<script setup lang="ts">
import type { DropdownMenuItem } from '@nuxt/ui'
import type { InternalApi } from 'nitropack/types'
import {
  StudentsAddGuardianDialog,
  StudentsEnrolmentDialog,
  StudentsGuardianDialog,
  StudentsPhotoDialog,
  StudentsStudentDialog,
  TemporaryPasswordDialog,
} from '#components'

definePageMeta({ roles: ['admin', 'principal', 'bursar', 'teacher'] })

const route = useRoute()
const toast = useToast()
const confirm = useConfirmDialog()
const overlay = useOverlay()
const studentDialog = overlay.create(StudentsStudentDialog, { destroyOnClose: true })
const enrolmentDialog = overlay.create(StudentsEnrolmentDialog, { destroyOnClose: true })
const photoDialog = overlay.create(StudentsPhotoDialog, { destroyOnClose: true })
const addGuardianDialog = overlay.create(StudentsAddGuardianDialog, { destroyOnClose: true })
const guardianDialog = overlay.create(StudentsGuardianDialog, { destroyOnClose: true })
const passwordDialog = overlay.create(TemporaryPasswordDialog, { destroyOnClose: true })

const { user } = useUserSession()
const isAdmin = computed(() => user.value?.role === 'admin')
const seesFees = computed(() => ['admin', 'bursar', 'principal'].includes(user.value?.role ?? ''))

// Explicit type: `/api/students/${id}` also matches /api/students/import, so inference gives {}
type Student = InternalApi['/api/students/:id']['get']
const { data: student, refresh } = await useFetch<Student>(() => `/api/students/${route.params.id}`)
type Guardian = Student['guardians'][number]

const fullName = computed(() => student.value ? [student.value.firstName, student.value.middleName, student.value.lastName].filter(Boolean).join(' ') : '')
useHead({ title: () => fullName.value || 'Student' })

const RELATIONSHIP_LABELS: Record<string, string> = { father: 'Father', mother: 'Mother', guardian: 'Guardian', other: 'Other' }

/** Personal details are left out for the bursar (the API doesn't send them). */
const details = computed(() => {
  const s = student.value
  if (!s) return []
  const rows: [string, string][] = [['Gender', s.gender === 'male' ? 'Male' : 'Female']]
  if ('dateOfBirth' in s) {
    // `in` doesn't narrow the serialized union
    const personal = s as unknown as Record<'dateOfBirth' | 'stateOfOrigin' | 'lga' | 'address', string | null>
    rows.push(
      ['Date of birth', formatDate(personal.dateOfBirth) || '—'],
      ['State of origin', personal.stateOfOrigin ?? '—'],
      ['LGA', personal.lga ?? '—'],
      ['Address', personal.address ?? '—'],
    )
  }
  if (s.enrolment?.section === 'sss') rows.push(['Department', s.department?.name ?? '—'])
  rows.push(['Admitted', formatDate(s.admittedOn)])
  return rows
})

async function afterChange(changed: unknown, message: string) {
  if (!changed) return
  await refresh()
  toast.add({ title: message, color: 'success', icon: 'i-lucide-circle-check' })
}

async function addGuardian(s: Student) {
  const result = await addGuardianDialog.open({ studentId: s.id, name: s.firstName })
  if (!result) return
  await afterChange(true, `${result.name} added`)
  if (result.temporaryPassword) await passwordDialog.open({ name: result.name, password: result.temporaryPassword })
}

async function unlink(s: Student, guardian: Guardian) {
  if (!await confirm({
    title: `Remove ${guardian.name} as ${s.firstName}'s guardian?`,
    description: 'Their account stays, with any other children.',
    confirmLabel: 'Remove guardian',
  })) return
  try {
    await $fetch(`/api/students/${s.id}/guardians/${guardian.id}`, { method: 'DELETE' })
    await afterChange(true, `${guardian.name} removed`)
  }
  catch (e) {
    toast.add({ title: apiErrorMessage(e), color: 'error' })
  }
}

async function resetPassword(guardian: Guardian) {
  if (!await confirm({
    title: `Reset ${guardian.name}'s password?`,
    description: 'Their current password stops working. You\'ll get a temporary password to give them; they log in with their phone number.',
    confirmLabel: 'Reset password',
  })) return
  try {
    const { temporaryPassword } = await $fetch<{ temporaryPassword: string }>(`/api/users/${guardian.id}/reset-password`, { method: 'POST' })
    await passwordDialog.open({ name: guardian.name, password: temporaryPassword })
  }
  catch (e) {
    toast.add({ title: apiErrorMessage(e), color: 'error' })
  }
}

async function remove(s: Student) {
  if (!await confirm({
    title: `Remove ${s.firstName} ${s.lastName}?`,
    description: 'For students who have left. They disappear from lists and from their parents\' accounts. Their records are kept.',
    confirmLabel: 'Remove student',
  })) return
  try {
    await $fetch(`/api/students/${s.id}`, { method: 'DELETE' })
    toast.add({ title: `${s.firstName} ${s.lastName} removed`, color: 'success', icon: 'i-lucide-circle-check' })
    await navigateTo('/students')
  }
  catch (e) {
    toast.add({ title: apiErrorMessage(e), color: 'error' })
  }
}

const studentActions = computed<DropdownMenuItem[][]>(() => {
  const s = student.value
  if (!s) return []
  return [
    [
      { label: 'Edit details', icon: 'i-lucide-pencil', onSelect: async () => afterChange(await studentDialog.open({ student: s }), 'Student saved') },
      { label: 'Change class', icon: 'i-lucide-arrow-right-left', onSelect: async () => afterChange(await enrolmentDialog.open({ studentId: s.id, name: s.firstName, classArmId: s.enrolment?.classArmId }), 'Class changed') },
      { label: 'Photo', icon: 'i-lucide-camera', onSelect: async () => afterChange(await photoDialog.open({ studentId: s.id, name: s.firstName, photoUrl: s.photoUrl }), 'Photo updated') },
      { label: 'Add guardian', icon: 'i-lucide-user-plus', onSelect: () => addGuardian(s) },
    ],
    [{ label: 'Remove student', icon: 'i-lucide-trash', color: 'error', onSelect: () => remove(s) }],
  ]
})

function guardianActions(s: Student, guardian: Guardian): DropdownMenuItem[][] {
  return [
    [
      { label: 'Edit', icon: 'i-lucide-pencil', onSelect: async () => afterChange(await guardianDialog.open({ guardian }), 'Guardian saved') },
      { label: 'Reset password', icon: 'i-lucide-key-round', onSelect: () => resetPassword(guardian) },
    ],
    [{ label: 'Remove as guardian', icon: 'i-lucide-user-minus', color: 'error', onSelect: () => unlink(s, guardian) }],
  ]
}
</script>

<template>
  <div class="mx-auto w-full max-w-3xl space-y-6">
    <UButton
      to="/students"
      label="All students"
      icon="i-lucide-arrow-left"
      color="neutral"
      variant="ghost"
      class="-ms-2.5"
    />

    <template v-if="student">
      <div class="flex flex-wrap items-center gap-4">
        <UAvatar
          :src="student.photoUrl ?? undefined"
          :alt="fullName"
          size="3xl"
        />
        <div class="min-w-0 flex-1">
          <h1
            data-testid="student-name"
            class="text-2xl font-semibold"
          >
            {{ fullName }}
          </h1>
          <p class="text-muted">
            <span data-testid="student-admission-number">{{ student.admissionNumber }}</span>
            <template v-if="student.enrolment">
              · <span data-testid="student-class-label">{{ student.enrolment.label }}</span> ({{ student.enrolment.sessionName }})
            </template>
            <template v-else>
              · Not in a class this session
            </template>
          </p>
        </div>
        <UButton
          v-if="seesFees"
          :to="`/students/${student.id}/fees`"
          data-testid="student-fees-link"
          label="Fees"
          icon="i-lucide-wallet"
          color="neutral"
          variant="outline"
        />
        <UDropdownMenu
          v-if="isAdmin"
          :items="studentActions"
          :content="{ align: 'end' }"
        >
          <UButton
            data-testid="student-actions"
            label="Actions"
            trailing-icon="i-lucide-chevron-down"
            color="neutral"
            variant="outline"
          />
        </UDropdownMenu>
      </div>

      <UCard>
        <template #header>
          <h2 class="font-semibold">
            Details
          </h2>
        </template>
        <dl class="grid gap-3 sm:grid-cols-2">
          <div
            v-for="[label, value] in details"
            :key="label"
          >
            <dt class="text-sm text-muted">
              {{ label }}
            </dt>
            <dd class="break-words">
              {{ value }}
            </dd>
          </div>
        </dl>
      </UCard>

      <StudentsAttendanceCard
        v-if="user?.role !== 'bursar'"
        :student-id="student.id"
      />

      <UCard>
        <template #header>
          <h2 class="font-semibold">
            Guardians
          </h2>
        </template>
        <ul class="divide-y divide-default">
          <li
            v-for="guardian in student.guardians"
            :key="guardian.id"
            data-testid="student-guardian"
            class="flex items-start gap-3 py-3 first:pt-0 last:pb-0"
          >
            <div class="min-w-0 flex-1 space-y-0.5">
              <p class="font-medium">
                {{ guardian.name }}
                <span class="font-normal text-muted">· {{ RELATIONSHIP_LABELS[guardian.relationship] }}</span>
              </p>
              <ULink
                v-if="guardian.phone"
                :href="`tel:${guardian.phone}`"
                class="flex items-center gap-1 text-sm"
              >
                <UIcon name="i-lucide-phone" />{{ guardian.phone }}
              </ULink>
              <p
                v-if="guardian.email"
                class="break-all text-sm text-muted"
              >
                {{ guardian.email }}
              </p>
            </div>
            <UDropdownMenu
              v-if="isAdmin"
              :items="guardianActions(student, guardian)"
              :content="{ align: 'end' }"
            >
              <UButton
                icon="i-lucide-ellipsis-vertical"
                :aria-label="`Actions for ${guardian.name}`"
                color="neutral"
                variant="ghost"
              />
            </UDropdownMenu>
          </li>
        </ul>
      </UCard>
    </template>
  </div>
</template>
