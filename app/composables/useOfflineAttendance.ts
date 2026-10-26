import type { AttendanceStatus } from '#shared/schemas/attendance'
import {
  type ArmCopy,
  type OutboxEntry,
  type RosterCopy,
  type SendRegister,
  listOutbox,
  loadArmsCopy,
  loadRosterCopy,
  queueRegister,
  removeFromOutbox,
  saveArmsCopy,
  saveRosterCopy,
  syncOutbox,
} from '~/utils/offline/attendance'
import { offlineStorage } from '~/utils/offline/storage'

export type RegisterStudent = { id: string, name: string, admissionNumber: string, photoUrl: string | null, status: AttendanceStatus | null }

/** The service worker's cache of opened pages (nuxt.config.ts → pwa), wiped at logout */
export const PAGES_CACHE = 'pages'

// Typed as a plain string: the typed route's PUT body overflows TS here (TS2321, see PROGRESS.md)
const REGISTER_URL: string = '/api/attendance/register'

const send: SendRegister = async (body) => {
  // Network failures throw; any answer from the server (also 4xx/5xx) comes back as a status
  const response = await $fetch.raw<unknown>(REGISTER_URL, { method: 'PUT', body, ignoreResponseError: true, retry: false })
  return { status: response.status, body: response._data }
}

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`

/**
 * Attendance on this phone (docs/features/10c-offline-attendance.md): saved copies of the teacher's classes,
 * the outbox of registers waiting to send, and sending it. Everything is kept per school (host) and user.
 */
export function useOfflineAttendance() {
  const { user } = useUserSession()
  const toast = useToast()
  const outbox = useState<OutboxEntry[]>('offline-outbox', () => [])
  const scope = computed(() => import.meta.client && user.value ? `${location.host}|${user.value.id}` : null)
  const store = () => offlineStorage()

  async function refreshOutbox() {
    outbox.value = scope.value ? await listOutbox(store(), scope.value) : []
  }

  const entryFor = (armId: string | undefined, date: string | undefined) =>
    outbox.value.find(e => e.classArmId === armId && e.date === date)
  const waiting = computed(() => outbox.value.filter(e => e.state === 'waiting'))

  /** Sends waiting registers now; toasts what was sent and what needs the teacher. */
  async function sendNow({ quiet = false } = {}) {
    if (!scope.value) return null
    const result = await syncOutbox(store(), scope.value, send)
    await refreshOutbox()
    if (result.sent) {
      await refreshNuxtData(['attendance-arms', 'attendance-register'])
      toast.add({ title: `${plural(result.sent, 'register')} sent`, color: 'success', icon: 'i-lucide-circle-check' })
    }
    if (result.problems) {
      toast.add({ title: `${plural(result.problems, 'register')} couldn't be sent`, description: 'Open Attendance to see why.', color: 'warning', icon: 'i-lucide-triangle-alert' })
    }
    if (result.offline && !quiet) {
      toast.add({ title: 'Couldn\'t send yet. It will try again when you\'re online.', color: 'neutral', icon: 'i-lucide-wifi-off' })
    }
    return result
  }

  async function queue(entry: Omit<OutboxEntry, 'savedAt' | 'state'>) {
    if (!scope.value) return
    await queueRegister(store(), scope.value, entry)
    await refreshOutbox()
  }

  /** Drops the phone's copy (keeps the school's). */
  async function discard(entry: OutboxEntry) {
    if (!scope.value) return
    await removeFromOutbox(store(), scope.value, entry.classArmId, entry.date)
    await refreshOutbox()
  }

  /** After a conflict: send the phone's marks again, now replacing the school's register the teacher has seen. */
  async function sendMine(entry: OutboxEntry) {
    const school = entry.school as { register?: { version: number } | null } | undefined
    await queue({ ...entry, baseVersion: school?.register?.version ?? null })
    return sendNow()
  }

  const saveArms = async (arms: ArmCopy[]) => scope.value && saveArmsCopy(store(), scope.value, arms)
  const loadArms = async () => (scope.value ? loadArmsCopy(store(), scope.value) : null)
  const saveRoster = async (armId: string, copy: RosterCopy<RegisterStudent>) => scope.value && saveRosterCopy(store(), scope.value, armId, copy)
  const loadRoster = async (armId: string) => (scope.value ? loadRosterCopy<RegisterStudent>(store(), scope.value, armId) : null)

  /** Logout on a shared phone: everything Edu Desk saved here goes, including unsent registers. */
  async function wipe() {
    await store().clear()
    outbox.value = []
    if ('caches' in window) await caches.delete(PAGES_CACHE)
  }

  return { outbox, waiting, entryFor, refreshOutbox, sendNow, queue, discard, sendMine, saveArms, loadArms, saveRoster, loadRoster, wipe }
}
