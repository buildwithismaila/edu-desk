import { and, eq } from 'drizzle-orm'
import { transitionArmResults } from '../../services/results'
import { classArms, classLevels, resultStatuses, terms, users } from '../schema'
import type { Db } from '../../utils/db'

export interface DemoResults {
  /** Arm labels whose current-term results are published */
  publish: string[]
  /** Email of the principal (or admin) who publishes them */
  by: string
}

/**
 * Publishes the demo arms through the Phase 7 service, so the snapshots are real report cards. Re-seeding
 * sets them back to Submitted first and publishes again, so the snapshots match the re-seeded scores.
 */
export async function seedResults(db: Db, schoolId: string, demo: DemoResults) {
  const [term] = await db.select({ id: terms.id }).from(terms).where(and(eq(terms.schoolId, schoolId), eq(terms.isCurrent, true)))
  if (!term) return
  const [publisher] = await db.select({ id: users.id, role: users.role }).from(users).where(and(eq(users.schoolId, schoolId), eq(users.email, demo.by)))
  const arms = await db.select({ id: classArms.id, arm: classArms.name, level: classLevels.name })
    .from(classArms).innerJoin(classLevels, eq(classArms.classLevelId, classLevels.id)).where(eq(classArms.schoolId, schoolId))

  for (const label of demo.publish) {
    const arm = arms.find(a => `${a.level}${a.arm}` === label)!
    const values = { status: 'submitted' as const, submittedAt: new Date(), returnedReason: null }
    await db.insert(resultStatuses).values({ schoolId, termId: term.id, classArmId: arm.id, ...values })
      .onConflictDoUpdate({ target: [resultStatuses.schoolId, resultStatuses.termId, resultStatuses.classArmId], set: values })
    await transitionArmResults(db, { id: schoolId }, publisher!, { termId: term.id, classArmId: arm.id }, 'publish')
  }
}
