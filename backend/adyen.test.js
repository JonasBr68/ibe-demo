const { test } = require('node:test');
const assert = require('node:assert/strict');

const {
  resolveCheckoutOrigin,
  rewriteCheckoutOrigin,
  merchantContext,
  buildPaymentPayload,
} = require('./adyen');
const { GATEWAY_HOSTS } = require('./accounts');

const managed = { name: 'managed', merchantAccount: 'ExampleCOM' };
const balance = { name: 'balance', store: 'STX123' };
const account = { apaleo: { accountId: 'RRQL', subMerchantId: 'SUB1' } };

test('resolveCheckoutOrigin is unset without an origin', () => {
  assert.equal(resolveCheckoutOrigin(), undefined);
});

test('resolveCheckoutOrigin accepts both gateway hosts and strips a trailing slash', () => {
  assert.equal(resolveCheckoutOrigin(`${GATEWAY_HOSTS.production}/`), GATEWAY_HOSTS.production);
  assert.equal(resolveCheckoutOrigin(GATEWAY_HOSTS.staging), GATEWAY_HOSTS.staging);
});

test('resolveCheckoutOrigin rejects any other host', () => {
  assert.throws(() => resolveCheckoutOrigin('https://checkout-test.adyen.com'), /not an allowed gateway host/);
  assert.throws(() => resolveCheckoutOrigin('https://evil.example.com'), /not an allowed gateway host/);
});

test('rewriteCheckoutOrigin keeps the Adyen test path on the production gateway host', () => {
  assert.equal(
    rewriteCheckoutOrigin('https://checkout-test.adyen.com/v71/payments', GATEWAY_HOSTS.production),
    `${GATEWAY_HOSTS.production}/v71/payments`,
  );
});

test('rewriteCheckoutOrigin keeps the Adyen test path on the staging gateway host', () => {
  assert.equal(
    rewriteCheckoutOrigin('https://checkout-test.adyen.com/v71/payments', GATEWAY_HOSTS.staging),
    `${GATEWAY_HOSTS.staging}/v71/payments`,
  );
});

test('rewriteCheckoutOrigin keeps the Adyen live /checkout path on the gateway host', () => {
  assert.equal(
    rewriteCheckoutOrigin(
      'https://abcde-checkout-live.adyenpayments.com/checkout/v71/payments/details',
      GATEWAY_HOSTS.production,
    ),
    `${GATEWAY_HOSTS.production}/checkout/v71/payments/details`,
  );
});

test('rewriteCheckoutOrigin is a no-op without a gateway origin', () => {
  const endpoint = 'https://checkout-test.adyen.com/v71/paymentMethods';
  assert.equal(rewriteCheckoutOrigin(endpoint), endpoint);
});

test('merchantContext sends only merchantAccount in Managed mode', () => {
  assert.deepEqual(merchantContext(managed), { merchantAccount: 'ExampleCOM' });
});

test('merchantContext sends only store in Balance mode', () => {
  assert.deepEqual(merchantContext(balance), { store: 'STX123' });
});

test('payment payload uses the Managed body shape and the account metadata', () => {
  const payload = buildPaymentPayload({
    account,
    mode: managed,
    amount: { value: 100, currency: 'EUR' },
    reference: 'R1',
    propertyId: 'CBA',
  });

  assert.equal(payload.merchantAccount, 'ExampleCOM');
  assert.equal('store' in payload, false);
  assert.equal(payload.additionalData['metadata.accountId'], 'RRQL');
  assert.equal(payload.additionalData['metadata.propertyId'], 'CBA');
  assert.equal(payload.additionalData.subMerchantID, 'SUB1');
});

test('payment payload uses the Balance body shape', () => {
  const payload = buildPaymentPayload({
    account,
    mode: balance,
    amount: { value: 100, currency: 'EUR' },
    reference: 'R1',
    propertyId: 'CBA',
  });

  assert.equal(payload.store, 'STX123');
  assert.equal('merchantAccount' in payload, false);
});
