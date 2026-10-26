// Demo kit (docs/demo/DEMO-SCRIPT.md). Runs Edu Desk from your laptop with the Greenfield demo school, in its own
// database (edudesk_demo), so your dev data is never touched and no internet is needed.
//
//   pnpm demo:reset          fresh demo database: drop, migrate, seed (do this before every demo or rehearsal)
//   pnpm demo:start          start the demo at http://localhost:4000 (run `pnpm build` once first)
//   pnpm demo:start --lan    also reachable from phones on the same Wi-Fi, at http://<laptop-ip>:4000
import { spawn } from 'node:child_process'
import { copyFileSync, existsSync, mkdirSync, readFileSync } from 'node:fs'
import { networkInterfaces } from 'node:os'
import { fileURLToPath } from 'node:url'
import { and, eq, isNull, sql } from 'drizzle-orm'
import { drizzle } from 'drizzle-orm/postgres-js'
import { migrate } from 'drizzle-orm/postgres-js/migrator'
import postgres from 'postgres'
import * as schema from '../server/database/schema'
import { seed } from '../server/database/seed/seed'
import { DB_CASING } from '../server/utils/db'
import { SCHOOL_TIME_ZONE, todayIn } from '../shared/utils/dates'

const PORT = 4000
const DEMO_DB = 'edudesk_demo'
const migrationsFolder = fileURLToPath(new URL('../server/database/migrations', import.meta.url))

if (existsSync('.env')) process.loadEnvFile()

function demoDatabaseUrl() {
  const base = process.env.DATABASE_URL
  if (!base) throw new Error('DATABASE_URL is not set (in .env)')
  const url = new URL(base)
  url.pathname = `/${DEMO_DB}`
  return url
}

async function reset() {
  const url = demoDatabaseUrl()
  const adminUrl = new URL(url)
  adminUrl.pathname = '/postgres'
  const admin = postgres(adminUrl.toString(), { max: 1, onnotice: () => {} })
  try {
    // A clean slate: anything done in the last demo (payments, published results, new logins) is gone
    await admin.unsafe(`drop database if exists "${DEMO_DB}" with (force)`)
    await admin.unsafe(`create database "${DEMO_DB}"`)
  }
  finally {
    await admin.end()
  }

  const client = postgres(url.toString(), { max: 1, onnotice: () => {} })
  try {
    const db = drizzle({ client, schema, casing: DB_CASING })
    await migrate(db, { migrationsFolder })
    await seed(db)
    // Today must be inside the current term so a register can be taken live
    const today = todayIn(SCHOOL_TIME_ZONE)
    await db.update(schema.terms)
      .set({ startsOn: sql`least(${schema.terms.startsOn}, ${today}::date)`, endsOn: sql`greatest(${schema.terms.endsOn}, ${today}::date)` })
      .where(eq(schema.terms.isCurrent, true))
    // Greenfield's logo, in the uploads folder the app reads (./.data/uploads)
    const [greenfield] = await db.select({ id: schema.schools.id }).from(schema.schools)
      .where(and(eq(schema.schools.slug, 'greenfield'), isNull(schema.schools.logoKey)))
    if (greenfield) {
      const key = `schools/${greenfield.id}/logo.png`
      mkdirSync(`.data/uploads/schools/${greenfield.id}`, { recursive: true })
      copyFileSync('docs/demo/greenfield-emblem.png', `.data/uploads/${key}`)
      await db.update(schema.schools).set({ logoKey: key, logoUpdatedAt: new Date() }).where(eq(schema.schools.id, greenfield.id))
    }
  }
  finally {
    await client.end()
  }
  console.log(`Demo database "${DEMO_DB}" is fresh. Start it with: pnpm demo:start`)
}

function lanAddress() {
  for (const list of Object.values(networkInterfaces())) {
    for (const net of list ?? []) {
      if (net.family === 'IPv4' && !net.internal && !net.address.startsWith('169.254.')) return net.address
    }
  }
  return null
}

function start(lan: boolean) {
  if (!existsSync('.output/server/index.mjs')) throw new Error('No build yet: run `pnpm build` first')
  const preset = JSON.parse(readFileSync('.output/nitro.json', 'utf8')).preset as string
  if (preset !== 'node-server') throw new Error(`The current build is for "${preset}". Run \`pnpm build\` (without NITRO_PRESET) first`)
  const session = process.env.NUXT_SESSION_PASSWORD
  if (!session) throw new Error('NUXT_SESSION_PASSWORD is not set (in .env)')

  // One school (Greenfield) on the bare address, so http://localhost works without school subdomains
  const ip = lan ? lanAddress() : null
  if (lan && !ip) throw new Error('No Wi-Fi/LAN address found. Connect to a network, or start without --lan')
  const domain = ip ?? 'localhost'
  const child = spawn(process.execPath, ['.output/server/index.mjs'], {
    stdio: 'inherit',
    env: {
      ...process.env,
      DATABASE_URL: demoDatabaseUrl().toString(),
      HOST: ip ? '0.0.0.0' : '127.0.0.1',
      PORT: String(PORT),
      NUXT_APP_DOMAIN: domain,
      NUXT_DEFAULT_SCHOOL_SLUG: 'greenfield',
      // Plain http on a laptop: the login cookie can't be Secure-only
      NUXT_SESSION_COOKIE_SECURE: 'false',
    },
  })
  console.log(`
Edu Desk demo (Greenfield Academy): http://${domain}:${PORT}
  Logins (password: password123)
    admin@greenfield.test      Proprietor / admin
    principal@greenfield.test  Principal
    teacher@greenfield.test    Class teacher, JSS 1A
    bursar@greenfield.test     Bursar
    08031110001                Parent (Ngozi Eze, two children)
  Stop with Ctrl+C. Walkthrough: docs/demo/DEMO-SCRIPT.md
`)
  child.on('exit', code => process.exit(code ?? 0))
}

const [command, ...args] = process.argv.slice(2)
if (command === 'reset') await reset()
else if (command === 'start') start(args.includes('--lan'))
else {
  console.error('Usage: pnpm demo:reset | pnpm demo:start [--lan]')
  process.exit(1)
}
