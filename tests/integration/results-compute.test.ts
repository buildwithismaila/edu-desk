import { eq } from 'drizzle-orm'
import { beforeAll, describe, expect, it } from 'vitest'
import { studentEnrolments, students } from '~~/server/database/schema'
import type { Db } from '~~/server/utils/db'
import { createTestApp } from '../helpers/app'
import { createTestDb } from '../helpers/db'
import { armQuery, resultsFixture, resultsRequests } from '../helpers/results-fixture'

let db: Db
let app: ReturnType<typeof createTestApp>
let http: ReturnType<typeof resultsRequests>

beforeAll(async () => {
  db = await createTestDb()
  app = createTestApp(db)
  http = resultsRequests(app)
})

type Row = { name: string, total: number | null, offered: number, average: number | null, position: number | null }
const rows = (body: { students: Row[] }) => body.students.map(s => [s.name, s.total, s.offered, s.average, s.position])

describe('live results', () => {
  it('match the hand-calculated example: totals, averages over offered subjects, competition ranking', async () => {
    const f = await resultsFixture(db, app)
    const body = await (await http.get(f, f.cookies.classTeacher, `/api/results?${armQuery(f)}`)).json()

    expect(body).toMatchObject({ status: 'draft', mode: 'scores', showPositions: true, numberInClass: 3, completeness: [] })
    expect(rows(body)).toEqual([
      ['Chidi Eze', 180, 2, 90, 1],
      ['Ada Obi', 137, 2, 68.5, 2],
      ['Bola Ade', 137, 2, 68.5, 2],
    ])
  })

  it('computes the third-term cumulative average from the session\'s term averages', async () => {
    const f = await resultsFixture(db, app)
    // Ada: first term 68.5 (fixture); second 20+20+60 = 100; third 10+10+30 = 50 → (68.5 + 100 + 50) / 3 = 72.83
    await f.scores(f.second, f.students.ada, f.maths, [20, 20, 60])
    await f.scores(f.third, f.students.ada, f.maths, [10, 10, 30])

    const card = async (term: { id: string }) =>
      (await (await http.get(f, f.cookies.admin, `/api/students/${f.students.ada.id}/report-card?termId=${term.id}`)).json()).summary
    expect(await card(f.third)).toMatchObject({ average: 50, cumulativeAverage: 72.83 })
    expect((await card(f.first)).cumulativeAverage).toBeNull()
  })

  it('keeps a student\'s scores when they move arm mid-term, and leaves out removed students', async () => {
    const f = await resultsFixture(db, app)
    await db.update(studentEnrolments).set({ classArmId: f.armB.id }).where(eq(studentEnrolments.studentId, f.students.bola.id))
    await db.update(students).set({ deletedAt: new Date() }).where(eq(students.id, f.students.chidi.id))

    const inA = await (await http.get(f, f.cookies.admin, `/api/results?${armQuery(f)}`)).json()
    expect(rows(inA)).toEqual([['Ada Obi', 137, 2, 68.5, 1]])
    expect(inA.numberInClass).toBe(1)

    const inB = await (await http.get(f, f.cookies.admin, `/api/results?${armQuery(f, f.armB)}`)).json()
    // Dayo has no scores: listed, not ranked
    expect(rows(inB)).toEqual([['Bola Ade', 137, 2, 68.5, 1], ['Dayo Lawal', null, 0, null, null]])
  })
})
