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

Backend Checkout HTTP (`/v71/paymentMethods`, `/payments`, `/payments/details`) uses the Adyen Node SDK and always goes through an apaleo Adyen Gateway (production or staging) with an `adyk_…` key. Drop-in talks to `checkoutshopper-*.adyen.com` with the public `clientKey`.

One deployment serves several apaleo accounts. The UI has an account selector and a Managed / Balance switch (see [Accounts](#accounts)).

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

The SDK keeps Adyen's path (`/v71/…` on TEST, `/checkout/v71/…` on LIVE); the demo only rewrites the origin to the account's gateway host.

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

Open `http://localhost:3000`. `/api/health` lists the configured accounts, gateway hosts, and modes (HTTP 503 when none are configured).

### Accounts

Profiles load from `ACCOUNTS_FILE` (local JSON file), else `ACCOUNTS_JSON` (the same JSON in one env var), else the legacy flat `APALEO_*` / `ADYEN_*` variables as a single account. An invalid `ACCOUNTS_FILE` / `ACCOUNTS_JSON` stops the server at boot.

```json
{
  "accounts": [
    {
      "id": "RRQL",
      "label": "RRQL production",
      "defaultPropertyId": "CBA",
      "gateway": "https://adyen-gateway.apaleo.com",
      "apaleo": { "clientId": "", "clientSecret": "", "accountId": "RRQL", "subMerchantId": "" },
      "modes": {
        "managed": { "apiKey": "adyk_test_…", "clientKey": "test_…", "environment": "TEST", "merchantAccount": "ExampleCOM" },
        "balance": { "apiKey": "adyk_test_…", "clientKey": "test_…", "environment": "TEST", "store": "ST…" }
      }
    }
  ]
}
```

- `gateway` is `https://adyen-gateway.apaleo.com` or `https://adyen-gateway.apaleo-staging.com`. Staging is a separate deployment with its own `adyk_` keys. To use both hosts for one apaleo account, add two profiles (for example `RRQL` and `RRQL-staging`).
- Each mode block is optional; the UI offers the modes that exist.
- The browser sends only `accountId` and `mode`. Keys, merchant accounts, stores, and hosts stay on the server.
- apaleo APIs (`api.apaleo.com`, `identity.apaleo.com`) are the same for every account.

### Managed vs Balance

The gateway ties each `adyk_` credential to one operations mode and treats the two request shapes as disjoint:

| Mode | Request body | Gateway behavior |
|---|---|---|
| Managed | `merchantAccount` only | authorizes that legacy merchant account and forwards it |
| Balance | `store` only | authorizes the store, then injects the regional `merchantAccount` |

So each mode needs its own gateway credential (and its own Drop-in `clientKey`). Switching the mode in the UI selects that credential and body shape for the next payment. A 3DS redirect keeps the account and mode of the original payment.

---

## Deploy on Render

One Web Service from this repo serves every account:

- Root directory: empty (not `backend/`)
- Build: `npm install --prefix backend`
- Start: `npm start --prefix backend`
- Health check: `/api/health`
- Region: Frankfurt
- Env: `ACCOUNTS_JSON` as a secret env var holding the JSON above. Once it is set, the flat `APALEO_*` / `ADYEN_*` variables are unused and can be removed (including `ADYEN_GATEWAY_API_KEY`, `ADYEN_GATEWAY_BASE_URL`, `ADYEN_CHECKOUT_MODE` from the earlier dual-client setup).

After the first `https://<service>.onrender.com` URL exists, add that origin to the Allowed Origins list of every Drop-in `clientKey` used in `ACCOUNTS_JSON` (each mode and each staging key).

---
## Project structure

```text
backend/
  accounts.js
  adyen.js
  apaleo.js
  index.js
  package.json

frontend/
  index.html
  script.js
  style.css
```
