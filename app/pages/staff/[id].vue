<script setup lang="ts">
import { ROLE_LABELS } from '#shared/constants/roles'

definePageMeta({ roles: ['admin', 'principal'] })

const route = useRoute()
const { data: member } = await useFetch(() => `/api/staff/${route.params.id}`)
useHead({ title: () => member.value?.name ?? 'Staff' })
</script>

<template>
  <div class="mx-auto w-full max-w-3xl space-y-6">
    <UButton
      to="/staff"
      label="All staff"
      icon="i-lucide-arrow-left"
      color="neutral"
      variant="ghost"
      class="-ms-2.5"
    />

    <template v-if="member">
      <div class="flex flex-wrap items-center gap-2">
        <h1
          data-testid="staff-detail-name"
          class="text-2xl font-semibold"
        >
          {{ member.name }}
        </h1>
        <UBadge
          :color="member.isActive ? 'success' : 'neutral'"
          variant="subtle"
          :label="member.isActive ? 'Active' : 'Inactive'"
        />
      </div>

      <UCard>
        <dl class="grid gap-3 sm:grid-cols-2">
          <div>
            <dt class="text-sm text-muted">
              Role
            </dt>
            <dd>{{ ROLE_LABELS[member.role] }}</dd>
          </div>
          <div>
            <dt class="text-sm text-muted">
              Email
            </dt>
            <dd class="break-all">
              {{ member.email }}
            </dd>
          </div>
          <div>
            <dt class="text-sm text-muted">
              Phone
            </dt>
            <dd>{{ member.phone ?? '—' }}</dd>
          </div>
          <div>
            <dt class="text-sm text-muted">
              Last login
            </dt>
            <dd>{{ formatDateTime(member.lastLoginAt) || 'Never' }}</dd>
          </div>
        </dl>
      </UCard>

      <UCard>
        <template #header>
          <div class="flex items-center justify-between gap-2">
            <h2 class="font-semibold">
              Classes {{ member.session ? `· ${member.session.name}` : '' }}
            </h2>
            <UButton
              to="/assignments"
              label="Manage assignments"
              color="neutral"
              variant="outline"
              size="sm"
            />
          </div>
        </template>
        <p
          v-if="!member.session"
          class="text-sm text-muted"
        >
          No current session.
        </p>
        <div
          v-else
          class="space-y-4"
        >
          <div>
            <h3 class="text-sm font-medium text-muted">
              Class teacher of
            </h3>
            <p
              v-if="!member.classTeacherOf.length"
              class="text-sm"
            >
              None
            </p>
            <div class="mt-1 flex flex-wrap gap-1">
              <UBadge
                v-for="arm in member.classTeacherOf"
                :key="arm.classArmId"
                :label="arm.label"
                variant="subtle"
              />
            </div>
          </div>
          <div>
            <h3 class="text-sm font-medium text-muted">
              Teaches
            </h3>
            <p
              v-if="!member.subjects.length"
              class="text-sm"
            >
              None
            </p>
            <ul class="mt-1 space-y-1 text-sm">
              <li
                v-for="s in member.subjects"
                :key="`${s.subjectId}-${s.classArmId}`"
              >
                {{ s.name }} — {{ s.label }}
              </li>
            </ul>
          </div>
        </div>
      </UCard>
    </template>
  </div>
</template>
