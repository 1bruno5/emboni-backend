// Run once, after you have MOMO_SUBSCRIPTION_KEY in your .env:
//   node src/provision-momo-sandbox.js
// It prints an API User + API Key -- copy both into your .env as
// MOMO_API_USER and MOMO_API_KEY, then you're ready to call requestToPay.
import 'dotenv/config'
import { provisionSandboxUser } from './services/momo.js'

try {
  const { apiUser, apiKey } = await provisionSandboxUser()
  console.log('\nSandbox provisioning succeeded! Add these to your .env:\n')
  console.log(`MOMO_API_USER=${apiUser}`)
  console.log(`MOMO_API_KEY=${apiKey}\n`)
} catch (err) {
  console.error('Provisioning failed:', err.message)
  process.exit(1)
}
