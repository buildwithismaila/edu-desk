import { describe, expect, it, vi } from 'vitest'
import {
  type OutboxEntry,
  type SendRegister,
  listOutbox,
  loadArmsCopy,
  loadRosterCopy,
  queueRegister,
  removeFromOutbox,
  saveArmsCopy,
  saveRosterCopy,
  syncOutbox,
} from '~~/app/utils/offline/attendance'
import { memoryStorage, type OfflineStorage } from '~~/app/utils/offline/storage'
import { isNetworkError } from '~~/app/utils/api-error'

const scope = 'greenfield.edudesk.ng|teacher-1'
const marks = [{ studentId: 's1', status: 'present' as const }, { studentId: 's2', status: 'absent' as const }]
const entry = (over: Partial<OutboxEntry> = {}) => ({ classArmId: 'a1', armLabel: 'JSS 1A', date: '2026-10-12', marks, baseVersion: null, ...over })

/** A fake API: answers per call in order; `'offline'` throws like a network failure. */
function fakeSend(...answers: ({ status: number, body?: unknown } | 'offline')[]) {
  return vi.fn<SendRegister>(async () => {
    const answer = answers.shift() ?? { status: 200 }
    if (answer === 'offline') throw new TypeError('fetch failed')
    return answer
  })
}

describe('the outbox', () => {
  it('keeps one waiting register per class and day (saving again replaces it)', async () => {
    const store = memoryStorage()
    await queueRegister(store, scope, entry(), new Date('2026-10-12T08:00:00Z'))
    await queueRegister(store, scope, entry({ marks: [{ studentId: 's1', status: 'late' }] }), new Date('2026-10-12T08:05:00Z'))
    await queueRegister(store, scope, entry({ date: '2026-10-13' }), new Date('2026-10-13T08:00:00Z'))

    const list = await listOutbox(store, scope)
    expect(list.map(e => [e.date, e.state, e.marks[0]!.status])).toEqual([['2026-10-12', 'waiting', 'late'], ['2026-10-13', 'waiting', 'present']])
  })

  it('keeps each user\'s and each school\'s outbox apart', async () => {
    const store = memoryStorage()
    await queueRegister(store, scope, entry())
    expect(await listOutbox(store, 'greenfield.edudesk.ng|teacher-2')).toEqual([])
    expect(await listOutbox(store, 'sunrise.edudesk.ng|teacher-1')).toEqual([])
  })
})

describe('syncOutbox', () => {
  it('sends waiting registers oldest first, marked as taken offline with the version the phone saw', async () => {
    const store = memoryStorage()
    await queueRegister(store, scope, entry({ date: '2026-10-13', baseVersion: 2 }), new Date('2026-10-13T08:00:00Z'))
    await queueRegister(store, scope, entry(), new Date('2026-10-12T08:00:00Z'))
    const send = fakeSend({ status: 201 }, { status: 200 })

    const result = await syncOutbox(store, scope, send)

    expect(send.mock.calls.map(c => c[0])).toEqual([
      { classArmId: 'a1', date: '2026-10-12', marks, offline: { baseVersion: null } },
      { classArmId: 'a1', date: '2026-10-13', marks, offline: { baseVersion: 2 } },
    ])
    expect(result).toEqual({ sent: 2, problems: 0, offline: false })
    expect((await listOutbox(store, scope)).map(e => e.state)).toEqual(['sent', 'sent'])
  })

  it('keeps the school\'s copy on a conflict, for the teacher to decide', async () => {
    const store = memoryStorage()
    await queueRegister(store, scope, entry({ baseVersion: 1 }))
    const school = { register: { version: 2 }, students: [] }
    await syncOutbox(store, scope, fakeSend({ status: 409, body: { message: 'This register was changed at school after your phone saved it', data: { register: school } } }))

    const [conflict] = await listOutbox(store, scope)
    expect(conflict).toMatchObject({ state: 'conflict', message: 'This register was changed at school after your phone saved it', school })
  })

  it('records refusals (class changed, too old) with the reason, and doesn\'t retry them', async () => {
    const store = memoryStorage()
    await queueRegister(store, scope, entry())
    await syncOutbox(store, scope, fakeSend({ status: 400, body: { message: 'Validation Error', data: { fieldErrors: { marks: ['Mark every student: Chidi Eze is missing'] } } } }))
    expect((await listOutbox(store, scope))[0]).toMatchObject({ state: 'rejected', message: 'Mark every student: Chidi Eze is missing' })

    const send = fakeSend()
    await syncOutbox(store, scope, send)
    expect(send).not.toHaveBeenCalled()
  })

  it('stops at the first network failure and keeps everything waiting, to retry later', async () => {
    const store = memoryStorage()
    await queueRegister(store, scope, entry(), new Date('2026-10-12T08:00:00Z'))
    await queueRegister(store, scope, entry({ date: '2026-10-13' }), new Date('2026-10-13T08:00:00Z'))
    const send = fakeSend('offline')

    expect(await syncOutbox(store, scope, send)).toEqual({ sent: 0, problems: 0, offline: true })
    expect(send).toHaveBeenCalledTimes(1)
    expect((await listOutbox(store, scope)).map(e => e.state)).toEqual(['waiting', 'waiting'])

    expect(await syncOutbox(store, scope, fakeSend({ status: 201 }, { status: 201 }))).toEqual({ sent: 2, problems: 0, offline: false })
  })

  it('treats a server error (5xx) like a network failure: retried later', async () => {
    const store = memoryStorage()
    await queueRegister(store, scope, entry())
    expect(await syncOutbox(store, scope, fakeSend({ status: 503 }))).toEqual({ sent: 0, problems: 0, offline: true })
    expect((await listOutbox(store, scope))[0]!.state).toBe('waiting')
  })

  it('keeps registers waiting when the session has ended (401), to send after logging in again', async () => {
    const store = memoryStorage()
    await queueRegister(store, scope, entry())
    expect(await syncOutbox(store, scope, fakeSend({ status: 401, body: { message: 'Not logged in' } }))).toEqual({ sent: 0, problems: 0, offline: true })
    expect((await listOutbox(store, scope))[0]!.state).toBe('waiting')
  })

  it('never sends the same register twice when two syncs overlap', async () => {
    const store = memoryStorage()
    await queueRegister(store, scope, entry())
    let release!: () => void
    const send = vi.fn<SendRegister>(() => new Promise((resolve) => {
      release = () => resolve({ status: 201 })
    }))
    const first = syncOutbox(store, scope, send)
    const second = syncOutbox(store, scope, send)
    await vi.waitFor(() => expect(send).toHaveBeenCalledTimes(1))
    release()
    await Promise.all([first, second])
    expect(send).toHaveBeenCalledTimes(1)
  })

  it('lets the teacher discard an entry', async () => {
    const store = memoryStorage()
    await queueRegister(store, scope, entry())
    await removeFromOutbox(store, scope, 'a1', '2026-10-12')
    expect(await listOutbox(store, scope)).toEqual([])
  })
})

describe('saved copies for offline use', () => {
  it('keeps the teacher\'s classes and each class\'s latest register, per user', async () => {
    const store: OfflineStorage = memoryStorage()
    await saveArmsCopy(store, scope, [{ id: 'a1', label: 'JSS 1A', students: 2, taken: false }])
    await saveRosterCopy(store, scope, 'a1', { date: '2026-10-12', version: 3, students: [{ id: 's1', name: 'Ada Obi', admissionNumber: 'GFA/1' }] })

    expect(await loadArmsCopy(store, scope)).toEqual([{ id: 'a1', label: 'JSS 1A', students: 2, taken: false }])
    expect(await loadRosterCopy(store, scope, 'a1')).toEqual({ date: '2026-10-12', version: 3, students: [{ id: 's1', name: 'Ada Obi', admissionNumber: 'GFA/1' }] })
    expect(await loadRosterCopy(store, 'other|user', 'a1')).toBeNull()
  })

  it('is wiped completely (logout on a shared phone)', async () => {
    const store = memoryStorage()
    await saveArmsCopy(store, scope, [])
    await queueRegister(store, scope, entry())
    await store.clear()
    expect(await loadArmsCopy(store, scope)).toBeNull()
    expect(await listOutbox(store, scope)).toEqual([])
  })
})

describe('isNetworkError', () => {
  // Shaped like ofetch's FetchError (not a direct dependency)
  const failed = (response?: unknown) => Object.assign(new Error('request failed'), { name: 'FetchError', response })

  it('is true when the request never reached the server, also wrapped as Nuxt wraps it', () => {
    expect(isNetworkError(failed())).toBe(true)
    expect(isNetworkError(Object.assign(new Error('wrapped'), { cause: failed() }))).toBe(true)
  })

  it('is false when the server answered (an error status), or for other errors', () => {
    expect(isNetworkError(failed({ status: 400 }))).toBe(false)
    expect(isNetworkError(new Error('boom'))).toBe(false)
    expect(isNetworkError(null)).toBe(false)
  })
})
