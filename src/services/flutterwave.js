const BASE_URL = 'https://api.flutterwave.com/v3'
const SECRET_KEY = process.env.FLW_SECRET_KEY

// Flutterwave's Rwanda mobile money charge auto-detects MTN vs Airtel from the
// phone number's prefix, so we don't need to tell it which network to use --
// same call handles both, matching what momo.js / airtel.js do separately.
export async function requestToPay({ amount, phone, orderId }) {
  if (!SECRET_KEY) throw new Error('Missing FLW_SECRET_KEY in .env')

  const res = await fetch(`${BASE_URL}/charges?type=mobile_money_rwanda`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${SECRET_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      phone_number: phone,
      amount,
      currency: 'RWF',
      email: `${orderId}@imbonicarrentals.com`, // Flutterwave requires an email; customer's isn't collected in checkout yet
      tx_ref: orderId,
    }),
  })

  const data = await res.json()
  if (!res.ok || data.status !== 'success') {
    throw new Error(data.message || `Flutterwave charge failed: ${res.status}`)
  }

  return { providerRef: orderId } // tx_ref doubles as our reference, no separate ID needed
}

export async function checkStatus(orderId) {
  if (!SECRET_KEY) throw new Error('Missing FLW_SECRET_KEY in .env')

  const res = await fetch(`${BASE_URL}/transactions/verify_by_reference?tx_ref=${orderId}`, {
    headers: { Authorization: `Bearer ${SECRET_KEY}` },
  })

  if (!res.ok) throw new Error(`Flutterwave status check failed: ${res.status}`)
  const data = await res.json()
  return data?.data?.status // 'successful' | 'failed' | 'pending'
}
