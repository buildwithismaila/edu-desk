import { beforeAll, describe, expect, it } from 'vitest'
import { academicSessions, gradeBands, subjects, terms } from '~~/server/database/schema'
import type { Db } from '~~/server/utils/db'
import { createDepartment, createSession } from '../factories/academics'
import { createTwoSchools } from '../factories/schools'
import { createTestDb } from '../helpers/db'

// Database-level guarantees, independent of route code
let db: Db

beforeAll(async () => {
  db = await createTestDb()
})

describe('academics constraints', () => {
  it('allows at most one current session per school', async () => {
    const { schoolA } = await createTwoSchools(db)
    await createSession(db, schoolA, { name: '2025/2026', isCurrent: true })

    await expect(db.insert(academicSessions).values({ schoolId: schoolA.id, name: '2026/2027', isCurrent: true })).rejects.toThrow()
  })

  it('allows each school its own current session', async () => {
    const { schoolA, schoolB } = await createTwoSchools(db)
    await createSession(db, schoolA, { name: '2026/2027', isCurrent: true })

    await expect(createSession(db, schoolB, { name: '2026/2027', isCurrent: true })).resolves.toBeDefined()
  })

  it('allows at most one current term per school, even across sessions', async () => {
    const { schoolA } = await createTwoSchools(db)
    const older = await createSession(db, schoolA, { name: '2025/2026', currentTerm: 'third' })
    const newer = await createSession(db, schoolA, { name: '2026/2027' })
    expect(older.terms.find(t => t.number === 'third')!.isCurrent).toBe(true)

    await expect(db.insert(terms).values({ schoolId: schoolA.id, sessionId: newer.session.id, number: 'first', isCurrent: true })).rejects.toThrow()
  })

  it('rejects a duplicate session name in a school', async () => {
    const { schoolA } = await createTwoSchools(db)
    await createSession(db, schoolA, { name: '2026/2027' })

    await expect(createSession(db, schoolA, { name: '2026/2027' })).rejects.toThrow()
  })

  it('rejects a department on a non-SSS subject', async () => {
    const { schoolA } = await createTwoSchools(db)
    const science = await createDepartment(db, schoolA, 'Science')

    await expect(db.insert(subjects).values({ schoolId: schoolA.id, section: 'jss', name: 'Physics', departmentId: science.id })).rejects.toThrow()
    await expect(db.insert(subjects).values({ schoolId: schoolA.id, section: 'sss', name: 'Physics', departmentId: science.id })).resolves.toBeDefined()
  })

  it('rejects nursery grade bands and out-of-range scores', async () => {
    const { schoolA } = await createTwoSchools(db)
    const band = { schoolId: schoolA.id, grade: 'A', minScore: 0, maxScore: 100, sortOrder: 0 }

    await expect(db.insert(gradeBands).values({ ...band, section: 'nursery' })).rejects.toThrow()
    await expect(db.insert(gradeBands).values({ ...band, section: 'jss', maxScore: 101 })).rejects.toThrow()
    await expect(db.insert(gradeBands).values({ ...band, section: 'jss', minScore: 60, maxScore: 50 })).rejects.toThrow()
  })
})
