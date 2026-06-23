# murmur — Fase 12 (Privacidad) — Plan de implementación

> REQUIRED SUB-SKILL: superpowers:subagent-driven-development / test-driven-development.
> TDD: test primero (falla) → implementación (pasa). Commit por Task con el trailer
> `Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>`.

**Goal:** Controles de privacidad: modo local, retención/pruning, redacción, gestión de memoria
explícita (CLI) y export/borrado, con el orchestrator honrando los flags. Repo en verde.

**Spec:** `docs/superpowers/specs/2026-06-23-phase-12-privacy.md`.

**Convenciones:** TS strict ESM; tests sin red; store inyectable; NO toques `PROGRESS.md` ni nada
fuera del repo (lo lleva el orquestador).

---

## Task 1: `redactSensitive` (`@murmur/shared/src/redact.ts`)

**Files:** `packages/shared/src/redact.ts` (+ `redact.test.ts`), export en `index.ts`.

- [ ] Tests (fallan→pasan): emails → `[email]`, `sk-...` → `[clave]`, secuencias largas de dígitos
  → `[número]`; texto normal intacto; idempotente; pura.
- [ ] Implementar con regex. Commit: `feat(shared): redactSensitive (redacción de datos sensibles)`.

## Task 2: `pruneOlderThan` + `exportAll` (`@murmur/rag` store)

**Files:** `packages/rag/src/sqlite/*` (memory-store/conversation-store/index) (+ tests).

- [ ] `memory`: `pruneOlderThan(beforeMs)` borra items con `created_at < beforeMs`; `conversation`:
  prune de mensajes/sesiones anteriores. `createSqliteStore` expone `pruneOlderThan(beforeMs)` y
  `exportAll()` → `{ memory, sessions, messages }`.
- [ ] Tests (fallan→pasan): insertar con `now()` fijo, `pruneOlderThan` borra solo lo anterior;
  `exportAll` devuelve todo lo persistido.
- [ ] Commit: `feat(rag): pruneOlderThan y exportAll`.

## Task 3: Privacidad en config + subcomandos `memory` (`@murmur/cli`)

**Files:** `packages/cli/src/config.ts`, `packages/cli/src/cli.ts` (+ tests).

- [ ] `MurmurConfig.privacy` (defaults del spec) en `ConfigStore` (normalización + setter
  `config set-privacy <campo> <valor>` o setters dedicados); `config` muestra la privacidad.
- [ ] Subcomandos: `memory list`, `memory add <texto>` (`explicit_user_memory`), `memory forget <id>`,
  `memory export [ruta]` (JSON de `exportAll`), `memory prune` (aplica `retentionDays`). Store inyectable.
- [ ] Tests (fallan→pasan): add→list muestra el item; forget lo borra; export produce JSON con las
  claves; prune respeta retención; `config` refleja privacidad; defaults correctos.
- [ ] Commit: `feat(cli): privacidad en config y gestión de memoria explícita`.

## Task 4: Orchestrator honra privacidad (`@murmur/core`)

**Files:** `packages/core/src/orchestrator.ts` (+ tests).

- [ ] Añadir `privacy?: { localOnlyMode?; storeTranscripts?; redactBeforeStore? }` a las deps
  (o leerlo de `connection`/config). `startSession`: si `localOnlyMode`, NO inyecta contexto RAG.
  Persistencia: si `storeTranscripts===false`, no persiste texto; si `redactBeforeStore`, aplica
  `redactSensitive` antes de `addMessage`.
- [ ] Tests (fallan→pasan): `localOnlyMode` → instructions sin bloque de contexto aunque haya
  retriever; `storeTranscripts:false` → no se persisten mensajes; `redactBeforeStore` → el mensaje
  persistido está redactado. Los tests previos siguen verdes.
- [ ] Commit: `feat(core): el orchestrator honra los flags de privacidad`.

## Task 5: Verificación de fase

- [ ] `pnpm install && pnpm typecheck && pnpm lint && pnpm test && pnpm build` verde.
- [ ] `cd packages/native && cargo test` verde. `pnpm exec prettier --check .` limpio.
- [ ] Criterios de aceptación del spec §4.

---

## Self-Review (mapeo spec → tasks)

- §2 redacción → Task 1. retención/export → Task 2. config+CLI memoria → Task 3. orchestrator → Task 4. §4 → Task 5.
