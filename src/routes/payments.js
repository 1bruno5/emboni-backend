import { Router } from 'express'
import * as momo from '../services/momo.js'
import * as airtel from '../services/airtel.js'
import * as flutterwave from '../services/flutterwave.js'
import * as pesapal from '../services/pesapal.js'
import { paymentStore } from '../services/paymentStore.js'

const router = Router()

// 'pesapal' | 'flutterwave' | 'none'. 'none' calls MTN/Airtel directly.
// Change this single value to switch payment processors -- no frontend changes needed.
const AGGREGATOR = process.env.AGGREGATOR || 'pesapal'

function getClient(provider) {
  if (AGGREGATOR === 'pesapal') return pesapal
  if (AGGREGATOR === 'flutterwave') return flutterwave
  return provider === 'momo' ? momo : airtel
}

// POST /api/payments/request-to-pay
// body: { provider: 'momo' | 'airtel', phone, amount, orderId, callbackUrl? }
//
// Response shape differs by processor:
//   - momo / airtel / flutterwave: { orderId, status: 'PENDING' } -- frontend
//     polls /status/:orderId while the customer approves on their phone.
//   - pesapal: { orderId, status: 'REDIRECT', redirectUrl } -- frontend must
//     navigate the browser to redirectUrl; Pesapal handles the rest on its own
//     hosted page, then sends the customer back to callbackUrl.
router.post('/request-to-pay', async (req, res) => {
  const { provider, phone, amount, orderId, callbackUrl } = req.body || {}

  if (!provider || !phone || !amount || !orderId) {
    return res.status(400).json({ error: 'provider, phone, amount, and orderId are all required' })
  }
  if (!['momo', 'airtel'].includes(provider)) {
    return res.status(400).json({ error: "provider must be 'momo' or 'airtel'" })
  }
  if (AGGREGATOR === 'pesapal' && !callbackUrl) {
    return res.status(400).json({ error: 'callbackUrl is required when using Pesapal' })
  }

  try {
    const client = getClient(provider)
    const result = await client.requestToPay
      ? await client.requestToPay({ amount, phone, orderId })
      : await client.submitOrder({ amount, phone, orderId, callbackUrl })

    const providerRef = result.referenceId || result.transactionId || result.providerRef

    paymentStore.create(orderId, {
      provider,
      processor: AGGREGATOR === 'none' ? provider : AGGREGATOR,
      phone,
      amount,
      providerRef,
      status: 'PENDING',
    })

    if (result.redirectUrl) {
      return res.json({ orderId, status: 'REDIRECT', redirectUrl: result.redirectUrl })
    }
    res.json({ orderId, status: 'PENDING' })
  } catch (err) {
    console.error(err)
    res.status(502).json({ error: err.message })
  }
})

// GET /api/payments/status/:orderId
// Frontend polls this until status is SUCCESSFUL or FAILED.
router.get('/status/:orderId', async (req, res) => {
  const record = paymentStore.get(req.params.orderId)
  if (!record) return res.status(404).json({ error: 'Order not found' })

  // If already resolved (e.g. a webhook already updated it), just return it.
  if (record.status !== 'PENDING') {
    return res.json({ orderId: record.orderId, status: record.status })
  }

  try {
    const client =
      record.processor === 'pesapal' ? pesapal
      : record.processor === 'flutterwave' ? flutterwave
      : record.provider === 'momo' ? momo : airtel

    const rawStatus = await client.checkStatus(record.providerRef)

    const normalized =
      ['SUCCESSFUL', 'TS', 'successful', 'COMPLETED'].includes(rawStatus) ? 'SUCCESSFUL'
      : ['FAILED', 'TF', 'failed', 'INVALID', 'REVERSED'].includes(rawStatus) ? 'FAILED'
      : 'PENDING'

    const updated = paymentStore.update(req.params.orderId, { status: normalized })
    res.json({ orderId: updated.orderId, status: updated.status })
  } catch (err) {
    console.error(err)
    res.status(502).json({ error: err.message })
  }
})

// --- Webhooks -----------------------------------------------------------
router.post('/webhook/momo', (req, res) => {
  console.log('MoMo webhook received:', JSON.stringify(req.body))
  const { externalId, status } = req.body || {}
  if (externalId) paymentStore.update(externalId, { status: status || 'SUCCESSFUL' })
  res.sendStatus(200)
})

router.post('/webhook/airtel', (req, res) => {
  console.log('Airtel webhook received:', JSON.stringify(req.body))
  const { reference, status } = req.body?.transaction || {}
  if (reference) paymentStore.update(reference, { status: status || 'SUCCESSFUL' })
  res.sendStatus(200)
})

router.post('/webhook/flutterwave', (req, res) => {
  console.log('Flutterwave webhook received:', JSON.stringify(req.body))
  const { tx_ref, status } = req.body?.data || {}
  if (tx_ref) {
    paymentStore.update(tx_ref, { status: status === 'successful' ? 'SUCCESSFUL' : 'FAILED' })
  }
  res.sendStatus(200)
})

// Pesapal's IPN never includes the actual status (by design, for security) --
// it just tells us "something changed", so we look the real status up ourselves.
router.get('/webhook/pesapal', async (req, res) => {
  console.log('Pesapal IPN received:', JSON.stringify(req.query))
  const { OrderTrackingId, OrderMerchantReference } = req.query || {}

  if (OrderTrackingId && OrderMerchantReference) {
    try {
      const rawStatus = await pesapal.checkStatus(OrderTrackingId)
      const normalized = rawStatus === 'COMPLETED' ? 'SUCCESSFUL' : rawStatus === 'PENDING' ? 'PENDING' : 'FAILED'
      paymentStore.update(OrderMerchantReference, { status: normalized })
    } catch (err) {
      console.error('Failed to resolve Pesapal IPN status:', err.message)
    }
  }
  res.sendStatus(200)
})

export default router
