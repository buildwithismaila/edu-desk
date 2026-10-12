import { and, asc, eq, ne, type SQL, sql } from 'drizzle-orm'
import { SECTIONS, type Section } from '../../shared/constants/academics'
import { subjectSchema } from '../../shared/schemas/subjects'
import { departments, subjects } from '../database/schema'
import type { Db } from '../utils/db'
import { conflict, notFound } from '../utils/errors'
import { whereSchool } from '../utils/tenant'
import { assertValid, fieldError } from '../utils/validation'

type SchoolRef = { id: string }
type SubjectValues = { section: Section, name: string, code: string | null, departmentId: string | null }

const sameName = (column: typeof departments.name | typeof subjects.name, name: string) => sql`lower(${column}) = lower(${name})`

// Departments

export function listDepartments(db: Db, school: SchoolRef) {
  return db.select({ id: departments.id, name: departments.name }).from(departments)
    .where(whereSchool(departments, school)).orderBy(asc(departments.name))
}

async function findDepartment(db: Db, school: SchoolRef, id: string) {
  const [department] = await db.select().from(departments).where(whereSchool(departments, school, eq(departments.id, id)))
  return department
}

async function assertDepartmentNameFree(db: Db, school: SchoolRef, name: string, exceptId?: string) {
  const [clash] = await db.select({ id: departments.id }).from(departments)
    .where(whereSchool(departments, school, sameName(departments.name, name), exceptId ? ne(departments.id, exceptId) : undefined))
  if (clash) throw conflict(`There is already a department called ${name}`)
}

export async function createDepartment(db: Db, school: SchoolRef, name: string) {
  await assertDepartmentNameFree(db, school, name)
  const [department] = await db.insert(departments).values({ schoolId: school.id, name })
    .returning({ id: departments.id, name: departments.name })
  return department!
}

export async function renameDepartment(db: Db, school: SchoolRef, id: string, name: string) {
  if (!await findDepartment(db, school, id)) throw notFound('Department not found')
  await assertDepartmentNameFree(db, school, name, id)
  const [department] = await db.update(departments).set({ name })
    .where(whereSchool(departments, school, eq(departments.id, id)))
    .returning({ id: departments.id, name: departments.name })
  return department!
}

export async function deleteDepartment(db: Db, school: SchoolRef, id: string) {
  if (!await findDepartment(db, school, id)) throw notFound('Department not found')
  const [used] = await db.select({ id: subjects.id }).from(subjects)
    .where(whereSchool(subjects, school, eq(subjects.departmentId, id))).limit(1)
  if (used) throw conflict('Some subjects belong to this department. Move or delete those subjects first.')
  await db.delete(departments).where(whereSchool(departments, school, eq(departments.id, id)))
}

// Subjects

const subjectColumns = {
  id: subjects.id,
  section: subjects.section,
  name: subjects.name,
  code: subjects.code,
  departmentId: subjects.departmentId,
  departmentName: departments.name,
}

async function listSubjectRows(db: Db, school: SchoolRef, where?: SQL) {
  const rows = await db.select(subjectColumns).from(subjects)
    .leftJoin(departments, eq(subjects.departmentId, departments.id))
    .where(whereSchool(subjects, school, where))
    .orderBy(asc(subjects.name))
  return rows.sort((a, b) => SECTIONS.indexOf(a.section) - SECTIONS.indexOf(b.section))
}

/** By section (Nursery → SSS), then name; optionally one section. */
export function listSubjects(db: Db, school: SchoolRef, section?: Section) {
  return listSubjectRows(db, school, section ? eq(subjects.section, section) : undefined)
}

async function getSubject(db: Db, school: SchoolRef, id: string) {
  const [row] = await listSubjectRows(db, school, eq(subjects.id, id))
  return row
}

/** Name unique per section (ignoring case); the department must be this school's. */
async function checkSubject(db: Db, school: SchoolRef, values: SubjectValues, exceptId?: string) {
  if (values.departmentId && !await findDepartment(db, school, values.departmentId)) {
    throw fieldError('departmentId', 'Choose one of your departments')
  }
  const [clash] = await db.select({ id: subjects.id }).from(subjects)
    .where(whereSchool(subjects, school, and(eq(subjects.section, values.section), sameName(subjects.name, values.name)), exceptId ? ne(subjects.id, exceptId) : undefined))
  if (clash) throw conflict(`There is already a ${values.section.toUpperCase()} subject called ${values.name}`)
}

export async function createSubject(db: Db, school: SchoolRef, values: SubjectValues) {
  await checkSubject(db, school, values)
  const [subject] = await db.insert(subjects).values({ ...values, schoolId: school.id }).returning({ id: subjects.id })
  return (await getSubject(db, school, subject!.id))!
}

/** Applies `changes`, then validates the whole subject (e.g. moving out of SSS needs the department cleared). */
export async function updateSubject(db: Db, school: SchoolRef, id: string, changes: Partial<SubjectValues>) {
  const current = await getSubject(db, school, id)
  if (!current) throw notFound('Subject not found')

  const values: SubjectValues = assertValid(subjectSchema, {
    section: current.section,
    name: current.name,
    code: current.code,
    departmentId: current.departmentId,
    ...changes,
  })
  await checkSubject(db, school, values, id)
  await db.update(subjects).set(values).where(whereSchool(subjects, school, eq(subjects.id, id)))
  return (await getSubject(db, school, id))!
}

/** Phase 6 adds a 409 when the subject has scores. */
export async function deleteSubject(db: Db, school: SchoolRef, id: string) {
  if (!await getSubject(db, school, id)) throw notFound('Subject not found')
  await db.delete(subjects).where(whereSchool(subjects, school, eq(subjects.id, id)))
}
