import crypto from 'crypto'

const BASE_URL = process.env.AIRTEL_BASE_URL || 'https://openapiuat.airtel.africa' // staging
const CLIENT_ID = process.env.AIRTEL_CLIENT_ID
const CLIENT_SECRET = process.env.AIRTEL_CLIENT_SECRET
const COUNTRY = process.env.AIRTEL_COUNTRY || 'RW'
const CURRENCY = process.env.AIRTEL_CURRENCY || 'RWF'

async function getAccessToken() {
  if (!CLIENT_ID || !CLIENT_SECRET) {
    throw new Error('Missing AIRTEL_CLIENT_ID or AIRTEL_CLIENT_SECRET in .env')
  }

  const res = await fetch(`${BASE_URL}/auth/oauth2/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      client_id: CLIENT_ID,
      client_secret: CLIENT_SECRET,
      grant_type: 'client_credentials',
    }),
  })

  if (!res.ok) throw new Error(`Airtel auth failed: ${res.status} ${await res.text()}`)
  const data = await res.json()
  return data.access_token
}

export async function requestToPay({ amount, phone, orderId }) {
  const token = await getAccessToken()
  const transactionId = crypto.randomUUID()

  const res = await fetch(`${BASE_URL}/merchant/v1/payments/`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      Accept: '*/*',
      'X-Country': COUNTRY,
      'X-Currency': CURRENCY,
    },
    body: JSON.stringify({
      reference: orderId,
      subscriber: {
        country: COUNTRY,
        currency: CURRENCY,
        msisdn: phone.replace(/^0/, ''),
      },
      transaction: {
        amount,
        country: COUNTRY,
        currency: CURRENCY,
        id: transactionId,
      },
    }),
  })

  if (!res.ok) {
    throw new Error(`Airtel request-to-pay failed: ${res.status} ${await res.text()}`)
  }

  return { transactionId }
}

export async function checkStatus(transactionId) {
  const token = await getAccessToken()

  const res = await fetch(`${BASE_URL}/standard/v1/payments/${transactionId}`, {
    headers: {
      Authorization: `Bearer ${token}`,
      'X-Country': COUNTRY,
      'X-Currency': CURRENCY,
    },
  })

  if (!res.ok) throw new Error(`Airtel status check failed: ${res.status} ${await res.text()}`)
  const data = await res.json()
  return data?.data?.transaction?.status // TS (success) | TF (failed) | TA/TIP (pending), per Airtel docs
}
