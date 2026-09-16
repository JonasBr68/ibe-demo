const { test, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');

const {
  resolveCheckoutMode,
  gatewayCheckoutUrl,
  merchantContext,
  DEFAULT_GATEWAY_BASE_URL,
  DEFAULT_CHECKOUT_VERSION,
} = require('./adyen');

const originalEnv = { ...process.env };

function restoreEnv() {
  for (const key of Object.keys(process.env)) {
    if (!(key in originalEnv)) {
      delete process.env[key];
    }
  }

  Object.assign(process.env, originalEnv);
}

beforeEach(() => {
  delete process.env.ADYEN_CHECKOUT_MODE;
  delete process.env.ADYEN_GATEWAY_API_KEY;
  delete process.env.ADYEN_GATEWAY_BASE_URL;
  delete process.env.ADYEN_CHECKOUT_VERSION;
  delete process.env.ADYEN_STORE;
  delete process.env.ADYEN_MERCHANT_ACCOUNT;
});

afterEach(restoreEnv);

test('resolveCheckoutMode defaults to gateway when an integrator key is set', () => {
  process.env.ADYEN_GATEWAY_API_KEY = 'adyk_test_example';
  assert.equal(resolveCheckoutMode(), 'gateway');
});

test('resolveCheckoutMode defaults to direct when no integrator key is set', () => {
  assert.equal(resolveCheckoutMode(), 'direct');
});

test('resolveCheckoutMode honours an explicit mode override', () => {
  process.env.ADYEN_GATEWAY_API_KEY = 'adyk_test_example';
  process.env.ADYEN_CHECKOUT_MODE = 'direct';
  assert.equal(resolveCheckoutMode(), 'direct');
});

test('gatewayCheckoutUrl uses production gateway and v71 by default', () => {
  assert.equal(
    gatewayCheckoutUrl(),
    `${DEFAULT_GATEWAY_BASE_URL}/${DEFAULT_CHECKOUT_VERSION}`,
  );
});

test('gatewayCheckoutUrl strips a trailing slash and appends the version', () => {
  process.env.ADYEN_GATEWAY_BASE_URL = 'https://adyen-gateway.apaleo.com/api/checkout/';
  process.env.ADYEN_CHECKOUT_VERSION = 'v72';
  assert.equal(
    gatewayCheckoutUrl(),
    'https://adyen-gateway.apaleo.com/api/checkout/v72',
  );
});

test('merchantContext omits store and merchantAccount when unset', () => {
  assert.deepEqual(merchantContext(), {});
});

test('merchantContext includes store for Balance Platform credentials', () => {
  process.env.ADYEN_STORE = 'STX123';
  assert.deepEqual(merchantContext(), { store: 'STX123' });
});

test('merchantContext includes merchantAccount for Managed credentials', () => {
  process.env.ADYEN_MERCHANT_ACCOUNT = 'ExampleCOM';
  assert.deepEqual(merchantContext(), { merchantAccount: 'ExampleCOM' });
});
