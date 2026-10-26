<script setup lang="ts">
import type { InternalApi } from 'nitropack/types'
import type { AttendanceStatus } from '#shared/schemas/attendance'
import { SCHOOL_TIME_ZONE, todayIn } from '#shared/utils/dates'
import type { ArmCopy, OutboxEntry, RosterCopy } from '~/utils/offline/attendance'
import type { RegisterStudent } from '~/composables/useOfflineAttendance'

definePageMeta({ roles: ['admin', 'principal', 'teacher'] })
useHead({ title: 'Attendance' })

type RegisterView = InternalApi['/api/attendance/register']['get']
/** What the page shows: the server's register, or the phone's saved copy when offline */
interface View {
  date: string
  arm: { id: string, label: string }
  termStartsOn: string | null
  register: { takenBy: string | null, updatedAt: string, sentLateAt: string | null } | null
  /** Version of the school's register (null: not taken), sent with registers saved on the phone */
  version: number | null
  canEdit: boolean
  students: RegisterStudent[]
  /** Offline: the day the saved class list is from */
  copyFrom?: string
}

const route = useRoute()
const router = useRouter()
const toast = useToast()
const confirm = useConfirmDialog()
const online = useOnline()
const offline = useOfflineAttendance()
const { user } = useUserSession()
const canBackfill = computed(() => user.value?.role === 'admin' || user.value?.role === 'principal')
// Registers are taken offline by class teachers only (docs/features/10c-offline-attendance.md)
const isTeacher = computed(() => user.value?.role === 'teacher')

const { data: armList, refresh: refreshArms, error: armsError } = await useFetch('/api/attendance/arms', { key: 'attendance-arms' })

// Offline, or this page came from the phone's cache on another day: the phone's saved copies instead
const copies = ref<{ today: string, arms: ArmCopy[] } | null>(null)
const rosterCopy = ref<RosterCopy<RegisterStudent> | null>(null)
async function switchToCopies() {
  copies.value = { today: todayIn(SCHOOL_TIME_ZONE), arms: await offline.loadArms() ?? [] }
}

const arms = computed(() => copies.value?.arms ?? armList.value?.arms ?? [])
const today = computed(() => copies.value?.today ?? armList.value?.today ?? '')

// Arm and date live in the URL; a teacher with one arm goes straight to it. A teacher can open an earlier day
// only to fix a register saved on the phone.
const armId = computed(() => typeof route.query.arm === 'string' ? route.query.arm : arms.value.length === 1 ? arms.value[0]!.id : undefined)
const date = computed(() => {
  const asked = typeof route.query.date === 'string' ? route.query.date : undefined
  return asked && (canBackfill.value || offline.entryFor(armId.value, asked)) ? asked : today.value
})
function setQuery(changes: { arm?: string, date?: string }) {
  router.replace({ query: { ...route.query, ...changes } })
}
function armStatus(arm: ArmCopy) {
  const entry = offline.entryFor(arm.id, today.value)
  if (entry?.state === 'waiting') return 'Waiting to send'
  return arm.taken || entry?.state === 'sent' ? 'Taken' : 'Not taken'
}
const armItems = computed(() => arms.value.map(a => ({ label: `${a.label} · ${armStatus(a)}`, value: a.id })))
const selectedArm = computed({
  get: () => armId.value,
  set: value => setQuery({ arm: value }),
})

// useRequestFetch: during SSR a bare $fetch doesn't forward the request (host, cookie), so the tenant is unknown
const requestFetch = useRequestFetch()
// Explicit type: inference on this path overflows TS (TS2321, see PROGRESS.md)
const { data: register, refresh, error } = await useAsyncData('attendance-register',
  () => armId.value && date.value && !copies.value
    ? requestFetch<RegisterView>('/api/attendance/register', { query: { classArmId: armId.value, date: date.value } })
    : Promise.resolve(null),
  { watch: [armId, date] })

watch([copies, armId], async () => {
  rosterCopy.value = copies.value && armId.value ? await offline.loadRoster(armId.value) : null
})

const view = computed<View | null>(() => {
  if (copies.value) {
    const arm = arms.value.find(a => a.id === armId.value)
    const copy = rosterCopy.value
    if (!arm || !copy) return null
    // The saved list is from an earlier day: its marks (and version) are that day's, not today's
    const sameDay = copy.date === date.value
    return {
      date: date.value,
      arm: { id: arm.id, label: arm.label },
      termStartsOn: null,
      register: null,
      version: sameDay ? copy.version : null,
      canEdit: isTeacher.value,
      students: copy.students.map(s => ({ ...s, status: sameDay ? s.status : null })),
      copyFrom: copy.date,
    }
  }
  const r = register.value
  if (!r) return null
  return {
    date: r.date,
    arm: { id: r.arm.id, label: r.arm.label },
    termStartsOn: r.term.startsOn,
    register: r.register ? { takenBy: r.register.takenBy, updatedAt: String(r.register.updatedAt), sentLateAt: r.register.sentLateAt ? String(r.register.sentLateAt) : null } : null,
    version: r.register?.version ?? null,
    canEdit: r.canEdit,
    students: r.students,
  }
})

// A register saved on the phone for this class and day: its marks are shown (and can be fixed and saved again)
const pending = computed(() => offline.entryFor(view.value?.arm.id, view.value?.date))
const unsent = computed(() => !!pending.value && pending.value.state !== 'sent')
const shownStudents = computed(() => {
  const v = view.value
  if (!v) return []
  const entry = pending.value
  if (!entry || (entry.state === 'sent' && !copies.value)) return v.students
  const marks = new Map(entry.marks.map(m => [m.studentId, m.status]))
  return v.students.map(s => ({ ...s, status: marks.get(s.id) ?? null }))
})
const editable = computed(() => !!view.value && (view.value.canEdit || (isTeacher.value && unsent.value)))

// Online: keep copies on the phone of the teacher's classes and today's lists, for when there's no signal
async function saveCopies() {
  const list = armList.value
  if (!list || copies.value || !isTeacher.value) return
  await offline.saveArms(list.arms)
  await Promise.all(list.arms.map(async (arm) => {
    const r = await $fetch<RegisterView>('/api/attendance/register', { query: { classArmId: arm.id, date: list.today } }).catch(() => null)
    if (r) await offline.saveRoster(arm.id, { date: r.date, version: r.register?.version ?? null, students: r.students })
  }))
}

async function goOnline() {
  copies.value = null
  await refreshArms()
  if (isNetworkError(armsError.value)) return switchToCopies()
  await saveCopies()
}

onMounted(async () => {
  await offline.refreshOutbox()
  // A page from the phone's cache can be from an earlier day: check with the server first
  if (!online.value) return switchToCopies()
  if (isNetworkError(armsError.value) || armList.value?.today !== todayIn(SCHOOL_TIME_ZONE)) return goOnline()
  await saveCopies()
})
watch(online, now => now ? goOnline() : switchToCopies())
watch(error, (e) => {
  if (isNetworkError(e)) switchToCopies()
})

const saving = ref(false)
async function save(marks: { studentId: string, status: AttendanceStatus }[]) {
  if (copies.value || unsent.value) return saveOnPhone(marks)
  saving.value = true
  try {
    await $fetch('/api/attendance/register', { method: 'PUT', body: { classArmId: armId.value, date: date.value, marks } })
    await Promise.all([refresh(), refreshArms()])
    toast.add({ title: 'Register saved', color: 'success', icon: 'i-lucide-circle-check' })
  }
  catch (e) {
    if (isNetworkError(e)) return saveOnPhone(marks)
    toast.add({ title: apiFormErrors(e)[0]?.message ?? apiErrorMessage(e), color: 'error' })
  }
  finally {
    saving.value = false
  }
}

/** Into the phone's outbox, marked with the school's version this phone saw; sent right away when online. */
async function saveOnPhone(marks: { studentId: string, status: AttendanceStatus }[]) {
  const v = view.value
  if (!v) return
  if (!isTeacher.value) {
    toast.add({ title: 'You\'re offline. Connect to the internet to save this register.', color: 'error' })
    return
  }
  saving.value = true
  try {
    await offline.queue({ classArmId: v.arm.id, armLabel: v.arm.label, date: v.date, marks, baseVersion: v.version })
    const result = online.value ? await offline.sendNow({ quiet: true }) : null
    if (!result || result.offline) {
      toast.add({ title: 'Saved on this phone. It will send when you\'re online.', color: 'info', icon: 'i-lucide-smartphone' })
    }
  }
  finally {
    saving.value = false
  }
}

const sending = ref(false)
async function sendNow() {
  sending.value = true
  try {
    await offline.sendNow()
  }
  finally {
    sending.value = false
  }
}
async function sendMine(entry: OutboxEntry) {
  sending.value = true
  try {
    await offline.sendMine(entry)
  }
  finally {
    sending.value = false
  }
}
function openEntry(entry: OutboxEntry) {
  setQuery({ arm: entry.classArmId, date: entry.date })
}

async function removeRegister() {
  const current = register.value?.register
  if (!current || !await confirm({
    title: 'Delete this register?',
    description: 'For a register taken by mistake, e.g. on a holiday. Its marks are deleted and the day no longer counts as a school day.',
    confirmLabel: 'Delete register',
  })) return
  try {
    await $fetch(`/api/attendance/registers/${current.id}`, { method: 'DELETE' })
    await Promise.all([refresh(), refreshArms()])
    toast.add({ title: 'Register deleted', color: 'success', icon: 'i-lucide-circle-check' })
  }
  catch (e) {
    toast.add({ title: apiErrorMessage(e), color: 'error' })
  }
}
</script>

<template>
  <div class="mx-auto w-full max-w-2xl space-y-4">
    <div class="flex flex-wrap items-center justify-between gap-2">
      <h1 class="text-2xl font-semibold">
        Attendance
      </h1>
      <UButton
        v-if="!copies"
        :to="armId ? `/attendance/summary?arm=${armId}` : '/attendance/summary'"
        label="Term summary"
        icon="i-lucide-chart-column"
        color="neutral"
        variant="outline"
        size="sm"
      />
    </div>

    <AttendanceOutbox
      v-if="offline.outbox.value.length"
      :entries="offline.outbox.value"
      :online="online"
      :sending="sending"
      @send-now="sendNow"
      @discard="offline.discard"
      @send-mine="sendMine"
      @open="openEntry"
    />

    <UAlert
      v-if="copies && !arms.length"
      data-testid="attendance-no-copy"
      color="neutral"
      variant="subtle"
      icon="i-lucide-wifi-off"
      :title="isTeacher ? 'Open Attendance once while online, so your class is saved on this phone.' : 'You\'re offline. Attendance needs a connection for admins and principals.'"
    />

    <UAlert
      v-else-if="!arms.length"
      data-testid="attendance-no-arms"
      color="neutral"
      variant="subtle"
      icon="i-lucide-info"
      :title="user?.role === 'teacher' ? 'Attendance is taken by class teachers. You\'re not a class teacher this session.' : 'No classes yet for the current session.'"
    />

    <template v-else>
      <div class="grid gap-2 sm:grid-cols-2">
        <USelect
          v-if="arms.length > 1"
          v-model="selectedArm"
          data-testid="attendance-arm"
          :items="armItems"
          placeholder="Choose a class"
          class="w-full"
        />
        <UInput
          v-if="canBackfill && armId && !copies"
          :model-value="date"
          data-testid="attendance-date"
          type="date"
          :min="view?.termStartsOn ?? undefined"
          :max="today"
          class="w-full"
          @update:model-value="value => setQuery({ date: String(value) })"
        />
      </div>

      <UAlert
        v-if="error && !copies && !isNetworkError(error)"
        color="error"
        variant="subtle"
        :title="apiFormErrors(error)[0]?.message ?? apiErrorMessage(error)"
      />

      <template v-if="view">
        <div class="space-y-1">
          <h2
            data-testid="register-title"
            class="text-lg font-semibold"
          >
            {{ view.arm.label }} · {{ view.date === today ? 'Today' : formatDate(view.date) }}{{ view.date === today ? `, ${formatDate(view.date)}` : '' }}
          </h2>
          <p
            data-testid="register-status"
            class="text-sm text-muted"
          >
            <template v-if="pending?.state === 'waiting'">
              Saved on this phone · waiting to send
            </template>
            <template v-else-if="view.register">
              Taken by {{ view.register.takenBy ?? 'a former user' }} · last saved {{ formatDateTime(view.register.updatedAt) }}
            </template>
            <template v-else-if="view.copyFrom">
              Class list saved on this phone {{ view.copyFrom === today ? 'today' : `on ${formatDate(view.copyFrom)}` }}
            </template>
            <template v-else>
              Not taken yet
            </template>
          </p>
          <p
            v-if="view.register?.sentLateAt && !unsent"
            data-testid="register-sent-late"
            class="text-sm text-warning"
          >
            Sent late (offline) · arrived {{ formatDateTime(view.register.sentLateAt) }}
          </p>
          <p
            v-if="!editable"
            data-testid="register-readonly"
            class="text-sm text-muted"
          >
            You can only change today's register.
          </p>
        </div>

        <p
          v-if="!shownStudents.length"
          class="text-sm text-muted"
        >
          No students in this class yet.
        </p>
        <AttendanceRegister
          v-else
          :students="shownStudents"
          :readonly="!editable"
          :saving="saving"
          @save="save"
        />

        <UButton
          v-if="canBackfill && register?.register && !copies"
          data-testid="register-delete"
          label="Delete register"
          icon="i-lucide-trash"
          color="error"
          variant="ghost"
          size="sm"
          @click="removeRegister"
        />
      </template>
    </template>
  </div>
</template>
