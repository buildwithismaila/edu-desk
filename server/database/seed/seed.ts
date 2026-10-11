import { and, eq, sql } from 'drizzle-orm'
import type { TermNumber } from '../../../shared/constants/academics'
import {
  academicSessions,
  classArms,
  classLevels,
  departments,
  type NewSchool,
  type NewUser,
  schools,
  subjects,
  terms,
  users,
} from '../schema'
import { applySchoolDefaults } from '../../services/school-defaults'
import type { Db } from '../../utils/db'
import { DEMO_PASSWORD_HASH } from './demo-password'

const demoSchools: NewSchool[] = [
  {
    slug: 'greenfield',
    name: 'Greenfield Academy',
    status: 'active',
    address: '14 Adeola Odeku Street, Victoria Island, Lagos',
    motto: 'Knowledge and Character',
    phone: '+2348031234567',
    email: 'info@greenfield.test',
  },
  {
    slug: 'sunrise',
    name: 'Sunrise Schools',
    status: 'active',
    address: 'Plot 5, Aminu Kano Crescent, Wuse II, Abuja',
    motto: 'Rise and Shine',
    phone: '+2349012345678',
    email: 'hello@sunrise.test',
  },
  { slug: 'hillside', name: 'Hillside College', status: 'suspended' },
]

type DemoUser = Pick<NewUser, 'email' | 'name' | 'role'> & { school: string, isActive?: boolean }

// All share the demo password (see demo-password.ts)
const demoUsers: DemoUser[] = [
  { school: 'greenfield', email: 'admin@greenfield.test', name: 'Adaeze Okafor', role: 'admin' },
  { school: 'greenfield', email: 'principal@greenfield.test', name: 'Emeka Nwosu', role: 'principal' },
  { school: 'greenfield', email: 'bursar@greenfield.test', name: 'Fatima Bello', role: 'bursar' },
  { school: 'greenfield', email: 'teacher@greenfield.test', name: 'Tunde Adeyemi', role: 'teacher' },
  { school: 'greenfield', email: 'parent@greenfield.test', name: 'Ngozi Eze', role: 'parent' },
  { school: 'greenfield', email: 'inactive@greenfield.test', name: 'Musa Ibrahim', role: 'teacher', isActive: false },
  { school: 'sunrise', email: 'admin@sunrise.test', name: 'Bola Ogunleye', role: 'admin' },
]

type TermDates = Partial<Record<TermNumber, { startsOn: string, endsOn: string, nextTermBeginsOn: string }>>

interface DemoAcademics {
  sessions: { name: string, terms: TermDates }[]
  current: { session: string, term: TermNumber }
  /** class level name → arm names */
  arms: Record<string, string[]>
  /** section → subject names; SSS keyed by department ('' = core) */
  subjects: { primary?: string[], jss?: string[], sss?: Record<string, string[]> }
}

const FIRST_TERM_2026: TermDates = { first: { startsOn: '2026-09-14', endsOn: '2026-12-18', nextTermBeginsOn: '2027-01-11' } }

const demoAcademics: Record<string, DemoAcademics> = {
  greenfield: {
    sessions: [
      {
        name: '2025/2026',
        terms: {
          first: { startsOn: '2025-09-15', endsOn: '2025-12-19', nextTermBeginsOn: '2026-01-12' },
          second: { startsOn: '2026-01-12', endsOn: '2026-04-02', nextTermBeginsOn: '2026-04-27' },
          third: { startsOn: '2026-04-27', endsOn: '2026-07-24', nextTermBeginsOn: '2026-09-14' },
        },
      },
      { name: '2026/2027', terms: FIRST_TERM_2026 },
    ],
    current: { session: '2026/2027', term: 'first' },
    arms: {
      ...Object.fromEntries(['Creche', 'Pre-Nursery', 'Nursery 1', 'Nursery 2'].map(level => [level, ['A']])),
      ...Object.fromEntries([1, 2, 3, 4, 5, 6].map(n => [`Primary ${n}`, ['A', 'B']])),
      ...Object.fromEntries(['JSS 1', 'JSS 2', 'JSS 3', 'SSS 1', 'SSS 2', 'SSS 3'].map(level => [level, ['A', 'B']])),
    },
    subjects: {
      primary: ['English Language', 'Mathematics', 'Basic Science', 'Social Studies', 'Christian Religious Studies', 'Islamic Religious Studies', 'Verbal Reasoning', 'Quantitative Reasoning', 'Cultural and Creative Arts', 'Computer Studies'],
      jss: ['English Language', 'Mathematics', 'Basic Science', 'Basic Technology', 'Business Studies', 'Civic Education', 'Social Studies', 'Christian Religious Studies', 'Computer Studies', 'French'],
      sss: {
        '': ['English Language', 'Mathematics', 'Civic Education'],
        'Science': ['Physics', 'Chemistry', 'Biology'],
        'Arts': ['Literature in English', 'Government', 'Christian Religious Studies'],
        'Commercial': ['Financial Accounting', 'Commerce', 'Economics'],
      },
    },
  },
  sunrise: {
    sessions: [{ name: '2026/2027', terms: FIRST_TERM_2026 }],
    current: { session: '2026/2027', term: 'first' },
    arms: { 'JSS 1': ['Gold', 'Diamond'], 'JSS 2': ['Gold'] },
    subjects: { jss: ['English Language', 'Mathematics'] },
  },
}

/** Idempotent: upserts by natural keys and resets demo passwords, flags and the current term. */
export async function seed(db: Db) {
  if (process.env.NODE_ENV === 'production') throw new Error('Refusing to seed demo data in production')

  const seededSchools = await db
    .insert(schools)
    .values(demoSchools)
    .onConflictDoUpdate({
      target: schools.slug,
      set: {
        name: sql`excluded.name`,
        status: sql`excluded.status`,
        address: sql`excluded.address`,
        motto: sql`excluded.motto`,
        phone: sql`excluded.phone`,
        email: sql`excluded.email`,
        updatedAt: sql`now()`,
      },
    })
    .returning({ id: schools.id, slug: schools.slug })
  const schoolIds = new Map(seededSchools.map(s => [s.slug, s.id]))

  await db
    .insert(users)
    .values(demoUsers.map(({ school, isActive = true, ...user }) => ({
      ...user,
      schoolId: schoolIds.get(school)!,
      passwordHash: DEMO_PASSWORD_HASH,
      isActive,
      mustChangePassword: false,
    })))
    .onConflictDoUpdate({
      target: [users.schoolId, users.email],
      set: {
        name: sql`excluded.name`,
        role: sql`excluded.role`,
        passwordHash: sql`excluded.password_hash`,
        isActive: sql`excluded.is_active`,
        mustChangePassword: sql`excluded.must_change_password`,
        updatedAt: sql`now()`,
      },
    })

  for (const [slug, academics] of Object.entries(demoAcademics)) {
    const schoolId = schoolIds.get(slug)!
    await applySchoolDefaults(db, schoolId)
    await seedAcademics(db, schoolId, academics)
  }
}

async function seedAcademics(db: Db, schoolId: string, academics: DemoAcademics) {
  await db.transaction(async (tx) => {
    const sessionIds = new Map<string, string>()
    for (const { name, terms: dates } of academics.sessions) {
      const [session] = await tx.insert(academicSessions).values({ schoolId, name })
        .onConflictDoUpdate({ target: [academicSessions.schoolId, academicSessions.name], set: { updatedAt: sql`now()` } })
        .returning({ id: academicSessions.id })
      sessionIds.set(name, session!.id)
      for (const number of ['first', 'second', 'third'] as const) {
        const termDates = dates[number] ?? { startsOn: null, endsOn: null, nextTermBeginsOn: null }
        await tx.insert(terms).values({ schoolId, sessionId: session!.id, number, ...termDates })
          .onConflictDoUpdate({ target: [terms.schoolId, terms.sessionId, terms.number], set: { ...termDates, updatedAt: sql`now()` } })
      }
    }

    // Unset before set: the partial unique indexes allow one current row per school
    const currentSessionId = sessionIds.get(academics.current.session)!
    await tx.update(terms).set({ isCurrent: false }).where(eq(terms.schoolId, schoolId))
    await tx.update(academicSessions).set({ isCurrent: false }).where(eq(academicSessions.schoolId, schoolId))
    await tx.update(academicSessions).set({ isCurrent: true }).where(eq(academicSessions.id, currentSessionId))
    await tx.update(terms).set({ isCurrent: true })
      .where(and(eq(terms.sessionId, currentSessionId), eq(terms.number, academics.current.term)))

    const levels = await tx.select({ id: classLevels.id, name: classLevels.name }).from(classLevels).where(eq(classLevels.schoolId, schoolId))
    const levelIds = new Map(levels.map(l => [l.name, l.id]))
    const arms = Object.entries(academics.arms).flatMap(([level, names]) =>
      names.map(name => ({ schoolId, classLevelId: levelIds.get(level)!, name })))
    if (arms.length) await tx.insert(classArms).values(arms).onConflictDoNothing()

    const depts = await tx.select({ id: departments.id, name: departments.name }).from(departments).where(eq(departments.schoolId, schoolId))
    const deptIds = new Map(depts.map(d => [d.name, d.id]))
    const { primary = [], jss = [], sss = {} } = academics.subjects
    const rows = [
      ...primary.map(name => ({ schoolId, section: 'primary' as const, name })),
      ...jss.map(name => ({ schoolId, section: 'jss' as const, name })),
      ...Object.entries(sss).flatMap(([dept, names]) =>
        names.map(name => ({ schoolId, section: 'sss' as const, name, departmentId: dept ? deptIds.get(dept)! : null }))),
    ]
    if (rows.length) await tx.insert(subjects).values(rows).onConflictDoNothing()
  })
}
