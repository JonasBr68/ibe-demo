const crypto = require('crypto');
const axios = require('axios');
const { Client, CheckoutAPI } = require('@adyen/api-library');

const DEFAULT_GATEWAY_BASE_URL = 'https://adyen-gateway.apaleo.com/api/checkout';
const DEFAULT_CHECKOUT_VERSION = 'v71';

/**
 * Direct talks to Adyen Checkout with a real Adyen API key.
 * Gateway talks to apaleo's authorization gateway with an integrator key
 * (`adyk_test_…` / `adyk_live_…`). Drop-in in the browser is unchanged.
 *
 * Default: gateway when ADYEN_GATEWAY_API_KEY is set, otherwise direct.
 * Override with ADYEN_CHECKOUT_MODE=gateway|direct.
 */
function resolveCheckoutMode() {
  const explicit = String(process.env.ADYEN_CHECKOUT_MODE || '').toLowerCase();
  if (explicit === 'direct' || explicit === 'gateway') {
    return explicit;
  }

  return process.env.ADYEN_GATEWAY_API_KEY ? 'gateway' : 'direct';
}

function gatewayCheckoutUrl() {
  const base = (
    process.env.ADYEN_GATEWAY_BASE_URL || DEFAULT_GATEWAY_BASE_URL
  ).replace(/\/$/, '');
  const version = process.env.ADYEN_CHECKOUT_VERSION || DEFAULT_CHECKOUT_VERSION;
  return `${base}/${version}`;
}

/**
 * Native BP credentials authorize Adyen's `store` field.
 * Managed / legacy credentials authorize `merchantAccount` and pass it through.
 * Send both only when the gateway credential is set up that way.
 */
function merchantContext() {
  const body = {};

  if (process.env.ADYEN_STORE) {
    body.store = process.env.ADYEN_STORE;
  }

  if (process.env.ADYEN_MERCHANT_ACCOUNT) {
    body.merchantAccount = process.env.ADYEN_MERCHANT_ACCOUNT;
  }

  return body;
}

function createDirectCheckoutClient() {
  const environment =
    String(process.env.ADYEN_ENVIRONMENT || 'TEST').toUpperCase() === 'LIVE'
      ? 'LIVE'
      : 'TEST';

  const client = new Client({
    apiKey: process.env.ADYEN_API_KEY,
    environment,
  });

  return new CheckoutAPI(client);
}

function createGatewayClient() {
  const apiKey = process.env.ADYEN_GATEWAY_API_KEY;
  if (!apiKey) {
    throw new Error('ADYEN_GATEWAY_API_KEY is required when using gateway checkout');
  }

  return axios.create({
    baseURL: gatewayCheckoutUrl(),
    headers: {
      'Content-Type': 'application/json',
      'x-API-key': apiKey,
    },
  });
}

function parseDeliveryDate(deliveryDate) {
  if (!deliveryDate) {
    return undefined;
  }

  return new Date(`${deliveryDate}T00:00:00.000Z`);
}

function apaleoPayAdditionalData(propertyId) {
  return {
    'metadata.flowType': 'CaptureOnly',
    'metadata.accountId': process.env.APALEO_ACCOUNT_ID,
    'metadata.propertyId': propertyId,
    subMerchantID: process.env.APALEO_SUBMERCHANT_ID,
  };
}

function buildPaymentPayload({
  amount,
  paymentMethod,
  browserInfo,
  reference,
  returnUrl,
  shopperEmail,
  shopperReference,
  propertyId,
  deliveryDate,
}) {
  const payload = {
    ...merchantContext(),
    amount,
    reference,
    paymentMethod,
    returnUrl,
    shopperEmail,
    shopperReference,
    storePaymentMethod: true,
    deliveryDate: parseDeliveryDate(deliveryDate),
    shopperInteraction: 'Ecommerce',
    recurringProcessingModel: 'UnscheduledCardOnFile',
    additionalData: apaleoPayAdditionalData(propertyId),
  };

  if (browserInfo) {
    payload.browserInfo = browserInfo;
  }

  return payload;
}

function debugPaymentPayload(payload, paymentMethod, deliveryDate) {
  return {
    merchantAccount: payload.merchantAccount,
    store: payload.store,
    amount: payload.amount,
    reference: payload.reference,
    returnUrl: payload.returnUrl,
    shopperEmail: payload.shopperEmail,
    shopperReference: payload.shopperReference,
    deliveryDate: deliveryDate || null,
    shopperInteraction: payload.shopperInteraction,
    storePaymentMethod: payload.storePaymentMethod,
    recurringProcessingModel: payload.recurringProcessingModel,
    additionalData: payload.additionalData,
    paymentMethod: {
      type: paymentMethod?.type || null,
      brand: paymentMethod?.brand || null,
    },
  };
}

async function postGateway(path, body, extraHeaders = {}) {
  const client = createGatewayClient();
  const response = await client.post(path, body, { headers: extraHeaders });
  return response.data;
}

async function getPaymentMethods({
  amount,
  countryCode = 'DE',
  shopperLocale = 'en-US',
}) {
  const request = {
    ...merchantContext(),
    countryCode,
    shopperLocale,
    amount,
    channel: 'Web',
  };

  if (resolveCheckoutMode() === 'gateway') {
    return postGateway('/paymentMethods', request);
  }

  return createDirectCheckoutClient().PaymentsApi.paymentMethods(request);
}

async function makePayment(input) {
  const payload = buildPaymentPayload(input);

  let response;
  if (resolveCheckoutMode() === 'gateway') {
    response = await postGateway('/payments', payload, {
      'Idempotency-Key': crypto.randomUUID(),
    });
  } else {
    response = await createDirectCheckoutClient().PaymentsApi.payments(payload);
  }

  return {
    paymentResponse: response,
    paymentPayload: debugPaymentPayload(payload, input.paymentMethod, input.deliveryDate),
  };
}

async function submitAdditionalDetails(details) {
  const request = { details };

  if (resolveCheckoutMode() === 'gateway') {
    return postGateway('/payments/details', request);
  }

  return createDirectCheckoutClient().PaymentsApi.paymentsDetails(request);
}

module.exports = {
  DEFAULT_GATEWAY_BASE_URL,
  DEFAULT_CHECKOUT_VERSION,
  resolveCheckoutMode,
  gatewayCheckoutUrl,
  merchantContext,
  getPaymentMethods,
  makePayment,
  submitAdditionalDetails,
};
