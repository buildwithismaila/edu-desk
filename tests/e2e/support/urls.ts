/** The app URL for another school's subdomain, e.g. `http://sunrise.lvh.me:3100/`. */
export function schoolUrl(baseURL: string | undefined, slug: string, path = '/') {
  if (!baseURL) throw new Error('baseURL is not configured')
  const url = new URL(path, baseURL)
  url.hostname = `${slug}.lvh.me`
  return url.toString()
}
