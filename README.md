# apaleo IBE Demo

Upstream demo: https://ibe-demo-purk.onrender.com/

A minimal demo Internet Booking Engine (IBE) built with:

- **apaleo** for property, offer, and booking APIs
- **Adyen Drop-in** for payment authorization
- **Node.js + Express** for the backend
- **Vanilla HTML/CSS/JavaScript** for the frontend

This project is intentionally simple. It is meant to act as a **workbook / reference implementation** for the base flow of an IBE:

1. Load properties
2. Search offers
3. Select an offer
4. Enter guest details
5. Authorize a payment with Adyen
6. Use the Adyen PSP reference to create a booking in apaleo

Checkout API calls from the backend default to apaleo's **Adyen authorization gateway** (`https://adyen-gateway.apaleo.com/api/checkout`) when `ADYEN_GATEWAY_API_KEY` is set. The browser Drop-in still talks to Adyen Checkoutshopper directly with the public `clientKey`.

---

## What this project demonstrates

This demo focuses on the base technical flow behind a booking engine.

### apaleo flow
- Load properties from `GET /inventory/v1/properties`
- Search offers from `GET /booking/v1/offers`
- Build a booking payload from the selected offer
- Create a booking through `POST /booking/v1/bookings`

### Adyen flow
- Load payment methods for Drop-in
- Mount Adyen Drop-in in the browser
- Authorize a payment
- Handle 3DS / redirect flows
- Receive a **PSP reference**
- Use that PSP reference as `transactionReference` in the apaleo booking request

Backend Checkout calls (when `ADYEN_CHECKOUT_MODE=gateway` or an integrator key is set):

- `POST /api/checkout/{version}/paymentMethods`
- `POST /api/checkout/{version}/payments`
- `POST /api/checkout/{version}/payments/details`

authenticated with `x-API-key: adyk_test_…`. Set `ADYEN_CHECKOUT_MODE=direct` to call Adyen Checkout with a real Adyen API key instead (rollback / comparison).

### apaleo Pay / Adyen metadata flow
The Adyen payment request includes `additionalData` such as:

- `metadata.flowType = CaptureOnly`
- `metadata.accountId`
- `metadata.propertyId`
- `subMerchantID`

This allows apaleo Pay to recognize the payment context correctly.

---

## Run locally

```bash
cp .env.example backend/.env
# fill in values — never commit backend/.env
cd backend
npm install
npm test
npm start
```

Open `http://localhost:3000`. `/api/health` reports `checkoutMode`.

### Environment

Copy `.env.example`. Gateway mode needs `ADYEN_GATEWAY_API_KEY` (`adyk_test_…` issued from the gateway config API) and the public `ADYEN_CLIENT_KEY`. Do not put a real Adyen API key in gateway mode.

- **Managed / legacy credential:** set `ADYEN_MERCHANT_ACCOUNT`, leave `ADYEN_STORE` empty.
- **Balance Platform credential:** set `ADYEN_STORE` to the assigned store code.

---

## Deploy on Render

New Web Service from this repo:

- Root directory: empty (not `backend/`)
- Build: `npm install --prefix backend`
- Start: `npm start --prefix backend`
- Health check: `/api/health`
- Region: Frankfurt

After the first `https://<service>.onrender.com` URL exists, add that origin to the Adyen client key Allowed Origins list.

---

## Project structure

```text
backend/
  adyen.js
  apaleo.js
  index.js
  package.json

frontend/
  index.html
  script.js
  style.css
```
