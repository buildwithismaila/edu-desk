import { and, asc, count, eq, inArray, isNull } from 'drizzle-orm'
import { createError } from 'h3'
import { type GradedSection, SECTION_LABELS, SECTIONS } from '../../shared/constants/academics'
import type { Role } from '../../shared/constants/roles'
import type { NurseryRating } from '../../shared/constants/traits'
import { classArmLabel } from '../../shared/utils/academics'
import { studentOffersSubject } from '../../shared/utils/scores'
import {
  classArms,
  classLevels,
  nurseryRatings,
  publishedResults,
  resultStatuses,
  scoreEntries,
  scoreLocks,
  studentEnrolments,
  students,
  subjects,
  subjectTeacherAssignments,
  termComments,
  terms,
  traitRatings,
} from '../database/schema'
import type { Db } from '../utils/db'
import { conflict, notFound } from '../utils/errors'
import { whereSchool } from '../utils/tenant'
import { fieldError } from '../utils/validation'
import { getCurrentTerm } from './calendar'
import { listAssessmentComponents, listBands } from './grading'
import { studentPhotoUrl } from './guardians'
import { resolveTerm } from './terms'

type SchoolRef = { id: string }
type Viewer = { id: string, role: Role }

/** Whether the subject has any scores or Nursery ratings (any term): deleting it would lose them. */
export async function subjectHasScores(db: Db, school: SchoolRef, subjectId: string) {
  const [score] = await db.select({ id: scoreEntries.id }).from(scoreEntries)
    .where(whereSchool(scoreEntries, school, eq(scoreEntries.subjectId, subjectId))).limit(1)
  if (score) return true
  const [rating] = await db.select({ id: nurseryRatings.id }).from(nurseryRatings)
    .where(whereSchool(nurseryRatings, school, eq(nurseryRatings.subjectId, subjectId))).limit(1)
  return !!rating
}

/** Whether any term of the session has scores, ratings, comments, locks or results. */
export async function sessionHasScores(db: Db, school: SchoolRef, sessionId: string) {
  const termIds = (await db.select({ id: terms.id }).from(terms).where(whereSchool(terms, school, eq(terms.sessionId, sessionId)))).map(t => t.id)
  if (!termIds.length) return false
  for (const table of [scoreEntries, nurseryRatings, traitRatings, termComments, scoreLocks, resultStatuses, publishedResults]) {
    const [row] = await db.select({ id: table.id }).from(table).where(whereSchool(table, school, inArray(table.termId, termIds))).limit(1)
    if (row) return true
  }
  return false
}

/** Whether the arm has a score lock or results (any term): deleting it would lose them. */
export async function armHasResults(db: Db, school: SchoolRef, armId: string) {
  for (const table of [scoreLocks, resultStatuses, publishedResults]) {
    const [row] = await db.select({ id: table.id }).from(table).where(whereSchool(table, school, eq(table.classArmId, armId))).limit(1)
    if (row) return true
  }
  return false
}

/** Whether the school has entered any score: the assessment split is frozen from then on. */
export async function schoolHasScores(db: Db, school: SchoolRef) {
  const [row] = await db.select({ id: scoreEntries.id }).from(scoreEntries).where(whereSchool(scoreEntries, school)).limit(1)
  return !!row
}

const forbidden = (message: string) => createError({ statusCode: 403, statusMessage: 'Forbidden', message })
const lockedError = () => conflict('These scores are locked. Ask the principal or an admin to unlock them.')

export async function findArm(db: Db, school: SchoolRef, id: string) {
  const [arm] = await db.select({ id: classArms.id, name: classArms.name, level: classLevels.name, section: classLevels.section })
    .from(classArms).innerJoin(classLevels, eq(classArms.classLevelId, classLevels.id))
    .where(whereSchool(classArms, school, eq(classArms.id, id)))
  if (!arm) throw notFound('Class not found')
  return { id: arm.id, label: classArmLabel(arm.level, arm.name), section: arm.section }
}

async function findSubject(db: Db, school: SchoolRef, id: string) {
  const [subject] = await db.select({ id: subjects.id, name: subjects.name, section: subjects.section, departmentId: subjects.departmentId })
    .from(subjects).where(whereSchool(subjects, school, eq(subjects.id, id)))
  if (!subject) throw notFound('Subject not found')
  return subject
}

export async function isLocked(db: Db, school: SchoolRef, termId: string, armId: string) {
  const [lock] = await db.select({ id: scoreLocks.id }).from(scoreLocks)
    .where(whereSchool(scoreLocks, school, eq(scoreLocks.termId, termId), eq(scoreLocks.classArmId, armId)))
  return !!lock
}

/** Why a (term, arm) is read-only for the viewer, if it is: earlier session, locked, or (non-leads) not the current term. */
export function readOnlyFor(term: { isCurrent: boolean, sessionIsCurrent: boolean }, locked: boolean, isStaffLead: boolean, what: string) {
  if (!term.sessionIsCurrent) return { reason: 'Earlier session', error: () => forbidden(`${what} from earlier sessions can't be changed`) }
  if (locked) return { reason: 'Locked', error: lockedError }
  if (!isStaffLead && !term.isCurrent) return { reason: 'Earlier or later term', error: () => forbidden(`You can only change ${what.toLowerCase()} for the current term`) }
  return null
}

/**
 * Who may open a sheet: admin and principal (any), or the subject teacher assigned to the (arm, subject)
 * in the term's session; plus why it's read-only, if it is.
 */
async function sheetAccess(db: Db, school: SchoolRef, viewer: Viewer, query: { termId?: string, classArmId: string, subjectId: string }) {
  const arm = await findArm(db, school, query.classArmId)
  const subject = await findSubject(db, school, query.subjectId)
  const term = await resolveTerm(db, school, query.termId)
  if (subject.section !== arm.section) throw fieldError('subjectId', `${subject.name} isn't a ${SECTION_LABELS[arm.section]} subject`)

  const isStaffLead = viewer.role === 'admin' || viewer.role === 'principal'
  if (!isStaffLead) {
    if (viewer.role !== 'teacher') throw forbidden('You can\'t open score sheets')
    const [assigned] = await db.select({ id: subjectTeacherAssignments.id }).from(subjectTeacherAssignments)
      .where(whereSchool(subjectTeacherAssignments, school,
        eq(subjectTeacherAssignments.sessionId, term.sessionId),
        eq(subjectTeacherAssignments.classArmId, arm.id),
        eq(subjectTeacherAssignments.subjectId, subject.id),
        eq(subjectTeacherAssignments.userId, viewer.id)))
    if (!assigned) throw forbidden(`Only the ${subject.name} teacher for ${arm.label} can open this sheet`)
  }

  const locked = await isLocked(db, school, term.id, arm.id)
  return { arm, subject, term, locked, readOnly: readOnlyFor(term, locked, isStaffLead, 'Scores') }
}

/** Active students enrolled in the arm for the session, by surname. */
export async function armRoster(db: Db, school: SchoolRef, sessionId: string, armId: string) {
  return db.select({
    id: students.id,
    firstName: students.firstName,
    lastName: students.lastName,
    admissionNumber: students.admissionNumber,
    departmentId: students.departmentId,
    photoKey: students.photoKey,
    photoUpdatedAt: students.photoUpdatedAt,
  })
    .from(studentEnrolments)
    .innerJoin(students, eq(studentEnrolments.studentId, students.id))
    .where(whereSchool(studentEnrolments, school, eq(studentEnrolments.sessionId, sessionId), eq(studentEnrolments.classArmId, armId), isNull(students.deletedAt)))
    .orderBy(asc(students.lastName), asc(students.firstName))
}

/** The arm's students who offer the subject (SSS department rule), and how many were left out for having no department. */
async function sheetRoster(db: Db, school: SchoolRef, sessionId: string, armId: string, subject: { departmentId: string | null }) {
  const rows = await armRoster(db, school, sessionId, armId)
  return {
    students: rows.filter(s => studentOffersSubject(s, subject)),
    skippedNoDepartment: subject.departmentId ? rows.filter(s => s.departmentId === null).length : 0,
  }
}

/** The sheet: components, the section's bands, and each student's cells (or Nursery rating). */
export async function getScoreSheet(db: Db, school: SchoolRef, viewer: Viewer, query: { termId?: string, classArmId: string, subjectId: string }) {
  const { arm, subject, term, locked, readOnly } = await sheetAccess(db, school, viewer, query)
  const mode = arm.section === 'nursery' ? 'rating' as const : 'scores' as const
  const { students: roster, skippedNoDepartment } = await sheetRoster(db, school, term.sessionId, arm.id, subject)
  const ids = roster.map(s => s.id)

  const components = mode === 'scores' ? await listAssessmentComponents(db, school) : []
  const bands = mode === 'scores' ? await listBands(db, school, arm.section as GradedSection) : []
  const entries = mode === 'scores' && ids.length
    ? await db.select({ studentId: scoreEntries.studentId, componentId: scoreEntries.componentId, score: scoreEntries.score, absent: scoreEntries.absent })
        .from(scoreEntries).where(whereSchool(scoreEntries, school, eq(scoreEntries.termId, term.id), eq(scoreEntries.subjectId, subject.id), inArray(scoreEntries.studentId, ids)))
    : []
  const ratings = mode === 'rating' && ids.length
    ? await db.select({ studentId: nurseryRatings.studentId, rating: nurseryRatings.rating })
        .from(nurseryRatings).where(whereSchool(nurseryRatings, school, eq(nurseryRatings.termId, term.id), eq(nurseryRatings.subjectId, subject.id), inArray(nurseryRatings.studentId, ids)))
    : []

  return {
    term: { id: term.id, number: term.number, sessionName: term.sessionName, isCurrent: term.isCurrent },
    arm,
    subject: { id: subject.id, name: subject.name },
    mode,
    components,
    bands: bands.map(({ id: _id, ...band }) => band),
    locked,
    canEdit: !readOnly,
    readOnlyReason: readOnly?.reason ?? null,
    skippedNoDepartment,
    students: roster.map(s => ({
      id: s.id,
      name: `${s.firstName} ${s.lastName}`,
      admissionNumber: s.admissionNumber,
      photoUrl: studentPhotoUrl(s),
      cells: Object.fromEntries(entries.filter(e => e.studentId === s.id).map(e => [e.componentId, { score: e.score, absent: e.absent }])),
      rating: (ratings.find(r => r.studentId === s.id)?.rating ?? null) as NurseryRating | null,
    })),
  }
}

type SheetSave = {
  termId: string
  classArmId: string
  subjectId: string
  entries: { studentId: string, componentId: string, value: number | 'ABS' | null }[]
  ratings: { studentId: string, rating: NurseryRating | null }[]
}

/**
 * Saves changed cells in one transaction (null deletes the cell). Every cell is checked first; any
 * problem refuses the whole save (400 with `cellErrors`).
 */
export async function saveScoreSheet(db: Db, school: SchoolRef, viewer: Viewer, input: SheetSave) {
  const { arm, subject, term, readOnly } = await sheetAccess(db, school, viewer, input)
  if (readOnly) throw readOnly.error()
  const nursery = arm.section === 'nursery'
  if (nursery && input.entries.length) throw fieldError('entries', 'Nursery subjects take ratings, not scores')
  if (!nursery && input.ratings.length) throw fieldError('ratings', 'Only Nursery subjects take ratings')

  const onSheet = new Set((await sheetRoster(db, school, term.sessionId, arm.id, subject)).students.map(s => s.id))
  const components = new Map((await listAssessmentComponents(db, school)).map(c => [c.id, c]))
  const cellErrors: { studentId: string, componentId?: string, message: string }[] = []
  for (const entry of input.entries) {
    const component = components.get(entry.componentId)
    let message: string | null = null
    if (!onSheet.has(entry.studentId)) message = 'This student isn\'t on this sheet'
    else if (!component) message = 'Unknown assessment'
    else if (typeof entry.value === 'number' && (entry.value < 0 || entry.value > component.maxScore)) message = `Enter a score from 0 to ${component.maxScore}`
    if (message) cellErrors.push({ studentId: entry.studentId, componentId: entry.componentId, message })
  }
  for (const rating of input.ratings) {
    if (!onSheet.has(rating.studentId)) cellErrors.push({ studentId: rating.studentId, message: 'This student isn\'t on this sheet' })
  }
  if (cellErrors.length) {
    throw createError({ statusCode: 400, statusMessage: 'Validation Error', message: 'Some cells need fixing before you can save', data: { cellErrors } })
  }

  await db.transaction(async (tx) => {
    for (const { studentId, componentId, value } of input.entries) {
      const cell = and(eq(scoreEntries.termId, term.id), eq(scoreEntries.studentId, studentId), eq(scoreEntries.subjectId, subject.id), eq(scoreEntries.componentId, componentId))
      if (value === null) {
        await tx.delete(scoreEntries).where(whereSchool(scoreEntries, school, cell))
        continue
      }
      const values = value === 'ABS' ? { score: null, absent: true } : { score: value, absent: false }
      await tx.insert(scoreEntries)
        .values({ schoolId: school.id, termId: term.id, studentId, subjectId: subject.id, componentId, ...values, enteredById: viewer.id })
        .onConflictDoUpdate({
          target: [scoreEntries.schoolId, scoreEntries.termId, scoreEntries.studentId, scoreEntries.subjectId, scoreEntries.componentId],
          set: { ...values, enteredById: viewer.id, updatedAt: new Date() },
        })
    }
    for (const { studentId, rating } of input.ratings) {
      const cell = and(eq(nurseryRatings.termId, term.id), eq(nurseryRatings.studentId, studentId), eq(nurseryRatings.subjectId, subject.id))
      if (rating === null) {
        await tx.delete(nurseryRatings).where(whereSchool(nurseryRatings, school, cell))
        continue
      }
      await tx.insert(nurseryRatings)
        .values({ schoolId: school.id, termId: term.id, studentId, subjectId: subject.id, rating, enteredById: viewer.id })
        .onConflictDoUpdate({
          target: [nurseryRatings.schoolId, nurseryRatings.termId, nurseryRatings.studentId, nurseryRatings.subjectId],
          set: { rating, enteredById: viewer.id, updatedAt: new Date() },
        })
    }
  })

  return getScoreSheet(db, school, viewer, input)
}

/** Admin/principal: lock or unlock a (term, arm). Both are idempotent. */
export async function setScoreLock(db: Db, school: SchoolRef, viewer: Viewer, input: { termId: string, classArmId: string }, locked: boolean) {
  const arm = await findArm(db, school, input.classArmId)
  const term = await resolveTerm(db, school, input.termId)
  if (locked) {
    await db.insert(scoreLocks).values({ schoolId: school.id, termId: term.id, classArmId: arm.id, lockedById: viewer.id }).onConflictDoNothing()
  }
  else {
    await db.delete(scoreLocks).where(whereSchool(scoreLocks, school, eq(scoreLocks.termId, term.id), eq(scoreLocks.classArmId, arm.id)))
  }
  return { termId: term.id, classArmId: arm.id, locked }
}

/**
 * The viewer's sheets for the current term with progress (students on the sheet; students with every
 * component entered, or a Nursery rating) and lock state. Teachers: their assigned pairs; admin and
 * principal: every arm × subject of its section.
 */
export async function listScoreSheets(db: Db, school: SchoolRef, viewer: Viewer) {
  const { session, term } = await getCurrentTerm(db, school)
  if (!session || !term) return { term: null, sheets: [] }

  const arms = await db.select({ id: classArms.id, name: classArms.name, level: classLevels.name, section: classLevels.section, sortOrder: classLevels.sortOrder })
    .from(classArms).innerJoin(classLevels, eq(classArms.classLevelId, classLevels.id)).where(whereSchool(classArms, school))
  const allSubjects = await db.select({ id: subjects.id, name: subjects.name, section: subjects.section, departmentId: subjects.departmentId })
    .from(subjects).where(whereSchool(subjects, school))

  const pairs = viewer.role === 'teacher'
    ? await db.select({ armId: subjectTeacherAssignments.classArmId, subjectId: subjectTeacherAssignments.subjectId }).from(subjectTeacherAssignments)
        .where(whereSchool(subjectTeacherAssignments, school, eq(subjectTeacherAssignments.sessionId, session.id), eq(subjectTeacherAssignments.userId, viewer.id)))
    : arms.flatMap(arm => allSubjects.filter(s => s.section === arm.section).map(s => ({ armId: arm.id, subjectId: s.id })))
  const termRef = { id: term.id, number: term.number }
  if (!pairs.length) return { term: termRef, sheets: [] }

  const armIds = [...new Set(pairs.map(p => p.armId))]
  const enrolled = await db.select({ armId: studentEnrolments.classArmId, studentId: students.id, departmentId: students.departmentId })
    .from(studentEnrolments).innerJoin(students, eq(studentEnrolments.studentId, students.id))
    .where(whereSchool(studentEnrolments, school, eq(studentEnrolments.sessionId, session.id), inArray(studentEnrolments.classArmId, armIds), isNull(students.deletedAt)))
  const componentCount = (await listAssessmentComponents(db, school)).length
  const filled = await db.select({ studentId: scoreEntries.studentId, subjectId: scoreEntries.subjectId, cells: count() })
    .from(scoreEntries).where(whereSchool(scoreEntries, school, eq(scoreEntries.termId, term.id)))
    .groupBy(scoreEntries.studentId, scoreEntries.subjectId)
  const rated = await db.select({ studentId: nurseryRatings.studentId, subjectId: nurseryRatings.subjectId })
    .from(nurseryRatings).where(whereSchool(nurseryRatings, school, eq(nurseryRatings.termId, term.id)))
  const complete = new Set([
    ...filled.filter(f => f.cells >= componentCount).map(f => `${f.studentId}:${f.subjectId}`),
    ...rated.map(r => `${r.studentId}:${r.subjectId}`),
  ])
  const locks = new Set((await db.select({ armId: scoreLocks.classArmId }).from(scoreLocks)
    .where(whereSchool(scoreLocks, school, eq(scoreLocks.termId, term.id)))).map(l => l.armId))

  const sheets = pairs.flatMap(({ armId, subjectId }) => {
    const arm = arms.find(a => a.id === armId)
    const subject = allSubjects.find(s => s.id === subjectId)
    if (!arm || !subject) return []
    const onSheet = enrolled.filter(e => e.armId === armId && studentOffersSubject(e, subject))
    return [{
      sort: [SECTIONS.indexOf(arm.section), arm.sortOrder, arm.name] as const,
      sheet: {
        classArmId: arm.id,
        armLabel: classArmLabel(arm.level, arm.name),
        section: arm.section,
        subjectId: subject.id,
        subjectName: subject.name,
        students: onSheet.length,
        complete: onSheet.filter(e => complete.has(`${e.studentId}:${subject.id}`)).length,
        locked: locks.has(arm.id),
      },
    }]
  })
  sheets.sort((a, b) => a.sort[0] - b.sort[0] || a.sort[1] - b.sort[1] || a.sort[2].localeCompare(b.sort[2]) || a.sheet.subjectName.localeCompare(b.sheet.subjectName))
  return { term: termRef, sheets: sheets.map(s => s.sheet) }
}
