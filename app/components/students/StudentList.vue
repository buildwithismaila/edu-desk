<script setup lang="ts">
import type { TableColumn } from '@nuxt/ui'

// Search, filters and page live in the URL query, so a reload or a shared link shows the same list.
const route = useRoute()
const router = useRouter()
const { user } = useUserSession()

const text = (value: unknown) => typeof value === 'string' && value ? value : undefined
const query = computed(() => ({
  page: Math.max(1, Number(route.query.page) || 1),
  search: text(route.query.search),
  classLevelId: text(route.query.classLevelId),
  classArmId: text(route.query.classArmId),
  gender: text(route.query.gender) as 'male' | 'female' | undefined,
}))
type Query = typeof query.value

/** Changing a filter goes back to page 1 unless a page is given. */
function setQuery(changes: Partial<Query>) {
  const next: Record<string, unknown> = { ...query.value, page: undefined, ...changes }
  router.replace({ query: Object.fromEntries(Object.entries(next).filter(([key, value]) => value && !(key === 'page' && value === 1))) as Record<string, string> })
}

const { data, status } = await useFetch('/api/students', { query })
const { levels } = useClassArms()

const ALL = 'all'
const levelItems = computed(() => [{ label: 'All classes', value: ALL }, ...levels.value.map(l => ({ label: l.name, value: l.id }))])
const armItems = computed(() => [
  { label: 'All arms', value: ALL },
  ...(levels.value.find(l => l.id === query.value.classLevelId)?.arms ?? []).map(a => ({ label: a.label, value: a.id })),
])
const genderItems = [{ label: 'Boys and girls', value: ALL }, { label: 'Boys', value: 'male' }, { label: 'Girls', value: 'female' }]

const level = computed({
  get: () => query.value.classLevelId ?? ALL,
  set: value => setQuery({ classLevelId: value === ALL ? undefined : value, classArmId: undefined }),
})
const arm = computed({
  get: () => query.value.classArmId ?? ALL,
  set: value => setQuery({ classArmId: value === ALL ? undefined : value }),
})
const gender = computed({
  get: () => query.value.gender ?? ALL,
  set: value => setQuery({ gender: value === ALL ? undefined : value as Query['gender'] }),
})

const search = ref(query.value.search ?? '')
watchDebounced(search, value => setQuery({ search: value.trim() || undefined }), { debounce: 300 })

type Student = NonNullable<typeof data.value>['items'][number]
const columns: TableColumn<Student>[] = [
  { accessorKey: 'lastName', header: 'Name' },
  { accessorKey: 'admissionNumber', header: 'Admission no.' },
  { accessorKey: 'classLabel', header: 'Class' },
  { accessorKey: 'gender', header: 'Gender' },
]
const fullName = (s: Student) => [s.firstName, s.middleName, s.lastName].filter(Boolean).join(' ')
</script>

<template>
  <div class="space-y-4">
    <div class="grid gap-2 sm:flex sm:flex-wrap">
      <UInput
        v-model="search"
        data-testid="student-search"
        icon="i-lucide-search"
        placeholder="Search by name or admission no."
        class="w-full sm:w-72"
      />
      <USelect
        v-model="level"
        data-testid="student-level"
        :items="levelItems"
        class="w-full sm:w-40"
      />
      <USelect
        v-model="arm"
        data-testid="student-arm"
        :items="armItems"
        :disabled="!query.classLevelId"
        class="w-full sm:w-40"
      />
      <USelect
        v-model="gender"
        data-testid="student-gender"
        :items="genderItems"
        class="w-full sm:w-40"
      />
    </div>

    <p
      v-if="data"
      data-testid="student-total"
      class="text-sm text-muted"
    >
      {{ data.total }} {{ data.total === 1 ? 'student' : 'students' }}
    </p>

    <UTable
      :data="data?.items ?? []"
      :columns="columns"
      :loading="status === 'pending'"
      data-testid="student-table"
      :empty="user?.role === 'teacher' ? 'No students match. You see the students in the classes you teach.' : 'No students match.'"
    >
      <template #lastName-cell="{ row }">
        <ULink
          :to="`/students/${row.original.id}`"
          class="flex items-center gap-2 font-medium text-highlighted"
        >
          <UAvatar
            :src="row.original.photoUrl ?? undefined"
            :alt="fullName(row.original)"
            size="sm"
          />
          {{ fullName(row.original) }}
        </ULink>
      </template>
      <template #classLabel-cell="{ row }">
        {{ row.original.classLabel ?? '—' }}
      </template>
      <template #gender-cell="{ row }">
        {{ row.original.gender === 'male' ? 'Male' : 'Female' }}
      </template>
    </UTable>

    <div
      v-if="data && data.total > data.pageSize"
      class="flex justify-center"
    >
      <UPagination
        data-testid="student-pages"
        :page="query.page"
        :total="data.total"
        :items-per-page="data.pageSize"
        @update:page="page => setQuery({ ...query, page })"
      />
    </div>
  </div>
</template>
