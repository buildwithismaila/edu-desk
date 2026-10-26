import { asc, eq, inArray } from 'drizzle-orm'
import { createError } from 'h3'
import { type GradedSection, SECTIONS, TERM_NUMBERS, type TermNumber } from '../../shared/constants/academics'
import type { Role } from '../../shared/constants/roles'
import { AFFECTIVE_TRAITS, NURSERY_RATINGS, PSYCHOMOTOR_TRAITS } from '../../shared/constants/traits'
import { classArmLabel } from '../../shared/utils/academics'
import {
  computeArmResults,
  cumulativeAverage,
  type ExactAverage,
  resultsCompleteness,
  type ResultAction,
  type ResultStatus,
  transitionResults,
} from '../../shared/utils/results'
import { type ScoreCell, studentOffersSubject } from '../../shared/utils/scores'
import {
  classArms,
  classLevels,
  classTeacherAssignments,
  nurseryRatings,
  publishedResults,
  resultStatuses,
  schools,
  scoreEntries,
  scoreLocks,
  studentEnrolments,
  subjects,
  termComments,
  terms,
  traitRatings,
  users,
} from '../database/schema'
import type { Db } from '../utils/db'
import { conflict, notFound } from '../utils/errors'
import { schoolLogoUrl } from '../utils/school'
import { whereSchool } from '../utils/tenant'
import { fieldError } from '../utils/validation'
import { studentAttendanceSummary } from './attendance'
import { termBalanceOf } from './payments'
import { getCurrentTerm } from './calendar'
import { listAssessmentComponents, listBands } from './grading'
import { studentPhotoUrl } from './guardians'
import { armRoster, findArm } from './scores'
import { resolveTerm } from './terms'
import { withheldError, withheldTerms } from './result-holds'

type SchoolRef = { id: string }
type Viewer = { id: string, role: Role }
type Term = Awaited<ReturnType<typeof resolveTerm>>
type Arm = Awaited<ReturnType<typeof findArm>>

const forbidden = (message: string) => createError({ statusCode: 403, statusMessage: 'Forbidden', message })

async function isClassTeacherOf(db: Db, school: SchoolRef, userId: string, sessionId: string, armId: string) {
  const [row] = await db.select({ id: classTeacherAssignments.id }).from(classTeacherAssignments)
    .where(whereSchool(classTeacherAssignments, school, eq(classTeacherAssignments.sessionId, sessionId), eq(classTeacherAssignments.classArmId, armId), eq(classTeacherAssignments.userId, userId)))
  return !!row
}

async function statusOf(db: Db, school: SchoolRef, termId: string, armId: string) {
  const [row] = await db.select().from(resultStatuses)
    .where(whereSchool(resultStatuses, school, eq(resultStatuses.termId, termId), eq(resultStatuses.classArmId, armId)))
  return row ?? null
}

/** Who may see an arm's results: admin, principal, or its class teacher in the term's session. */
async function resultsAccess(db: Db, school: SchoolRef, viewer: Viewer, query: { termId?: string, classArmId: string }) {
  const arm = await findArm(db, school, query.classArmId)
  const term = await resolveTerm(db, school, query.termId)
  const lead = viewer.role === 'admin' || viewer.role === 'principal'
  const isClassTeacher = viewer.role === 'teacher' && await isClassTeacherOf(db, school, viewer.id, term.sessionId, arm.id)
  if (!lead && !isClassTeacher) throw forbidden(`Only ${arm.label}'s class teacher, the principal or an admin can see these results`)
  const row = await statusOf(db, school, term.id, arm.id)
  return { arm, term, lead, isClassTeacher, row, status: (row?.status ?? 'draft') as ResultStatus }
}

/** Cells for these students in a term, keyed `${studentId}:${subjectId}:${componentId}`. */
async function termCells(db: Db, school: SchoolRef, termId: string, studentIds: string[]) {
  if (!studentIds.length) return {}
  const rows = await db.select({ studentId: scoreEntries.studentId, subjectId: scoreEntries.subjectId, componentId: scoreEntries.componentId, score: scoreEntries.score, absent: scoreEntries.absent })
    .from(scoreEntries).where(whereSchool(scoreEntries, school, eq(scoreEntries.termId, termId), inArray(scoreEntries.studentId, studentIds)))
  return Object.fromEntries(rows.map(r => [`${r.studentId}:${r.subjectId}:${r.componentId}`, { score: r.score, absent: r.absent } satisfies ScoreCell]))
}

/** Third term only: each student's average in the session's other terms (from their own scores). */
async function earlierAverages(db: Db, school: SchoolRef, term: Term, studentIds: string[], components: { id: string, name: string, maxScore: number }[]) {
  const result = new Map<string, (ExactAverage | null)[]>()
  if (term.number !== 'third' || !studentIds.length) return result
  const sessionTerms = await db.select({ id: terms.id, number: terms.number }).from(terms).where(whereSchool(terms, school, eq(terms.sessionId, term.sessionId)))
  const allSubjects = await db.select({ id: subjects.id, name: subjects.name }).from(subjects).where(whereSchool(subjects, school))
  for (const other of sessionTerms.filter(t => t.id !== term.id).sort((a, b) => TERM_NUMBERS.indexOf(a.number) - TERM_NUMBERS.indexOf(b.number))) {
    const computed = computeArmResults({ components, subjects: allSubjects, students: studentIds.map(id => ({ id })), cells: await termCells(db, school, other.id, studentIds), bands: [] })
    for (const row of computed.students) result.set(row.studentId, [...(result.get(row.studentId) ?? []), row.exact])
  }
  return result
}

const ratingLabel = (value: string) => NURSERY_RATINGS.find(r => r.value === value)?.label ?? value

/**
 * Live report cards for every active student in the arm (what Publish freezes), plus what's missing
 * before the results can be submitted.
 */
async function buildReports(db: Db, school: SchoolRef, arm: Arm, term: Term, status: ResultStatus, publishedAt: Date | null) {
  const [schoolRow] = await db.select().from(schools).where(eq(schools.id, school.id))
  const roster = await armRoster(db, school, term.sessionId, arm.id)
  const ids = roster.map(s => s.id)
  const sectionSubjects = await db.select({ id: subjects.id, name: subjects.name, departmentId: subjects.departmentId })
    .from(subjects).where(whereSchool(subjects, school, eq(subjects.section, arm.section))).orderBy(asc(subjects.name))
  const mode = arm.section === 'nursery' ? 'rating' as const : 'scores' as const
  const components = mode === 'scores' ? await listAssessmentComponents(db, school) : []
  const bands = mode === 'scores' ? await listBands(db, school, arm.section as GradedSection) : []
  const cells = mode === 'scores' ? await termCells(db, school, term.id, ids) : {}
  const ratings = mode === 'rating' && ids.length
    ? await db.select({ studentId: nurseryRatings.studentId, subjectId: nurseryRatings.subjectId, rating: nurseryRatings.rating })
        .from(nurseryRatings).where(whereSchool(nurseryRatings, school, eq(nurseryRatings.termId, term.id), inArray(nurseryRatings.studentId, ids)))
    : []
  const traits = ids.length
    ? await db.select({ studentId: traitRatings.studentId, trait: traitRatings.trait, rating: traitRatings.rating })
        .from(traitRatings).where(whereSchool(traitRatings, school, eq(traitRatings.termId, term.id), inArray(traitRatings.studentId, ids)))
    : []
  const comments = ids.length
    ? await db.select().from(termComments).where(whereSchool(termComments, school, eq(termComments.termId, term.id), inArray(termComments.studentId, ids)))
    : []
  const [termRow] = await db.select({ nextTermBeginsOn: terms.nextTermBeginsOn }).from(terms).where(eq(terms.id, term.id))

  const computed = computeArmResults({ components, subjects: sectionSubjects, students: roster, cells, bands })
  const earlier = await earlierAverages(db, school, term, ids, components)
  const rated = new Set(ratings.map(r => `${r.studentId}:${r.subjectId}`))
  const completeness = resultsCompleteness({
    components,
    sheets: sectionSubjects.map(subject => ({
      subject,
      students: roster.filter(s => studentOffersSubject(s, subject)).map(s => ({ id: s.id, name: `${s.firstName} ${s.lastName}` })),
    })),
    has: (studentId, subjectId, componentId) => componentId ? `${studentId}:${subjectId}:${componentId}` in cells : rated.has(`${studentId}:${subjectId}`),
  })
  const showPositions = schoolRow!.showPositions
  // Phase 8: the term's fee balance, when the school shows it on report cards
  const feeBalances = schoolRow!.showFeesOnReportCard ? await termBalanceOf(db, school, term.id, ids) : null

  const reports = []
  for (const student of roster) {
    const row = computed.students.find(r => r.studentId === student.id)!
    const exactAverages = [...(earlier.get(student.id) ?? []), row.exact]
    const attendance = await studentAttendanceSummary(db, school, student.id, term.id)
    const traitOf = (key: string) => traits.find(t => t.studentId === student.id && t.trait === key)?.rating ?? null
    const comment = comments.find(c => c.studentId === student.id)
    reports.push({
      status,
      publishedAt: publishedAt?.toISOString() ?? null,
      school: { name: schoolRow!.name, address: schoolRow!.address, motto: schoolRow!.motto, logoUrl: schoolLogoUrl(schoolRow!) },
      student: { id: student.id, name: `${student.firstName} ${student.lastName}`, admissionNumber: student.admissionNumber, photoUrl: studentPhotoUrl(student) },
      arm: { id: arm.id, label: arm.label, section: arm.section },
      term: { id: term.id, number: term.number, sessionName: term.sessionName, nextTermBeginsOn: termRow?.nextTermBeginsOn ?? null },
      mode,
      components,
      subjects: row.subjects.map((r) => {
        const subject = sectionSubjects.find(s => s.id === r.subjectId)!
        return {
          id: subject.id,
          name: subject.name,
          cells: components.map((c) => {
            const cell = r.cells[c.id]
            return !cell ? null : cell.absent ? 'ABS' as const : cell.score
          }),
          total: r.total,
          grade: r.grade,
          remark: r.remark,
          position: showPositions ? r.position : null,
        }
      }),
      nurseryRatings: sectionSubjects.flatMap((subject) => {
        const rating = ratings.find(r => r.studentId === student.id && r.subjectId === subject.id)
        return rating ? [{ subject: subject.name, rating: ratingLabel(rating.rating) }] : []
      }),
      summary: {
        total: row.total,
        offered: row.offered,
        average: row.average,
        position: showPositions ? row.position : null,
        numberInClass: roster.length,
        showPositions,
        cumulativeAverage: term.number === 'third' && exactAverages.filter(Boolean).length > 1 ? cumulativeAverage(exactAverages) : null,
      },
      attendance: { opened: attendance.opened, present: attendance.present, absent: attendance.absent, late: attendance.late, rate: attendance.rate },
      traits: {
        affective: AFFECTIVE_TRAITS.map(t => ({ label: t.label, rating: traitOf(t.key) })),
        psychomotor: PSYCHOMOTOR_TRAITS.map(t => ({ label: t.label, rating: traitOf(t.key) })),
      },
      comments: { classTeacher: comment?.classTeacherComment ?? null, principal: comment?.principalComment ?? null },
      fees: feeBalances ? { balanceKobo: feeBalances.get(student.id) ?? null } : null,
    })
  }
  return { reports, completeness, subjectStats: computed.subjectStats, sectionSubjects }
}

export type ReportCard = Awaited<ReturnType<typeof buildReports>>['reports'][number]

async function snapshots(db: Db, school: SchoolRef, termId: string, armId: string, studentId?: string) {
  const rows = await db.select({ report: publishedResults.report }).from(publishedResults)
    .where(whereSchool(publishedResults, school, eq(publishedResults.termId, termId), eq(publishedResults.classArmId, armId), studentId ? eq(publishedResults.studentId, studentId) : undefined))
  return rows.map(r => r.report as ReportCard).sort((a, b) => a.student.name.localeCompare(b.student.name))
}

async function userName(db: Db, id: string | null) {
  if (!id) return null
  const [user] = await db.select({ name: users.name }).from(users).where(eq(users.id, id))
  return user?.name ?? null
}

/**
 * The arm's results: status and history, completeness (unpublished), and each student's total, average and
 * position, ranked. Published arms read the frozen snapshots.
 */
export async function getArmResults(db: Db, school: SchoolRef, viewer: Viewer, query: { termId?: string, classArmId: string }) {
  const { arm, term, lead, isClassTeacher, row, status } = await resultsAccess(db, school, viewer, query)
  const published = status === 'published'
  const live = published ? null : await buildReports(db, school, arm, term, status, null)
  const reports = published ? await snapshots(db, school, term.id, arm.id) : live!.reports

  const students = reports.map(r => ({
    id: r.student.id,
    name: r.student.name,
    admissionNumber: r.student.admissionNumber,
    total: r.summary.total,
    offered: r.summary.offered,
    average: r.summary.average,
    position: r.summary.position,
    principalComment: r.comments.principal,
  })).sort((a, b) => (b.average ?? -1) - (a.average ?? -1) || a.name.localeCompare(b.name))

  return {
    term: { id: term.id, number: term.number, sessionName: term.sessionName, isCurrent: term.isCurrent, sessionIsCurrent: term.sessionIsCurrent },
    arm,
    status,
    submitted: row?.submittedAt ? { by: await userName(db, row.submittedById), at: row.submittedAt } : null,
    published: published && row?.publishedAt ? { by: await userName(db, row.publishedById), at: row.publishedAt } : null,
    returnedReason: status === 'draft' ? row?.returnedReason ?? null : null,
    viewer: { lead, isClassTeacher },
    mode: arm.section === 'nursery' ? 'rating' as const : 'scores' as const,
    showPositions: reports[0]?.summary.showPositions ?? true,
    numberInClass: reports.length,
    completeness: live?.completeness ?? [],
    students,
  }
}

/** Report cards for the arm (or one student): the frozen snapshots once published, live otherwise. */
export async function getReportCards(db: Db, school: SchoolRef, viewer: Viewer, query: { termId?: string, classArmId: string, studentId?: string }) {
  const { arm, term, status } = await resultsAccess(db, school, viewer, query)
  const reports = status === 'published'
    ? await snapshots(db, school, term.id, arm.id, query.studentId)
    : (await buildReports(db, school, arm, term, status, null)).reports.filter(r => !query.studentId || r.student.id === query.studentId)
  if (query.studentId && !reports.length) throw notFound('Report card not found')
  return reports
}

/**
 * One student's report card. Parents: only their own child's (the route checks), only once published.
 * Staff: as for the arm's results (the arm is the student's in the term's session).
 */
export async function getStudentReportCard(db: Db, school: SchoolRef, viewer: Viewer, studentId: string, termId?: string) {
  const term = await resolveTerm(db, school, termId)
  const [published] = await db.select({ report: publishedResults.report, classArmId: publishedResults.classArmId }).from(publishedResults)
    .where(whereSchool(publishedResults, school, eq(publishedResults.termId, term.id), eq(publishedResults.studentId, studentId)))
  if (viewer.role === 'parent') {
    if (!published) throw notFound('Report card not found')
    // Fees for the term still owed while the school withholds results (Phase 10d)
    if ((await withheldTerms(db, school, studentId)).has(term.id)) throw withheldError()
    return published.report as ReportCard
  }
  const [enrolment] = await db.select({ armId: studentEnrolments.classArmId }).from(studentEnrolments)
    .where(whereSchool(studentEnrolments, school, eq(studentEnrolments.sessionId, term.sessionId), eq(studentEnrolments.studentId, studentId)))
  const armId = published?.classArmId ?? enrolment?.armId
  if (!armId) throw notFound('Report card not found')
  const [report] = await getReportCards(db, school, viewer, { termId: term.id, classArmId: armId, studentId })
  return report!
}

/** Students × subject totals, total, average and position, with class stats per subject (computed live). */
export async function getBroadsheet(db: Db, school: SchoolRef, viewer: Viewer, query: { termId?: string, classArmId: string }) {
  const { arm, term, status } = await resultsAccess(db, school, viewer, query)
  const { reports, subjectStats, sectionSubjects } = await buildReports(db, school, arm, term, status, null)
  const offered = sectionSubjects.filter(s => subjectStats.some(st => st.subjectId === s.id))
  return {
    term: { id: term.id, number: term.number, sessionName: term.sessionName },
    arm,
    status,
    showPositions: reports[0]?.summary.showPositions ?? true,
    subjects: offered.map(s => ({ id: s.id, name: s.name })),
    students: reports.map(r => ({
      id: r.student.id,
      name: r.student.name,
      admissionNumber: r.student.admissionNumber,
      totals: Object.fromEntries(r.subjects.map(s => [s.id, s.total])),
      total: r.summary.total,
      average: r.summary.average,
      position: r.summary.position,
    })).sort((a, b) => (b.average ?? -1) - (a.average ?? -1) || a.name.localeCompare(b.name)),
    subjectStats,
  }
}

/** Draft → Submitted → Published and back. Locks scores while submitted or published; publishing freezes report cards. */
export async function transitionArmResults(db: Db, school: SchoolRef, viewer: Viewer, input: { termId: string, classArmId: string, reason?: string }, action: ResultAction) {
  const { arm, term, isClassTeacher, status } = await resultsAccess(db, school, viewer, input)
  const move = transitionResults(status, action, { role: viewer.role, isClassTeacher })
  if (!move.ok) throw move.reason === 'forbidden' ? forbidden(move.message) : conflict(move.message)
  if (!term.sessionIsCurrent) throw forbidden('Results from earlier sessions can\'t be changed')

  const now = new Date()
  const key = { schoolId: school.id, termId: term.id, classArmId: arm.id }
  const setStatus = (tx: Db, values: Partial<typeof resultStatuses.$inferInsert> & { status: ResultStatus }) =>
    tx.insert(resultStatuses).values({ ...key, ...values })
      .onConflictDoUpdate({ target: [resultStatuses.schoolId, resultStatuses.termId, resultStatuses.classArmId], set: { ...values, updatedAt: now } })
  const lock = (tx: Db) => tx.insert(scoreLocks).values({ ...key, lockedById: viewer.id }).onConflictDoNothing()

  if (action === 'submit') {
    const { completeness } = await buildReports(db, school, arm, term, status, null)
    if (completeness.length) {
      throw createError({ statusCode: 400, statusMessage: 'Validation Error', message: 'Some scores are missing. Complete every sheet, then submit.', data: { completeness } })
    }
    await db.transaction(async (tx) => {
      await setStatus(tx, { status: 'submitted', submittedById: viewer.id, submittedAt: now, returnedReason: null })
      await lock(tx)
    })
  }
  else if (action === 'publish') {
    const { reports } = await buildReports(db, school, arm, term, 'published', now)
    await db.transaction(async (tx) => {
      await tx.delete(publishedResults).where(whereSchool(publishedResults, school, eq(publishedResults.termId, term.id), eq(publishedResults.classArmId, arm.id)))
      if (reports.length) await tx.insert(publishedResults).values(reports.map(report => ({ ...key, studentId: report.student.id, report })))
      await setStatus(tx, { status: 'published', publishedById: viewer.id, publishedAt: now })
      await lock(tx)
    })
  }
  else if (action === 'return') {
    if (!input.reason) throw fieldError('reason', 'Say why the results are being returned')
    await db.transaction(async (tx) => {
      await tx.update(resultStatuses).set({ status: 'draft', returnedReason: input.reason, updatedAt: now })
        .where(whereSchool(resultStatuses, school, eq(resultStatuses.termId, term.id), eq(resultStatuses.classArmId, arm.id)))
      await tx.delete(scoreLocks).where(whereSchool(scoreLocks, school, eq(scoreLocks.termId, term.id), eq(scoreLocks.classArmId, arm.id)))
    })
  }
  else {
    await db.transaction(async (tx) => {
      await tx.delete(publishedResults).where(whereSchool(publishedResults, school, eq(publishedResults.termId, term.id), eq(publishedResults.classArmId, arm.id)))
      await tx.update(resultStatuses).set({ status: 'submitted', publishedById: null, publishedAt: null, updatedAt: now })
        .where(whereSchool(resultStatuses, school, eq(resultStatuses.termId, term.id), eq(resultStatuses.classArmId, arm.id)))
    })
  }
  return getArmResults(db, school, viewer, { termId: term.id, classArmId: arm.id })
}

/** Admin/principal: principal's comments for the arm's students (not once published). null clears one. */
export async function savePrincipalComments(db: Db, school: SchoolRef, viewer: Viewer, input: { termId: string, classArmId: string, comments: { studentId: string, comment: string | null }[] }) {
  const { arm, term, lead, status } = await resultsAccess(db, school, viewer, input)
  if (!lead) throw forbidden('Only the principal or an admin can write principal\'s comments')
  if (!term.sessionIsCurrent) throw forbidden('Results from earlier sessions can\'t be changed')
  if (status === 'published') throw conflict('These results are published. Unpublish them to change comments.')
  const inArm = new Set((await armRoster(db, school, term.sessionId, arm.id)).map(s => s.id))
  const cellErrors = input.comments.filter(c => !inArm.has(c.studentId)).map(c => ({ studentId: c.studentId, message: 'This student isn\'t in this class' }))
  if (cellErrors.length) throw createError({ statusCode: 400, statusMessage: 'Validation Error', message: 'Some students aren\'t in this class', data: { cellErrors } })

  await db.transaction(async (tx) => {
    for (const { studentId, comment } of input.comments) {
      const values = { principalComment: comment, principalCommentById: comment ? viewer.id : null }
      await tx.insert(termComments).values({ schoolId: school.id, termId: term.id, studentId, ...values })
        .onConflictDoUpdate({ target: [termComments.schoolId, termComments.termId, termComments.studentId], set: { ...values, updatedAt: new Date() } })
    }
  })
  return getArmResults(db, school, viewer, input)
}

/** The current term's arms the viewer sees results for (teachers: class-teacher arms), with status. */
export async function listResultArms(db: Db, school: SchoolRef, viewer: Viewer) {
  const { session, term } = await getCurrentTerm(db, school)
  if (!session || !term) return { term: null, arms: [] }
  const own = viewer.role === 'teacher'
    ? (await db.select({ id: classTeacherAssignments.classArmId }).from(classTeacherAssignments)
        .where(whereSchool(classTeacherAssignments, school, eq(classTeacherAssignments.sessionId, session.id), eq(classTeacherAssignments.userId, viewer.id)))).map(r => r.id)
    : null
  const termRef = { id: term.id, number: term.number as TermNumber, sessionName: session.name }
  if (own && !own.length) return { term: termRef, arms: [] }

  const arms = await db.select({ id: classArms.id, name: classArms.name, level: classLevels.name, section: classLevels.section, sortOrder: classLevels.sortOrder })
    .from(classArms).innerJoin(classLevels, eq(classArms.classLevelId, classLevels.id))
    .where(whereSchool(classArms, school, own ? inArray(classArms.id, own) : undefined))
  const statuses = await db.select({ armId: resultStatuses.classArmId, status: resultStatuses.status }).from(resultStatuses)
    .where(whereSchool(resultStatuses, school, eq(resultStatuses.termId, term.id)))
  return {
    term: termRef,
    arms: arms
      .sort((a, b) => SECTIONS.indexOf(a.section) - SECTIONS.indexOf(b.section) || a.sortOrder - b.sortOrder || a.name.localeCompare(b.name))
      .map(a => ({ id: a.id, label: classArmLabel(a.level, a.name), section: a.section, status: (statuses.find(s => s.armId === a.id)?.status ?? 'draft') as ResultStatus })),
  }
}

/** Whether the arm's results hold its scores locked (submitted or published): a manual unlock must wait. */
export async function resultsHoldLock(db: Db, school: SchoolRef, termId: string, armId: string) {
  const row = await statusOf(db, school, termId, armId)
  return row?.status === 'submitted' || row?.status === 'published'
}
