import { defineEventHandler } from 'h3'
import { requireTenant } from '../utils/tenant'

/** Public school identity for the layout. Never exposes id or status. */
export default defineEventHandler((event) => {
  const { slug, name } = requireTenant(event)
  return { slug, name }
})
