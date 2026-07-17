// Simple in-memory store, keyed by our own orderId.
// Fine for getting real payments working end-to-end during development.
//
// IMPORTANT: this resets whenever the server restarts (including free-tier hosts
// like Render/Railway spinning down after inactivity). Before relying on this in
// production, swap it for a real database (Postgres, SQLite, MongoDB -- whatever
// you're comfortable with) using the same get/set/all shape below so nothing else
// needs to change.

const payments = new Map()

export const paymentStore = {
  create(orderId, data) {
    payments.set(orderId, { orderId, ...data, updatedAt: new Date().toISOString() })
    return payments.get(orderId)
  },
  update(orderId, patch) {
    const existing = payments.get(orderId)
    if (!existing) return null
    const updated = { ...existing, ...patch, updatedAt: new Date().toISOString() }
    payments.set(orderId, updated)
    return updated
  },
  get(orderId) {
    return payments.get(orderId) || null
  },
  all() {
    return Array.from(payments.values())
  },
}
