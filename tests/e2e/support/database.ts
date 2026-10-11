import { existsSync } from 'node:fs'

/**
 * E2E runs against its own database so it never touches dev data:
 * `E2E_DATABASE_URL` if set, else `DATABASE_URL` with the database renamed to `edudesk_test`.
 */
export function e2eDatabaseUrl(): string {
  if (existsSync('.env')) process.loadEnvFile()
  if (process.env.E2E_DATABASE_URL) return process.env.E2E_DATABASE_URL

  const base = process.env.DATABASE_URL
  if (!base) throw new Error('Set DATABASE_URL (or E2E_DATABASE_URL) before running E2E tests')
  const url = new URL(base)
  url.pathname = '/edudesk_test'
  return url.toString()
}
