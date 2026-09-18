const crypto = require('crypto');
const {
  Client,
  CheckoutAPI,
  HttpURLConnectionClient,
} = require('@adyen/api-library');

const DEFAULT_GATEWAY_ORIGIN = 'https://adyen-gateway.apaleo.com';

/**
 * Checkout HTTP (this file) can target Adyen or the apaleo gateway.
 * Drop-in in the browser still talks to checkoutshopper-*.adyen.com.
 *
 * Leave ADYEN_CHECKOUT_ORIGIN empty to call Adyen.
 * Set it to https://adyen-gateway.apaleo.com (no trailing slash, no path)
 * and put an adyk_… key in ADYEN_API_KEY to call the gateway.
 *
 * The Node SDK hardcodes https://checkout-test.adyen.com/v71. There is no
 * base-URL argument, so gateway mode only rewrites the origin and keeps the path.
 */
function resolveCheckoutOrigin() {
  const origin = process.env.ADYEN_CHECKOUT_ORIGIN;
  if (!origin) {
    return undefined;
  }

  return origin.replace(/\/$/, '');
}

function rewriteCheckoutOrigin(endpoint, checkoutOrigin) {
  if (!checkoutOrigin) {
    return endpoint;
  }

  const url = new URL(endpoint);
  const origin = new URL(checkoutOrigin);
  url.protocol = origin.protocol;
  url.host = origin.host;
  return url.toString();
}

function createHttpClient(checkoutOrigin) {
  const httpClient = new HttpURLConnectionClient();
  if (!checkoutOrigin) {
    return httpClient;
  }

  const originalRequest = httpClient.request.bind(httpClient);
  httpClient.request = (endpoint, json, config, isApiRequired, requestOptions) =>
    originalRequest(
      rewriteCheckoutOrigin(endpoint, checkoutOrigin),
      json,
      config,
      isApiRequired,
      requestOptions,
    );

  return httpClient;
}

function createCheckoutClient() {
  const environment =
    String(process.env.ADYEN_ENVIRONMENT || 'TEST').toUpperCase() === 'LIVE'
      ? 'LIVE'
      : 'TEST';

  const client = new Client(
    {
      apiKey: process.env.ADYEN_API_KEY,
      environment,
    },
    createHttpClient(resolveCheckoutOrigin()),
  );

  return new CheckoutAPI(client);
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

async function getPaymentMethods({
  amount,
  countryCode = 'DE',
  shopperLocale = 'en-US',
}) {
  return createCheckoutClient().PaymentsApi.paymentMethods({
    ...merchantContext(),
    countryCode,
    shopperLocale,
    amount,
    channel: 'Web',
  });
}

async function makePayment(input) {
  const payload = buildPaymentPayload(input);
  const paymentResponse = await createCheckoutClient().PaymentsApi.payments(
    payload,
    { idempotencyKey: crypto.randomUUID() },
  );

  return {
    paymentResponse,
    paymentPayload: debugPaymentPayload(
      payload,
      input.paymentMethod,
      input.deliveryDate,
    ),
  };
}

async function submitAdditionalDetails(details) {
  return createCheckoutClient().PaymentsApi.paymentsDetails({ details });
}

module.exports = {
  DEFAULT_GATEWAY_ORIGIN,
  resolveCheckoutOrigin,
  rewriteCheckoutOrigin,
  merchantContext,
  getPaymentMethods,
  makePayment,
  submitAdditionalDetails,
};
