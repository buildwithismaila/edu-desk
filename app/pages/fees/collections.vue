<script setup lang="ts">
import type { InternalApi } from 'nitropack/types'
import { PAYMENT_METHOD_LABELS } from '#shared/schemas/fees'

definePageMeta({ roles: ['admin', 'bursar', 'principal'] })
useHead({ title: 'Collections' })

type Collections = InternalApi['/api/fees/collections']['get']

const route = useRoute()
const router = useRouter()
const termId = computed({
  get: () => typeof route.query.term === 'string' ? route.query.term : undefined,
  set: value => router.replace({ query: { ...route.query, term: value } }),
})
const requestFetch = useRequestFetch()
const { data } = await useAsyncData('collections', () => requestFetch<Collections>('/api/fees/collections', { query: termId.value ? { termId: termId.value } : {} }), { watch: [termId] })

const rate = computed(() => data.value && data.value.expectedKobo > 0 ? Math.round((data.value.collectedKobo / data.value.expectedKobo) * 100) : null)
</script>

<template>
  <div class="mx-auto w-full max-w-4xl space-y-4">
    <div class="flex flex-wrap items-center justify-between gap-2">
      <h1 class="text-2xl font-semibold">
        Collections{{ data ? ` · ${data.term.label}` : '' }}
      </h1>
      <FeesTermSelect v-model="termId" />
    </div>

    <template v-if="data">
      <div class="grid gap-3 sm:grid-cols-4">
        <UCard
          v-for="tile in [
            { key: 'expected', label: 'Expected', value: data.expectedKobo },
            { key: 'collected', label: `Collected${rate !== null ? ` (${rate}%)` : ''}`, value: data.collectedKobo },
            { key: 'outstanding', label: 'Outstanding', value: data.outstandingKobo },
            { key: 'credit', label: 'Credit held', value: data.creditKobo },
          ]"
          :key="tile.key"
          :data-testid="`collections-${tile.key}`"
        >
          <p class="text-sm text-muted">
            {{ tile.label }}
          </p>
          <p class="text-xl font-semibold tabular-nums">
            {{ formatNaira(tile.value) }}
          </p>
        </UCard>
      </div>

      <div class="grid gap-4 md:grid-cols-2">
        <UCard>
          <template #header>
            <h2 class="font-semibold">
              By class level
            </h2>
          </template>
          <table class="w-full text-sm">
            <thead>
              <tr class="text-left text-muted">
                <th class="py-1">
                  Level
                </th>
                <th class="py-1 text-right">
                  Expected
                </th>
                <th class="py-1 text-right">
                  Collected
                </th>
              </tr>
            </thead>
            <tbody>
              <tr
                v-for="level in data.byLevel"
                :key="level.level"
                class="border-t border-default"
              >
                <td class="py-1.5">
                  {{ level.level }} <span class="text-muted">({{ level.bills }})</span>
                </td>
                <td class="py-1.5 text-right tabular-nums">
                  {{ formatNaira(level.expectedKobo) }}
                </td>
                <td class="py-1.5 text-right tabular-nums">
                  {{ formatNaira(level.collectedKobo) }}
                </td>
              </tr>
            </tbody>
          </table>
        </UCard>

        <UCard>
          <template #header>
            <h2 class="font-semibold">
              By payment method
            </h2>
          </template>
          <table class="w-full text-sm">
            <tbody>
              <tr
                v-for="m in data.byMethod"
                :key="m.method"
                class="border-t border-default first:border-t-0"
              >
                <td class="py-1.5">
                  {{ PAYMENT_METHOD_LABELS[m.method] }} <span class="text-muted">({{ m.count }})</span>
                </td>
                <td class="py-1.5 text-right tabular-nums">
                  {{ formatNaira(m.amountKobo) }}
                </td>
              </tr>
            </tbody>
          </table>
        </UCard>
      </div>

      <UCard>
        <template #header>
          <h2 class="font-semibold">
            By day
          </h2>
        </template>
        <p
          v-if="!data.byDay.length"
          class="text-sm text-muted"
        >
          No payments yet this term.
        </p>
        <table
          v-else
          class="w-full text-sm"
        >
          <tbody>
            <tr
              v-for="d in data.byDay"
              :key="d.date"
              class="border-t border-default first:border-t-0"
            >
              <td class="py-1.5">
                {{ formatDate(d.date) }}
              </td>
              <td class="py-1.5 text-right tabular-nums">
                {{ formatNaira(d.amountKobo) }}
              </td>
            </tr>
          </tbody>
        </table>
      </UCard>
    </template>
  </div>
</template>
