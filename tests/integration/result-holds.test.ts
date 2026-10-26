import { eq } from 'drizzle-orm'
import { beforeAll, describe, expect, it } from 'vitest'
import { schools } from '~~/server/database/schema'
import type { Db } from '~~/server/utils/db'
import { createBill, createPayment } from '../factories/fees'
import { createTestApp } from '../helpers/app'
import { createTestDb } from '../helpers/db'
import { armBody, resultsFixture, resultsRequests, type ResultsFixture, type ResultsRole } from '../helpers/results-fixture'

// Results withheld from parents until fees are paid (docs/features/10d-results-withheld-for-fees.md)

let db: Db
let app: ReturnType<typeof createTestApp>
let http: ReturnType<typeof resultsRequests>

beforeAll(async () => {
  db = await createTestDb()
  app = createTestApp(db)
  http = resultsRequests(app)
})

/**
 * The results fixture with first-term results published and Ada's first-term bill: Tuition ₦50,000, ₦25,000 paid,
 * so ₦25,000 is owed. The school withholds results unless `withhold: false`.
 */
async function setup({ withhold = true } = {}) {
  const f = await resultsFixture(db, app)
  expect((await http.post(f, f.cookies.classTeacher, '/api/results/submit', armBody(f))).status).toBe(200)
  expect((await http.post(f, f.cookies.principal, '/api/results/publish', armBody(f))).status).toBe(200)
  const { ada } = f.students
  const firstBill = await createBill(db, f.school, { term: f.first, student: ada, level: f.level, arm: f.armA, items: [{ name: 'Tuition', amountKobo: 5_000_000 }] })
  await createPayment(db, f.school, { bill: firstBill, student: ada, amountKobo: 2_500_000 })
  if (withhold) await db.update(schools).set({ withholdResultsUntilPaid: true }).where(eq(schools.id, f.school.id))
  return { ...f, firstBill }
}
type Fixture = Awaited<ReturnType<typeof setup>>

const results = async (f: ResultsFixture) => (await http.get(f, f.cookies.parent, `/api/me/children/${f.students.ada.id}/results`)).json()
const reportCard = (f: ResultsFixture, cookie: string) => http.get(f, cookie, `/api/students/${f.students.ada.id}/report-card?termId=${f.first.id}`)
const release = (f: ResultsFixture, cookie: string, method: 'put' | 'del' = 'put') =>
  http[method](f, cookie, `/api/students/${f.students.ada.id}/result-release?termId=${f.first.id}`)

describe('a term whose fees are owed', () => {
  it('is withheld from the parent: no results in the list, the report card refused, the amount owed shown', async () => {
    const f = await setup()

    expect(await results(f)).toEqual([expect.objectContaining({ termId: f.first.id, withheld: true, owedKobo: 2_500_000, average: null, position: null, numberInClass: null })])
    const card = await reportCard(f, f.cookies.parent)
    expect(card.status).toBe(403)
    expect((await card.json()).message).toBe('This result is withheld until fees are paid')
    const [child] = await (await http.get(f, f.cookies.parent, '/api/me/children')).json()
    expect(child.latestReportCard).toEqual({ termId: f.first.id, term: expect.any(String), withheld: true, owedKobo: 2_500_000 })
  })

  it('shows as soon as the fees are paid, and is withheld again if that payment is reversed', async () => {
    const f = await setup()
    const payment = await createPayment(db, f.school, { bill: f.firstBill, student: f.students.ada, amountKobo: 2_500_000 })

    expect(await results(f)).toEqual([expect.objectContaining({ withheld: false, owedKobo: null, average: 68.5 })])
    expect((await reportCard(f, f.cookies.parent)).status).toBe(200)

    await http.post(f, f.cookies.bursar, `/api/fees/payments/${payment.id}/reverse`, { reason: 'Bounced transfer' })
    expect((await reportCard(f, f.cookies.parent)).status).toBe(403)
  })

  it('stays visible to staff, and to every parent when the school doesn\'t withhold results', async () => {
    const f = await setup()
    for (const role of ['admin', 'principal', 'classTeacher'] as const) expect((await reportCard(f, f.cookies[role])).status).toBe(200)

    const off = await setup({ withhold: false })
    expect((await reportCard(off, off.cookies.parent)).status).toBe(200)
    expect(await results(off)).toEqual([expect.objectContaining({ withheld: false, average: 68.5 })])
  })

  it('counts payments against the oldest debt: arrears paid off release the earlier term', async () => {
    const f = await setup()
    // Second term: ₦50,000 of its own plus the ₦25,000 arrears
    const secondBill = await createBill(db, f.school, { term: f.second, student: f.students.ada, level: f.level, arm: f.armA, items: [{ name: 'Tuition', amountKobo: 5_000_000 }], carryForwardKobo: 2_500_000 })
    // ₦75,000 owed: ₦50,000 on the second term, ₦25,000 still on the first
    expect((await reportCard(f, f.cookies.parent)).status).toBe(403)

    // ₦25,000 paid on the new bill clears the first term's debt; the second term still owes ₦50,000
    await createPayment(db, f.school, { bill: secondBill, student: f.students.ada, amountKobo: 2_500_000 })
    expect((await reportCard(f, f.cookies.parent)).status).toBe(200)
  })
})

describe('releasing a withheld result', () => {
  it('shows that term to the parent until withheld again, and lists it for staff', async () => {
    const f = await setup()
    expect((await release(f, f.cookies.bursar)).status).toBe(200)
    expect((await reportCard(f, f.cookies.parent)).status).toBe(200)
    const holds = await (await http.get(f, f.cookies.admin, `/api/students/${f.students.ada.id}/result-holds`)).json()
    expect(holds).toEqual({ enabled: true, terms: [{ termId: f.first.id, term: expect.any(String), owedKobo: 2_500_000, released: { by: f.users.bursar.name, at: expect.any(String) } }] })

    expect((await release(f, f.cookies.admin, 'del')).status).toBe(200)
    expect((await reportCard(f, f.cookies.parent)).status).toBe(403)
    expect((await (await http.get(f, f.cookies.admin, `/api/students/${f.students.ada.id}/result-holds`)).json()).terms[0].released).toBeNull()
  })

  it('needs a published result for that student and term', async () => {
    const f = await setup()
    const res = await http.put(f, f.cookies.admin, `/api/students/${f.students.ada.id}/result-release?termId=${f.second.id}`)
    expect(res.status).toBe(404)
  })

  const ROLES: ResultsRole[] = ['admin', 'bursar', 'principal', 'classTeacher', 'parent']
  it.each(ROLES.map(role => [role, ['admin', 'bursar'].includes(role) ? 200 : 403] as const))('release, withhold again and the holds list as %s → %i', async (role, status) => {
    const f = await setup()
    expect((await release(f, f.cookies[role])).status).toBe(status)
    expect((await release(f, f.cookies[role], 'del')).status).toBe(status)
    expect((await http.get(f, f.cookies[role], `/api/students/${f.students.ada.id}/result-holds`)).status).toBe(status)
  })

  it('needs a login and validates the term', async () => {
    const f = await setup()
    expect((await release(f, '')).status).toBe(401)
    expect((await http.put(f, f.cookies.admin, `/api/students/${f.students.ada.id}/result-release?termId=nope`)).status).toBe(400)
    expect((await http.put(f, f.cookies.admin, `/api/students/${f.students.ada.id}/result-release`)).status).toBe(400)
  })

  it('keeps other schools out (404)', async () => {
    const f = await setup()
    const other: Fixture = await setup()
    for (const method of ['put', 'del'] as const) {
      const res = await http[method](other, other.cookies.admin, `/api/students/${f.students.ada.id}/result-release?termId=${f.first.id}`)
      expect(res.status).toBe(404)
    }
    expect((await http.get(other, other.cookies.admin, `/api/students/${f.students.ada.id}/result-holds`)).status).toBe(404)
    expect((await reportCard(f, f.cookies.parent)).status).toBe(403)
  })
})

describe('the school setting', () => {
  it('is changed by the admin only', async () => {
    const f = await setup({ withhold: false })
    const patch = (cookie: string) => app.request('/api/school/profile', {
      host: `${f.school.slug}.lvh.me:3000`, cookie, method: 'PATCH', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ withholdResultsUntilPaid: true }),
    })
    expect((await patch(f.cookies.bursar)).status).toBe(403)
    const res = await patch(f.cookies.admin)
    expect(res.status).toBe(200)
    expect((await res.json()).withholdResultsUntilPaid).toBe(true)
    expect((await reportCard(f, f.cookies.parent)).status).toBe(403)
  })
})
