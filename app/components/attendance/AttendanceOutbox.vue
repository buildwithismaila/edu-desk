<script setup lang="ts">
import type { OutboxEntry } from '~/utils/offline/attendance'

// Registers saved on this phone (docs/features/10c-offline-attendance.md): waiting, sent, or needing the teacher
defineProps<{ entries: OutboxEntry[], online: boolean, sending?: boolean }>()
const emit = defineEmits<{ sendNow: [], discard: [entry: OutboxEntry], sendMine: [entry: OutboxEntry], open: [entry: OutboxEntry] }>()

const STATES = {
  waiting: { label: 'Waiting to send', color: 'warning' },
  sent: { label: 'Sent', color: 'success' },
  conflict: { label: 'Changed at school', color: 'error' },
  rejected: { label: 'Not accepted', color: 'error' },
} as const

type Marked = { status: string | null }
function counts(marks: Marked[]) {
  const n = (status: string) => marks.filter(m => m.status === status).length
  return `Present ${n('present')} · Absent ${n('absent')} · Late ${n('late')}`
}
const schoolStudents = (entry: OutboxEntry) => (entry.school as { students?: Marked[] } | undefined)?.students ?? []
</script>

<template>
  <div
    data-testid="outbox"
    class="space-y-2 rounded-md border border-default p-3"
  >
    <div class="flex flex-wrap items-center justify-between gap-2">
      <p class="flex items-center gap-1.5 text-sm font-medium">
        <UIcon
          name="i-lucide-smartphone"
          class="size-4"
        />
        Saved on this phone
      </p>
      <UButton
        v-if="entries.some(e => e.state === 'waiting')"
        data-testid="outbox-send"
        label="Send now"
        icon="i-lucide-send"
        size="xs"
        :disabled="!online"
        :loading="sending"
        @click="emit('sendNow')"
      />
    </div>

    <ul class="divide-y divide-default">
      <li
        v-for="entry in entries"
        :key="`${entry.classArmId}|${entry.date}`"
        :data-testid="`outbox-${entry.state}`"
        class="space-y-2 py-2"
      >
        <div class="flex flex-wrap items-center justify-between gap-2">
          <p class="text-sm">
            {{ entry.armLabel }} · {{ formatDate(entry.date) }}
          </p>
          <UBadge
            :label="STATES[entry.state].label"
            :color="STATES[entry.state].color"
            variant="subtle"
          />
        </div>
        <p
          v-if="entry.message && entry.state !== 'sent'"
          class="text-sm text-muted"
        >
          {{ entry.message }}
        </p>

        <template v-if="entry.state === 'conflict'">
          <dl class="grid gap-1 text-sm sm:grid-cols-2">
            <div>
              <dt class="font-medium">
                Yours
              </dt>
              <dd class="text-muted">
                {{ counts(entry.marks) }}
              </dd>
            </div>
            <div>
              <dt class="font-medium">
                School's
              </dt>
              <dd class="text-muted">
                {{ counts(schoolStudents(entry)) }}
              </dd>
            </div>
          </dl>
          <div class="flex flex-wrap gap-2">
            <UButton
              data-testid="outbox-keep-school"
              label="Keep school's"
              color="neutral"
              variant="outline"
              size="xs"
              @click="emit('discard', entry)"
            />
            <UButton
              data-testid="outbox-send-mine"
              label="Send mine instead"
              size="xs"
              :disabled="!online"
              @click="emit('sendMine', entry)"
            />
          </div>
        </template>

        <div
          v-else-if="entry.state === 'rejected'"
          class="flex flex-wrap gap-2"
        >
          <UButton
            data-testid="outbox-open"
            label="Open and fix"
            size="xs"
            @click="emit('open', entry)"
          />
          <UButton
            data-testid="outbox-discard"
            label="Discard"
            color="neutral"
            variant="outline"
            size="xs"
            @click="emit('discard', entry)"
          />
        </div>
      </li>
    </ul>
  </div>
</template>
