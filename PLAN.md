# Supabase Compliance Checker – Implementation Plan

_Last updated: 2025-06-27_

---

## 1. Project Scaffolding

```
.
├── apps
│   └── web                # Next.js 14 (App Router) – UI & API routes
├── packages
│   ├── core               # Pure TypeScript library – scan logic & models
│   └── tests              # Jest test suite & shared mocks
├── .nvmrc                 # "20"
├── pnpm-workspace.yaml    # Monorepo configuration
└── README.md
```

Tooling: pnpm · TypeScript · ESLint/Prettier · Husky pre-commit

## 2. OAuth with Supabase Platform

1. **Login flow**
   - `GET /auth/login` → 302 to `https://api.supabase.com/auth/v1/authorize?...` (PKCE).
2. **Callback**
   - `GET /auth/callback?code=...`
   - Backend exchanges `code` + `code_verifier` for `access_token` (Supabase Management API).
3. **Session storage**
   - `access_token` encrypted in HTTP-only cookie.

> The access token authorises Management API calls to list projects, tables, users, etc.

## 3. Core Checks (MVP)

| Check | Endpoint(s) used | Pass Criteria | Evidence JSON |
|-------|-----------------|---------------|---------------|
| MFA per user | `GET /projects/{id}/auth/users` then `GET /projects/{id}/auth/users/{uid}/factors` | Every user has ≥1 verified factor (`totp` or `webauthn`) | `{ "user_id": "UUID", "mfa_verified": true }` |
| RLS per table | `GET /projects/{id}/tables` | `rls_enabled === true` | `{ "table": "schema.table", "rls_enabled": true }` |
| PITR per project (stub) | `GET /projects/{id}` | `point_in_time_recovery_enabled === true` | `{ "project_id": "UUID", "pitr_enabled": true }` |

### Evidence Record Schema

```jsonc
{
  "scan_id": "uuid",
  "resource_type": "user|table|project",
  "resource_id": "string",
  "pass": true,
  "details": { /* provider-specific raw fields */ },
  "timestamp": "ISO-8601"
}
```

## 4. API Contracts (Internal)

### POST /api/scan
Trigger a full scan for the authenticated Supabase org.

```jsonc
// request body – none

// success 202
{
  "scanId": "uuid",
  "startedAt": "ISO-8601",
  "status": "running"
}
```

### GET /api/scan/{id}
Fetch progress & summary.

```jsonc
{
  "scanId": "uuid",
  "startedAt": "ISO-8601",
  "finishedAt": "ISO-8601|null",
  "summary": {
    "users": { "total": 42, "passing": 39 },
    "tables": { "total": 120, "passing": 120 },
    "projects": { "total": 3, "passing": 2 }
  },
  "status": "running|complete|failed"
}
```

## 5. Test-Driven Development Roadmap

1. **core package**
   - `scanUsers()`
     * GIVEN mock Management API responses → RETURNS array of evidence.
   - `scanTables()`
   - `scanProjects()` (PITR stub)
2. **HTTP layer**
   - Unit-test `/api/scan` handler with mocked `core` functions.
3. **OAuth flow** (integration)
   - Jest + `supertest` against Next API routes, mocking Supabase OAuth endpoints.
4. **UI**
   - Storybook/React Testing Library snapshot tests for components.
5. **End-to-end**
   - Playwright: login → run scan → verify table shows pass/fail counts.

CI: GitHub Actions matrix (Node 20 on Ubuntu + Windows).

---

## 6. Stretch Goals

- **Auto-fix endpoints** (PUT `/api/fix/rls`, etc.) guarded by confirm dialog.
- **LLM chat** using OpenAI Function-calling, suggesting fixes.
- **Cron scans** via Vercel Cron or Supabase Edge Functions.

---

_Once this file looks good, we’ll commit it and begin implementation._
