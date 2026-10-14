import { sql } from 'drizzle-orm'
import { createError, defineEventHandler } from 'h3'
import { useDb } from '../utils/db'

/** Uptime check (no school needed): ok when the database answers, 503 otherwise. */
export default defineEventHandler(async () => {
  try {
    await useDb().execute(sql`select 1`)
  }
  catch {
    throw createError({ statusCode: 503, statusMessage: 'Service Unavailable', message: 'Database unavailable' })
  }
  return { ok: true }
})
