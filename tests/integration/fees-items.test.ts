import { and, eq } from 'drizzle-orm'
import { beforeAll, describe, expect, it } from 'vitest'
import { feeItems } from '~~/server/database/schema'
import type { Db } from '~~/server/utils/db'
import { createTestApp } from '../helpers/app'
import { createTestDb } from '../helpers/db'
import { type FeesFixture, feesFixture, feesRequests, type FeesRole } from '../helpers/fees-fixture'

let db: Db
let app: ReturnType<typeof createTestApp>
let http: ReturnType<typeof feesRequests>

beforeAll(async () => {
  db = await createTestDb()
  app = createTestApp(db)
  http = feesRequests(app)
})

const itemsOf = (f: FeesFixture, term = f.term, level = f.jss1) =>
  db.select().from(feeItems).where(and(eq(feeItems.termId, term.id), eq(feeItems.classLevelId, level.id)))

describe('permissions', () => {
  let f: FeesFixture
  beforeAll(async () => {
    f = await feesFixture(db, app)
  })
  const ROLES: FeesRole[] = ['admin', 'bursar', 'principal', 'teacher', 'parent']

  it.each(ROLES.map(role => [role, ['teacher', 'parent'].includes(role) ? 403 : 200] as const))('GET /api/fees/items as %s → %i', async (role, status) => {
    expect((await http.get(f, f.cookies[role], '/api/fees/items')).status).toBe(status)
  })

  it.each(ROLES.map(role => [role, ['admin', 'bursar'].includes(role) ? 200 : 403] as const))('PUT /api/fees/items as %s → %i', async (role, status) => {
    const res = await http.put(f, f.cookies[role], '/api/fees/items', { termId: f.second.id, classLevelId: f.sss1.id, items: [{ name: 'Tuition', amount: '1000', optional: false }] })
    expect(res.status).toBe(status)
  })

  it.each(['principal', 'teacher', 'parent'] as const)('POST /api/fees/items/copy as %s → 403', async (role) => {
    expect((await http.post(f, f.cookies[role], '/api/fees/items/copy', { fromTermId: f.term.id, toTermId: f.lastThird.id })).status).toBe(403)
  })

  it('returns 401 without a session', async () => {
    expect((await http.get(f, undefined, '/api/fees/items')).status).toBe(401)
  })
})

describe('GET /api/fees/items', () => {
  it('lists every class level with its items for the current term', async () => {
    const f = await feesFixture(db, app)
    const body = await (await http.get(f, f.cookies.principal, '/api/fees/items')).json()
    expect(body.term).toMatchObject({ id: f.term.id, label: 'First Term 2026/2027' })
    expect(body.levels.map((l: { name: string }) => l.name)).toEqual(['JSS 1', 'SSS 1'])
    // Same sort order (the factory's 0) → by name
    expect(body.levels[0].items).toEqual([
      { id: f.items.bus.id, name: 'Bus', amountKobo: 2_500_000, optional: true },
      { id: f.items.pta.id, name: 'PTA', amountKobo: 250_000, optional: false },
      { id: f.items.tuition.id, name: 'Tuition', amountKobo: 8_500_000, optional: false },
    ])
  })
})

describe('PUT /api/fees/items', () => {
  it('replaces a level\'s items in kobo, keeping same-name items\' ids and removing the rest', async () => {
    const f = await feesFixture(db, app)
    const res = await http.put(f, f.cookies.bursar, '/api/fees/items', {
      termId: f.term.id, classLevelId: f.jss1.id,
      items: [{ name: 'tuition', amount: '90,000', optional: false }, { name: 'Books', amount: '15,000.50', optional: false }],
    })
    expect(res.status).toBe(200)

    const rows = await itemsOf(f)
    expect(rows.map(r => [r.name, r.amountKobo, r.optional, r.sortOrder]).sort()).toEqual([['Books', 1_500_050, false, 1], ['tuition', 9_000_000, false, 0]])
    expect(rows.find(r => r.name === 'tuition')!.id).toBe(f.items.tuition.id)
    // SSS 1 untouched
    expect(await itemsOf(f, f.term, f.sss1)).toHaveLength(1)
  })

  it('refuses invalid amounts and duplicate names', async () => {
    const f = await feesFixture(db, app)
    const put = (items: unknown[]) => http.put(f, f.cookies.bursar, '/api/fees/items', { termId: f.term.id, classLevelId: f.jss1.id, items })
    for (const items of [
      [{ name: 'Tuition', amount: '0', optional: false }],
      [{ name: 'Tuition', amount: '-5', optional: false }],
      [{ name: 'Tuition', amount: '1.234', optional: false }],
      [{ name: 'Bus', amount: '1', optional: true }, { name: 'BUS', amount: '2', optional: true }],
    ]) expect((await put(items)).status).toBe(400)
    expect(await itemsOf(f)).toHaveLength(3)
  })
})

describe('POST /api/fees/items/copy', () => {
  it('copies every level\'s items to a term without items, and refuses one that has some', async () => {
    const f = await feesFixture(db, app)
    const res = await http.post(f, f.cookies.bursar, '/api/fees/items/copy', { fromTermId: f.term.id, toTermId: f.second.id })
    expect(res.status).toBe(200)
    expect((await itemsOf(f, f.second)).map(i => [i.name, i.amountKobo, i.optional]).sort()).toEqual([['Bus', 2_500_000, true], ['PTA', 250_000, false], ['Tuition', 8_500_000, false]])

    expect((await http.post(f, f.cookies.bursar, '/api/fees/items/copy', { fromTermId: f.term.id, toTermId: f.second.id })).status).toBe(409)
    expect((await http.post(f, f.cookies.bursar, '/api/fees/items/copy', { fromTermId: f.lastThird.id, toTermId: f.lastThird.id })).status).toBe(400)
  })
})

describe('tenant isolation', () => {
  it('treats another school\'s term and level as not found', async () => {
    const a = await feesFixture(db, app)
    const b = await feesFixture(db, app)
    expect((await http.get(b, b.cookies.bursar, `/api/fees/items?termId=${a.term.id}`)).status).toBe(404)
    expect((await http.put(b, b.cookies.bursar, '/api/fees/items', { termId: b.term.id, classLevelId: a.jss1.id, items: [] })).status).toBe(404)
    expect(await itemsOf(a)).toHaveLength(3)
    expect((await http.get(b, a.cookies.bursar, '/api/fees/items')).status).toBe(401)
  })
})
