import type { Section, TermNumber } from '~~/shared/constants/academics'
import { TERM_NUMBERS } from '~~/shared/constants/academics'
import { academicSessions, classArms, classLevels, departments, type School, subjects, terms } from '~~/server/database/schema'
import type { Db } from '~~/server/utils/db'

type SchoolRef = Pick<School, 'id'>

let counter = 0
const next = () => ++counter

/** A session with its three terms; `currentTerm` also makes the session current. */
export async function createSession(db: Db, school: SchoolRef, { name, isCurrent, currentTerm }: { name?: string, isCurrent?: boolean, currentTerm?: TermNumber } = {}) {
  const year = 2100 + next()
  const [session] = await db.insert(academicSessions).values({
    schoolId: school.id,
    name: name ?? `${year}/${year + 1}`,
    isCurrent: isCurrent ?? !!currentTerm,
  }).returning()
  const created = await db.insert(terms).values(TERM_NUMBERS.map(number => ({
    schoolId: school.id,
    sessionId: session!.id,
    number,
    isCurrent: number === currentTerm,
  }))).returning()
  return { session: session!, terms: created }
}

export async function createClassLevel(db: Db, school: SchoolRef, { section = 'jss', name }: { section?: Section, name?: string } = {}) {
  const n = next()
  const [level] = await db.insert(classLevels).values({ schoolId: school.id, section, name: name ?? `Level ${n}`, sortOrder: n }).returning()
  return level!
}

export async function createClassArm(db: Db, school: SchoolRef, level: { id: string }, name = 'A') {
  const [arm] = await db.insert(classArms).values({ schoolId: school.id, classLevelId: level.id, name }).returning()
  return arm!
}

export async function createDepartment(db: Db, school: SchoolRef, name = `Department ${next()}`) {
  const [department] = await db.insert(departments).values({ schoolId: school.id, name }).returning()
  return department!
}

export async function createSubject(db: Db, school: SchoolRef, { section = 'jss', name, departmentId }: { section?: Section, name?: string, departmentId?: string } = {}) {
  const [subject] = await db.insert(subjects).values({ schoolId: school.id, section, name: name ?? `Subject ${next()}`, departmentId }).returning()
  return subject!
}
