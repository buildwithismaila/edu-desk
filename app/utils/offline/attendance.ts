import type { AttendanceStatus } from '../../../shared/schemas/attendance'
import type { OfflineStorage } from './storage'

// Registers taken offline (docs/features/10c-offline-attendance.md): saved on the phone in an outbox and sent when
// back online, marked `offline` with the version of the school's register the phone saw. The server keeps the
// school's copy if it changed since (409), so nothing is overwritten silently.

export type OutboxState = 'waiting' | 'sent' | 'conflict' | 'rejected'

export interface OutboxEntry {
  classArmId: string
  armLabel: string
  date: string
  marks: { studentId: string, status: AttendanceStatus }[]
  /** Version of the school's register when the phone saved this (null: there was none) */
  baseVersion: number | null
  savedAt: string
  state: OutboxState
  sentAt?: string
  /** Why it was refused, or the conflict message */
  message?: string
  /** On a conflict: the school's register, to show next to the teacher's */
  school?: unknown
}

export interface ArmCopy { id: string, label: string, students: number, taken: boolean }
export interface RosterCopy<S = { id: string, name: string, admissionNumber: string }> {
  /** The day this list was loaded for, and the version of that day's register then (null: not taken) */
  date: string
  version: number | null
  students: S[]
}

/** What `send` gets back from PUT /api/attendance/register; throwing means the network failed. */
export type SendResult = { status: number, body?: unknown }
export type SendRegister = (body: { classArmId: string, date: string, marks: OutboxEntry['marks'], offline: { baseVersion: number | null } }) => Promise<SendResult>

const outboxPrefix = (scope: string) => `${scope}|outbox|`
const outboxKey = (scope: string, armId: string, date: string) => `${outboxPrefix(scope)}${armId}|${date}`
const SENT_KEPT_MS = 24 * 60 * 60_000

/** Saves (or replaces) the class's register for that day in the outbox, waiting to send. */
export async function queueRegister(store: OfflineStorage, scope: string, input: Omit<OutboxEntry, 'savedAt' | 'state'>, now = new Date()) {
  const entry: OutboxEntry = { ...input, savedAt: now.toISOString(), state: 'waiting' }
  await store.set(outboxKey(scope, input.classArmId, input.date), entry)
  return entry
}

/** The outbox, oldest first. Sent entries are dropped a day after sending. */
export async function listOutbox(store: OfflineStorage, scope: string, now = new Date()) {
  const entries: OutboxEntry[] = []
  for (const key of await store.keys(outboxPrefix(scope))) {
    const entry = await store.get<OutboxEntry>(key)
    if (!entry) continue
    if (entry.state === 'sent' && entry.sentAt && now.getTime() - Date.parse(entry.sentAt) > SENT_KEPT_MS) {
      await store.delete(key)
      continue
    }
    entries.push(entry)
  }
  return entries.sort((a, b) => a.savedAt.localeCompare(b.savedAt))
}

export async function removeFromOutbox(store: OfflineStorage, scope: string, armId: string, date: string) {
  await store.delete(outboxKey(scope, armId, date))
}

/** The first field error, else the message, from an API error body. */
function reasonOf(body: unknown) {
  const data = body as { message?: string, data?: { fieldErrors?: Record<string, string[]> } } | undefined
  const fieldError = Object.values(data?.data?.fieldErrors ?? {})[0]?.[0]
  return fieldError ?? data?.message ?? 'The school refused this register'
}

const syncing = new Set<string>()

/**
 * Sends waiting registers, oldest first. Stops at the first network failure, server error (5xx) or 401, leaving the
 * rest waiting for next time. A 409 keeps the school's copy (conflict); other refusals are recorded with the
 * reason and not retried. Overlapping calls for the same scope do nothing, so nothing is sent twice.
 */
export async function syncOutbox(store: OfflineStorage, scope: string, send: SendRegister, now = () => new Date()) {
  const result = { sent: 0, problems: 0, offline: false }
  if (syncing.has(scope)) return result
  syncing.add(scope)
  try {
    for (const entry of await listOutbox(store, scope, now())) {
      if (entry.state !== 'waiting') continue
      let response: SendResult
      try {
        response = await send({ classArmId: entry.classArmId, date: entry.date, marks: entry.marks, offline: { baseVersion: entry.baseVersion } })
      }
      catch {
        return { ...result, offline: true }
      }
      // Server trouble, or the session ended (log in again): keep waiting, try again later
      if (response.status >= 500 || response.status === 401) return { ...result, offline: true }

      const key = outboxKey(scope, entry.classArmId, entry.date)
      if (response.status < 300) {
        await store.set(key, { ...entry, state: 'sent', sentAt: now().toISOString() } satisfies OutboxEntry)
        result.sent++
      }
      else if (response.status === 409) {
        const body = response.body as { message?: string, data?: { register?: unknown } } | undefined
        await store.set(key, { ...entry, state: 'conflict', message: body?.message ?? 'Changed at school', school: body?.data?.register } satisfies OutboxEntry)
        result.problems++
      }
      else {
        await store.set(key, { ...entry, state: 'rejected', message: reasonOf(response.body) } satisfies OutboxEntry)
        result.problems++
      }
    }
    return result
  }
  finally {
    syncing.delete(scope)
  }
}

export async function saveArmsCopy(store: OfflineStorage, scope: string, arms: ArmCopy[]) {
  await store.set(`${scope}|arms`, arms)
}
export async function loadArmsCopy(store: OfflineStorage, scope: string) {
  return store.get<ArmCopy[]>(`${scope}|arms`)
}
export async function saveRosterCopy<S>(store: OfflineStorage, scope: string, armId: string, copy: RosterCopy<S>) {
  await store.set(`${scope}|roster|${armId}`, copy)
}
export async function loadRosterCopy<S = { id: string, name: string, admissionNumber: string }>(store: OfflineStorage, scope: string, armId: string) {
  return store.get<RosterCopy<S>>(`${scope}|roster|${armId}`)
}
