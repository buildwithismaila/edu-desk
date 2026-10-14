// pnpm school:create --slug greenfield --name "Greenfield Academy" --admin-name "Adaeze Okafor" \
//   --admin-email owner@example.com [--admin-phone 08031234567]
// In production: docker compose run --rm tools school:create --slug ... (docs/deploy.md)
import { existsSync } from 'node:fs'
import { parseArgs } from 'node:util'
import { createSchoolWithAdmin } from '../server/services/school-onboarding'
import { createDb } from '../server/utils/db'

if (existsSync('.env')) process.loadEnvFile()

const { values } = parseArgs({
  options: {
    'slug': { type: 'string' },
    'name': { type: 'string' },
    'admin-name': { type: 'string' },
    'admin-email': { type: 'string' },
    'admin-phone': { type: 'string' },
  },
})
const missing = ['slug', 'name', 'admin-name', 'admin-email'].filter(key => !values[key as keyof typeof values])
if (missing.length) {
  console.error(`Missing: ${missing.map(m => `--${m}`).join(', ')}\n`
    + 'Usage: pnpm school:create --slug greenfield --name "Greenfield Academy" --admin-name "Adaeze Okafor" --admin-email owner@example.com [--admin-phone 08031234567]')
  process.exit(1)
}
const url = process.env.DATABASE_URL
if (!url) throw new Error('DATABASE_URL is not set')

const db = createDb(url)
try {
  const { school, admin, temporaryPassword } = await createSchoolWithAdmin(db, {
    slug: values.slug!,
    name: values.name!,
    admin: { name: values['admin-name']!, email: values['admin-email']!, phone: values['admin-phone'] ?? null },
  })
  const domain = process.env.NUXT_APP_DOMAIN || 'lvh.me'
  console.log(`
Created ${school.name}
  Address:   https://${school.slug}.${domain}
  Admin:     ${admin.name} <${admin.email}>
  Password:  ${temporaryPassword}   (one-time: they must change it at first login)

Give the password to the admin privately. It is not stored anywhere and won't be shown again.`)
}
catch (error) {
  console.error(`Could not create the school: ${error instanceof Error ? error.message : error}`)
  process.exitCode = 1
}
finally {
  await db.$client.end()
}
