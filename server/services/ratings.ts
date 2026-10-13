import { and, eq, inArray } from 'drizzle-orm'
import { createError } from 'h3'
import type { Role } from '../../shared/constants/roles'
import { AFFECTIVE_TRAITS, PSYCHOMOTOR_TRAITS, type TraitKey } from '../../shared/constants/traits'
import { classTeacherAssignments, termComments, traitRatings } from '../database/schema'
import type { Db } from '../utils/db'
import { whereSchool } from '../utils/tenant'
import { studentPhotoUrl } from './guardians'
import { armRoster, findArm, isLocked, readOnlyFor } from './scores'
import { resolveTerm } from './terms'

type SchoolRef = { id: string }
type Viewer = { id: string, role: Role }

const forbidden = (message: string) => createError({ statusCode: 403, statusMessage: 'Forbidden', message })

/** Admin and principal (any arm), or the arm's class teacher in the term's session; plus why it's read-only. */
async function ratingsAccess(db: Db, school: SchoolRef, viewer: Viewer, query: { termId?: string, classArmId: string }) {
  const arm = await findArm(db, school, query.classArmId)
  const term = await resolveTerm(db, school, query.termId)
  const isStaffLead = viewer.role === 'admin' || viewer.role === 'principal'
  if (!isStaffLead) {
    const [assigned] = viewer.role === 'teacher'
      ? await db.select({ id: classTeacherAssignments.id }).from(classTeacherAssignments)
          .where(whereSchool(classTeacherAssignments, school, eq(classTeacherAssignments.sessionId, term.sessionId), eq(classTeacherAssignments.classArmId, arm.id), eq(classTeacherAssignments.userId, viewer.id)))
      : []
    if (!assigned) throw forbidden(`Only ${arm.label}'s class teacher can rate its students`)
  }
  const locked = await isLocked(db, school, term.id, arm.id)
  return { arm, term, locked, readOnly: readOnlyFor(term, locked, isStaffLead, 'Ratings') }
}

/** The arm's students with their trait ratings (1–5) and the class teacher's comment for the term. */
export async function getRatingsSheet(db: Db, school: SchoolRef, viewer: Viewer, query: { termId?: string, classArmId: string }) {
  const { arm, term, locked, readOnly } = await ratingsAccess(db, school, viewer, query)
  const roster = await armRoster(db, school, term.sessionId, arm.id)
  const ids = roster.map(s => s.id)
  const ratings = ids.length
    ? await db.select({ studentId: traitRatings.studentId, trait: traitRatings.trait, rating: traitRatings.rating }).from(traitRatings)
        .where(whereSchool(traitRatings, school, eq(traitRatings.termId, term.id), inArray(traitRatings.studentId, ids)))
    : []
  const comments = ids.length
    ? await db.select({ studentId: termComments.studentId, comment: termComments.classTeacherComment }).from(termComments)
        .where(whereSchool(termComments, school, eq(termComments.termId, term.id), inArray(termComments.studentId, ids)))
    : []

  return {
    term: { id: term.id, number: term.number, sessionName: term.sessionName, isCurrent: term.isCurrent },
    arm,
    traits: { affective: AFFECTIVE_TRAITS, psychomotor: PSYCHOMOTOR_TRAITS },
    locked,
    canEdit: !readOnly,
    readOnlyReason: readOnly?.reason ?? null,
    students: roster.map(s => ({
      id: s.id,
      name: `${s.firstName} ${s.lastName}`,
      admissionNumber: s.admissionNumber,
      photoUrl: studentPhotoUrl(s),
      ratings: Object.fromEntries(ratings.filter(r => r.studentId === s.id).map(r => [r.trait, r.rating])) as Partial<Record<TraitKey, number>>,
      comment: comments.find(c => c.studentId === s.id)?.comment ?? null,
    })),
  }
}

type RatingsSave = {
  termId: string
  classArmId: string
  students: { studentId: string, ratings: Partial<Record<TraitKey, number | null>>, comment: string | null }[]
}

/** Saves ratings (null clears one) and comments (null clears it) in one transaction. */
export async function saveRatingsSheet(db: Db, school: SchoolRef, viewer: Viewer, input: RatingsSave) {
  const { arm, term, readOnly } = await ratingsAccess(db, school, viewer, input)
  if (readOnly) throw readOnly.error()
  const inArm = new Set((await armRoster(db, school, term.sessionId, arm.id)).map(s => s.id))
  const cellErrors = input.students.filter(s => !inArm.has(s.studentId)).map(s => ({ studentId: s.studentId, message: 'This student isn\'t in this class' }))
  if (cellErrors.length) {
    throw createError({ statusCode: 400, statusMessage: 'Validation Error', message: 'Some students aren\'t in this class', data: { cellErrors } })
  }

  await db.transaction(async (tx) => {
    for (const { studentId, ratings, comment } of input.students) {
      for (const [trait, rating] of Object.entries(ratings) as [TraitKey, number | null][]) {
        if (rating === null) {
          await tx.delete(traitRatings).where(whereSchool(traitRatings, school, and(eq(traitRatings.termId, term.id), eq(traitRatings.studentId, studentId), eq(traitRatings.trait, trait))))
          continue
        }
        await tx.insert(traitRatings).values({ schoolId: school.id, termId: term.id, studentId, trait, rating, enteredById: viewer.id })
          .onConflictDoUpdate({ target: [traitRatings.schoolId, traitRatings.termId, traitRatings.studentId, traitRatings.trait], set: { rating, enteredById: viewer.id, updatedAt: new Date() } })
      }
      if (comment === null) {
        // Null the column, not the row: it also holds the principal's comment
        await tx.update(termComments).set({ classTeacherComment: null, enteredById: viewer.id })
          .where(whereSchool(termComments, school, and(eq(termComments.termId, term.id), eq(termComments.studentId, studentId))))
      }
      else {
        await tx.insert(termComments).values({ schoolId: school.id, termId: term.id, studentId, classTeacherComment: comment, enteredById: viewer.id })
          .onConflictDoUpdate({ target: [termComments.schoolId, termComments.termId, termComments.studentId], set: { classTeacherComment: comment, enteredById: viewer.id, updatedAt: new Date() } })
      }
    }
  })
  return getRatingsSheet(db, school, viewer, input)
}
