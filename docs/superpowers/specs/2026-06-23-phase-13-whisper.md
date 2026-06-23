# murmur — Spec: Fase 13 (Whisper — transcripción alternativa)

- **Fecha:** 2026-06-23
- **Producto:** `murmur`
- **Estado:** Aprobado, pendiente de implementación
- **Depende de:** F0 (`TranscriptionProvider`/`TranscriptionMode`), F1 (config), F5 (realtime)

---

## 1. Resumen

Implementar la transcripción **alternativa** a la del realtime: un `TranscriptionProvider` sobre la
**Whisper API de OpenAI** (`whisper-api`) y un **whisper local** (`local-whisper`) detrás de un
ejecutor inyectable, además de un mock. Un selector elige el provider según `config.transcription`.
El camino por defecto sigue siendo el realtime (F5), que ya transcribe; whisper es el fallback/opción
para flujos sin realtime o cuando se configura. Tests sin red (HTTP y ejecutor mockeados).

## 2. Decisiones confirmadas

| Tema | Decisión |
| ---- | -------- |
| Interfaz | La de F0: `TranscriptionProvider { readonly mode: TranscriptionMode; transcribe(audio: Uint8Array): Promise<string> }`, `TranscriptionMode = 'realtime' \| 'whisper-api' \| 'local-whisper'`. |
| whisper-api | `createOpenAIWhisperProvider({ apiKey, model?, fetchFn?, format? })`: POST `https://api.openai.com/v1/audio/transcriptions`, multipart `FormData` con `file` (Blob de los bytes, p. ej. `audio/wav`) + `model` (default `whisper-1`); parsea `{ text }`. `fetchFn` inyectable (default `globalThis.fetch`). Error HTTP/parse → `ModelError`. Key nunca logueada. mode `'whisper-api'`. |
| local-whisper | `createLocalWhisperProvider({ run })`: `run(audio) => Promise<string>` es **inyectable** (en producción invoca un binario/modelo whisper local configurable; se documenta que el binario/modelo no se empaqueta aquí — F16 o instalado por el usuario). mode `'local-whisper'`. Sin `run` → error claro. |
| mock | `createMockTranscriptionProvider(text, mode?)` determinista para tests/orchestrator. |
| Selector | `selectTranscriptionProvider(mode, deps)` → el provider adecuado; `'realtime'` no hace transcripción aparte (la hace el realtime) → devuelve un provider que lanza o un no-op documentado. |
| Config | `MurmurConfig.transcription: TranscriptionMode` (default `'realtime'`), normalizada en `ConfigStore`; `config`/`status` la muestran; `config set-transcription <mode>` la fija (valida el enum). |
| Audio | Reutiliza el PCM16 de F4; para whisper-api se envuelve en un contenedor mínimo (WAV) o se envía como bytes con el `content-type` apropiado (decisión documentada en el módulo). |

## 3. Entregables

- `@murmur/core`: `src/providers/whisper.ts` (`createOpenAIWhisperProvider`, `createLocalWhisperProvider`,
  `createMockTranscriptionProvider`, `selectTranscriptionProvider`), export en `index.ts`. Tests sin red.
- `@murmur/cli`: `transcription` en `MurmurConfig`/`ConfigStore` + `config set-transcription` + muestra en `config`/`status` (+ tests).
- Documentación breve de cómo enchufar el whisper local (binario/modelo, fuera del pipeline).

## 4. Criterios de aceptación

1. `pnpm install && pnpm typecheck && pnpm lint && pnpm test && pnpm build` en verde. `cargo test` intacto.
2. `createOpenAIWhisperProvider` (fetch mockeado): hace la petición multipart correcta (URL,
   `Authorization`, `FormData` con `file`+`model`), parsea `{ text }`; error → `ModelError`; sin red; key no logueada.
3. `createLocalWhisperProvider`: usa el `run` inyectado y devuelve su texto; sin `run` → error claro.
4. `createMockTranscriptionProvider`: devuelve el texto dado; `mode` correcto.
5. `selectTranscriptionProvider`: para `'whisper-api'`/`'local-whisper'`/`'realtime'` devuelve el provider
   esperado (o el comportamiento documentado para realtime).
6. `ConfigStore`: `transcription` con default `'realtime'`, validada; `config set-transcription whisper-api`
   persiste; valor inválido → error.
7. TS strict sin `any` injustificado; ESLint y Prettier limpios; sin keys reales.

## 5. Fuera de alcance

Empaquetar el binario/modelo de whisper local (F16/usuario), integrar el fallback automático realtime→whisper
en el orchestrator (se deja el provider listo y seleccionable; el cableado fino es opcional/futuro), diarización.
