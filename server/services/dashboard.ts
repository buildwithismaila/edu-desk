import { and, eq, isNull } from 'drizzle-orm'
import { SECTIONS } from '../../shared/constants/academics'
import type { Role } from '../../shared/constants/roles'
import { classArmLabel } from '../../shared/utils/academics'
import { percentOf, todayAttendance } from '../../shared/utils/dashboard'
import { attendanceMarks, attendanceRegisters, classArms, classLevels, studentEnrolments, students } from '../database/schema'
import type { Db } from '../utils/db'
import { whereSchool } from '../utils/tenant'
import { getCurrentTerm } from './calendar'
import { termLabel } from './fees'
import { collections, debtors } from './payments'
import { listResultArms } from './results'
import { listScoreSheets } from './scores'

type SchoolRef = { id: string }
type Viewer = { id: string, role: Role }

/**
 * Staff dashboard for the current term. Every number comes from the services behind the detail pages
 * (Collections, Debtors, Scores, Results), so they always agree. The bursar gets no academic blocks.
 */
export async function getDashboard(db: Db, school: SchoolRef, viewer: Viewer, today: string) {
  const { session, term } = await getCurrentTerm(db, school)
  if (!session || !term) return { term: null, students: null, attendance: null, fees: null, results: null }
  const academic = viewer.role === 'admin' || viewer.role === 'principal'

  // This session's active students, with their arm
  const enrolled = await db.select({ armId: classArms.id, arm: classArms.name, level: classLevels.name, section: classLevels.section, sortOrder: classLevels.sortOrder, gender: students.gender })
    .from(studentEnrolments)
    .innerJoin(students, eq(studentEnrolments.studentId, students.id))
    .innerJoin(classArms, eq(studentEnrolments.classArmId, classArms.id))
    .innerJoin(classLevels, eq(classArms.classLevelId, classLevels.id))
    .where(whereSchool(studentEnrolments, school, eq(studentEnrolments.sessionId, session.id), isNull(students.deletedAt)))
  const studentBlock = {
    total: enrolled.length,
    bySection: SECTIONS.map(section => ({ section, count: enrolled.filter(e => e.section === section).length })).filter(s => s.count),
    female: enrolled.filter(e => e.gender === 'female').length,
    male: enrolled.filter(e => e.gender === 'male').length,
  }
  // Arms with students, in class order
  const arms = [...new Map(enrolled.map(e => [e.armId, e])).values()]
    .sort((a, b) => SECTIONS.indexOf(a.section) - SECTIONS.indexOf(b.section) || a.sortOrder - b.sortOrder || a.arm.localeCompare(b.arm))
    .map(e => ({ id: e.armId, label: classArmLabel(e.level, e.arm) }))

  const termRef = { id: term.id, number: term.number, sessionName: session.name }
  const money = await collections(db, school, { termId: term.id })
  const owing = await debtors(db, school, { termId: term.id })
  const fees = {
    expectedKobo: money.expectedKobo,
    collectedKobo: money.collectedKobo,
    outstandingKobo: money.outstandingKobo,
    percentCollected: percentOf(money.collectedKobo, money.expectedKobo),
    todayKobo: money.byDay.find(d => d.date === today)?.amountKobo ?? 0,
    debtors: owing.count,
  }
  if (!academic) return { term: { id: term.id, label: termLabel(termRef) }, students: studentBlock, attendance: null, fees, results: null }

  const marks = await db.select({ armId: attendanceRegisters.classArmId, status: attendanceMarks.status })
    .from(attendanceRegisters)
    .innerJoin(attendanceMarks, eq(attendanceMarks.registerId, attendanceRegisters.id))
    .where(whereSchool(attendanceRegisters, school, and(eq(attendanceRegisters.termId, term.id), eq(attendanceRegisters.date, today))))
  const registerArms = [...new Set(marks.map(m => m.armId))]
  const attendance = {
    date: today,
    ...todayAttendance({ arms, registers: registerArms.map(armId => ({ classArmId: armId, statuses: marks.filter(m => m.armId === armId).map(m => m.status) })) }),
  }

  const { sheets } = await listScoreSheets(db, school, viewer)
  const withStudents = sheets.filter(s => s.students > 0)
  const statuses = (await listResultArms(db, school, viewer)).arms.filter(a => arms.some(arm => arm.id === a.id))
  const results = {
    sheets: { complete: withStudents.filter(s => s.complete === s.students).length, total: withStudents.length },
    arms: {
      draft: statuses.filter(a => a.status === 'draft').length,
      submitted: statuses.filter(a => a.status === 'submitted').length,
      published: statuses.filter(a => a.status === 'published').length,
    },
  }
  return { term: { id: term.id, label: termLabel(termRef) }, students: studentBlock, attendance, fees, results }
}
