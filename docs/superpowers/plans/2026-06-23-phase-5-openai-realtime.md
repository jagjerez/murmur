# murmur — Fase 5 (OpenAI Realtime) — Plan de implementación

> REQUIRED SUB-SKILL: superpowers:subagent-driven-development / test-driven-development.
> TDD: test primero (falla) → implementación (pasa). Commit por Task con el trailer
> `Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>`.

**Goal:** `RealtimeModelProvider` real contra OpenAI Realtime sobre WebSocket inyectable, testeado
sin red con un `FakeWebSocket`. Repo en verde.

**Spec:** `docs/superpowers/specs/2026-06-23-phase-5-openai-realtime.md`.

**Convenciones:** TS strict ESM; `ModelError` de `@murmur/shared`; base64/PCM de `@murmur/audio`;
sin red en tests; sin dependencias nuevas (usa `globalThis.WebSocket`).

---

## Task 1: `FakeWebSocket` (helper de test reutilizable)

**Files:** `packages/core/src/providers/fake-websocket.ts` (+ `fake-websocket.test.ts`), export en index.

- [ ] Implementar `createFakeWebSocket()` con la forma `WebSocketLike`:
  `send(data)` (acumula en `sent: string[]`), `close()` (marca cerrado, dispara `close`),
  `addEventListener(type, cb)`/props `onopen/onmessage/onclose/onerror`, `readyState`. Helpers de
  test: `simulateOpen()`, `emitServerEvent(obj)` (dispara `message` con `JSON.stringify`),
  `simulateError()`, `simulateClose()`. Captura los subprotocolos pasados al constructor.
- [ ] Test (falla→pasa): emitir open/mensaje/close llama a los listeners; `sent` registra envíos.
- [ ] Commit: `feat(core): FakeWebSocket para tests de realtime`.

## Task 2: Extender `RealtimeConnectOptions`

**Files:** `packages/core/src/providers/realtime-model-provider.ts`.

- [ ] Añadir callbacks opcionales `onUserTranscript`, `onAssistantTranscript`, `onOpen` (no rompe a
  nadie). 
- [ ] `pnpm --filter @murmur/core typecheck` verde. (Se commitea junto con Task 3.)

## Task 3: `OpenAIRealtimeProvider`

**Files:** `packages/core/src/providers/openai-realtime.ts` (+ `openai-realtime.test.ts`), `index.ts`.

Contrato:
```ts
export interface WebSocketLike {
  send(data: string): void;
  close(): void;
  readyState: number;
  addEventListener(type: 'open'|'message'|'close'|'error', cb: (ev: unknown) => void): void;
}
export type WebSocketFactory = (url: string, protocols?: string[]) => WebSocketLike;
export function createOpenAIRealtimeProvider(deps?: { webSocketFactory?: WebSocketFactory }): RealtimeModelProvider;
```

- [ ] Tests (fallan) con `createFakeWebSocket` inyectado vía factory:
  - `connect()` crea el WS con `wss://api.openai.com/v1/realtime?model=<model>` y subprotocolos
    `['realtime', 'openai-insecure-api-key.<KEY>', 'openai-beta.realtime-v1']`; tras `simulateOpen()`
    el primer `sent` es `session.update` con `voice`, `input_audio_format:'pcm16'`,
    `output_audio_format:'pcm16'`, `turn_detection.type:'server_vad'`.
  - `sendAudio(bytes)` → `sent` contiene `input_audio_buffer.append` con `audio` = base64(bytes).
  - `commit()` → `input_audio_buffer.commit` y luego `response.create`.
  - `emitServerEvent({type:'input_audio_buffer.speech_started'})` → `onState('listening')`;
    `...speech_stopped`/`response.created` → `onState('thinking')`;
    `response.output_audio.delta {delta: base64}` → `onState('speaking')` (primera vez) + `onAudio(bytes)`;
    también acepta `response.audio.delta`;
    `response.done` → `onState('idle')`.
  - transcripts: `conversation.item.input_audio_transcription.completed {transcript}` → `onUserTranscript`;
    `response.output_audio_transcript.delta {delta}` → `onAssistantTranscript`.
  - `interrupt()` → `response.cancel`; `close()` cierra y es idempotente.
  - `emitServerEvent({type:'error', error:{message}})` → `onError(ModelError)`.
- [ ] Implementar `openai-realtime.ts`: clase de sesión que registra los listeners, hace el
  `session.update` en `open`, traduce eventos→callbacks/estado, y métodos `sendAudio/commit/interrupt/close`.
  La key solo va en el subprotocolo; nunca se loguea.
- [ ] Export en `index.ts` (`createOpenAIRealtimeProvider`, tipos). 
- [ ] `pnpm --filter @murmur/core test/typecheck/build` verde. Commit: `feat(core): OpenAIRealtimeProvider sobre WebSocket inyectable`.

## Task 4: Verificación de fase

- [ ] `pnpm install && pnpm typecheck && pnpm lint && pnpm test && pnpm build` verde.
- [ ] `cd packages/native && cargo test` verde. `pnpm exec prettier --check .` limpio.
- [ ] `git grep -nE "sk-[A-Za-z0-9]{6,}"` → solo keys ficticias de test. Criterios del spec §5.

---

## Self-Review (mapeo spec → tasks)

- §4 FakeWebSocket → Task 1. §3 interfaz → Task 2. §2 provider + estados + transcript + errores → Task 3.
- §5 criterios → Task 4. Auth por subprotocolo y caveat documentado en el módulo.
