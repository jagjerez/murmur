# murmur — Fase 9 (Orchestrator completo) — Plan de implementación

> REQUIRED SUB-SKILL: superpowers:subagent-driven-development / test-driven-development.
> TDD: test primero (falla) → implementación (pasa). Commit por Task con el trailer
> `Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>`.

**Goal:** `ConversationOrchestrator` que integra audio + realtime + persistencia + RAG en el pipeline
completo, con deps inyectadas y testeado sin red/hardware. Repo en verde.

**Spec:** `docs/superpowers/specs/2026-06-23-phase-9-orchestrator.md`.

**Convenciones:** TS strict ESM; reutiliza `createPushPullStream`/mocks de `@murmur/audio`, providers
de `@murmur/core` (F5), stores/retriever/summarizer/factExtractor de `@murmur/rag`. Sin red en tests.
`@murmur/core` añade dep `@murmur/rag` (no hay ciclo: rag no depende de core).

---

## Task 1: `createMockRealtimeProvider` (`@murmur/core/src/providers/mock-realtime.ts`)

**Files:** `packages/core/src/providers/mock-realtime.ts` (+ `mock-realtime.test.ts`), export en `index.ts`.

- [ ] Provider `RealtimeModelProvider` cuyo `connect(options)` guarda los callbacks (`onState`,
      `onAudio`, `onUserTranscript`, `onAssistantTranscript`, `onError`, `onOpen`) y devuelve una sesión
      que registra `sendAudio`/`commit`/`interrupt`/`close` en arrays inspeccionables. Expone helpers de
      test: `emitState(s)`, `emitAudio(bytes)`, `emitUserTranscript(t)`, `emitAssistantTranscript(t)`,
      `emitResponseDone()`, `emitError(e)`, y acceso a la última sesión/options.
- [ ] Tests (fallan→pasan): connect captura options; los emit llaman a los callbacks; sendAudio/commit
      /interrupt/close quedan registrados.
- [ ] Commit: `feat(core): createMockRealtimeProvider para tests del orchestrator`.

## Task 2: `ConversationOrchestrator` (pipeline completo)

**Files:** `packages/core/src/orchestrator.ts` (reescribir), `packages/core/src/orchestrator.test.ts`
(ampliar), `packages/core/package.json` (dep `@murmur/rag`), `packages/core/src/index.ts`.

- [ ] Mantener compat F0: `getState()` arranca en `idle`; `reset()` notifica `onStateChange('idle')`.
- [ ] Implementar deps inyectadas (ver spec §3) y los métodos:
  - `startSession()`: `conversation.createSession()`; si hay `retriever`, `retrieve` un contexto y
    construir `instructions` básico; `realtime.connect({...connection, instructions, onState, onAudio,
onUserTranscript, onAssistantTranscript, onError, onOpen})`.
  - `startListening()`: `input.start()` → iterar `read()` → `session.sendAudio(chunk)`; estado de
    captura. `stopListening()`: `input.stop()` (si aplica) + `session.commit()`.
  - callbacks: `onState`→`setState`; `onAudio`→push a un `createPushPullStream` que alimenta
    `output.play(stream.read())` (arrancado una vez por respuesta); `onUserTranscript`→`addMessage(user)`
    - `onTranscript`; `onAssistantTranscript`→acumular; al `responseDone`/`onState('idle')`→
      `addMessage(assistant)` con lo acumulado y cerrar el stream de salida; `onError`→`setState('error')`.
  - `interrupt()`: `session.interrupt()` + `output.stop()` + cerrar stream de salida.
  - `endSession()`: `conversation.endSession(id)`; si hay `summarizer`→`summarize(id)`; si hay
    `factExtractor`→`extract(transcriptCompleto)`; (con `sink`/`retriever.index` para indexar); `session.close()`.
- [ ] Tests de integración (fallan→pasan), con `createMockRealtimeProvider`, `createMockVoiceInput`,
      `createMemoryVoiceOutput`, `createSqliteStore(':memory:')` (conversation), mock retriever/summarizer/
      factExtractor (o los reales con ChatProvider mock):
  - startSession crea sesión y conecta con `instructions` (incluye contexto si hay retriever).
  - startListening envía los chunks del input al `sendAudio` de la sesión.
  - secuencia de emits del mock realtime → estados `listening→thinking→speaking→idle` notificados;
    `onAudio` llega a la salida (bytes acumulados en `createMemoryVoiceOutput`).
  - tras el turno: el ConversationStore tiene el mensaje de usuario y el de asistente en orden.
  - `interrupt()` registra `interrupt` en la sesión y llama `output.stop()`.
  - `endSession()` finaliza la sesión y guarda `session_summary` + `long_term_fact` (sink/index llamado).
  - `onError` → estado `error`.
- [ ] `pnpm --filter @murmur/core test/typecheck/build` verde. Commit: `feat(core): ConversationOrchestrator con pipeline completo`.

## Task 3: Verificación de fase

- [ ] `pnpm install && pnpm typecheck && pnpm lint && pnpm test && pnpm build` verde.
- [ ] `cd packages/native && cargo test` verde. `pnpm exec prettier --check .` limpio.
- [ ] Criterios de aceptación del spec §5 (incl. compat F0).

---

## Self-Review (mapeo spec → tasks)

- §3 mock realtime → Task 1. §2 pipeline + §3 deps + §5 criterios → Task 2. §5 puerta → Task 3.
- Sin ciclos de dependencia (core→rag→shared). Streams de salida vía `createPushPullStream` (F4).
