import 'dotenv/config'
import express from 'express'
import cors from 'cors'
import paymentsRouter from './routes/payments.js'

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
