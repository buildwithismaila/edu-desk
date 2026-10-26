import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { flushPromises } from '@vue/test-utils'
import { mockNuxtImport, mountSuspended, registerEndpoint } from '@nuxt/test-utils/runtime'
import { SCHOOL_TIME_ZONE, todayIn } from '#shared/utils/dates'
import AttendanceOutbox from '~/components/attendance/AttendanceOutbox.vue'
import AttendancePage from '~/pages/attendance/index.vue'
import UserMenu from '~/components/layout/UserMenu.vue'
import { type OutboxEntry, listOutbox, queueRegister, saveArmsCopy, saveRosterCopy } from '~/utils/offline/attendance'
import { offlineStorage } from '~/utils/offline/storage'

// Offline attendance in the app (docs/features/10c-offline-attendance.md)

// The confirm dialog needs <UApp>'s overlay host: the test answers it instead ("Cancel" by default)
const { confirm, logoutCalled } = vi.hoisted(() => ({ confirm: vi.fn(async () => false), logoutCalled: vi.fn() }))
mockNuxtImport('useConfirmDialog', () => () => confirm)
registerEndpoint('/api/auth/logout', { method: 'POST', handler: () => {
  logoutCalled()
  return {}
} })

const marks = [{ studentId: 's1', status: 'present' as const }, { studentId: 's2', status: 'absent' as const }]
const entry = (over: Partial<OutboxEntry> = {}): OutboxEntry =>
  ({ classArmId: 'a1', armLabel: 'JSS 1A', date: '2026-10-12', marks, baseVersion: null, savedAt: '2026-10-12T08:00:00Z', state: 'waiting', ...over })

describe('AttendanceOutbox', () => {
  it('shows each register saved on the phone with its state, and sends on request (not while offline)', async () => {
    const entries = [entry(), entry({ date: '2026-10-09', state: 'sent' })]
    const wrapper = await mountSuspended(AttendanceOutbox, { props: { entries, online: true } })

    expect(wrapper.get('[data-testid=outbox-waiting]').text()).toContain('JSS 1A · 12/10/2026')
    expect(wrapper.get('[data-testid=outbox-waiting]').text()).toContain('Waiting to send')
    expect(wrapper.get('[data-testid=outbox-sent]').text()).toContain('Sent')
    await wrapper.get('[data-testid=outbox-send]').trigger('click')
    expect(wrapper.emitted('sendNow')).toHaveLength(1)

    await wrapper.setProps({ online: false })
    expect(wrapper.get('[data-testid=outbox-send]').attributes('disabled')).toBeDefined()
  })

  it('shows yours and the school\'s on a conflict, and lets the teacher choose', async () => {
    const conflict = entry({
      state: 'conflict',
      message: 'This register was changed at school after your phone saved it',
      school: { register: { version: 2 }, students: [{ status: 'present' }, { status: 'late' }] },
    })
    const wrapper = await mountSuspended(AttendanceOutbox, { props: { entries: [conflict], online: true } })

    const text = wrapper.get('[data-testid=outbox-conflict]').text()
    expect(text).toContain('Changed at school')
    expect(text).toContain('Yours')
    expect(text).toContain('Present 1 · Absent 1 · Late 0')
    expect(text).toContain('School\'s')
    expect(text).toContain('Present 1 · Absent 0 · Late 1')

    await wrapper.get('[data-testid=outbox-keep-school]').trigger('click')
    await wrapper.get('[data-testid=outbox-send-mine]').trigger('click')
    expect(wrapper.emitted('discard')?.[0]).toEqual([conflict])
    expect(wrapper.emitted('sendMine')?.[0]).toEqual([conflict])
  })

  it('shows why a register wasn\'t accepted, to open and fix or discard', async () => {
    const rejected = entry({ state: 'rejected', message: 'Mark every student: Chidi Eze is missing' })
    const wrapper = await mountSuspended(AttendanceOutbox, { props: { entries: [rejected], online: true } })

    expect(wrapper.get('[data-testid=outbox-rejected]').text()).toContain('Mark every student: Chidi Eze is missing')
    await wrapper.get('[data-testid=outbox-open]').trigger('click')
    expect(wrapper.emitted('open')?.[0]).toEqual([rejected])
  })
})

describe('taking a register with no connection', () => {
  const today = todayIn(SCHOOL_TIME_ZONE)
  const students = [
    { id: 's1', name: 'Ada Obi', admissionNumber: 'GFA/1', photoUrl: null, status: null },
    { id: 's2', name: 'Bola Ade', admissionNumber: 'GFA/2', photoUrl: null, status: null },
  ]
  let scope = ''
  const setOnline = (value: boolean) => {
    vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(value)
    window.dispatchEvent(new Event(value ? 'online' : 'offline'))
  }

  // What the server last said (the page also asks it during setup; offline the phone's copies are used)
  registerEndpoint('/api/attendance/arms', () => ({ today: '2026-01-05', arms: [] }))

  beforeEach(async () => {
    useUserSession().session.value = { id: 'session-1', user: { id: 'u1', name: 'Tunde Bello', role: 'teacher', mustChangePassword: false } }
    scope = `${location.host}|u1`
    await saveArmsCopy(offlineStorage(), scope, [{ id: 'a1', label: 'JSS 1A', students: 2, taken: false }])
    await saveRosterCopy(offlineStorage(), scope, 'a1', { date: '2026-10-09', version: 4, students: students.map(s => ({ ...s, status: 'late' as const })) })
  })
  afterEach(async () => {
    vi.restoreAllMocks()
    await offlineStorage().clear()
    useState('offline-outbox').value = []
    useUserSession().session.value = null
  })

  it('opens the class from the phone\'s copy and saves the register on the phone', async () => {
    setOnline(false)
    const wrapper = await mountSuspended(AttendancePage, { route: '/attendance' })
    await vi.waitFor(() => expect(wrapper.find('[data-testid=register-title]').exists()).toBe(true))

    expect(wrapper.get('[data-testid=register-title]').text()).toContain('JSS 1A · Today')
    expect(wrapper.get('[data-testid=register-status]').text()).toBe('Class list saved on this phone on 09/10/2026')
    // The copy's marks were for its own day: today's register starts fresh (everyone present)
    expect(wrapper.get('[data-testid=register-counts]').text()).toBe('Present 2 · Absent 0 · Late 0')

    await wrapper.get('[data-testid=register-save]').trigger('click')
    await vi.waitFor(() => expect(wrapper.find('[data-testid=outbox-waiting]').exists()).toBe(true))

    expect(wrapper.get('[data-testid=register-status]').text()).toBe('Saved on this phone · waiting to send')
    const [saved] = await listOutbox(offlineStorage(), scope)
    // An earlier day's copy says nothing about today's register at school: sent as "there was none"
    expect(saved).toMatchObject({ classArmId: 'a1', date: today, baseVersion: null, state: 'waiting' })
    expect(saved!.marks).toEqual([{ studentId: 's1', status: 'present' }, { studentId: 's2', status: 'present' }])
  })

  it('tells a teacher with nothing saved to open Attendance once while online', async () => {
    await offlineStorage().clear()
    setOnline(false)
    const wrapper = await mountSuspended(AttendancePage, { route: '/attendance' })
    await vi.waitFor(() => expect(wrapper.find('[data-testid=attendance-no-copy]').exists()).toBe(true))
    expect(wrapper.get('[data-testid=attendance-no-copy]').text()).toContain('Open Attendance once while online')
  })

  it('warns at logout when registers haven\'t been sent, and keeps them if the teacher stays', async () => {
    await queueRegister(offlineStorage(), scope, entry())
    const wrapper = await mountSuspended(UserMenu, { attachTo: document.body })
    // Opened from the keyboard: happy-dom's pointer events don't open the menu
    await wrapper.get('[data-testid=user-menu]').trigger('keydown', { key: 'Enter' })
    await flushPromises()
    let logout: HTMLElement | undefined
    await vi.waitFor(() => {
      logout = [...document.body.querySelectorAll<HTMLElement>('[role=menuitem]')].find(el => el.textContent?.includes('Log out'))
      expect(logout).toBeDefined()
    })
    logout!.click()
    await vi.waitFor(() => expect(confirm).toHaveBeenCalledWith(expect.objectContaining({ title: '1 register not sent yet', confirmLabel: 'Log out anyway' })))

    // The teacher stays: still logged in, and the register is still on the phone
    await flushPromises()
    expect(logoutCalled).not.toHaveBeenCalled()
    expect(await listOutbox(offlineStorage(), scope)).toHaveLength(1)
    wrapper.unmount()
  })
})
