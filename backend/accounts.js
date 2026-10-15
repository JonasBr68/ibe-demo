const fs = require('fs');

const GATEWAY_HOSTS = Object.freeze({
  production: 'https://adyen-gateway.apaleo.com',
  staging: 'https://adyen-gateway.apaleo-staging.com',
});

const ALLOWED_GATEWAYS = Object.values(GATEWAY_HOSTS);
const MODE_NAMES = ['managed', 'balance'];

function fail(message) {
  throw new Error(`Invalid account configuration: ${message}`);
}

function requireString(value, label) {
  if (typeof value !== 'string' || !value.trim()) {
    fail(`${label} is required`);
  }
  return value.trim();
}

function normalizeGateway(value, label) {
  const gateway = requireString(value, label).replace(/\/+$/, '');
  if (!ALLOWED_GATEWAYS.includes(gateway)) {
    fail(`${label} must be one of ${ALLOWED_GATEWAYS.join(', ')} (got "${gateway}")`);
  }
  return gateway;
}

function normalizeMode(accountId, modeName, raw) {
  const label = `accounts[${accountId}].modes.${modeName}`;
  if (!raw || typeof raw !== 'object') {
    fail(`${label} must be an object`);
  }

  const environment =
    String(raw.environment || 'TEST').toUpperCase() === 'LIVE' ? 'LIVE' : 'TEST';

  const mode = {
    name: modeName,
    apiKey: requireString(raw.apiKey, `${label}.apiKey`),
    clientKey: requireString(raw.clientKey, `${label}.clientKey`),
    environment,
  };

  if (modeName === 'managed') {
    if (raw.store) {
      fail(`${label} must not set store (Managed sends merchantAccount only)`);
    }
    mode.merchantAccount = requireString(raw.merchantAccount, `${label}.merchantAccount`);
  } else {
    if (raw.merchantAccount) {
      fail(`${label} must not set merchantAccount (Balance sends store only)`);
    }
    mode.store = requireString(raw.store, `${label}.store`);
  }

  return mode;
}

function normalizeAccount(raw, index) {
  if (!raw || typeof raw !== 'object') {
    fail(`accounts[${index}] must be an object`);
  }

  const id = requireString(raw.id, `accounts[${index}].id`);
  const apaleo = raw.apaleo || {};

  const modes = {};
  for (const [name, value] of Object.entries(raw.modes || {})) {
    if (!MODE_NAMES.includes(name)) {
      fail(`accounts[${id}].modes has unknown mode "${name}"`);
    }
    modes[name] = normalizeMode(id, name, value);
  }

  if (!Object.keys(modes).length) {
    fail(`accounts[${id}] needs at least one mode (managed or balance)`);
  }

  return {
    id,
    label: raw.label ? String(raw.label) : id,
    defaultPropertyId: raw.defaultPropertyId ? String(raw.defaultPropertyId) : null,
    gateway: normalizeGateway(raw.gateway, `accounts[${id}].gateway`),
    apaleo: {
      clientId: requireString(apaleo.clientId, `accounts[${id}].apaleo.clientId`),
      clientSecret: requireString(apaleo.clientSecret, `accounts[${id}].apaleo.clientSecret`),
      accountId: requireString(apaleo.accountId, `accounts[${id}].apaleo.accountId`),
      subMerchantId: apaleo.subMerchantId ? String(apaleo.subMerchantId) : undefined,
    },
    modes,
  };
}

function parseAccounts(json) {
  let parsed;
  try {
    parsed = typeof json === 'string' ? JSON.parse(json) : json;
  } catch (error) {
    fail(`not valid JSON (${error.message})`);
  }

  const list = Array.isArray(parsed) ? parsed : parsed?.accounts;
  if (!Array.isArray(list) || !list.length) {
    fail('expected { "accounts": [ ... ] } with at least one account');
  }

  const accounts = list.map(normalizeAccount);
  const ids = new Set();
  for (const account of accounts) {
    if (ids.has(account.id)) {
      fail(`duplicate account id "${account.id}"`);
    }
    ids.add(account.id);
  }

  return accounts;
}

/**
 * Builds one profile from the legacy flat env vars so a service that has not
 * received ACCOUNTS_JSON yet keeps booting. Returns [] when they are absent.
 */
function accountsFromLegacyEnv(env) {
  if (!env.APALEO_CLIENT_ID && !env.ADYEN_API_KEY) {
    return [];
  }

  const modes = {};
  const base = {
    apiKey: env.ADYEN_API_KEY,
    clientKey: env.ADYEN_CLIENT_KEY,
    environment: env.ADYEN_ENVIRONMENT,
  };
  if (env.ADYEN_MERCHANT_ACCOUNT) {
    modes.managed = { ...base, merchantAccount: env.ADYEN_MERCHANT_ACCOUNT };
  }
  if (env.ADYEN_STORE) {
    modes.balance = { ...base, store: env.ADYEN_STORE };
  }

  const accountId = env.APALEO_ACCOUNT_ID || 'default';
  return parseAccounts({
    accounts: [
      {
        id: accountId,
        gateway: env.ADYEN_CHECKOUT_ORIGIN || GATEWAY_HOSTS.production,
        apaleo: {
          clientId: env.APALEO_CLIENT_ID,
          clientSecret: env.APALEO_CLIENT_SECRET,
          accountId,
          subMerchantId: env.APALEO_SUBMERCHANT_ID,
        },
        modes,
      },
    ],
  });
}

/**
 * Order: ACCOUNTS_FILE, then ACCOUNTS_JSON, then legacy flat env vars.
 * A configured-but-invalid source throws so boot fails loudly.
 */
function loadAccounts(env = process.env) {
  if (env.ACCOUNTS_FILE) {
    return parseAccounts(fs.readFileSync(env.ACCOUNTS_FILE, 'utf8'));
  }
  if (env.ACCOUNTS_JSON) {
    return parseAccounts(env.ACCOUNTS_JSON);
  }
  return accountsFromLegacyEnv(env);
}

function createRegistry(accounts) {
  const byId = new Map(accounts.map((account) => [account.id, account]));

  return {
    accounts,

    /** Returns { account, mode } or throws an error with status 400. */
    resolve(accountId, modeName) {
      const account = byId.get(accountId);
      if (!account) {
        const error = new Error(`Unknown accountId "${accountId}"`);
        error.status = 400;
        throw error;
      }
      if (modeName === undefined) {
        return { account, mode: undefined };
      }
      const mode = account.modes[modeName];
      if (!mode) {
        const error = new Error(
          `Account "${accountId}" has no "${modeName}" mode (available: ${Object.keys(account.modes).join(', ')})`,
        );
        error.status = 400;
        throw error;
      }
      return { account, mode };
    },

    publicList() {
      return accounts.map((account) => ({
        id: account.id,
        label: account.label,
        gateway: account.gateway,
        environment: GATEWAY_HOSTS.staging === account.gateway ? 'staging' : 'production',
        modes: Object.keys(account.modes),
        defaultPropertyId: account.defaultPropertyId,
      }));
    },
  };
}

module.exports = {
  GATEWAY_HOSTS,
  ALLOWED_GATEWAYS,
  parseAccounts,
  accountsFromLegacyEnv,
  loadAccounts,
  createRegistry,
};
