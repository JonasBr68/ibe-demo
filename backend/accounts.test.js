const { test } = require('node:test');
const assert = require('node:assert/strict');

const {
  GATEWAY_HOSTS,
  parseAccounts,
  loadAccounts,
  createRegistry,
} = require('./accounts');

function profile(overrides = {}) {
  return {
    id: 'RRQL',
    gateway: GATEWAY_HOSTS.production,
    apaleo: { clientId: 'cid', clientSecret: 'secret', accountId: 'RRQL' },
    modes: {
      managed: { apiKey: 'adyk_test_m', clientKey: 'test_m', merchantAccount: 'ExampleCOM' },
      balance: { apiKey: 'adyk_test_b', clientKey: 'test_b', store: 'ST1', environment: 'live' },
    },
    ...overrides,
  };
}

test('parses a valid profile and normalizes defaults', () => {
  const [account] = parseAccounts({ accounts: [profile({ gateway: `${GATEWAY_HOSTS.staging}/` })] });

  assert.equal(account.gateway, GATEWAY_HOSTS.staging);
  assert.equal(account.label, 'RRQL');
  assert.equal(account.modes.managed.environment, 'TEST');
  assert.equal(account.modes.balance.environment, 'LIVE');
});

test('rejects a gateway host outside the allowlist', () => {
  assert.throws(
    () => parseAccounts({ accounts: [profile({ gateway: 'https://checkout-test.adyen.com' })] }),
    /gateway must be one of/,
  );
});

test('rejects Managed with a store and Balance with a merchantAccount', () => {
  const bad = profile();
  bad.modes.managed.store = 'ST1';
  assert.throws(() => parseAccounts({ accounts: [bad] }), /must not set store/);

  const bad2 = profile();
  bad2.modes.balance.merchantAccount = 'ExampleCOM';
  assert.throws(() => parseAccounts({ accounts: [bad2] }), /must not set merchantAccount/);
});

test('requires merchantAccount for Managed and store for Balance', () => {
  const bad = profile();
  delete bad.modes.managed.merchantAccount;
  assert.throws(() => parseAccounts({ accounts: [bad] }), /merchantAccount is required/);

  const bad2 = profile();
  delete bad2.modes.balance.store;
  assert.throws(() => parseAccounts({ accounts: [bad2] }), /store is required/);
});

test('rejects invalid JSON, duplicate ids, unknown modes and empty modes', () => {
  assert.throws(() => parseAccounts('{nope'), /not valid JSON/);
  assert.throws(() => parseAccounts({ accounts: [profile(), profile()] }), /duplicate account id/);
  assert.throws(
    () => parseAccounts({ accounts: [profile({ modes: { classic: {} } })] }),
    /unknown mode/,
  );
  assert.throws(() => parseAccounts({ accounts: [profile({ modes: {} })] }), /at least one mode/);
});

test('loadAccounts prefers ACCOUNTS_JSON and fails loudly when it is invalid', () => {
  const accounts = loadAccounts({ ACCOUNTS_JSON: JSON.stringify({ accounts: [profile()] }) });
  assert.equal(accounts[0].id, 'RRQL');

  assert.throws(() => loadAccounts({ ACCOUNTS_JSON: '{}' }), /at least one account/);
});

test('loadAccounts falls back to the legacy flat env vars', () => {
  const accounts = loadAccounts({
    APALEO_CLIENT_ID: 'cid',
    APALEO_CLIENT_SECRET: 'secret',
    APALEO_ACCOUNT_ID: 'RRQL',
    ADYEN_API_KEY: 'adyk_test_x',
    ADYEN_CLIENT_KEY: 'test_x',
    ADYEN_STORE: 'ST1',
  });

  assert.equal(accounts.length, 1);
  assert.equal(accounts[0].gateway, GATEWAY_HOSTS.production);
  assert.deepEqual(Object.keys(accounts[0].modes), ['balance']);
});

test('loadAccounts returns no accounts when nothing is configured', () => {
  assert.deepEqual(loadAccounts({}), []);
});

test('registry resolves accounts and rejects unknown ones with status 400', () => {
  const registry = createRegistry(parseAccounts({ accounts: [profile()] }));

  const { account, mode } = registry.resolve('RRQL', 'balance');
  assert.equal(account.id, 'RRQL');
  assert.equal(mode.store, 'ST1');

  assert.throws(() => registry.resolve('NOPE'), (error) => error.status === 400);
  assert.throws(() => registry.resolve('RRQL', 'classic'), (error) => error.status === 400);
});

test('registry public list contains no secrets', () => {
  const registry = createRegistry(parseAccounts({ accounts: [profile()] }));
  const serialized = JSON.stringify(registry.publicList());

  assert.equal(serialized.includes('adyk_'), false);
  assert.equal(serialized.includes('secret'), false);
  assert.deepEqual(registry.publicList()[0].modes, ['managed', 'balance']);
});
