const IS_SANDBOX = (process.env.PESAPAL_ENVIRONMENT || 'sandbox') !== 'production'
const BASE_URL = IS_SANDBOX
  ? 'https://cybqa.pesapal.com/pesapalv3/api'
  : 'https://pay.pesapal.com/v3/api'

const CONSUMER_KEY = process.env.PESAPAL_CONSUMER_KEY
const CONSUMER_SECRET = process.env.PESAPAL_CONSUMER_SECRET

// Cached after first registration so we don't re-register on every request.
// Resets on server restart, which is fine -- registering again is harmless.
let cachedIpnId = process.env.PESAPAL_IPN_ID || null

async function getAccessToken() {
  if (!CONSUMER_KEY || !CONSUMER_SECRET) {
    throw new Error('Missing PESAPAL_CONSUMER_KEY or PESAPAL_CONSUMER_SECRET in .env')
  }

  const res = await fetch(`${BASE_URL}/Auth/RequestToken`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify({ consumer_key: CONSUMER_KEY, consumer_secret: CONSUMER_SECRET }),
  })

  const data = await res.json()
  if (!res.ok || !data.token) throw new Error(data.message || 'Pesapal auth failed')
  return data.token
}

// Registers your backend's own public IPN endpoint with Pesapal (required once
// before submitting orders). BACKEND_PUBLIC_URL must be a real public HTTPS URL
// -- e.g. your Render URL -- localhost will not work here.
async function ensureIpnRegistered() {
  if (cachedIpnId) return cachedIpnId

  const backendUrl = process.env.BACKEND_PUBLIC_URL
  if (!backendUrl) {
    throw new Error('Set BACKEND_PUBLIC_URL in .env to your deployed backend URL (Pesapal needs a public IPN endpoint)')
  }

  const token = await getAccessToken()
  const res = await fetch(`${BASE_URL}/URLSetup/RegisterIPNURL`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      Accept: 'application/json',
    },
    body: JSON.stringify({
      url: `${backendUrl}/api/payments/webhook/pesapal`,
      ipn_notification_type: 'GET',
    }),
  })

  const data = await res.json()
  if (!res.ok || !data.ipn_id) throw new Error(data.message || 'Failed to register Pesapal IPN URL')

  cachedIpnId = data.ipn_id
  return cachedIpnId
}

// Returns a redirect_url -- the frontend must navigate the customer there to
// actually complete payment (Pesapal's hosted page), unlike momo/airtel/flutterwave
// which push a prompt directly to the customer's phone.
export async function submitOrder({ amount, phone, orderId, email, callbackUrl }) {
  const token = await getAccessToken()
  const notificationId = await ensureIpnRegistered()

  const res = await fetch(`${BASE_URL}/Transactions/SubmitOrderRequest`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      Accept: 'application/json',
    },
    body: JSON.stringify({
      id: orderId,
      currency: 'RWF',
      amount,
      description: 'Imboni Car Rentals payment',
      callback_url: callbackUrl,
      notification_id: notificationId,
      billing_address: {
        email_address: email || `${orderId}@imbonicarrentals.com`,
        phone_number: phone,
        country_code: 'RW',
        first_name: 'Imboni',
        last_name: 'Customer',
      },
    }),
  })

  const data = await res.json()
  if (!res.ok || !data.redirect_url) throw new Error(data.message || 'Pesapal order submission failed')

  return { providerRef: data.order_tracking_id, redirectUrl: data.redirect_url }
}

export async function checkStatus(orderTrackingId) {
  const token = await getAccessToken()

  const res = await fetch(`${BASE_URL}/Transactions/GetTransactionStatus?orderTrackingId=${orderTrackingId}`, {
    headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' },
  })

  const data = await res.json()
  if (!res.ok) throw new Error(data.message || 'Pesapal status check failed')
  return data.payment_status_description // 'COMPLETED' | 'FAILED' | 'PENDING' | 'INVALID' | 'REVERSED'
}
