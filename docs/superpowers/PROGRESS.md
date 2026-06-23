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
| 6    | SQLite (MemoryStore persistente, sesiones/mensajes/memoria, migraciones)                                 | ✅ COMPLETA (en `main`) |
| 7    | RAG embeddings + retrieval (EmbeddingProvider, vectores en SQLite, RagRetriever)                         | ✅ COMPLETA (en `main`) |
| 8    | RAG summaries + facts (SessionSummarizer, FactExtractor, alimenta contexto)                              | ✅ COMPLETA (en `main`) |
| 9    | Orchestrator completo (hotkey→captura→modelo→contexto→respuesta→persistir)                               | ✅ COMPLETA (en `main`) |
| 10   | Prompt (persona cálida, construcción de contexto RAG, presupuesto de tokens)                             | ✅ COMPLETA (en `main`) |
| 11   | UI avanzada (onboarding, ajustes, estados de error/vacío, transcripción)                                 | ✅ COMPLETA (en `main`) |
| 12   | Privacidad (modo local, retención, borrado/exportación, memoria explícita)                               | ✅ COMPLETA (en `main`) |
| 13   | Whisper (TranscriptionProvider local/whisper-api como fallback)                                          | ✅ COMPLETA (en `main`) |
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
- Fase 6: SQLite (mergeada en `main`, commit `28eda98`; Workflow `pass` + smoke del binario por el
  orquestador). Motor **`node:sqlite`** (Node 26, cero deps, sin build nativo). `@murmur/rag/src/sqlite/`:
  `db.ts` (`openDatabase`/`migrate` idempotente, `user_version`, FKs + `ON DELETE CASCADE`, índices),
  `SqliteMemoryStore` (interfaz `MemoryStore` + `getByType`/`recent`/`get`/`delete`/`count`, valida type
  → `MemoryError`), `ConversationStore` (sesiones/mensajes con `Session`/`Message`/`Role`), `createSqliteStore`
  (`{memory,conversation,reset,close,path}`). CLI: `memory reset --yes` borra de verdad, `status` muestra
  conteo; `storeFactory` inyectable. **Bug de empaquetado corregido**: `tsup removeNodeProtocol:true`
  reescribía `node:sqlite`→`sqlite` rompiendo el binario en runtime (invisible a Vitest, que corre el
  fuente) → `removeNodeProtocol:false` en `tsup.config.ts` de rag y cli, verificado con el binario.
  202 tests TS (rag 26, cli 32), cargo 11. IDs `randomUUID`, `now()` inyectable, tests con `:memory:`/temp.
- Fase 7: RAG embeddings + retrieval (mergeada en `main`, commit `f049245`; Workflow `pass` al
  primer intento + confirmación del orquestador). `@murmur/rag`: `vector.ts` (`cosineSimilarity`
  idénticos→1/ortogonales→0/opuestos→−1/cero→0; `float32ToBytes`/`bytesToFloat32` LE), `embeddings.ts`
  (`createOpenAIEmbeddingProvider` POST `/v1/embeddings` con `fetchFn` inyectable, `text-embedding-3-small`,
  error→`ModelError`, key no logueada; `createMockEmbeddingProvider` determinista FNV-1a normalizado),
  tabla `embeddings` (migración **v2** idempotente que preserva v1, FK `ON DELETE CASCADE`) con
  `upsertEmbedding`/`getEmbedding`/`allEmbeddings`, y `createSqliteRagRetriever` (`index`/`retrieve`
  top-k por coseno, `retrieveScored`, filtra por modelo). 253 tests TS (rag 74), cargo 11. Sin red,
  SQL parametrizada. NITs no bloqueantes: input vacío en embed, skip silencioso si vector undefined.
- Fase 8: RAG summaries + facts (mergeada en `main`, commit `0cac448`; Workflow `pass` al primer
  intento + confirmación del orquestador). `@murmur/rag`: `chat.ts` (`ChatProvider`;
  `createOpenAIChatProvider` POST `/v1/chat/completions`, default `gpt-4o-mini`, `fetchFn` inyectable,
  error→`ModelError`, key no logueada; `createMockChatProvider`), `summarizer.ts`
  (`createSessionSummarizer.summarize(sessionId)`: lee mensajes, sesión vacía no llama al LLM, guarda
  `session_summary` vía `sink`), `facts.ts` (`createFactExtractor.extract(text)`: parser robusto de array
  JSON con escáner de corchetes que respeta strings/escapes, tolera fences/prosa, sin array→[], guarda
  `long_term_fact`). `sink` desacopla generación de indexación (F9 inyectará `retriever.index`). 99 rag
  tests, cargo 11. Drift menor no bloqueante: `responseFormat` mencionado en el spec pero no implementado
  (no exigido; el parseo robusto no lo necesita).
- Fase 9: Orchestrator completo (mergeada en `main`, commit `fa49256`; Workflow `pass` al primer
  intento + confirmación del orquestador; commits `365fc6f` mock-realtime, `f3e4959`
  pipeline). `@murmur/core`: `providers/mock-realtime.ts`
  (`createMockRealtimeProvider`: `connect` captura options/callbacks; sesión registra
  `sentAudio`/`commits`/`interrupts`/`closes`; helpers `emitState`/`emitAudio`/`emitUserTranscript`/
  `emitAssistantTranscript`/`emitResponseDone`/`emitError`). `orchestrator.ts` REESCRITO:
  `ConversationOrchestrator` con `Partial<OrchestratorDeps>` (realtime/input/output/conversation/
  connection + retriever/summarizer/factExtractor opcionales + onStateChange/onTranscript/onError/now).
  Compat F0 intacta (idle/reset). Pipeline: `startSession` (createSession + RAG context→instructions +
  realtime.connect), `startListening`/`stopListening` (input.read→sendAudio; commit), salida vía
  `createPushPullStream`→`output.play` por respuesta, persistencia de turno (user en onUserTranscript,
  assistant acumulado en onState idle), `interrupt` (session.interrupt+output.stop), `endSession`
  (endSession + summarizer/factExtractor→`retriever.index` + session.close), `flush()` para sincronizar
  reproducción en tests. Añadida dep `@murmur/rag` a core (sin ciclo). GOTCHA: el orchestrator se bundlea
  en el webview del desktop, así que NO usa `node:crypto`; usa `globalThis.crypto.randomUUID()`
  (Web Crypto, Node>=19 y browser) — `node:crypto` rompía el `vite build` del desktop. 60 core tests
  (15 orchestrator + 8 mock-realtime), 299 TS total, cargo 11. Sin red ni hardware en tests.
  NITs de robustez (seguimiento en F11, cuando el orchestrator se cablea en cli/desktop): `interrupt()`
  debería limpiar `assistantBuffer` (evitar persistir respuesta cancelada tras barge-in); encadenar la
  promesa de `playback` en multi-turno; documentar el contrato fire-and-forget de `startListening`.
- Fase 10: Prompt (mergeada en `main`, commit `4df2467`; Workflow `pass` al primer intento +
  confirmación del orquestador). `@murmur/core/src/prompt.ts`: `MURMUR_PERSONA`/`getPersona(locale)`
  (cálida/íntima/breve, sin listas al hablar, idioma del usuario es/en), `estimateTokens` (~ceil(chars/4),
  monótona), `formatContext` (orden por tipo `long_term_fact`/`explicit_user_memory`→`session_summary`→
  `short_term` + recencia; bloque "Lo que recuerdo…"; trunca al `tokenBudget`), `buildSystemPrompt`
  (persona nunca truncada + contexto si cabe; budget default 1500). `orchestrator.startSession` ahora
  usa `buildSystemPrompt` (dep opcional `locale`). 80 core tests (prompt 17 + orchestrator 18). El
  agente respetó la instrucción de no tocar el tracker. NIT: truncado voraz (intencional).
- Fase 11: UI avanzada (mergeada en `main`, commit `5f64b28`; Workflow `pass` al primer intento +
  confirmación del orquestador). `apps/desktop`: `ConfigClient` (mock + Tauri, key nunca expuesta),
  `Onboarding`/`Settings`/`ErrorState`/`Transcript` (RTL + accesibilidad real, `:focus-visible`,
  `role=alert`/`aria-live`), `use-murmur.ts` + `App.tsx` shell (sin key→onboarding; con key→cápsula+
  ajustes; hotkey dispara captura; cápsula refleja `onStateChange`). Comandos Rust `config.rs`
  (`get_config`/`set_config`/`set_openai_key`, con tests cargo internos fuera del pipeline nativo).
  Fixes de robustez del orchestrator aplicados (interrupt limpia `assistantBuffer`, playback encadenado,
  contrato `startListening` documentado). 369 tests TS (desktop 108, core 83), cargo 11. NITs no
  bloqueantes: selector de micro inerte (sin campo en config); tests Rust de `config.rs` fuera de CI.
- Fase 12: Privacidad (mergeada en `main`, commit `396f866`; Workflow `pass` al primer intento).
  `@murmur/shared` `redactSensitive` ([email]/[clave]/[número], pura/idempotente); store
  `pruneOlderThan(beforeMs)` (memoria+mensajes+sesiones, cascada embeddings) + `exportAll()`;
  `MurmurConfig.privacy` (`localOnlyMode`/`storeTranscripts`/`redactBeforeStore`/`retentionDays`) +
  `config set-privacy`; subcomandos `memory list/add/forget/export/prune`; el orchestrator honra los
  flags (sin contexto RAG en local; no persiste/redacta según config). 415 tests TS (shared 13, rag
  106, cli 52, core 89). NITs: redacción no cubre dígitos con separadores; prune más estricto que el texto.
- Fase 13: Whisper (mergeada en `main`, commit `b6f3fcd`; Workflow `pass` al primer intento, sin
  issues). `@murmur/core/src/providers/whisper.ts`: `createOpenAIWhisperProvider` (POST
  `/v1/audio/transcriptions`, FormData file+model, `fetchFn` inyectable, error→`ModelError`, key no
  logueada), `createLocalWhisperProvider` (`run` inyectable; binario no empaquetado), `createMock…`,
  `selectTranscriptionProvider`. CLI: `MurmurConfig.transcription` (default `realtime`) +
  `config set-transcription` validado. 443 tests TS (core 107, cli 62). Nota: `TranscriptionMode`
  duplicado en cli/config.ts (cli no depende de core) — sincronizar si divergen.
