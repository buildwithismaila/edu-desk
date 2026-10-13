import { and, eq, sql } from 'drizzle-orm'
import type { TermNumber } from '../../../shared/constants/academics'
import {
  academicSessions,
  classArms,
  classLevels,
  classTeacherAssignments,
  departments,
  type NewSchool,
  type NewUser,
  schools,
  subjects,
  subjectTeacherAssignments,
  terms,
  users,
} from '../schema'
import { applySchoolDefaults } from '../../services/school-defaults'
import type { Db } from '../../utils/db'
import { DEMO_PASSWORD_HASH } from './demo-password'
import { type DemoAttendance, seedAttendance } from './attendance'
import { type DemoScores, seedScores } from './scores'
import { type DemoStudents, GREENFIELD_STUDENTS, seedStudents, SUNRISE_STUDENTS } from './students'

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

type DemoUser = Pick<NewUser, 'email' | 'name' | 'role'> & { school: string, isActive?: boolean, phone?: string, mustChangePassword?: boolean }

// All share the demo password (see demo-password.ts)
const demoUsers: DemoUser[] = [
  { school: 'greenfield', email: 'admin@greenfield.test', name: 'Adaeze Okafor', role: 'admin' },
  { school: 'greenfield', email: 'principal@greenfield.test', name: 'Emeka Nwosu', role: 'principal' },
  { school: 'greenfield', email: 'bursar@greenfield.test', name: 'Fatima Bello', role: 'bursar' },
  { school: 'greenfield', email: 'teacher@greenfield.test', name: 'Tunde Adeyemi', role: 'teacher' },
  { school: 'greenfield', email: 'parent@greenfield.test', name: 'Ngozi Eze', role: 'parent', phone: '+2348031110001' },
  { school: 'greenfield', email: 'inactive@greenfield.test', name: 'Musa Ibrahim', role: 'teacher', isActive: false },
  { school: 'greenfield', email: 'chioma@greenfield.test', name: 'Chioma Obi', role: 'teacher', phone: '+2348021112233' },
  { school: 'greenfield', email: 'yusuf@greenfield.test', name: 'Yusuf Lawal', role: 'teacher', phone: '+2347034445566' },
  { school: 'greenfield', email: 'grace@greenfield.test', name: 'Grace Ekpo', role: 'teacher' },
  { school: 'greenfield', email: 'ibrahim@greenfield.test', name: 'Ibrahim Sani', role: 'teacher' },
  { school: 'greenfield', email: 'kemi@greenfield.test', name: 'Kemi Balogun', role: 'teacher', mustChangePassword: true },
  { school: 'sunrise', email: 'admin@sunrise.test', name: 'Bola Ogunleye', role: 'admin' },
]

type TermDates = Partial<Record<TermNumber, { startsOn: string, endsOn: string, nextTermBeginsOn: string }>>

interface DemoAcademics {
  sessions: { name: string, terms: TermDates }[]
  current: { session: string, term: TermNumber }
  /** class level name → arm names */
  arms: Record<string, string[]>
  /** section → subject names; SSS keyed by department ('' = core) */
  subjects: { nursery?: string[], primary?: string[], jss?: string[], sss?: Record<string, string[]> }
  /** For the current session; arms as labels ("JSS 1A"), subjects with their section */
  assignments?: {
    classTeachers: { email: string, arm: string }[]
    subjectTeachers: { email: string, subject: string, section: 'primary' | 'jss' | 'sss', arms: string[] }[]
  }
  /** Admitted into the current session; default guardians get phones `${phoneBase}NNNN` */
  students?: DemoStudents & { phoneBase: string }
  /** Past registers in the current term (never today's) */
  attendance?: DemoAttendance
  /** Scores, ratings and comments in the current term */
  scores?: DemoScores
}

const GREENFIELD_JSS_SUBJECTS = ['English Language', 'Mathematics', 'Basic Science', 'Basic Technology', 'Business Studies', 'Civic Education', 'Social Studies', 'Christian Religious Studies', 'Computer Studies', 'French']

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
      nursery: ['Numeracy', 'Literacy', 'Rhymes & Songs'],
      primary: ['English Language', 'Mathematics', 'Basic Science', 'Social Studies', 'Christian Religious Studies', 'Islamic Religious Studies', 'Verbal Reasoning', 'Quantitative Reasoning', 'Cultural and Creative Arts', 'Computer Studies'],
      jss: GREENFIELD_JSS_SUBJECTS,
      sss: {
        '': ['English Language', 'Mathematics', 'Civic Education'],
        'Science': ['Physics', 'Chemistry', 'Biology'],
        'Arts': ['Literature in English', 'Government', 'Christian Religious Studies'],
        'Commercial': ['Financial Accounting', 'Commerce', 'Economics'],
      },
    },
    // Other arms and subjects stay unassigned so the gaps show on the Assignments page
    assignments: {
      classTeachers: [
        { email: 'teacher@greenfield.test', arm: 'JSS 1A' },
        { email: 'chioma@greenfield.test', arm: 'JSS 1B' },
        { email: 'grace@greenfield.test', arm: 'Primary 3A' },
      ],
      subjectTeachers: [
        { email: 'teacher@greenfield.test', subject: 'Mathematics', section: 'jss', arms: ['JSS 1A', 'JSS 1B'] },
        { email: 'chioma@greenfield.test', subject: 'English Language', section: 'jss', arms: ['JSS 1A', 'JSS 1B'] },
        { email: 'yusuf@greenfield.test', subject: 'Physics', section: 'sss', arms: ['SSS 1A', 'SSS 1B'] },
        { email: 'principal@greenfield.test', subject: 'Civic Education', section: 'sss', arms: ['SSS 1A'] },
      ],
    },
    students: { ...GREENFIELD_STUDENTS, phoneBase: '+234802210' },
    // JSS 1B has none, to show an untaken register
    attendance: { arms: ['JSS 1A'], days: 10, takenBy: 'teacher@greenfield.test' },
    // JSS 1A: every subject, ready for results, except Chidera Eze's English Exam (the gap to fill);
    // students 6 and 7 tie; one ABS in Maths. JSS 1B Maths half done, so progress shows.
    scores: {
      sheets: [
        ...GREENFIELD_JSS_SUBJECTS.map(subject => ({
          arm: 'JSS 1A',
          subject,
          share: 1,
          enteredBy: subject === 'Mathematics' ? 'teacher@greenfield.test' : subject === 'English Language' ? 'chioma@greenfield.test' : 'admin@greenfield.test',
          absentOne: subject === 'Mathematics',
          missing: subject === 'English Language' ? { student: 0, component: 2 } : undefined,
          tie: [5, 6] as [number, number],
        })),
        { arm: 'JSS 1B', subject: 'Mathematics', share: 0.5, enteredBy: 'teacher@greenfield.test' },
      ],
      ratings: { arm: 'JSS 1A', share: 1, enteredBy: 'teacher@greenfield.test', principalShare: 0.5, principal: 'principal@greenfield.test' },
      nursery: { arm: 'Nursery 1A', subject: 'Numeracy', enteredBy: 'admin@greenfield.test' },
    },
  },
  sunrise: {
    sessions: [{ name: '2026/2027', terms: FIRST_TERM_2026 }],
    current: { session: '2026/2027', term: 'first' },
    arms: { 'JSS 1': ['Gold', 'Diamond'], 'JSS 2': ['Gold'] },
    subjects: { jss: ['English Language', 'Mathematics'] },
    students: { ...SUNRISE_STUDENTS, phoneBase: '+234803310' },
    attendance: { arms: ['JSS 1 Gold'], days: 2, takenBy: 'admin@sunrise.test' },
    scores: { sheets: [{ arm: 'JSS 1 Gold', subject: 'Mathematics', share: 0.5, enteredBy: 'admin@sunrise.test' }] },
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
    .values(demoUsers.map(({ school, isActive = true, mustChangePassword = false, phone = null, ...user }) => ({
      ...user,
      schoolId: schoolIds.get(school)!,
      passwordHash: DEMO_PASSWORD_HASH,
      isActive,
      mustChangePassword,
      phone,
      deletedAt: null,
    })))
    .onConflictDoUpdate({
      target: [users.schoolId, users.email],
      set: {
        name: sql`excluded.name`,
        role: sql`excluded.role`,
        passwordHash: sql`excluded.password_hash`,
        isActive: sql`excluded.is_active`,
        mustChangePassword: sql`excluded.must_change_password`,
        phone: sql`excluded.phone`,
        deletedAt: sql`excluded.deleted_at`,
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
    const { nursery = [], primary = [], jss = [], sss = {} } = academics.subjects
    const rows = [
      ...nursery.map(name => ({ schoolId, section: 'nursery' as const, name })),
      ...primary.map(name => ({ schoolId, section: 'primary' as const, name })),
      ...jss.map(name => ({ schoolId, section: 'jss' as const, name })),
      ...Object.entries(sss).flatMap(([dept, names]) =>
        names.map(name => ({ schoolId, section: 'sss' as const, name, departmentId: dept ? deptIds.get(dept)! : null }))),
    ]
    if (rows.length) await tx.insert(subjects).values(rows).onConflictDoNothing()

    if (academics.assignments) await seedAssignments(tx, schoolId, currentSessionId, academics.assignments)
    if (academics.students) await seedStudents(tx, schoolId, currentSessionId, academics.students, academics.students.phoneBase)
    if (academics.attendance) await seedAttendance(tx, schoolId, currentSessionId, academics.attendance)
    if (academics.scores) await seedScores(tx, schoolId, currentSessionId, academics.scores)
  })
}

/** Upserts by the one-per-arm / one-per-subject keys, so re-seeding restores the demo teachers. */
async function seedAssignments(db: Db, schoolId: string, sessionId: string, assignments: NonNullable<DemoAcademics['assignments']>) {
  const people = await db.select({ id: users.id, email: users.email }).from(users).where(eq(users.schoolId, schoolId))
  const userId = (email: string) => people.find(p => p.email === email)!.id

  const arms = await db.select({ id: classArms.id, arm: classArms.name, level: classLevels.name })
    .from(classArms).innerJoin(classLevels, eq(classArms.classLevelId, classLevels.id)).where(eq(classArms.schoolId, schoolId))
  const armId = (label: string) => arms.find(a => `${a.level}${a.arm}` === label)!.id

  const subjectRows = await db.select({ id: subjects.id, name: subjects.name, section: subjects.section }).from(subjects).where(eq(subjects.schoolId, schoolId))
  const subjectId = (name: string, section: string) => subjectRows.find(s => s.name === name && s.section === section)!.id

  for (const { email, arm } of assignments.classTeachers) {
    await db.insert(classTeacherAssignments).values({ schoolId, sessionId, classArmId: armId(arm), userId: userId(email) })
      .onConflictDoUpdate({
        target: [classTeacherAssignments.schoolId, classTeacherAssignments.sessionId, classTeacherAssignments.classArmId],
        set: { userId: sql`excluded.user_id`, updatedAt: sql`now()` },
      })
  }
  for (const { email, subject, section, arms: labels } of assignments.subjectTeachers) {
    for (const label of labels) {
      await db.insert(subjectTeacherAssignments)
        .values({ schoolId, sessionId, classArmId: armId(label), subjectId: subjectId(subject, section), userId: userId(email) })
        .onConflictDoUpdate({
          target: [subjectTeacherAssignments.schoolId, subjectTeacherAssignments.sessionId, subjectTeacherAssignments.classArmId, subjectTeacherAssignments.subjectId],
          set: { userId: sql`excluded.user_id`, updatedAt: sql`now()` },
        })
    }
  }
}
