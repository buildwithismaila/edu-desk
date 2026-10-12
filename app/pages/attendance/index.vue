<script setup lang="ts">
import type { InternalApi } from 'nitropack/types'
import type { AttendanceStatus } from '#shared/schemas/attendance'

definePageMeta({ roles: ['admin', 'principal', 'teacher'] })
useHead({ title: 'Attendance' })

type RegisterView = InternalApi['/api/attendance/register']['get']

const route = useRoute()
const router = useRouter()
const toast = useToast()
const confirm = useConfirmDialog()
const { user } = useUserSession()
const canBackfill = computed(() => user.value?.role === 'admin' || user.value?.role === 'principal')

const { data: armList, refresh: refreshArms } = await useFetch('/api/attendance/arms', { key: 'attendance-arms' })
const arms = computed(() => armList.value?.arms ?? [])
const today = computed(() => armList.value?.today ?? '')

// Arm and date live in the URL; a teacher with one arm goes straight to it
const armId = computed(() => typeof route.query.arm === 'string' ? route.query.arm : arms.value.length === 1 ? arms.value[0]!.id : undefined)
const date = computed(() => typeof route.query.date === 'string' && canBackfill.value ? route.query.date : today.value)
function setQuery(changes: { arm?: string, date?: string }) {
  router.replace({ query: { ...route.query, ...changes } })
}
const armItems = computed(() => arms.value.map(a => ({ label: `${a.label} · ${a.taken ? 'Taken' : 'Not taken'}`, value: a.id })))
const selectedArm = computed({
  get: () => armId.value,
  set: value => setQuery({ arm: value }),
})

// useRequestFetch: during SSR a bare $fetch doesn't forward the request (host, cookie), so the tenant is unknown
const requestFetch = useRequestFetch()
// Explicit type: inference on this path overflows TS (TS2321, see PROGRESS.md)
const { data: register, refresh, error } = await useAsyncData('attendance-register',
  () => armId.value && date.value
    ? requestFetch<RegisterView>('/api/attendance/register', { query: { classArmId: armId.value, date: date.value } })
    : Promise.resolve(null),
  { watch: [armId, date] })

const saving = ref(false)
async function save(marks: { studentId: string, status: AttendanceStatus }[]) {
  saving.value = true
  try {
    await $fetch('/api/attendance/register', { method: 'PUT', body: { classArmId: armId.value, date: date.value, marks } })
    await Promise.all([refresh(), refreshArms()])
    toast.add({ title: 'Register saved', color: 'success', icon: 'i-lucide-circle-check' })
  }
  catch (e) {
    toast.add({ title: apiFormErrors(e)[0]?.message ?? apiErrorMessage(e), color: 'error' })
  }
  finally {
    saving.value = false
  }
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
        :to="armId ? `/attendance/summary?arm=${armId}` : '/attendance/summary'"
        label="Term summary"
        icon="i-lucide-chart-column"
        color="neutral"
        variant="outline"
        size="sm"
      />
    </div>

    <UAlert
      v-if="!arms.length"
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
          v-if="canBackfill && armId"
          :model-value="date"
          data-testid="attendance-date"
          type="date"
          :min="register?.term.startsOn ?? undefined"
          :max="today"
          class="w-full"
          @update:model-value="value => setQuery({ date: String(value) })"
        />
      </div>

      <UAlert
        v-if="error"
        color="error"
        variant="subtle"
        :title="apiFormErrors(error)[0]?.message ?? apiErrorMessage(error)"
      />

      <template v-if="register">
        <div class="space-y-1">
          <h2
            data-testid="register-title"
            class="text-lg font-semibold"
          >
            {{ register.arm.label }} · {{ register.date === today ? 'Today' : formatDate(register.date) }}{{ register.date === today ? `, ${formatDate(register.date)}` : '' }}
          </h2>
          <p
            data-testid="register-status"
            class="text-sm text-muted"
          >
            <template v-if="register.register">
              Taken by {{ register.register.takenBy ?? 'a former user' }} · last saved {{ formatDateTime(register.register.updatedAt) }}
            </template>
            <template v-else>
              Not taken yet
            </template>
          </p>
          <p
            v-if="!register.canEdit"
            data-testid="register-readonly"
            class="text-sm text-muted"
          >
            You can only change today's register.
          </p>
        </div>

        <p
          v-if="!register.students.length"
          class="text-sm text-muted"
        >
          No students in this class yet.
        </p>
        <AttendanceRegister
          v-else
          :students="register.students"
          :readonly="!register.canEdit"
          :saving="saving"
          @save="save"
        />

        <UButton
          v-if="canBackfill && register.register"
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
