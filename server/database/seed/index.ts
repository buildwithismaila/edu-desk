// CLI entry for `pnpm db:seed`
import { existsSync } from 'node:fs'
import { createDb } from '../../utils/db'
import { seed } from './seed'

if (existsSync('.env')) process.loadEnvFile()

const url = process.env.DATABASE_URL
if (!url) throw new Error('DATABASE_URL is not set')

const db = createDb(url)
try {
  await seed(db)
  console.log('Seeded demo schools: greenfield, sunrise, hillside (suspended)')
}
finally {
  await db.$client.end()
}
