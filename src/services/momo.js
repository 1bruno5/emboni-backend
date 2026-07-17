import crypto from 'crypto'

const BASE_URL = process.env.MOMO_BASE_URL || 'https://sandbox.momodeveloper.mtn.com'
const SUBSCRIPTION_KEY = process.env.MOMO_SUBSCRIPTION_KEY
const TARGET_ENV = process.env.MOMO_TARGET_ENVIRONMENT || 'sandbox'
const CALLBACK_HOST = process.env.MOMO_CALLBACK_HOST // e.g. your Render backend URL, used in production only

// --- One-time setup helper (sandbox only) -----------------------------------
// In sandbox, you generate your own API_USER + API_KEY by calling MTN's
// provisioning endpoints yourself (production credentials come from MTN's
// Partner Portal instead, after KYC). Run this once, then save the two values
// it prints into your .env as MOMO_API_USER and MOMO_API_KEY.
export async function provisionSandboxUser() {
  if (!SUBSCRIPTION_KEY) throw new Error('Set MOMO_SUBSCRIPTION_KEY in .env first')

  const apiUser = crypto.randomUUID()

  const createUserRes = await fetch(`${BASE_URL}/v1_0/apiuser`, {
    method: 'POST',
    headers: {
      'X-Reference-Id': apiUser,
      'Ocp-Apim-Subscription-Key': SUBSCRIPTION_KEY,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      providerCallbackHost: CALLBACK_HOST || 'imbonicarrentals.com',
    }),
  })

  if (!createUserRes.ok && createUserRes.status !== 201) {
    throw new Error(`Failed to create API user: ${createUserRes.status} ${await createUserRes.text()}`)
  }

  const createKeyRes = await fetch(`${BASE_URL}/v1_0/apiuser/${apiUser}/apikey`, {
    method: 'POST',
    headers: { 'Ocp-Apim-Subscription-Key': SUBSCRIPTION_KEY },
  })

  if (!createKeyRes.ok) {
    throw new Error(`Failed to create API key: ${createKeyRes.status} ${await createKeyRes.text()}`)
  }

  const { apiKey } = await createKeyRes.json()
  return { apiUser, apiKey }
}

// --- Auth ---------------------------------------------------------------
async function getAccessToken() {
  const apiUser = process.env.MOMO_API_USER
  const apiKey = process.env.MOMO_API_KEY
  if (!apiUser || !apiKey || !SUBSCRIPTION_KEY) {
    throw new Error('Missing MOMO_API_USER, MOMO_API_KEY, or MOMO_SUBSCRIPTION_KEY in .env')
  }

  const credentials = Buffer.from(`${apiUser}:${apiKey}`).toString('base64')

  const res = await fetch(`${BASE_URL}/collection/token/`, {
    method: 'POST',
    headers: {
      Authorization: `Basic ${credentials}`,
      'Ocp-Apim-Subscription-Key': SUBSCRIPTION_KEY,
    },
  })

  if (!res.ok) throw new Error(`MoMo auth failed: ${res.status} ${await res.text()}`)
  const data = await res.json()
  return data.access_token
}

// --- Request to pay -------------------------------------------------------
export async function requestToPay({ amount, phone, orderId }) {
  const token = await getAccessToken()
  const referenceId = crypto.randomUUID()

  const res = await fetch(`${BASE_URL}/collection/v1_0/requesttopay`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'X-Reference-Id': referenceId,
      'X-Target-Environment': TARGET_ENV,
      'Ocp-Apim-Subscription-Key': SUBSCRIPTION_KEY,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      amount: String(amount),
      currency: TARGET_ENV === 'sandbox' ? 'EUR' : 'RWF', // sandbox only accepts EUR
      externalId: orderId,
      payer: { partyIdType: 'MSISDN', partyId: phone.replace(/^0/, '250') },
      payerMessage: 'Imboni Car Rentals payment',
      payeeNote: orderId,
    }),
  })

  if (res.status !== 202) {
    throw new Error(`MoMo request-to-pay failed: ${res.status} ${await res.text()}`)
  }

  return { referenceId }
}

// --- Status check ----------------------------------------------------------
export async function checkStatus(referenceId) {
  const token = await getAccessToken()

  const res = await fetch(`${BASE_URL}/collection/v1_0/requesttopay/${referenceId}`, {
    headers: {
      Authorization: `Bearer ${token}`,
      'X-Target-Environment': TARGET_ENV,
      'Ocp-Apim-Subscription-Key': SUBSCRIPTION_KEY,
    },
  })

  if (!res.ok) throw new Error(`MoMo status check failed: ${res.status} ${await res.text()}`)
  const data = await res.json()
  return data.status // PENDING | SUCCESSFUL | FAILED
}
