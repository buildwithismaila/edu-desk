import { and, asc, desc, eq, gt, inArray, isNull, or } from 'drizzle-orm'
import { alias } from 'drizzle-orm/pg-core'
import { createError } from 'h3'
import { SECTIONS } from '../../shared/constants/academics'
import type { Role } from '../../shared/constants/roles'
import { classArmLabel } from '../../shared/utils/academics'
import { defaultPlacement, type PromotionOutcome, type PromotionRow, validatePromotion } from '../../shared/utils/promotion'
import {
  academicSessions,
  classArms,
  classLevels,
  promotionRuns,
  publishedResults,
  resultStatuses,
  studentEnrolments,
  studentPromotions,
  students,
  terms,
  users,
} from '../database/schema'
import type { Db } from '../utils/db'
import { conflict, notFound } from '../utils/errors'
import { whereSchool } from '../utils/tenant'
import { fieldError } from '../utils/validation'
import type { ReportCard } from './results'
import { armRoster } from './scores'

// End-of-session promotion (docs/features/10-dashboards-promotion.md): per class arm, from the current
// session into the next one, in one transaction; once per arm and session (DB-enforced); undo until the
// next session becomes current.

type SchoolRef = { id: string }
type Viewer = { id: string, role: Role }

/** Whether any promotion ran from or into the session (blocks deleting it). */
export async function sessionHasPromotions(db: Db, school: SchoolRef, sessionId: string) {
  const [run] = await db.select({ id: promotionRuns.id }).from(promotionRuns)
    .where(whereSchool(promotionRuns, school, or(eq(promotionRuns.fromSessionId, sessionId), eq(promotionRuns.toSessionId, sessionId)))).limit(1)
  return !!run
}

/** The current session (from) and the next one by name (to), e.g. 2026/2027 → 2027/2028. */
async function promotionSessions(db: Db, school: SchoolRef) {
  const [from] = await db.select({ id: academicSessions.id, name: academicSessions.name }).from(academicSessions)
    .where(whereSchool(academicSessions, school, eq(academicSessions.isCurrent, true)))
  if (!from) return { from: null, to: null }
  const [to] = await db.select({ id: academicSessions.id, name: academicSessions.name, isCurrent: academicSessions.isCurrent }).from(academicSessions)
    .where(whereSchool(academicSessions, school, gt(academicSessions.name, from.name)))
    .orderBy(asc(academicSessions.name)).limit(1)
  return { from, to: to ?? null }
}

/** The school's levels and arms in class order, for placements and the target-arm pickers. */
async function schoolClasses(db: Db, school: SchoolRef) {
  const levels = (await db.select({ id: classLevels.id, name: classLevels.name, section: classLevels.section, sortOrder: classLevels.sortOrder })
    .from(classLevels).where(whereSchool(classLevels, school)))
    .sort((a, b) => SECTIONS.indexOf(a.section) - SECTIONS.indexOf(b.section) || a.sortOrder - b.sortOrder)
  const arms = (await db.select({ id: classArms.id, classLevelId: classArms.classLevelId, name: classArms.name }).from(classArms).where(whereSchool(classArms, school)))
    .map((a) => {
      const level = levels.find(l => l.id === a.classLevelId)!
      return { ...a, label: classArmLabel(level.name, a.name), section: level.section }
    })
    .sort((a, b) => levels.findIndex(l => l.id === a.classLevelId) - levels.findIndex(l => l.id === b.classLevelId) || a.name.localeCompare(b.name))
  return { levels, arms }
}

async function findRun(db: Db, school: SchoolRef, fromSessionId: string, armId: string) {
  const [run] = await db.select({ id: promotionRuns.id, toSessionId: promotionRuns.toSessionId, at: promotionRuns.createdAt, by: users.name })
    .from(promotionRuns).leftJoin(users, eq(promotionRuns.promotedById, users.id))
    .where(whereSchool(promotionRuns, school, eq(promotionRuns.fromSessionId, fromSessionId), eq(promotionRuns.classArmId, armId)))
  return run
}

/** Every arm with its active students this session and whether it has been promoted. */
export async function listPromotionArms(db: Db, school: SchoolRef) {
  const { from, to } = await promotionSessions(db, school)
  if (!from) return { from: null, to: null, arms: [] }
  const { arms } = await schoolClasses(db, school)
  const enrolled = await db.select({ armId: studentEnrolments.classArmId }).from(studentEnrolments)
    .innerJoin(students, eq(studentEnrolments.studentId, students.id))
    .where(whereSchool(studentEnrolments, school, eq(studentEnrolments.sessionId, from.id), isNull(students.deletedAt)))
  const runs = await db.select({ armId: promotionRuns.classArmId, at: promotionRuns.createdAt, by: users.name })
    .from(promotionRuns).leftJoin(users, eq(promotionRuns.promotedById, users.id))
    .where(whereSchool(promotionRuns, school, eq(promotionRuns.fromSessionId, from.id)))
  return {
    from,
    to: to ? { id: to.id, name: to.name } : null,
    arms: arms.map((a) => {
      const run = runs.find(r => r.armId === a.id)
      return { id: a.id, label: a.label, section: a.section, students: enrolled.filter(e => e.armId === a.id).length, promotion: run ? { at: run.at, by: run.by } : null }
    }),
  }
}

/**
 * One arm's promotion: its active students with this session's third-term average (if published), any class
 * they already have next session, and either the recorded outcome (once promoted) or the default placement.
 */
export async function getArmPromotion(db: Db, school: SchoolRef, armId: string) {
  const { levels, arms } = await schoolClasses(db, school)
  const arm = arms.find(a => a.id === armId)
  if (!arm) throw notFound('Class not found')
  const { from, to } = await promotionSessions(db, school)
  if (!from) throw fieldError('session', 'Set the current session first')

  const roster = await armRoster(db, school, from.id, arm.id)
  const ids = roster.map(r => r.id)
  const run = await findRun(db, school, from.id, arm.id)
  const recorded = run ? await db.select().from(studentPromotions).where(whereSchool(studentPromotions, school, eq(studentPromotions.runId, run.id))) : []
  const next = to && ids.length
    ? await db.select({ studentId: studentEnrolments.studentId, armId: studentEnrolments.classArmId }).from(studentEnrolments)
        .where(whereSchool(studentEnrolments, school, eq(studentEnrolments.sessionId, to.id), inArray(studentEnrolments.studentId, ids)))
    : []

  const [third] = await db.select({ id: terms.id }).from(terms).where(whereSchool(terms, school, eq(terms.sessionId, from.id), eq(terms.number, 'third')))
  const cards = third && ids.length
    ? await db.select({ studentId: publishedResults.studentId, report: publishedResults.report }).from(publishedResults)
        .where(whereSchool(publishedResults, school, eq(publishedResults.termId, third.id), inArray(publishedResults.studentId, ids)))
    : []
  const [status] = third
    ? await db.select({ status: resultStatuses.status }).from(resultStatuses)
        .where(whereSchool(resultStatuses, school, eq(resultStatuses.termId, third.id), eq(resultStatuses.classArmId, arm.id)))
    : []
  const placement = defaultPlacement({ levels, arms, fromArm: arm })

  return {
    arm: { id: arm.id, label: arm.label },
    from,
    to: to ? { id: to.id, name: to.name } : null,
    resultsPublished: status?.status === 'published',
    promotion: run ? { at: run.at, by: run.by } : null,
    canUndo: !!run && !!to && !to.isCurrent,
    students: roster.map((student) => {
      const own = recorded.find(r => r.studentId === student.id)
      const enrolledIn = next.find(n => n.studentId === student.id)
      const card = cards.find(c => c.studentId === student.id)?.report as ReportCard | undefined
      return {
        id: student.id,
        name: `${student.firstName} ${student.lastName}`,
        admissionNumber: student.admissionNumber,
        average: card?.summary.average ?? null,
        enrolledNext: enrolledIn ? arms.find(a => a.id === enrolledIn.armId)?.label ?? null : null,
        outcome: (run ? own?.outcome ?? null : placement.outcome) as PromotionOutcome | null,
        toClassArmId: run ? own?.toClassArmId ?? null : placement.toClassArmId,
      }
    }),
    levels,
    arms: arms.map(a => ({ id: a.id, classLevelId: a.classLevelId, name: a.name, label: a.label })),
  }
}

/**
 * Promotes an arm into the next session in one transaction: next-session enrolments for promoted and
 * repeating students, an outcome for every student, and the run. Students already enrolled next session are
 * skipped. A second run for the same arm and session is refused (409), by the database as well.
 */
export async function promoteArm(db: Db, school: SchoolRef, viewer: Viewer, armId: string, input: { toSessionId: string, students: PromotionRow[] }) {
  const { levels, arms } = await schoolClasses(db, school)
  const arm = arms.find(a => a.id === armId)
  if (!arm) throw notFound('Class not found')
  const { from, to } = await promotionSessions(db, school)
  if (!from) throw fieldError('toSessionId', 'Set the current session first')
  if (!to) throw fieldError('toSessionId', 'Create the next session in Calendar first')
  if (input.toSessionId !== to.id) throw fieldError('toSessionId', `Promote into the next session, ${to.name}`)
  const alreadyPromoted = () => conflict(`${arm.label} has already been promoted`)
  if (await findRun(db, school, from.id, arm.id)) throw alreadyPromoted()

  const roster = new Set((await armRoster(db, school, from.id, arm.id)).map(r => r.id))
  const listed = input.students.map(s => s.studentId)
  if (listed.length !== roster.size || new Set(listed).size !== listed.length || listed.some(id => !roster.has(id))) {
    throw createError({ statusCode: 400, statusMessage: 'Validation Error', message: `List every student in ${arm.label} exactly once` })
  }
  const rowErrors = validatePromotion(input.students, { levels, arms, fromArm: arm })
  if (rowErrors.length) {
    throw createError({ statusCode: 400, statusMessage: 'Validation Error', message: 'Some students need a different outcome or class', data: { rowErrors } })
  }

  await db.transaction(async (tx) => {
    const [run] = await tx.insert(promotionRuns).values({ schoolId: school.id, fromSessionId: from.id, toSessionId: to.id, classArmId: arm.id, promotedById: viewer.id })
      .onConflictDoNothing().returning({ id: promotionRuns.id })
    if (!run) throw alreadyPromoted()

    // A student who already has a class next session (enrolled by hand) is skipped
    const skipped = listed.length
      ? new Set((await tx.select({ studentId: studentEnrolments.studentId }).from(studentEnrolments)
          .where(whereSchool(studentEnrolments, school, eq(studentEnrolments.sessionId, to.id), inArray(studentEnrolments.studentId, listed)))).map(e => e.studentId))
      : new Set<string>()
    const outcomes = input.students.filter(s => !skipped.has(s.studentId))
    const placed = outcomes.filter(s => s.outcome === 'promoted' || s.outcome === 'repeated')
    if (placed.length) {
      await tx.insert(studentEnrolments)
        .values(placed.map(s => ({ schoolId: school.id, sessionId: to.id, studentId: s.studentId, classArmId: s.toClassArmId! })))
    }
    if (outcomes.length) {
      await tx.insert(studentPromotions).values(outcomes.map(s => ({
        schoolId: school.id,
        runId: run.id,
        fromSessionId: from.id,
        studentId: s.studentId,
        fromClassArmId: arm.id,
        outcome: s.outcome,
        toClassArmId: s.toClassArmId ?? null,
      })))
    }
  })
  return getArmPromotion(db, school, arm.id)
}

/**
 * Undoes an arm's promotion while the next session isn't current: removes the enrolments it created and its
 * outcomes, so it can run again. Final (409) once the school has moved to the new session.
 */
export async function undoArmPromotion(db: Db, school: SchoolRef, armId: string) {
  const { arms } = await schoolClasses(db, school)
  const arm = arms.find(a => a.id === armId)
  if (!arm) throw notFound('Class not found')
  const { from } = await promotionSessions(db, school)
  const run = from ? await findRun(db, school, from.id, arm.id) : undefined
  if (!run) {
    const [final] = from
      ? await db.select({ id: promotionRuns.id }).from(promotionRuns)
          .where(whereSchool(promotionRuns, school, eq(promotionRuns.toSessionId, from.id), eq(promotionRuns.classArmId, arm.id)))
      : []
    if (final) throw conflict('Promotion is final once the new session has started')
    throw notFound(`${arm.label} hasn't been promoted`)
  }

  await db.transaction(async (tx) => {
    const placed = await tx.select({ studentId: studentPromotions.studentId, armId: studentPromotions.toClassArmId }).from(studentPromotions)
      .where(whereSchool(studentPromotions, school, eq(studentPromotions.runId, run.id)))
    for (const p of placed.filter(p => p.armId)) {
      await tx.delete(studentEnrolments).where(whereSchool(studentEnrolments, school, and(
        eq(studentEnrolments.sessionId, run.toSessionId),
        eq(studentEnrolments.studentId, p.studentId),
        eq(studentEnrolments.classArmId, p.armId!),
      )))
    }
    // Outcomes go with the run (cascade)
    await tx.delete(promotionRuns).where(whereSchool(promotionRuns, school, eq(promotionRuns.id, run.id)))
  })
  return getArmPromotion(db, school, arm.id)
}

const toArm = alias(classArms, 'to_arm')
const toLevel = alias(classLevels, 'to_level')

/** The student's latest promotion outcome (for the profile): e.g. graduated in 2026/2027, or promoted to JSS 2A. */
export async function latestPromotion(db: Db, school: SchoolRef, studentId: string) {
  const [row] = await db.select({ outcome: studentPromotions.outcome, sessionName: academicSessions.name, arm: toArm.name, level: toLevel.name })
    .from(studentPromotions)
    .innerJoin(academicSessions, eq(studentPromotions.fromSessionId, academicSessions.id))
    .leftJoin(toArm, eq(studentPromotions.toClassArmId, toArm.id))
    .leftJoin(toLevel, eq(toArm.classLevelId, toLevel.id))
    .where(whereSchool(studentPromotions, school, eq(studentPromotions.studentId, studentId)))
    .orderBy(desc(academicSessions.name))
    .limit(1)
  return row ? { outcome: row.outcome, sessionName: row.sessionName, toClassLabel: row.arm && row.level ? classArmLabel(row.level, row.arm) : null } : null
}
