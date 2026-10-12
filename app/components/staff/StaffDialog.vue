<script setup lang="ts">
import { ROLE_LABELS, type Role, STAFF_ROLES, type StaffRole } from '#shared/constants/roles'
import { createStaffSchema, updateStaffSchema } from '#shared/schemas/staff'

type Staff = { id: string, name: string, email: string, phone: string | null, role: Role }

// Add (no `staff`) or edit a staff member. Emits close with the API result, or false when cancelled.
const props = defineProps<{
  staff?: Staff
  /** Editing your own account: the role can't be changed */
  isSelf?: boolean
}>()

const emit = defineEmits<{ close: [result: false | { staff: Staff, temporaryPassword?: string }] }>()

const schema = props.staff ? updateStaffSchema : createStaffSchema
const form = useTemplateRef('form')
const state = reactive({
  name: props.staff?.name ?? '',
  email: props.staff?.email ?? '',
  phone: props.staff?.phone ?? '',
  // Staff are never parents, so the role is always a staff role
  role: (props.staff?.role ?? 'teacher') as StaffRole,
})
const roleItems = STAFF_ROLES.map(role => ({ label: ROLE_LABELS[role], value: role }))
const error = ref<string>()
const saving = ref(false)

async function onSubmit() {
  saving.value = true
  error.value = undefined
  try {
    if (props.staff) {
      const staff = await $fetch<Staff>(`/api/staff/${props.staff.id}`, { method: 'PATCH', body: updateStaffSchema.parse(state) })
      emit('close', { staff })
    }
    else {
      emit('close', await $fetch<{ staff: Staff, temporaryPassword: string }>('/api/staff', { method: 'POST', body: createStaffSchema.parse(state) }))
    }
  }
  catch (e) {
    const errors = apiFormErrors(e)
    if (errors.length) form.value?.setErrors(errors)
    else error.value = apiErrorMessage(e)
  }
  finally {
    saving.value = false
  }
}
</script>

<template>
  <UModal
    :title="staff ? `Edit ${staff.name}` : 'Add staff'"
    @update:open="(open) => !open && emit('close', false)"
  >
    <template #body>
      <UForm
        id="staff-form"
        ref="form"
        method="post"
        :schema="schema"
        :state="state"
        class="space-y-3"
        @submit="onSubmit"
      >
        <UFormField
          label="Full name"
          name="name"
          required
        >
          <UInput
            v-model="state.name"
            data-testid="staff-name"
            autofocus
            class="w-full"
          />
        </UFormField>
        <UFormField
          label="Email"
          name="email"
          required
          help="Used to log in"
        >
          <UInput
            v-model="state.email"
            data-testid="staff-email"
            type="email"
            class="w-full"
          />
        </UFormField>
        <UFormField
          label="Phone"
          name="phone"
        >
          <UInput
            v-model="state.phone"
            type="tel"
            placeholder="0803 123 4567"
            class="w-full"
          />
        </UFormField>
        <UFormField
          label="Role"
          name="role"
          :help="isSelf ? 'You can\'t change your own role' : undefined"
        >
          <USelect
            v-model="state.role"
            data-testid="staff-role"
            :items="roleItems"
            :disabled="isSelf"
            class="w-full"
          />
        </UFormField>
        <UAlert
          v-if="error"
          color="error"
          variant="subtle"
          :title="error"
        />
      </UForm>
    </template>
    <template #footer>
      <div class="flex w-full justify-end gap-2">
        <UButton
          label="Cancel"
          color="neutral"
          variant="ghost"
          @click="emit('close', false)"
        />
        <UButton
          data-testid="staff-save"
          type="submit"
          form="staff-form"
          :label="staff ? 'Save' : 'Add staff'"
          :loading="saving"
        />
      </div>
    </template>
  </UModal>
</template>
