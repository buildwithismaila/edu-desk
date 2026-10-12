import type { z } from 'zod'
import { ConfirmDialog, NameDialog } from '#components'

export interface ConfirmOptions {
  title: string
  description?: string
  confirmLabel?: string
}

export interface NameDialogOptions {
  title: string
  label: string
  value?: string
  placeholder?: string
  schema: z.ZodType<string>
  /**
   * Saves the name (awaited; throw to show the API error). Returns `unknown`, not `Promise<unknown>`:
   * comparing a typed $fetch result with `Promise<unknown>` can exceed TS's type depth (TS2321).
   */
  submit: (name: string) => unknown
}

/** `await confirm({ title, description })` → true when confirmed. */
export function useConfirmDialog() {
  const overlay = useOverlay()
  return async (props: ConfirmOptions) =>
    Boolean(await overlay.create(ConfirmDialog, { destroyOnClose: true, props }).open())
}

/** `await askName({ title, label, schema, submit })` → true once `submit` succeeded. */
export function useNameDialog() {
  const overlay = useOverlay()
  return async (props: NameDialogOptions) => {
    // useOverlay keeps props in reactive state; a proxied Zod schema throws on its read-only `_zod`
    // property ("'get' on proxy: property '_zod' is a read-only…"), so keep the schema raw
    const dialogProps = { ...props, schema: markRaw(props.schema) }
    return Boolean(await overlay.create(NameDialog, { destroyOnClose: true, props: dialogProps }).open())
  }
}
