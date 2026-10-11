import { defineEventHandler } from 'h3'

/** Idempotent: 200 whether or not there was a session. */
export default defineEventHandler(async (event) => {
  await clearUserSession(event)
  return { loggedOut: true }
})
