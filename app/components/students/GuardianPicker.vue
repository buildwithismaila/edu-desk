<script setup lang="ts">
import { MAX_GUARDIANS, newGuardianSchema, RELATIONSHIPS } from '#shared/schemas/students'

type Relationship = typeof RELATIONSHIPS[number]
/** An existing guardian (by id) or a new one; both match `studentGuardianSchema` once parsed. */
export type GuardianEntry
  = | { guardianId: string, name: string, phone: string | null, relationship: Relationship }
    | { name: string, phone: string, email: string, relationship: Relationship }

const props = withDefaults(defineProps<{ max?: number }>(), { max: MAX_GUARDIANS })
const guardians = defineModel<GuardianEntry[]>({ required: true })

const relationshipItems = RELATIONSHIPS.map(r => ({ label: r[0]!.toUpperCase() + r.slice(1), value: r }))
const mode = ref<'search' | 'new'>('search')
const modeItems = [
  { label: 'Search existing', value: 'search', icon: 'i-lucide-search' },
  { label: 'New guardian', value: 'new', icon: 'i-lucide-user-plus' },
] as const
const canAdd = computed(() => guardians.value.length < props.max)

function add(entry: GuardianEntry) {
  guardians.value = [...guardians.value, entry]
}
function remove(index: number) {
  guardians.value = guardians.value.filter((_, i) => i !== index)
}
function setRelationship(index: number, relationship: Relationship) {
  guardians.value = guardians.value.map((g, i) => i === index ? { ...g, relationship } : g)
}

// Search existing guardians (e.g. a sibling's parent) by name or phone
const search = ref('')
type SearchResult = { id: string, name: string, phone: string | null, children: string[] }
const results = ref<SearchResult[]>([])
const searching = ref(false)
watchDebounced(search, async (value) => {
  if (value.trim().length < 2) {
    results.value = []
    return
  }
  searching.value = true
  try {
    // Explicit type: the route-inferred one overflows TS here (TS2321, see PROGRESS.md)
    results.value = await $fetch<SearchResult[]>('/api/guardians', { query: { search: value.trim() } })
  }
  finally {
    searching.value = false
  }
}, { debounce: 300 })
const isAdded = (id: string) => guardians.value.some(g => 'guardianId' in g && g.guardianId === id)

// A new guardian: checked here, created with the student
const draft = reactive({ name: '', phone: '', email: '', relationship: 'guardian' as Relationship })
const draftErrors = ref<Record<string, string | undefined>>({})
function addNew() {
  const result = newGuardianSchema.safeParse(draft)
  if (!result.success) {
    draftErrors.value = Object.fromEntries(result.error.issues.map(issue => [String(issue.path[0]), issue.message]))
    return
  }
  if (guardians.value.some(g => g.phone === result.data.phone)) {
    draftErrors.value = { phone: 'This guardian is already added' }
    return
  }
  draftErrors.value = {}
  add({ ...result.data, email: result.data.email ?? '' })
  Object.assign(draft, { name: '', phone: '', email: '', relationship: 'guardian' })
}
</script>

<template>
  <div class="space-y-4">
    <ul
      v-if="guardians.length"
      class="divide-y divide-default rounded-md border border-default"
    >
      <li
        v-for="(guardian, index) in guardians"
        :key="'guardianId' in guardian ? guardian.guardianId : guardian.phone"
        data-testid="picked-guardian"
        class="flex flex-wrap items-center gap-2 p-3"
      >
        <div class="min-w-0 flex-1">
          <p class="font-medium">
            {{ guardian.name }}
            <UBadge
              :label="'guardianId' in guardian ? 'Existing' : 'New'"
              :color="'guardianId' in guardian ? 'neutral' : 'primary'"
              variant="subtle"
              size="sm"
              class="ms-1"
            />
          </p>
          <p class="text-sm text-muted">
            {{ guardian.phone }}
          </p>
        </div>
        <USelect
          :model-value="guardian.relationship"
          :items="relationshipItems"
          :aria-label="`Relationship of ${guardian.name}`"
          class="w-32"
          @update:model-value="value => setRelationship(index, value as Relationship)"
        />
        <UButton
          icon="i-lucide-x"
          color="neutral"
          variant="ghost"
          :aria-label="`Remove ${guardian.name}`"
          @click="remove(index)"
        />
      </li>
    </ul>

    <div
      v-if="canAdd"
      class="space-y-3 rounded-md border border-dashed border-default p-3"
    >
      <UFieldGroup size="sm">
        <UButton
          v-for="item in modeItems"
          :key="item.value"
          :data-testid="`guardian-mode-${item.value}`"
          :label="item.label"
          :icon="item.icon"
          color="neutral"
          :variant="mode === item.value ? 'solid' : 'outline'"
          :aria-pressed="mode === item.value"
          @click="mode = item.value"
        />
      </UFieldGroup>

      <div
        v-if="mode === 'search'"
        class="space-y-2"
      >
        <UInput
          v-model="search"
          data-testid="guardian-search"
          icon="i-lucide-search"
          placeholder="Name or phone number"
          :loading="searching"
          class="w-full"
        />
        <p
          v-if="search.trim().length >= 2 && !searching && !results.length"
          class="text-sm text-muted"
        >
          No guardian found. Add them as a new guardian.
        </p>
        <ul class="space-y-1">
          <li
            v-for="result in results"
            :key="result.id"
            data-testid="guardian-result"
            class="flex items-center gap-2"
          >
            <div class="min-w-0 flex-1 text-sm">
              <p class="font-medium">
                {{ result.name }} <span class="text-muted">· {{ result.phone }}</span>
              </p>
              <p
                v-if="result.children.length"
                class="truncate text-muted"
              >
                Parent of {{ result.children.join(', ') }}
              </p>
            </div>
            <UButton
              :label="isAdded(result.id) ? 'Added' : 'Add'"
              :disabled="isAdded(result.id)"
              size="sm"
              color="neutral"
              variant="outline"
              @click="add({ guardianId: result.id, name: result.name, phone: result.phone, relationship: 'guardian' })"
            />
          </li>
        </ul>
      </div>

      <div
        v-else
        class="grid gap-3 sm:grid-cols-2"
      >
        <UFormField
          label="Full name"
          :error="draftErrors.name"
          required
        >
          <UInput
            v-model="draft.name"
            data-testid="new-guardian-name"
            class="w-full"
          />
        </UFormField>
        <UFormField
          label="Phone"
          :error="draftErrors.phone"
          help="Used to log in"
          required
        >
          <UInput
            v-model="draft.phone"
            data-testid="new-guardian-phone"
            type="tel"
            placeholder="0803 123 4567"
            class="w-full"
          />
        </UFormField>
        <UFormField
          label="Email"
          :error="draftErrors.email"
        >
          <UInput
            v-model="draft.email"
            type="email"
            class="w-full"
          />
        </UFormField>
        <UFormField label="Relationship">
          <USelect
            v-model="draft.relationship"
            :items="relationshipItems"
            class="w-full"
          />
        </UFormField>
        <div class="sm:col-span-2">
          <UButton
            data-testid="new-guardian-add"
            label="Add guardian"
            icon="i-lucide-plus"
            color="neutral"
            variant="outline"
            @click="addNew"
          />
        </div>
      </div>
    </div>
  </div>
</template>
