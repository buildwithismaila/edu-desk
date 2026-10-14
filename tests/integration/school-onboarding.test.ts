import { eq } from 'drizzle-orm'
import { beforeAll, describe, expect, it } from 'vitest'
import { assessmentComponents, classLevels, schools, users } from '~~/server/database/schema'
import { createSchoolWithAdmin } from '~~/server/services/school-onboarding'
import type { Db } from '~~/server/utils/db'
import { hashPasswordScrypt } from '~~/server/utils/scrypt-hash'
import { createSchool } from '../factories/schools'
import { createTestApp } from '../helpers/app'
import { createTestDb } from '../helpers/db'
import { verifyPassword } from '../helpers/nitro-imports'

let db: Db
let app: ReturnType<typeof createTestApp>

beforeAll(async () => {
  db = await createTestDb()
  app = createTestApp(db)
})

const input = (slug: string) => ({ slug, name: 'St. Mary\'s College', admin: { name: 'Mrs Bisi Adeyemi', email: `owner@${slug}.test`, phone: '08031234567' } })

describe('hashPasswordScrypt', () => {
  it('makes hashes the app\'s login accepts (same scrypt format as nuxt-auth-utils)', async () => {
    const hash = await hashPasswordScrypt('Temp-pass-23')
    expect(hash).toMatch(/^\$scrypt\$n=16384,r=8,p=1\$[A-Za-z0-9+/]+\$[A-Za-z0-9+/]+$/)
    expect(await verifyPassword(hash, 'Temp-pass-23')).toBe(true)
    expect(await verifyPassword(hash, 'wrong')).toBe(false)
    expect(await hashPasswordScrypt('Temp-pass-23')).not.toBe(hash)
  })
})

describe('createSchoolWithAdmin', () => {
  it('creates the school with its defaults and an admin who logs in with a one-time password', async () => {
    const result = await createSchoolWithAdmin(db, input('st-marys'))

    expect(result.school).toMatchObject({ slug: 'st-marys', name: 'St. Mary\'s College', status: 'active' })
    expect(result.temporaryPassword).toMatch(/^[A-Za-z0-9]{10}$/)
    // Defaults: class levels, assessment split and grading
    expect((await db.select().from(classLevels).where(eq(classLevels.schoolId, result.school.id))).length).toBeGreaterThan(0)
    expect((await db.select().from(assessmentComponents).where(eq(assessmentComponents.schoolId, result.school.id))).length).toBeGreaterThan(0)
    const [admin] = await db.select().from(users).where(eq(users.schoolId, result.school.id))
    expect(admin).toMatchObject({ role: 'admin', name: 'Mrs Bisi Adeyemi', email: 'owner@st-marys.test', phone: '+2348031234567', mustChangePassword: true, isActive: true })

    const res = await app.postJson('/api/auth/login', { login: 'owner@st-marys.test', password: result.temporaryPassword }, { host: 'st-marys.lvh.me:3000' })
    expect(res.status).toBe(200)
    expect((await res.json()).user).toMatchObject({ role: 'admin', mustChangePassword: true })
  })

  it('refuses a taken slug without creating anything', async () => {
    await createSchool(db, { slug: 'taken-name' })
    await expect(createSchoolWithAdmin(db, input('taken-name'))).rejects.toThrow('A school called "taken-name" already exists')
    expect(await db.select().from(users).where(eq(users.email, 'owner@taken-name.test'))).toEqual([])
  })

  it('refuses reserved or malformed slugs and bad admin details', async () => {
    await expect(createSchoolWithAdmin(db, input('admin'))).rejects.toThrow('"admin" is reserved')
    await expect(createSchoolWithAdmin(db, input('Bad Slug'))).rejects.toThrow('Use 3–40 lowercase letters')
    await expect(createSchoolWithAdmin(db, { ...input('ok-school'), name: ' ' })).rejects.toThrow('School name')
    await expect(createSchoolWithAdmin(db, { ...input('ok-school'), admin: { name: 'X Y', email: 'not-an-email', phone: null } })).rejects.toThrow('email')
    expect(await db.select().from(schools).where(eq(schools.slug, 'ok-school'))).toEqual([])
  })

  it('is all-or-nothing: a failure while creating the admin leaves no school behind', async () => {
    const failingHash = async () => {
      throw new Error('hash failed')
    }
    await expect(createSchoolWithAdmin(db, input('half-made'), failingHash)).rejects.toThrow('hash failed')
    expect(await db.select().from(schools).where(eq(schools.slug, 'half-made'))).toEqual([])
  })
})
