# Imboni Backend

Small Express API that handles real MTN MoMo and Airtel Money payments for
Imboni Car Rentals. This exists because the payment provider APIs need a
secret key (which can never sit in browser code) and because they confirm
payment via a server-to-server callback that only a backend can receive.

## 1. Local setup

```bash
npm install
cp .env.example .env
```

Fill in `.env`:

### Flutterwave (recommended — start here)
MTN's own direct sandbox (below) is known to be chronically unreliable — even
their own "Try it" tool on their docs site 500s intermittently, as documented
across their community forum going back years. Flutterwave partners directly
with both MTN and Airtel in Rwanda, needs one integration instead of two, and
its test mode auto-approves Rwanda mobile money payments after a few seconds —
no waiting on a flaky sandbox.

1. Sign up at https://dashboard.flutterwave.com
2. Go to **Settings → API** and copy your **Test Secret Key**
3. Paste it into `FLW_SECRET_KEY` in `.env`
4. Leave `USE_AGGREGATOR=true` (the default) — this routes both MoMo and
   Airtel selections through Flutterwave automatically, based on the phone
   number's network prefix. No frontend changes needed either way.

That's genuinely all you need to get real end-to-end payments working. The
sections below (direct MTN/Airtel) are fully built and ready whenever you want
to switch away from the aggregator's small transaction fee — just flip
`USE_AGGREGATOR=false` once those credentials are sorted.

### MTN MoMo (direct integration, for later)
1. Register at https://momodeveloper.mtn.co.rw (Rwanda-specific sandbox) and
   subscribe to the **Collections** product. Copy the Primary Key it gives you
   into `MOMO_SUBSCRIPTION_KEY`.
2. Run the one-time provisioning script:
   ```bash
   node src/provision-momo-sandbox.js
   ```
   It prints `MOMO_API_USER` and `MOMO_API_KEY` — paste both into `.env`.

### Airtel Money (direct integration, for later)
1. Register at https://developers.airtel.africa/developer, create an
   application, and add the **Collection APIs** product.
2. Copy the Client ID / Client Secret it gives you into `AIRTEL_CLIENT_ID` /
   `AIRTEL_CLIENT_SECRET`.

Then start the server:

```bash
npm run dev
```

It runs on `http://localhost:4000` by default.

## 2. How it works

- `POST /api/payments/request-to-pay` — triggers a MoMo or Airtel payment
  prompt on the customer's phone. Body: `{ provider, phone, amount, orderId }`.
- `GET /api/payments/status/:orderId` — the frontend polls this every few
  seconds until it returns `SUCCESSFUL` or `FAILED`.
- `POST /api/payments/webhook/momo` and `/webhook/airtel` — only fire in
  **production**. Sandbox doesn't deliver real webhooks, so the status-polling
  endpoint above is what makes testing work end-to-end before you go live.

## 3. Testing in sandbox

MTN's sandbox only accepts the currency `EUR` (handled automatically in
`services/momo.js`) and doesn't actually charge a real phone — it just lets you
walk through the full request → poll → status flow. Airtel's staging
environment (`openapiuat.airtel.africa`) behaves similarly.

## 4. Deploying (Render or Railway)

1. Push this folder to its own GitHub repo (keep it separate from the frontend).
2. On Render: New → Web Service → connect the repo → build command `npm install`,
   start command `npm start`.
3. Add all the `.env` variables in the host's environment variables settings
   (never commit `.env` itself — it's already gitignored).
4. Set `FRONTEND_ORIGIN` to your deployed frontend's URL once you have one, so
   only your site can call this API.
5. Once you have a live URL (e.g. `https://imboni-backend.onrender.com`), set
   that as `VITE_API_BASE_URL` in the frontend's `.env` — see the frontend
   README for that step.

Note: free tiers on Render/Railway spin the server down after inactivity, so
the first request after idle time can take 10-20 seconds to wake up. That's
normal — just something to be aware of, not a bug.

## 5. Before going live

- Apply for production MoMo credentials (KYC required) via MTN's Partner Portal
  once sandbox testing looks good, and set `MOMO_TARGET_ENVIRONMENT=production`
  with the production base URL.
- Replace the in-memory `paymentStore` (see `src/services/paymentStore.js`)
  with a real database — it currently resets whenever the server restarts.
