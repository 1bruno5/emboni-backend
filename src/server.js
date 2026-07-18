import 'dotenv/config'
import dns from 'dns'
import express from 'express'
import cors from 'cors'
import paymentsRouter from './routes/payments.js'

// Fixes a common Windows issue where Node tries IPv6 first, hangs on a broken
// IPv6 path, and times out -- while browsers fall back to IPv4 much faster.
// This forces Node to prefer IPv4, matching what your browser already does.
dns.setDefaultResultOrder('ipv4first')

const app = express()

app.use(cors({ origin: process.env.FRONTEND_ORIGIN || '*' }))
app.use(express.json())

app.get('/', (_req, res) => {
  res.json({ status: 'ok', service: 'imboni-backend' })
})

app.use('/api/payments', paymentsRouter)

const PORT = process.env.PORT || 4000
app.listen(PORT, () => {
  console.log(`Imboni backend listening on port ${PORT}`)
})
