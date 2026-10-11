import { eq } from 'drizzle-orm'
import { beforeAll, describe, expect, it } from 'vitest'
import { users } from '~~/server/database/schema'
import { whereSchool } from '~~/server/utils/tenant'
import type { Db } from '~~/server/utils/db'
import { createTwoSchools } from '../factories/schools'
import { createUser } from '../factories/users'
import { createTestDb } from '../helpers/db'

let db: Db
let schoolA: Awaited<ReturnType<typeof createTwoSchools>>['schoolA']
let schoolB: Awaited<ReturnType<typeof createTwoSchools>>['schoolB']

beforeAll(async () => {
  db = await createTestDb()
  ;({ schoolA, schoolB } = await createTwoSchools(db))
})

describe('whereSchool', () => {
  it('returns only the given school\'s rows', async () => {
    const a1 = await createUser(db, schoolA)
    const a2 = await createUser(db, schoolA)
    await createUser(db, schoolB)

    const rows = await db.select({ id: users.id }).from(users).where(whereSchool(users, schoolA))

    expect(rows.map(r => r.id).sort()).toEqual([a1.id, a2.id].sort())
  })

  it('does not find another school\'s record by id', async () => {
    const bUser = await createUser(db, schoolB)

    const rows = await db.select().from(users).where(whereSchool(users, schoolA, eq(users.id, bUser.id)))

    expect(rows).toEqual([])
  })

  it('finds the record when it belongs to the school', async () => {
    const aUser = await createUser(db, schoolA)

    const rows = await db.select().from(users).where(whereSchool(users, schoolA, eq(users.id, aUser.id)))

    expect(rows.map(r => r.id)).toEqual([aUser.id])
  })
})
