<script setup lang="ts">
import { NIGERIAN_STATES } from '#shared/constants/states'

// Student bio fields, shared by the admission form and the edit dialog (inside their UForm).
export interface BioState {
  firstName: string
  middleName: string
  lastName: string
  gender: 'male' | 'female' | undefined
  dateOfBirth: string
  stateOfOrigin: string | undefined
  lga: string
  address: string
}

const state = defineModel<BioState>({ required: true })
const genderItems = [{ label: 'Male', value: 'male' }, { label: 'Female', value: 'female' }]
const stateItems: string[] = [...NIGERIAN_STATES]
const today = new Date().toISOString().slice(0, 10)
</script>

<template>
  <div class="grid gap-4 sm:grid-cols-3">
    <UFormField
      label="First name"
      name="firstName"
      required
    >
      <UInput
        v-model="state.firstName"
        data-testid="student-first-name"
        class="w-full"
      />
    </UFormField>
    <UFormField
      label="Middle name"
      name="middleName"
    >
      <UInput
        v-model="state.middleName"
        class="w-full"
      />
    </UFormField>
    <UFormField
      label="Last name"
      name="lastName"
      required
    >
      <UInput
        v-model="state.lastName"
        data-testid="student-last-name"
        class="w-full"
      />
    </UFormField>
    <UFormField
      label="Gender"
      name="gender"
      required
    >
      <USelect
        v-model="state.gender"
        data-testid="student-gender-select"
        :items="genderItems"
        placeholder="Choose"
        class="w-full"
      />
    </UFormField>
    <UFormField
      label="Date of birth"
      name="dateOfBirth"
    >
      <UInput
        v-model="state.dateOfBirth"
        type="date"
        :max="today"
        class="w-full"
      />
    </UFormField>
    <UFormField
      label="State of origin"
      name="stateOfOrigin"
    >
      <USelectMenu
        v-model="state.stateOfOrigin"
        :items="stateItems"
        placeholder="Choose"
        class="w-full"
      />
    </UFormField>
    <UFormField
      label="LGA"
      name="lga"
    >
      <UInput
        v-model="state.lga"
        class="w-full"
      />
    </UFormField>
    <UFormField
      label="Address"
      name="address"
      class="sm:col-span-2"
    >
      <UInput
        v-model="state.address"
        class="w-full"
      />
    </UFormField>
  </div>
</template>
