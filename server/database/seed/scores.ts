import { and, asc, eq, isNull, sql } from 'drizzle-orm'
import { NURSERY_RATING_VALUES, TRAIT_KEYS } from '../../../shared/constants/traits'
import {
  assessmentComponents,
  classArms,
  classLevels,
  nurseryRatings,
  scoreEntries,
  studentEnrolments,
  students,
  subjects,
  termComments,
  terms,
  traitRatings,
  users,
} from '../schema'
import type { Db } from '../../utils/db'

export interface DemoScores {
  /** Subject score sheets: arm label, subject (in the arm's section), share of students entered (1 = all) */
  sheets: {
    arm: string
    subject: string
    share: number
    enteredBy: string
    /** Marks the 4th student absent for the last component */
    absentOne?: boolean
    /** Leaves one cell blank: student index (by admission number), component index */
    missing?: { student: number, component: number }
    /** The second student copies the first's scores, so they tie for position */
    tie?: [number, number]
  }[]
  /** Class teachers' trait ratings and comments for a share of an arm */
  ratings?: { arm: string, share: number, enteredBy: string, principalShare?: number, principal?: string }[]
  /** Nursery skill ratings for one subject */
  nursery?: { arm: string, subject: string, enteredBy: string }
}

const PRINCIPAL_COMMENTS = [
  'An impressive result. Keep it up.',
  'Good effort; aim higher next term.',
  'Promoted on trial. Work harder.',
]

const COMMENTS = [
  'A diligent student who participates well in class.',
  'Shows steady improvement. Keep it up.',
  'Can do better with more attention to homework.',
  'Very neat and well behaved.',
  'Needs to be more punctual.',
]

/**
 * Idempotent demo scores for the current term: upserts by the one-per-cell keys. Values are a fixed
 * pattern within each component's max, so totals and grades vary.
 */
export async function seedScores(db: Db, schoolId: string, sessionId: string, demo: DemoScores) {
  const [term] = await db.select().from(terms).where(and(eq(terms.schoolId, schoolId), eq(terms.isCurrent, true)))
  if (!term) return
  const people = await db.select({ id: users.id, email: users.email }).from(users).where(eq(users.schoolId, schoolId))
  const userId = (email: string) => people.find(p => p.email === email)?.id
  const arms = await db.select({ id: classArms.id, arm: classArms.name, level: classLevels.name, section: classLevels.section })
    .from(classArms).innerJoin(classLevels, eq(classArms.classLevelId, classLevels.id)).where(eq(classArms.schoolId, schoolId))
  const armOf = (label: string) => arms.find(a => `${a.level}${a.arm}` === label || `${a.level} ${a.arm}` === label)!
  const components = await db.select().from(assessmentComponents).where(eq(assessmentComponents.schoolId, schoolId)).orderBy(asc(assessmentComponents.sortOrder))
  const roster = (armId: string) => db.select({ id: students.id }).from(studentEnrolments)
    .innerJoin(students, eq(studentEnrolments.studentId, students.id))
    .where(and(eq(studentEnrolments.schoolId, schoolId), eq(studentEnrolments.sessionId, sessionId), eq(studentEnrolments.classArmId, armId), isNull(students.deletedAt)))
    .orderBy(asc(students.admissionNumber))
  const subjectOf = (name: string, section: string) => db.select({ id: subjects.id }).from(subjects)
    .where(and(eq(subjects.schoolId, schoolId), eq(subjects.name, name), sql`${subjects.section} = ${section}`)).then(r => r[0]!)

  for (const [s, sheet] of demo.sheets.entries()) {
    const arm = armOf(sheet.arm)
    const subject = await subjectOf(sheet.subject, arm.section)
    const list = await roster(arm.id)
    const entered = list.slice(0, Math.ceil(list.length * sheet.share))
    const rows: (typeof scoreEntries.$inferInsert)[] = []
    for (const [i, student] of entered.entries()) {
      const pattern = sheet.tie && i === sheet.tie[1] ? sheet.tie[0] : i
      for (const [c, component] of components.entries()) {
        if (sheet.missing && i === sheet.missing.student && c === sheet.missing.component) {
          // Re-seeding restores the demo gap, even if someone filled it in
          await db.delete(scoreEntries).where(and(eq(scoreEntries.schoolId, schoolId), eq(scoreEntries.termId, term.id),
            eq(scoreEntries.studentId, student.id), eq(scoreEntries.subjectId, subject.id), eq(scoreEntries.componentId, component.id)))
          continue
        }
        const absent = !!sheet.absentOne && i === 3 && c === components.length - 1
        const score = absent ? null : Math.round(component.maxScore * (0.4 + ((pattern * 7 + c * 3 + s * 11) % 60) / 100))
        rows.push({ schoolId, termId: term.id, studentId: student.id, subjectId: subject.id, componentId: component.id, score, absent, enteredById: userId(sheet.enteredBy) })
      }
    }
    // One statement per sheet keeps re-seeding fast
    if (rows.length) {
      await db.insert(scoreEntries).values(rows).onConflictDoUpdate({
        target: [scoreEntries.schoolId, scoreEntries.termId, scoreEntries.studentId, scoreEntries.subjectId, scoreEntries.componentId],
        set: { score: sql`excluded.score`, absent: sql`excluded.absent` },
      })
    }
  }

  for (const ratings of demo.ratings ?? []) {
    const arm = armOf(ratings.arm)
    const list = await roster(arm.id)
    const rated = list.slice(0, Math.ceil(list.length * ratings.share))
    const traitRows = rated.flatMap((student, i) => TRAIT_KEYS.map((trait, k) =>
      ({ schoolId, termId: term.id, studentId: student.id, trait, rating: 2 + ((i + k) % 4), enteredById: userId(ratings.enteredBy) })))
    if (traitRows.length) {
      await db.insert(traitRatings).values(traitRows)
        .onConflictDoUpdate({ target: [traitRatings.schoolId, traitRatings.termId, traitRatings.studentId, traitRatings.trait], set: { rating: sql`excluded.rating` } })
    }
    for (const [i, student] of rated.entries()) {
      const comment = COMMENTS[i % COMMENTS.length]!
      const principalComment = ratings.principal && i < Math.ceil(list.length * (ratings.principalShare ?? 0))
        ? PRINCIPAL_COMMENTS[i % PRINCIPAL_COMMENTS.length]!
        : null
      const comments = { classTeacherComment: comment, principalComment, principalCommentById: principalComment ? userId(ratings.principal!) : null }
      await db.insert(termComments).values({ schoolId, termId: term.id, studentId: student.id, ...comments, enteredById: userId(ratings.enteredBy) })
        .onConflictDoUpdate({ target: [termComments.schoolId, termComments.termId, termComments.studentId], set: comments })
    }
  }

  if (demo.nursery) {
    const arm = armOf(demo.nursery.arm)
    const subject = await subjectOf(demo.nursery.subject, 'nursery')
    for (const [i, student] of (await roster(arm.id)).entries()) {
      const rating = NURSERY_RATING_VALUES[i % NURSERY_RATING_VALUES.length]!
      await db.insert(nurseryRatings).values({ schoolId, termId: term.id, studentId: student.id, subjectId: subject.id, rating, enteredById: userId(demo.nursery.enteredBy) })
        .onConflictDoUpdate({ target: [nurseryRatings.schoolId, nurseryRatings.termId, nurseryRatings.studentId, nurseryRatings.subjectId], set: { rating } })
    }
  }
}
