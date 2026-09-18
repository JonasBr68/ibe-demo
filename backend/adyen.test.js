const { test, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');

const {
  resolveCheckoutOrigin,
  rewriteCheckoutOrigin,
  merchantContext,
  DEFAULT_GATEWAY_ORIGIN,
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
  delete process.env.ADYEN_CHECKOUT_ORIGIN;
  delete process.env.ADYEN_STORE;
  delete process.env.ADYEN_MERCHANT_ACCOUNT;
});

afterEach(restoreEnv);

test('resolveCheckoutOrigin is unset when calling Adyen directly', () => {
  assert.equal(resolveCheckoutOrigin(), undefined);
});

test('resolveCheckoutOrigin strips a trailing slash', () => {
  process.env.ADYEN_CHECKOUT_ORIGIN = `${DEFAULT_GATEWAY_ORIGIN}/`;
  assert.equal(resolveCheckoutOrigin(), DEFAULT_GATEWAY_ORIGIN);
});

test('rewriteCheckoutOrigin keeps the Adyen test path on the gateway host', () => {
  assert.equal(
    rewriteCheckoutOrigin(
      'https://checkout-test.adyen.com/v71/payments',
      DEFAULT_GATEWAY_ORIGIN,
    ),
    `${DEFAULT_GATEWAY_ORIGIN}/v71/payments`,
  );
});

test('rewriteCheckoutOrigin keeps the Adyen live /checkout path on the gateway host', () => {
  assert.equal(
    rewriteCheckoutOrigin(
      'https://abcde-checkout-live.adyenpayments.com/checkout/v71/payments/details',
      DEFAULT_GATEWAY_ORIGIN,
    ),
    `${DEFAULT_GATEWAY_ORIGIN}/checkout/v71/payments/details`,
  );
});

test('rewriteCheckoutOrigin is a no-op without a gateway origin', () => {
  const endpoint = 'https://checkout-test.adyen.com/v71/paymentMethods';
  assert.equal(rewriteCheckoutOrigin(endpoint), endpoint);
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
