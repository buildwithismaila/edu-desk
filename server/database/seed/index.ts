// CLI entry for `pnpm db:seed`
import { existsSync } from 'node:fs'
import { createDb } from '../../utils/db'
import { DEMO_PASSWORD } from './demo-password'
import { seed } from './seed'

if (existsSync('.env')) process.loadEnvFile()

const url = process.env.DATABASE_URL
if (!url) throw new Error('DATABASE_URL is not set')

const db = createDb(url)
try {
  await seed(db)
  console.log(`Seeded demo schools (greenfield, sunrise, hillside-suspended), users (password: ${DEMO_PASSWORD}) and school setup (2026/2027 First Term current)`)
}
finally {
  await db.$client.end()
}
