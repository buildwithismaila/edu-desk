<script setup lang="ts">
import { SECTION_LABELS } from '#shared/constants/academics'

// Staff dashboard numbers for the current term; the bursar gets students and fees only.
const { data: stats } = await useFetch('/api/dashboard')

const sectionName = (section: keyof typeof SECTION_LABELS) => SECTION_LABELS[section].replace(/ \(.*\)$/, '')
</script>

<template>
  <section
    data-testid="dashboard-stats"
    class="space-y-3"
  >
    <p
      v-if="stats && !stats.term"
      data-testid="dashboard-no-term"
      class="text-sm text-muted"
    >
      Set the current term in Calendar to see this term's numbers.
    </p>
    <template v-else-if="stats?.term">
      <h2 class="text-lg font-semibold">
        {{ stats.term.label }}
      </h2>
      <div class="grid gap-3 sm:grid-cols-2">
        <UCard
          v-if="stats.students"
          data-testid="stats-students"
        >
          <p class="text-sm text-muted">
            Students
          </p>
          <p
            data-testid="stats-students-total"
            class="text-3xl font-semibold tabular-nums"
          >
            {{ stats.students.total }}
          </p>
          <p class="text-sm text-muted">
            {{ stats.students.female }} girls · {{ stats.students.male }} boys
          </p>
          <ul class="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-sm">
            <li
              v-for="s in stats.students.bySection"
              :key="s.section"
            >
              {{ sectionName(s.section) }} <strong class="tabular-nums">{{ s.count }}</strong>
            </li>
          </ul>
        </UCard>

        <UCard
          v-if="stats.attendance"
          data-testid="stats-attendance"
        >
          <p class="text-sm text-muted">
            Attendance today
          </p>
          <p
            data-testid="stats-attendance-rate"
            class="text-3xl font-semibold tabular-nums"
          >
            {{ stats.attendance.rate === null ? '—' : `${stats.attendance.rate}%` }}
          </p>
          <p class="text-sm text-muted">
            {{ stats.attendance.taken }} of {{ stats.attendance.total }} classes taken · {{ stats.attendance.absent }} absent
          </p>
          <p
            v-if="stats.attendance.notTaken.length"
            data-testid="stats-attendance-missing"
            class="mt-2 text-sm"
          >
            Not taken:
            <span
              v-for="arm in stats.attendance.notTaken"
              :key="arm.id"
              class="after:content-[',_'] last:after:content-none"
            >
              <ULink
                :to="`/attendance?arm=${arm.id}`"
                class="text-primary"
              >{{ arm.label }}</ULink>
            </span>
          </p>
        </UCard>

        <UCard
          v-if="stats.fees"
          data-testid="stats-fees"
        >
          <p class="text-sm text-muted">
            Fees this term
          </p>
          <p
            data-testid="stats-fees-collected"
            class="text-3xl font-semibold tabular-nums"
          >
            {{ formatNaira(stats.fees.collectedKobo) }}
          </p>
          <p class="text-sm text-muted">
            of {{ formatNaira(stats.fees.expectedKobo) }} expected{{ stats.fees.percentCollected === null ? '' : ` (${stats.fees.percentCollected}%)` }}
          </p>
          <UProgress
            v-if="stats.fees.percentCollected !== null"
            :model-value="stats.fees.percentCollected"
            class="mt-2"
          />
          <dl class="mt-2 grid grid-cols-2 gap-2 text-sm">
            <div>
              <dt class="text-muted">
                Outstanding
              </dt>
              <dd class="tabular-nums">
                {{ formatNaira(stats.fees.outstandingKobo) }}
              </dd>
            </div>
            <div>
              <dt class="text-muted">
                Today
              </dt>
              <dd
                data-testid="stats-fees-today"
                class="tabular-nums"
              >
                {{ formatNaira(stats.fees.todayKobo) }}
              </dd>
            </div>
          </dl>
          <div class="mt-2 flex flex-wrap gap-x-4 text-sm">
            <ULink
              to="/fees/collections"
              class="text-primary"
            >
              Collections
            </ULink>
            <ULink
              to="/fees/debtors"
              data-testid="stats-fees-debtors"
              class="text-primary"
            >
              {{ stats.fees.debtors }} {{ stats.fees.debtors === 1 ? 'debtor' : 'debtors' }}
            </ULink>
          </div>
        </UCard>

        <UCard
          v-if="stats.results"
          data-testid="stats-results"
        >
          <p class="text-sm text-muted">
            Results this term
          </p>
          <p
            data-testid="stats-results-sheets"
            class="text-3xl font-semibold tabular-nums"
          >
            {{ stats.results.sheets.complete }} / {{ stats.results.sheets.total }}
          </p>
          <p class="text-sm text-muted">
            score sheets complete
          </p>
          <p
            data-testid="stats-results-arms"
            class="mt-2 text-sm"
          >
            {{ stats.results.arms.draft }} draft · {{ stats.results.arms.submitted }} submitted · {{ stats.results.arms.published }} published
          </p>
          <div class="mt-2 flex flex-wrap gap-x-4 text-sm">
            <ULink
              to="/scores"
              class="text-primary"
            >
              Scores
            </ULink>
            <ULink
              to="/results"
              class="text-primary"
            >
              Results
            </ULink>
          </div>
        </UCard>
      </div>
    </template>
  </section>
</template>
