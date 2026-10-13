import { beforeAll, describe, expect, it } from 'vitest'
import type { Db } from '~~/server/utils/db'
import { createTestApp } from '../helpers/app'
import { createTestDb } from '../helpers/db'
import { type FeesFixture, feesFixture, feesRequests } from '../helpers/fees-fixture'

// docs/domain.md: the bursar handles fees, bills, payments, receipts and debtors — nothing academic
let db: Db
let app: ReturnType<typeof createTestApp>
let http: ReturnType<typeof feesRequests>
let f: FeesFixture

beforeAll(async () => {
  db = await createTestDb()
  app = createTestApp(db)
  http = feesRequests(app)
  f = await feesFixture(db, app)
})

describe('the bursar and academics', () => {
  it.each([
    ['GET', '/api/scores/sheets'],
    ['GET', '/api/results/arms'],
    ['GET', '/api/attendance/arms'],
    ['GET', '/api/assignments'],
  ])('%s %s → 403', async (method, path) => {
    expect((await http[method === 'GET' ? 'get' : 'post'](f, f.cookies.bursar, path)).status).toBe(403)
  })

  it('can\'t read or write any academic sheet, register, result or report card', async () => {
    const arm = f.jss1a.id
    const student = f.students.ada.id
    for (const path of [
      `/api/scores/sheet?classArmId=${arm}&subjectId=${f.items.tuition.id}`,
      `/api/ratings/sheet?classArmId=${arm}`,
      `/api/results?classArmId=${arm}`,
      `/api/results/report-cards?classArmId=${arm}`,
      `/api/results/broadsheet?classArmId=${arm}`,
      `/api/attendance/register?classArmId=${arm}`,
      `/api/attendance/summary?classArmId=${arm}`,
      `/api/students/${student}/attendance`,
      `/api/students/${student}/report-card`,
    ]) expect((await http.get(f, f.cookies.bursar, path)).status, path).toBe(403)

    expect((await http.put(f, f.cookies.bursar, '/api/scores/sheet', { termId: f.term.id, classArmId: arm, subjectId: f.items.tuition.id, entries: [] })).status).toBe(403)
    expect((await http.post(f, f.cookies.bursar, '/api/results/submit', { termId: f.term.id, classArmId: arm })).status).toBe(403)
  })

  it('still sees fees', async () => {
    expect((await http.get(f, f.cookies.bursar, '/api/fees/bills')).status).toBe(200)
  })
})
