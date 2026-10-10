# Decision Log

Record significant technical or product decisions here (newest at the bottom). Keep each entry short.

## Template
### NNN — Title (YYYY-MM-DD)
- **Context:** what problem or question came up
- **Decision:** what we chose
- **Alternatives considered:** and why not
- **Consequences:** trade-offs, follow-ups

---

### 001 — Money stored as integer kobo (initial)
- **Context:** Fees involve partial payments and discounts; floating-point rounding errors are unacceptable.
- **Decision:** Store all monetary values as integers in kobo; format only at display time.
- **Consequences:** All fee logic and tests use integers.

### 002 — PGlite for tests (initial)
- **Context:** Integration tests need a real database but must be fast and isolated.
- **Decision:** Use in-memory PGlite with the real Drizzle migrations for each test file.
- **Consequences:** Same SQL dialect as production Postgres; no Docker needed to run tests.

### 003 — Multi-tenant from day one: shared schema with `schoolId` (initial)
- **Context:** The product should become a SaaS serving many schools; retrofitting isolation later is risky.
- **Decision:** One database, shared schema, non-null `schoolId` on all tenant tables, scoped query helpers, cross-tenant tests on every route. SaaS business features deferred to Phases 11–13.
- **Alternatives considered:** database-per-school and schema-per-school — stronger isolation but costly migrations and hosting for many small schools.
- **Consequences:** Discipline required on every query; RLS considered as a safety net in Phase 1.

### 004 — Tenant resolved by subdomain (initial)
- **Context:** Requests must be mapped to a school before auth and data access.
- **Decision:** `<slug>.<APP_DOMAIN>` resolved in server middleware; `DEFAULT_SCHOOL_SLUG` fallback for single-school deployments; `*.lvh.me` for local dev.
- **Consequences:** Wildcard DNS and TLS needed in production; custom domains later.
