# murmur — Progreso de construcción (Fases 0–16)

> Tracker durable para ejecución autónoma orquestada por subagentes.
> Fuente de verdad de resumibilidad: este archivo + `git log` + ramas `phase-N`.
> Cadena por fase: **rama `phase-N` → spec → plan → implementación (TDD, subagentes) →
> review (spec + calidad) → puerta de calidad verde → merge a `main`**.
>
> Puerta de calidad (debe quedar verde al cerrar cada fase):
> `pnpm install && pnpm typecheck && pnpm lint && pnpm test && pnpm build` y, si toca crate
> Rust, `cd packages/native && cargo test`. Sin secretos en el repo.

## Estado

| Fase | Tema                                                                                                     | Estado                  |
| ---- | -------------------------------------------------------------------------------------------------------- | ----------------------- |
| 0    | Fundamentos + design system + brief                                                                      | ✅ COMPLETA (en `main`) |
| 1    | CLI real (`start`, `config`, `config set-openai-key`, `memory reset`, `status`, `~/.murmur/config.json`) | ✅ COMPLETA (en `main`) |
| 2    | UI Tauri: cápsula real (5 estados, animaciones, dark/light, draggable, PTT/toggle)                       | ✅ COMPLETA (en `main`) |
| 3    | Hotkey global (native Rust + Tauri global-shortcut)                                                      | ✅ COMPLETA (en `main`) |
| 4    | Audio real (captura/reproducción, AudioStream PCM, enumeración de dispositivos)                          | ✅ COMPLETA (en `main`) |
| 5    | OpenAI Realtime (RealtimeModelProvider sobre WebSocket, mockeado en tests)                               | ✅ COMPLETA (en `main`) |
| 6    | SQLite (MemoryStore persistente, sesiones/mensajes/memoria, migraciones)                                 | ⬜ pendiente            |
| 7    | RAG embeddings + retrieval (EmbeddingProvider, vectores en SQLite, RagRetriever)                         | ⬜ pendiente            |
| 8    | RAG summaries + facts (SessionSummarizer, FactExtractor, alimenta contexto)                              | ⬜ pendiente            |
| 9    | Orchestrator completo (hotkey→captura→modelo→contexto→respuesta→persistir)                               | ⬜ pendiente            |
| 10   | Prompt (persona cálida, construcción de contexto RAG, presupuesto de tokens)                             | ⬜ pendiente            |
| 11   | UI avanzada (onboarding, ajustes, estados de error/vacío, transcripción)                                 | ⬜ pendiente            |
| 12   | Privacidad (modo local, retención, borrado/exportación, memoria explícita)                               | ⬜ pendiente            |
| 13   | Whisper (TranscriptionProvider local/whisper-api como fallback)                                          | ⬜ pendiente            |
| 14   | Wake word ("hey murmur", native, toggle en config)                                                       | ⬜ pendiente            |
| 15   | Plugins (sistema de skills/acciones, registry, ejemplos)                                                 | ⬜ pendiente            |
| 16   | Packaging (npm publish CLI, bundling Tauri por plataforma, CI, iconos, docs)                             | ⬜ pendiente            |

## Reglas de fase

1. Todo detrás de interfaces; OpenAI/Whisper/SQLite/audio/native reemplazables.
2. Tests **sin red**: APIs externas mockeadas a través de las interfaces.
3. Native/plataforma: implementar y testear lo testeable (unit Rust / mocks TS); documentar lo
   que requiere hardware/entorno gráfico. Mantener `cargo test` y el pipeline pnpm verdes.
4. Secretos solo en `~/.murmur/config.json` / env; nunca en el repo.
5. Cada commit termina con el trailer `Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>`.
6. Cada fase deja el repo compilando y en verde antes de mergear.

## Bitácora

- Fase 0: completada y mergeada en `main` (commit `1dc1aae`).
- Fase 1: CLI real + `ConfigStore` (`~/.murmur/config.json`, `MURMUR_HOME`, perms 0600, key
  redactada). 43 tests verdes (30 en `murmur`). Review independiente: PASS. Mergeada en `main`
  (commit `1dea78f`).
- Fase 2: cápsula real (lógica pura visual/interacción/anclaje + componentes `Capsule`/`Waveform`
  - hook). Setup Vitest+jsdom+RTL en `apps/desktop`. 76 tests verdes (33 en desktop). CSP de Tauri
    fijado (cierra TODO(F2)); catalog `vite ^6→^7`. Puerta de calidad verde verificada en el
    orquestador. Mergeada en `main` (commit `4ea00e6`).
- Fase 3: hotkey global. `HotkeyError` en shared; parser de aceleradores en Rust
  (`packages/native`, 11 cargo tests) y TS (`@murmur/core` `parseAccelerator`); `HotkeyManager`
  - `createMemoryHotkeyManager`; `TauriHotkeyManager` (plugin global-shortcut, degradación segura
    fuera de Tauri) cableado a la captura de la cápsula (inyectable). Plugin Rust + capacidad
    `global-shortcut:default` añadidos (build nativa fuera del pipeline). 96 tests TS + 11 Rust.
    Mergeada en `main` (commit `1c0ef24`).
- Fase 4: audio real (mergeada en `main`, commit `686c2a1`; review independiente vía Workflow
  `pass` al primer intento + confirmación del orquestador). `@murmur/audio`: `pcm.ts`
  (formato canónico Int16 LE mono 24k — OpenAI Realtime; `float32ToPcm16`/`pcm16ToFloat32` con
  clamp y escala asimétrica, `resampleLinear`, `rms`, base64 portable, `chunkBytes`/`concatChunks`);
  `stream.ts` (`createPushPullStream`: cola con backpressure que conecta callbacks push→`AudioStream`
  async-iterable; `end`/`fail`/`stop`); `mock.ts` (`createMockVoiceInput`/`createMemoryVoiceOutput`/
  `createMockAudioDeviceManager`, para tests y orchestrator F9). `apps/desktop`: `audio/web-audio.ts`
  (`WebAudioDeviceManager` enumerateDevices→`AudioDevice[]`; `WebVoiceInputProvider` getUserMedia
  mono + ScriptProcessor → PCM16 24k vía push-pull, teardown de tracks/contexto, permiso → `AudioError`;
  `WebVoiceOutputProvider` encola `AudioBufferSource` contiguos) y `audio/use-audio-level.ts`
  (`useAudioLevel(input, active)` → RMS 0..1). Wiring ligero en `App.tsx`: panel dev lista micrófonos
  (inyectable, default Web Audio) y el `Waveform` refleja el nivel real al capturar (props opcionales
  `level`). Decisión "Web Audio primario, cpal futuro" + permisos de mic Tauri documentados en el
  módulo (config nativa del bundle → F16). cpal NO en esta fase (no arriesgar `cargo test`). Tests:
  audio 41 (24 pcm + 8 stream + 9 mock), desktop 58 (12 web-audio + 5 use-audio-level + nuevos de App).
  Puerta de calidad verde: typecheck/lint/test/build/prettier + `cargo test` 11. Commits:
  `9a1b61a` (pcm), `2aaf748` (stream), `cb74d85` (mock), `fb6d82f` (desktop), `7c55d18` (formato docs).
- Fase 5: OpenAI Realtime (mergeada en `main`, commit `5abc8b9`; Workflow `pass` al primer intento
  - confirmación del orquestador). `@murmur/core`: `openai-realtime.ts` (`createOpenAIRealtimeProvider`
    con WebSocket inyectable vía factory, default `globalThis.WebSocket`; URL `wss://api.openai.com/v1/realtime`
  - subprotocolos con la key —caveat de seguridad documentado, endurecimiento F12/F16—; `session.update`
    pcm16/voice/`server_vad`; `sendAudio`→append base64, `commit`→commit+`response.create`, `interrupt`→cancel+clear,
    `close` idempotente; mapeo de estados listening→thinking→speaking→idle; audio out GA+preview; transcripts
    usuario/asistente; `error`→`ModelError`), `fake-websocket.ts` (`createFakeWebSocket`, reutilizable en F9),
    `RealtimeConnectOptions` extendida (`onUserTranscript`/`onAssistantTranscript`/`onOpen`/`instructions`).
    `@murmur/core` ahora depende de `@murmur/audio` (PCM/base64). 178 tests TS (core 39: 16 realtime + 7 fake-ws),
    cargo 11. Sin red en tests; sin keys reales. Commits `fd90847` (fake-ws), `a35e5e2` (provider).
