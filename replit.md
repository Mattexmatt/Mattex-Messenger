# Workspace

## Overview

pnpm workspace monorepo using TypeScript. Each package manages its own dependencies.

## Stack

- **Monorepo tool**: pnpm workspaces
- **Node.js version**: 24
- **Package manager**: pnpm
- **TypeScript version**: 5.9
- **API framework**: Express 5
- **Database**: PostgreSQL + Drizzle ORM
- **Validation**: Zod (`zod/v4`), `drizzle-zod`
- **API codegen**: Orval (from OpenAPI spec)
- **Build**: esbuild (CJS bundle)

## Structure

```text
artifacts-monorepo/
├── artifacts/              # Deployable applications
│   └── api-server/         # Express API server
├── lib/                    # Shared libraries
│   ├── api-spec/           # OpenAPI spec + Orval codegen config
│   ├── api-client-react/   # Generated React Query hooks
│   ├── api-zod/            # Generated Zod schemas from OpenAPI
│   └── db/                 # Drizzle ORM schema + DB connection
├── scripts/                # Utility scripts (single workspace package)
│   └── src/                # Individual .ts scripts, run via `pnpm --filter @workspace/scripts run <script>`
├── pnpm-workspace.yaml     # pnpm workspace (artifacts/*, lib/*, lib/integrations/*, scripts)
├── tsconfig.base.json      # Shared TS options (composite, bundler resolution, es2022)
├── tsconfig.json           # Root TS project references
└── package.json            # Root package with hoisted devDeps
```

## TypeScript & Composite Projects

Every package extends `tsconfig.base.json` which sets `composite: true`. The root `tsconfig.json` lists all packages as project references. This means:

- **Always typecheck from the root** — run `pnpm run typecheck` (which runs `tsc --build --emitDeclarationOnly`). This builds the full dependency graph so that cross-package imports resolve correctly. Running `tsc` inside a single package will fail if its dependencies haven't been built yet.
- **`emitDeclarationOnly`** — we only emit `.d.ts` files during typecheck; actual JS bundling is handled by esbuild/tsx/vite...etc, not `tsc`.
- **Project references** — when package A depends on package B, A's `tsconfig.json` must list B in its `references` array. `tsc --build` uses this to determine build order and skip up-to-date packages.

## Root Scripts

- `pnpm run build` — runs `typecheck` first, then recursively runs `build` in all packages that define it
- `pnpm run typecheck` — runs `tsc --build --emitDeclarationOnly` using project references

## M Chat App

**M Chat** is the main product — a full-featured native mobile chat app by Allan Matt Tech. It uses the Expo artifact (`artifacts/m-chat`) with a PostgreSQL backend (`artifacts/api-server`).

### Features
- Username-based auth (JWT, no phone number)
- Real-time 1-on-1 messaging with emoji picker and voice notes
- 1-on-1 video call UI
- 7 chat themes (Midnight Hacker, Synthwave, Cyberpunk, Ocean, Volcanic, Galaxy, Arctic)
- Podcast Room with owner-only upload
- Meme Community with likes
- Instagram/WhatsApp-style image/video Stories (Updates tab): story ring circles, fullscreen viewer with progress bar, 24h expiry
- Telegram-style Settings screen (all sections)
- Hamburger menu on Chats with quick actions
- My Profile screen

### DB Schema
Tables: `users`, `conversations`, `messages`, `podcasts`, `memes`, `meme_likes`, `statuses`
JWT secret: `JWT_SECRET` env var (default: `mchat-secret-key-2024`)

### Mobile App Structure (`artifacts/m-chat`)
- `app/_layout.tsx` — root: ThemeProvider, AuthProvider, QueryClient
- `app/index.tsx` — redirects to login or tabs based on auth state
- `app/(auth)/` — login.tsx, register.tsx
- `app/(tabs)/` — index (Chats), memes, podcasts, profile
- `app/chat/[id].tsx` — chat screen with emoji picker, voice note
- `app/call/[id].tsx` — video call UI
- `context/ThemeContext.tsx` — 3 themes
- `context/AuthContext.tsx` — JWT stored in AsyncStorage
- `utils/api.ts` — apiRequest() with auth header injection

### API Routes (`artifacts/api-server/src/routes/`)
- `auth.ts` — POST /auth/register, POST /auth/login
- `users.ts` — GET /users/search, GET /users/me, PUT /users/me
- `conversations.ts` — GET /conversations, POST /conversations
- `messages.ts` — GET /messages/:convId, POST /messages
- `podcasts.ts` — GET /podcasts, POST /podcasts (owner only)
- `memes.ts` — GET /memes, POST /memes, POST /memes/:id/like; owner: DELETE /memes/:id (remove), PATCH /memes/:id/flag, POST /memes/:userId/warn (auto-ban @3), PATCH /memes/:userId/ban
- `statuses.ts` — GET /statuses, GET /statuses/mine, POST /statuses, DELETE /statuses/:id (image/video stories, 24h expiry)

**Important**: Use `import { z } from "zod"` (not `zod/v4`) — workspace uses zod v3.

## Packages

### `artifacts/api-server` (`@workspace/api-server`)

Express 5 API server. Routes live in `src/routes/` and use `@workspace/api-zod` for request and response validation and `@workspace/db` for persistence.

- Entry: `src/index.ts` — reads `PORT`, starts Express
- App setup: `src/app.ts` — mounts CORS, JSON/urlencoded parsing, routes at `/api`
- Routes: `src/routes/index.ts` mounts sub-routers; `src/routes/health.ts` exposes `GET /health` (full path: `/api/health`)
- Email service: `src/emailService.ts` — Resend integration via Replit connector (no hardcoded API key). Used for email verification, password reset, and login security alerts.
- Auth routes include: `/auth/register` (optional email), `/auth/login` (username OR email), `/auth/forgot-password`, `/auth/reset-password`, `/auth/verify-email`, `/auth/add-email`, `/auth/resend-verification`
- Depends on: `@workspace/db`, `@workspace/api-zod`
- `pnpm --filter @workspace/api-server run dev` — run the dev server
- `pnpm --filter @workspace/api-server run build` — production esbuild bundle (`dist/index.cjs`)
- Build bundles an allowlist of deps (express, cors, pg, drizzle-orm, zod, etc.) and externalizes the rest

### `lib/db` (`@workspace/db`)

Database layer using Drizzle ORM with PostgreSQL. Exports a Drizzle client instance and schema models.

- `src/index.ts` — creates a `Pool` + Drizzle instance, exports schema
- `src/schema/index.ts` — barrel re-export of all models
- `src/schema/<modelname>.ts` — table definitions with `drizzle-zod` insert schemas (no models definitions exist right now)
- `drizzle.config.ts` — Drizzle Kit config (requires `DATABASE_URL`, automatically provided by Replit)
- Exports: `.` (pool, db, schema), `./schema` (schema only)

Production migrations are handled by Replit when publishing. In development, we just use `pnpm --filter @workspace/db run push`, and we fallback to `pnpm --filter @workspace/db run push-force`.

### `lib/api-spec` (`@workspace/api-spec`)

Owns the OpenAPI 3.1 spec (`openapi.yaml`) and the Orval config (`orval.config.ts`). Running codegen produces output into two sibling packages:

1. `lib/api-client-react/src/generated/` — React Query hooks + fetch client
2. `lib/api-zod/src/generated/` — Zod schemas

Run codegen: `pnpm --filter @workspace/api-spec run codegen`

### `lib/api-zod` (`@workspace/api-zod`)

Generated Zod schemas from the OpenAPI spec (e.g. `HealthCheckResponse`). Used by `api-server` for response validation.

### `lib/api-client-react` (`@workspace/api-client-react`)

Generated React Query hooks and fetch client from the OpenAPI spec (e.g. `useHealthCheck`, `healthCheck`).

### `scripts` (`@workspace/scripts`)

Utility scripts package. Each script is a `.ts` file in `src/` with a corresponding npm script in `package.json`. Run scripts via `pnpm --filter @workspace/scripts run <script>`. Scripts can import any workspace package (e.g., `@workspace/db`) by adding it as a dependency in `scripts/package.json`.
