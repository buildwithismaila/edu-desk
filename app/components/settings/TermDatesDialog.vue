<script setup lang="ts">
import { TERM_LABELS, type TermNumber } from '#shared/constants/academics'
import { termDatesSchema } from '#shared/schemas/academics'

const props = defineProps<{
  sessionName: string
  term: { id: string, number: TermNumber, startsOn: string | null, endsOn: string | null, nextTermBeginsOn: string | null }
}>()

const emit = defineEmits<{ close: [saved: boolean] }>()

const form = useTemplateRef('form')
const state = reactive({
  startsOn: props.term.startsOn ?? '',
  endsOn: props.term.endsOn ?? '',
  nextTermBeginsOn: props.term.nextTermBeginsOn ?? '',
})
const error = ref<string>()
const saving = ref(false)

async function onSubmit() {
  saving.value = true
  error.value = undefined
  try {
    await $fetch(`/api/terms/${props.term.id}`, { method: 'PATCH', body: termDatesSchema.parse(state) })
    emit('close', true)
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
    :title="`${sessionName} · ${TERM_LABELS[term.number]}`"
    description="Leave a date empty if it isn't fixed yet."
    @update:open="(open) => !open && emit('close', false)"
  >
    <template #body>
      <UForm
        id="term-dates-form"
        ref="form"
        method="post"
        :schema="termDatesSchema"
        :state="state"
        class="space-y-3"
        @submit="onSubmit"
      >
        <UFormField
          label="Term starts"
          name="startsOn"
        >
          <UInput
            v-model="state.startsOn"
            data-testid="term-starts-on"
            type="date"
            class="w-full"
          />
        </UFormField>
        <UFormField
          label="Term ends"
          name="endsOn"
        >
          <UInput
            v-model="state.endsOn"
            data-testid="term-ends-on"
            type="date"
            class="w-full"
          />
        </UFormField>
        <UFormField
          label="Next term begins"
          name="nextTermBeginsOn"
        >
          <UInput
            v-model="state.nextTermBeginsOn"
            data-testid="term-next-begins-on"
            type="date"
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
          data-testid="term-dates-save"
          type="submit"
          form="term-dates-form"
          label="Save dates"
          :loading="saving"
        />
      </div>
    </template>
  </UModal>
</template>
