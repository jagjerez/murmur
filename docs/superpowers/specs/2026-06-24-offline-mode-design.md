# murmur — Spec: Modo offline (STT + LLM + TTS locales)

- **Fecha:** 2026-06-24
- **Producto:** `murmur`
- **Estado:** Aprobado (ejecución autónoma solicitada por el usuario), pendiente de implementación
- **Depende de:** F4 (audio: captura/reproducción + PCM16), F8 (`ChatProvider` en `@murmur/rag`), F9/F10 (orchestrator + prompt), F13 (`TranscriptionProvider`)
- **Contexto:** hoy la conversación en vivo es **voz→voz por OpenAI Realtime** (una sola pieza). El modo offline reconstruye ese loop **por turnos** con tres piezas locales, manteniendo la nube como modo por defecto.

---

## 1. Resumen

Añadir a murmur un **modo offline** que no dependa de la nube para conversar:

```
🎙 captura → [STT local] → texto → [LLM local] → texto → [TTS local] → 🔊 reproducción
```

Se reutilizan las costuras existentes (todas inyectables): `TranscriptionProvider` (STT),
`ChatProvider` de `@murmur/rag` (LLM), `VoiceInputProvider`/`VoiceOutputProvider` (audio), prompt
(`buildSystemPrompt`) y memoria/RAG (`ConversationStore`, summarizer, facts). Se añade **una** interfaz
nueva (`TextToSpeechProvider`) y un **orquestador por turnos** (`OfflineConversationOrchestrator`).

**Frontera honesta (no negociable):** los pesos (LLM, whisper large-v3) y los motores (Ollama, Piper,
whisper.cpp) **viven en la máquina del usuario** y se **auto-descargan**; NO se commitea ningún modelo
al repo. Toda la lógica se construye y verifica con **mocks y modelos pequeños**; los motores nativos
van **detrás de feature flags** para no romper el `cargo test`/CI por defecto. El modo offline pide
hardware capaz (~8–16 GB RAM, mejor con GPU/Apple Silicon); la **nube sigue siendo el default**.

## 2. Decisiones de motor (fijadas)

| Pieza | Motor                                                                                | Encaje                                                                      |
| ----- | ------------------------------------------------------------------------------------ | --------------------------------------------------------------------------- |
| STT   | **whisper.cpp vía `whisper-rs`** (Rust, en `packages/native` tras feature `whisper`) | comando Tauri `transcribe`; el `run` del `local-whisper` provider lo invoca |
| LLM   | **Ollama por HTTP** (`createOllamaChatProvider`)                                     | implementa `ChatProvider`; `fetch` inyectable; sin build nativa             |
| TTS   | **Piper** por subproceso (`run` inyectable)                                          | nueva interfaz `TextToSpeechProvider`; el desktop aporta el `run`           |
| Loop  | `OfflineConversationOrchestrator` (nuevo, por turnos) en `@murmur/core`              | reutiliza audio/RAG/prompt/memoria                                          |
| Modo  | config `mode` (`cloud` / `offline`)                                                  | la app elige orquestador realtime vs offline                                |

## 3. Roadmap (fases R1–R5)

| Fase   | Entrega                                                                                                                                                     | Verificable ahora                                    | Artefacto externo |
| ------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------- | ----------------- |
| **R1** | Arquitectura offline: interfaz `TextToSpeechProvider` (+ mock), `OfflineConversationOrchestrator` (loop por turnos), selección de modo. **Todo con mocks.** | ✅ entero, sin modelos                               | —                 |
| **R2** | STT local: `whisper-rs` (feature `whisper`) + comando Tauri + adaptador `run` (resample 24k→16k, pcm16→f32) + auto-descarga del modelo                      | ✅ integración; verifico mecanismo con modelo `tiny` | whisper large-v3  |
| **R3** | LLM local: `createOllamaChatProvider` (HTTP `/api/chat`, `fetch` inyectable)                                                                                | ✅ con `fetch` mock                                  | LLM en Ollama     |
| **R4** | TTS local: `createPiperTtsProvider({ run })` (PCM16) + comando Tauri (shell a piper)                                                                        | ✅ con `run` mock                                    | voz Piper         |
| **R5** | Gestión de modelos (descarga/caché/selección en `~/.murmur/models/`), config de modo, wiring en la app, docs + requisitos                                   | ✅                                                   | —                 |

**Orden:** R1 → (R2, R3, R4) → R5. R1 de-riesga todo (define las costuras y el loop, verificado con mocks).

## 4. Componentes y contratos

### 4.1 `TextToSpeechProvider` (nuevo, `@murmur/core`)

```ts
export interface TextToSpeechProvider {
  /** Sintetiza texto a PCM16 mono 24 kHz (formato canónico F4), listo para reproducir. */
  synthesize(text: string): Promise<Uint8Array>;
}
export function createMockTextToSpeechProvider(pcm?: Uint8Array): TextToSpeechProvider; // determinista
```

### 4.2 `OfflineConversationOrchestrator` (nuevo, `@murmur/core`)

Deps inyectables (todas mockeables): `input: VoiceInputProvider`, `transcription: TranscriptionProvider`,
`chat: ChatProvider`, `tts: TextToSpeechProvider`, `output: VoiceOutputProvider`, `conversation: ConversationStore`,
`retriever?`, `summarizer?`, `factExtractor?`, `privacy?`, `locale?`, `onStateChange?`, `onTranscript?`,
`onError?`, `now?`.

Flujo de un turno (`startListening`/`stopListening`, mismo contrato fire-and-forget que el realtime):

1. `startListening`: captura audio del `input` (acumula PCM), estado `listening`.
2. `stopListening`: para captura → estado `thinking` → `transcription.transcribe(pcm)` → `userText`.
3. Persistir turno de usuario (honra privacidad) + emitir `onTranscript`.
4. Construir `ChatMessage[]`: system (`buildSystemPrompt` con contexto RAG si hay retriever y no es modo local-privado) + historial de la sesión + turno del usuario.
5. `chat.complete(messages)` → `assistantText`. Persistir + emitir transcript.
6. Estado `speaking` → `tts.synthesize(assistantText)` → `output.play(asyncIterableDe(pcm))` → estado `idle`.

`endSession`: igual que el realtime — `summarizer`/`factExtractor` → `retriever.index`. Errores de cualquier
etapa → estado `error` + `onError` (sin romper la sesión). Compat: `new OfflineConversationOrchestrator()` arranca en `idle`.

### 4.3 `createOllamaChatProvider` (`@murmur/rag`, R3)

`POST {endpoint}/api/chat` con `{ model, messages, stream:false }`; parsea `message.content`. `endpoint`
default `http://localhost:11434`; `fetchFn` inyectable; errores → `ModelError` sin filtrar nada sensible.

### 4.4 STT local (R2)

- `packages/native` feature `whisper`: fn `transcribe(samples: &[f32]/* 16k mono */, model_path) -> String` con `whisper-rs`.
- `apps/desktop/src-tauri`: comando Tauri `transcribe(pcm16_24k: Vec<u8>) -> String` (resample + f32 + cachea el modelo).
- Desktop: `run` que envuelve `invoke('transcribe', …)` → se pasa a `selectTranscriptionProvider('local-whisper', { run })`.

### 4.5 TTS local (R4)

- `createPiperTtsProvider({ run })` donde `run(text) => Promise<Uint8Array>` (PCM16). El desktop aporta `run`
  vía un comando Tauri que ejecuta el binario `piper` (shell) y devuelve PCM (resample a 24k si hace falta).

### 4.6 Gestión de modelos + modo (R5)

- `MurmurConfig.mode: 'cloud' | 'offline'` (+ `config set-mode`); rutas de modelos en `~/.murmur/models/`.
- Descargador (`murmur models download <whisper|llm>` o auto en primer uso, con confirmación por tamaño) que baja a `~/.murmur/models/` y NO commitea nada.
- La app elige `OfflineConversationOrchestrator` cuando `mode==='offline'`, si no el realtime.

## 5. Criterios de aceptación

1. Puerta de calidad verde por defecto: `pnpm typecheck && pnpm lint && pnpm test && pnpm build && pnpm exec prettier --check .` y `cargo test` (con la feature `whisper` **desactivada** por defecto, para no exigir cmake en el gate normal).
2. **R1:** `OfflineConversationOrchestrator` completa un turno end-to-end con providers mock (input→STT→chat→TTS→output), persiste usuario+asistente, emite estados `listening→thinking→speaking→idle`, e indexa memoria en `endSession`. `TextToSpeechProvider` + mock testeados.
3. **R3:** `createOllamaChatProvider` hace el POST correcto y parsea la respuesta, con `fetch` mock; errores → `ModelError`.
4. **R2:** el adaptador `run` (resample 24k→16k + pcm16→f32) y el cableado del `local-whisper` provider están testeados con mocks; el módulo `whisper` de Rust compila tras la feature y hay un test de humo (con modelo `tiny` si el entorno lo permite, si no documentado).
5. **R4:** `createPiperTtsProvider` con `run` mock devuelve PCM y se integra en el loop.
6. **R5:** `mode` en config + `config set-mode` validado; el descargador escribe en `~/.murmur/models/` (verificado con un artefacto pequeño/mock de red); la app selecciona el orquestador por modo; README documenta requisitos del modo offline.
7. TS strict sin `any` injustificado; ESLint/Prettier limpios; sin secretos ni modelos en el repo.

## 6. Pruebas (TDD, sin red ni modelos)

Todo se prueba con mocks: `createMockVoiceInput`/`createMemoryVoiceOutput`, `createMockTranscriptionProvider`,
`createMockChatProvider`, `createMockTextToSpeechProvider`, `fetch` mock (Ollama), `run` mock (whisper/piper),
store SQLite `:memory:`. El módulo nativo `whisper` se compila solo bajo su feature; su smoke test no entra
en el `cargo test` por defecto.

## 7. Fuera de alcance (documentado)

- Empaquetar/commitear modelos (LLM, whisper) o binarios (Ollama, Piper) — son del usuario, auto-descargados/instalados.
- Function-calling (tools) en el loop offline — posible más adelante reutilizando `dispatchTool`; no en R1–R5.
- Streaming token-a-token del LLM y del TTS (v1 es por turnos completos).
- Wake word real (track aparte: openWakeWord con frase preentrenada, ya decidido).
- Builds nativas firmadas / publish (cubierto por `release.yml`).
