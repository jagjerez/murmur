# murmur — Fase 11 (UI avanzada) — Plan de implementación

> REQUIRED SUB-SKILL: superpowers:subagent-driven-development / test-driven-development.
> TDD: test primero (falla) → implementación (pasa). Commit por Task con el trailer
> `Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>`.

**Goal:** Onboarding + ajustes + estados de error + transcripción, y cableado real del orchestrator
en la app (todo inyectable/mockeable), + fixes de robustez del orchestrator. Repo en verde.

**Spec:** `docs/superpowers/specs/2026-06-23-phase-11-ui-advanced.md`.

**Convenciones:** TS strict ESM; React 19 + RTL/jsdom; reutiliza `@murmur/core` (orchestrator/prompt/
realtime/hotkey), `@murmur/audio` (Web providers/mocks), `@murmur/design-system`. Sin red ni hardware
en tests. NO toques `docs/superpowers/PROGRESS.md` ni nada fuera del repo (lo lleva el orquestador).

---

## Task 1: Fixes de robustez del orchestrator (`@murmur/core`)

**Files:** `packages/core/src/orchestrator.ts`, `packages/core/src/orchestrator.test.ts`.

- [ ] `interrupt()` limpia `assistantBuffer` (no persistir respuesta cancelada tras barge-in). Test:
      emitir transcript parcial → `interrupt()` → emitir `idle` → NO se persiste mensaje de asistente.
- [ ] Encadenar/await la promesa de `playback` anterior antes de reasignar en multi-turno (evitar
      rechazos sin manejar). Documentar el contrato fire-and-forget de `startListening` (JSDoc).
- [ ] `pnpm --filter @murmur/core test` verde. Commit: `fix(core): robustez del orchestrator (interrupt/playback/doc)`.

## Task 2: `ConfigClient` (`apps/desktop/src/config/config-client.ts`)

**Files:** `apps/desktop/src/config/config-client.ts` (+ test), comandos Rust en `src-tauri`.

- [ ] Interfaz `ConfigClient` (ver spec §2) + `createMockConfigClient(initial?)` (en memoria; key
      redactada en `get`) + `createTauriConfigClient()` (invoca `get_config`/`set_*`; degrada fuera de Tauri).
- [ ] Rust: comandos `get_config`/`set_config`/`set_openai_key` en `src-tauri/src/` + registro +
      capacidad. Documentar que la build nativa no se ejecuta aquí.
- [ ] Tests (mock): `setOpenAiKey` → `hasApiKey` true sin exponer la key; setters persisten.
- [ ] Commit: `feat(desktop): ConfigClient (mock + Tauri) y comandos de config`.

## Task 3: Componentes Onboarding, Settings, ErrorState, Transcript

**Files:** `apps/desktop/src/components/{Onboarding,Settings,ErrorState,Transcript}.tsx` (+ tests RTL), estilos.

- [ ] `Onboarding`: pasos bienvenida→API key→permiso micro (`getUserMedia` mockeado, maneja denegado)→
      hotkey (valida con `parseAccelerator`)→listo; guarda vía `ConfigClient`; accesible.
- [ ] `Settings`: micrófono (lista vía device manager inyectable), voz, modelo, hotkey (validado), tema
      (`data-theme`), estado de conexión; persiste vía `ConfigClient`.
- [ ] `ErrorState`: enum `no-api-key|no-mic|no-network|mic-denied` → mensaje + acción de recuperación.
- [ ] `Transcript`: líneas usuario/asistente con `aria-live`, alternable.
- [ ] Tests RTL para cada uno (ver criterios §4). Commit: `feat(desktop): onboarding, ajustes, estados de error y transcripción`.

## Task 4: Controlador `useMurmur` + App shell

**Files:** `apps/desktop/src/use-murmur.ts` (+ test), `apps/desktop/src/App.tsx`, estilos.

- [ ] `useMurmur(deps)`: construye/inyecta `ConversationOrchestrator` (con Web audio o mocks),
      `RealtimeModelProvider`, `ConfigClient`, `HotkeyManager`; expone estado de la cápsula, transcripts,
      conexión, y acciones (start/stop captura). Todo inyectable; default a impls reales, mocks en tests.
- [ ] `App.tsx`: shell — sin API key → `Onboarding`; con API key → cápsula + acceso a `Settings`;
      el hotkey dispara captura; la cápsula refleja `onStateChange`; `Transcript` opcional.
- [ ] Tests RTL: sin key → onboarding; con key (mock config) → cápsula; `hotkey.trigger` → captura;
      estado del orchestrator → estado de la cápsula. Los tests previos (cápsula/hotkey/audio) siguen verdes.
- [ ] Commit: `feat(desktop): controlador useMurmur y shell de la app`.

## Task 5: Verificación de fase

- [ ] `pnpm install && pnpm typecheck && pnpm lint && pnpm test && pnpm build` verde.
- [ ] `cd packages/native && cargo test` verde. `pnpm exec prettier --check .` limpio.
- [ ] Criterios de aceptación del spec §4.

---

## Self-Review (mapeo spec → tasks)

- §2 robustez orchestrator → Task 1. ConfigClient → Task 2. componentes → Task 3. cableado/shell → Task 4. §4 → Task 5.
