// CLI entry for `pnpm db:seed`
import { copyFileSync, existsSync, mkdirSync } from 'node:fs'
import { and, eq, isNull } from 'drizzle-orm'
import { createDb } from '../../utils/db'
import { schools } from '../schema'
import { DEMO_PASSWORD } from './demo-password'
import { seed } from './seed'

if (existsSync('.env')) process.loadEnvFile()

const url = process.env.DATABASE_URL
if (!url) throw new Error('DATABASE_URL is not set')

const db = createDb(url)
try {
  await seed(db)
  // Greenfield's demo logo, into the same uploads folder the app reads (nuxt.config.ts: ./.data/uploads), unless
  // the school already has one. Only here, not in seed(): tests and E2E must not write to the dev uploads.
  const [greenfield] = await db.select({ id: schools.id }).from(schools).where(and(eq(schools.slug, 'greenfield'), isNull(schools.logoKey)))
  if (greenfield) {
    const key = `schools/${greenfield.id}/logo.png`
    mkdirSync(`.data/uploads/schools/${greenfield.id}`, { recursive: true })
    copyFileSync('docs/demo/greenfield-emblem.png', `.data/uploads/${key}`)
    await db.update(schools).set({ logoKey: key, logoUpdatedAt: new Date() }).where(eq(schools.id, greenfield.id))
  }
  console.log(`Seeded demo schools (greenfield, sunrise, hillside-suspended), users (password: ${DEMO_PASSWORD}) and school setup (2026/2027 First Term current)`)
}
finally {
  await db.$client.end()
}
