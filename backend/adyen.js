const crypto = require('crypto');
const {
  Client,
  CheckoutAPI,
  HttpURLConnectionClient,
} = require('@adyen/api-library');

const { GATEWAY_HOSTS, ALLOWED_GATEWAYS } = require('./accounts');

const DEFAULT_GATEWAY_ORIGIN = GATEWAY_HOSTS.production;

/**
 * Checkout HTTP (this file) targets one of the two apaleo gateway hosts.
 * Drop-in in the browser still talks to checkoutshopper-*.adyen.com.
 *
 * The Node SDK hardcodes https://checkout-test.adyen.com/v71. There is no
 * base-URL argument, so gateway mode only rewrites the origin and keeps the path.
 *
 * The origin always comes from a server-side account profile, never the client.
 */
function resolveCheckoutOrigin(origin) {
  if (!origin) {
    return undefined;
  }

  const normalized = origin.replace(/\/+$/, '');
  if (!ALLOWED_GATEWAYS.includes(normalized)) {
    throw new Error(`Checkout origin "${normalized}" is not an allowed gateway host`);
  }

  return normalized;
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

function createCheckoutClient({ account, mode }) {
  const client = new Client(
    {
      apiKey: mode.apiKey,
      environment: mode.environment,
    },
    createHttpClient(resolveCheckoutOrigin(account.gateway)),
  );

  return new CheckoutAPI(client);
}

/**
 * Balance credentials authorize `store`; the gateway injects the regional merchantAccount.
 * Managed credentials authorize `merchantAccount` and the gateway forwards it as sent.
 * The gateway treats the two as disjoint request classes, so send exactly one.
 */
function merchantContext(mode) {
  if (mode.name === 'balance') {
    return { store: mode.store };
  }

  return { merchantAccount: mode.merchantAccount };
}

function parseDeliveryDate(deliveryDate) {
  if (!deliveryDate) {
    return undefined;
  }

  return new Date(`${deliveryDate}T00:00:00.000Z`);
}

function apaleoPayAdditionalData(account, propertyId) {
  return {
    'metadata.flowType': 'CaptureOnly',
    'metadata.accountId': account.apaleo.accountId,
    'metadata.propertyId': propertyId,
    subMerchantID: account.apaleo.subMerchantId,
  };
}

function buildPaymentPayload({
  account,
  mode,
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
    ...merchantContext(mode),
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
    additionalData: apaleoPayAdditionalData(account, propertyId),
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
  account,
  mode,
  amount,
  countryCode = 'DE',
  shopperLocale = 'en-US',
}) {
  return createCheckoutClient({ account, mode }).PaymentsApi.paymentMethods({
    ...merchantContext(mode),
    countryCode,
    shopperLocale,
    amount,
    channel: 'Web',
  });
}

async function makePayment(input) {
  const payload = buildPaymentPayload(input);
  const paymentResponse = await createCheckoutClient(input).PaymentsApi.payments(
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

async function submitAdditionalDetails({ account, mode, details }) {
  return createCheckoutClient({ account, mode }).PaymentsApi.paymentsDetails({ details });
}

module.exports = {
  DEFAULT_GATEWAY_ORIGIN,
  resolveCheckoutOrigin,
  rewriteCheckoutOrigin,
  merchantContext,
  buildPaymentPayload,
  getPaymentMethods,
  makePayment,
  submitAdditionalDetails,
};
