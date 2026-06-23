# murmur — Fase 6 (SQLite) — Plan de implementación

> REQUIRED SUB-SKILL: superpowers:subagent-driven-development / test-driven-development.
> TDD: test primero (falla) → implementación (pasa). Commit por Task con el trailer
> `Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>`.

**Goal:** Persistencia local SQLite en `@murmur/rag` (`SqliteMemoryStore` + `ConversationStore` +
migraciones) y cableado real de `murmur memory reset`/`status`. Repo en verde.

**Spec:** `docs/superpowers/specs/2026-06-23-phase-6-sqlite.md`.

**Convenciones:** TS strict ESM; `node:sqlite` (Node 26) si funciona bajo Vitest, si no
`better-sqlite3`; `MemoryError` de `@murmur/shared`; tests con db temporal/`:memory:`.

---

## Task 1: Capa de DB + migraciones (`@murmur/rag/src/sqlite/db.ts`)

**Files:** `packages/rag/src/sqlite/db.ts` (+ `db.test.ts`).

- [ ] PRIMERO: verifica `node:sqlite` bajo Vitest con un test mínimo (`import { DatabaseSync } from 'node:sqlite'`,
  crear `:memory:`, `CREATE TABLE`, insertar, leer). Si falla por flag/availability, cambia a
  `better-sqlite3` (añádelo al catalog + dep de `@murmur/rag`) y documenta el motivo en `db.ts`.
- [ ] `openDatabase(path)` → handle; `migrate(db)` crea `memory_items`, `sessions`, `messages` +
  índices, fija `PRAGMA user_version`. Idempotente (reejecutar no rompe ni duplica).
- [ ] Tests (fallan→pasan): abrir `:memory:` + migrate crea las tablas; migrate dos veces no falla;
  abrir un fichero temporal, escribir, cerrar, reabrir → datos presentes; `user_version` correcto.
- [ ] Commit: `feat(rag): capa SQLite + migraciones idempotentes`.

## Task 2: `SqliteMemoryStore` (`@murmur/rag/src/sqlite/memory-store.ts`)

**Files:** `packages/rag/src/sqlite/memory-store.ts` (+ `memory-store.test.ts`).

- [ ] `SqliteMemoryStore implements MemoryStore` con `add`, `all`, `clear`, `getByType(type)`,
  `recent(limit)`, `get(id)`, `delete(id)`, `count()`. `add` valida el `type` contra `MEMORY_TYPES`.
  `now()` inyectable para determinismo.
- [ ] Tests (fallan→pasan): add+all round-trip; getByType filtra; recent ordena desc por created_at
  y respeta limit; delete/get/count; clear vacía; type inválido → `MemoryError`.
- [ ] Commit: `feat(rag): SqliteMemoryStore`.

## Task 3: `ConversationStore` + `createSqliteStore` (`@murmur/rag/src/sqlite/`)

**Files:** `packages/rag/src/sqlite/conversation-store.ts`, `packages/rag/src/sqlite/index.ts`
(+ tests), export en `packages/rag/src/index.ts`.

- [ ] `ConversationStore`: `createSession()`, `endSession(id)`, `getSession(id)`, `recentSessions(limit)`,
  `addMessage(msg)`, `getMessages(sessionId)` (orden cronológico). Tipos `Session`/`Message`/`Role` de
  `@murmur/shared`. IDs con `crypto.randomUUID()`.
- [ ] `createSqliteStore(path)` → `{ memory, conversation, reset(), close(), path }` (abre db, migra,
  comparte el handle). `reset()` vacía las tres tablas.
- [ ] Tests (fallan→pasan): crear sesión + añadir mensajes + recuperarlos en orden; endSession fija
  `ended_at`; recentSessions; `reset()` deja todo a 0; persistencia entre reaperturas.
- [ ] Export en `index.ts`. Commit: `feat(rag): ConversationStore y createSqliteStore`.

## Task 4: Cableado del CLI (`memory reset` real + `status` con conteo)

**Files:** `packages/cli/src/cli.ts`, `packages/cli/src/cli.test.ts`, `packages/cli/package.json`
(dep `@murmur/rag`).

- [ ] `memory reset --yes`: abre `createSqliteStore(config.dataPath('memory.db'))`, `reset()`, cierra
  (o borra el fichero). Sin `--yes` no toca nada. `TODO(F6)` retirado.
- [ ] `status`: muestra "memoria: N elementos" abriendo el store (read-only/efímero) en el path; si
  no existe la db, "0".
- [ ] Inyectable en tests: permite pasar un `storeFactory`/path temporal en `CliDeps` para no tocar
  datos reales.
- [ ] Tests (fallan→pasan): tras añadir items (vía store en temp dir), `status` reporta N; `memory
  reset --yes` deja 0; sin `--yes` los conserva.
- [ ] `pnpm --filter murmur test/typecheck/build` verde. Commit: `feat(cli): memory reset real y status con conteo (SQLite)`.

## Task 5: Verificación de fase

- [ ] `pnpm install && pnpm typecheck && pnpm lint && pnpm test && pnpm build` verde.
- [ ] `cd packages/native && cargo test` verde. `pnpm exec prettier --check .` limpio.
- [ ] Criterios de aceptación del spec §4.

---

## Self-Review (mapeo spec → tasks)

- §2 motor+esquema+migraciones → Task 1. MemoryStore → Task 2. ConversationStore+createSqliteStore → Task 3.
- §2 CLI memory reset/status → Task 4. §4 criterios → Task 5.
