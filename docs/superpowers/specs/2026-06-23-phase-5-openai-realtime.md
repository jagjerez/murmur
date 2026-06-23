# murmur — Spec: Fase 5 (OpenAI Realtime)

- **Fecha:** 2026-06-23
- **Producto:** `murmur`
- **Estado:** Aprobado, pendiente de implementación
- **Depende de:** Fase 0 (interfaz `RealtimeModelProvider`), Fase 4 (PCM16 24k, base64)

---

## 1. Resumen

Implementar `RealtimeModelProvider` real contra la **OpenAI Realtime API** sobre WebSocket: envío
de audio del usuario en streaming, recepción de audio y texto del asistente, y mapeo de los eventos
del servidor a `AssistantState`. El WebSocket es **inyectable** (factory) para poder testear todo el
protocolo **sin red** con un `FakeWebSocket` que simula los eventos del servidor. El audio usa el
formato canónico de la Fase 4 (PCM16 mono 24 kHz, base64). La selección de `model`/`voice`/`apiKey`
viene de la config (la cablea el orchestrator en F9); aquí se reciben como opciones de `connect`.

## 2. Decisiones confirmadas

| Tema                  | Decisión                                                                                                                                                                                                                                                                                                                      |
| --------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Endpoint              | `wss://api.openai.com/v1/realtime?model=<model>`.                                                                                                                                                                                                                                                                             |
| Auth (cross-platform) | Subprotocolos del WebSocket (válido en navegador/webview): `["realtime", "openai-insecure-api-key.<API_KEY>", "openai-beta.realtime-v1"]`. **Caveat de seguridad documentado**: expone la key al cliente; aceptable para una app local con BYO-key; el endurecimiento (token efímero / proxy nativo) se considera en F12/F16. |
| Inyección             | `createOpenAIRealtimeProvider(deps?: { webSocketFactory?: WebSocketFactory })`. Default: `globalThis.WebSocket`. `WebSocketLike` = subconjunto mínimo (`send`, `close`, `addEventListener`/`on*`, `readyState`).                                                                                                              |
| Audio in              | `sendAudio(chunk)` → `input_audio_buffer.append` con `audio` = base64(PCM16). `commit()` → `input_audio_buffer.commit` + `response.create`.                                                                                                                                                                                   |
| Audio out             | Eventos `response.output_audio.delta` (GA) **y** `response.audio.delta` (preview) → decodifica base64 → `onAudio(Uint8Array)`.                                                                                                                                                                                                |
| Texto                 | `conversation.item.input_audio_transcription.completed` → `onUserTranscript`; `response.output_audio_transcript.delta`/`response.audio_transcript.delta` → `onAssistantTranscript`.                                                                                                                                           |
| Sesión inicial        | Al abrir, enviar `session.update`: `voice`, `input_audio_format: 'pcm16'`, `output_audio_format: 'pcm16'`, `modalities: ['audio','text']`, `turn_detection: { type: 'server_vad' }`, e `instructions` opcional (placeholder; el prompt real es F10).                                                                          |
| Estados               | `speech_started`→`listening`; `speech_stopped`/`input_audio_buffer.committed`/`response.created`→`thinking`; primer delta de audio→`speaking`; `response.done`→`idle`; `error`→`onError`+`error`.                                                                                                                             |
| `interrupt()`         | `response.cancel` + `input_audio_buffer.clear` (barge-in).                                                                                                                                                                                                                                                                    |
| `close()`             | cierra el WebSocket; idempotente.                                                                                                                                                                                                                                                                                             |
| Errores               | Evento `error` del servidor o fallo de conexión → `onError(new ModelError(...))`.                                                                                                                                                                                                                                             |

## 3. Cambios de interfaz

Extender `RealtimeConnectOptions` (en `realtime-model-provider.ts`) con callbacks OPCIONALES, sin
romper consumidores:

```ts
onUserTranscript?: (text: string) => void;
onAssistantTranscript?: (textDelta: string) => void;
onOpen?: () => void;
```

## 4. Entregables

- `packages/core/src/providers/openai-realtime.ts`: `WebSocketLike`, `WebSocketFactory`,
  `createOpenAIRealtimeProvider`, y la sesión interna que implementa `RealtimeModelSession`.
- `packages/core/src/providers/fake-websocket.ts`: `createFakeWebSocket()` — registra los mensajes
  enviados (`sent`), permite emitir eventos del servidor (`emitServerEvent(obj)`), y simula `open`/
  `close`/`error`. Reutilizable por los tests de F9. Exportado desde el índice.
- Extensión de `realtime-model-provider.ts` (callbacks opcionales). Export en `index.ts`.
- Tests `openai-realtime.test.ts` (sin red).

## 5. Criterios de aceptación

1. `pnpm install && pnpm typecheck && pnpm lint && pnpm test && pnpm build` en verde. `cargo test` intacto.
2. `connect()` abre el WS con la URL y subprotocolos correctos (key en subprotocolo, nunca logueada)
   y, al `open`, envía `session.update` con voice/pcm16/turn_detection.
3. `sendAudio` envía `input_audio_buffer.append` con base64 del PCM; `commit` envía `commit` +
   `response.create`.
4. Deltas de audio del servidor (ambos nombres de evento) → `onAudio` con los bytes PCM decodificados.
5. Transiciones de estado correctas vía `onState` (listening→thinking→speaking→idle) ante la
   secuencia de eventos del servidor.
6. `onUserTranscript`/`onAssistantTranscript` se invocan con el texto correspondiente.
7. `interrupt()` envía `response.cancel`; `close()` cierra el WS y es idempotente.
8. Evento `error` del servidor → `onError(ModelError)`. Fallo de conexión → `onError`.
9. La API key NUNCA aparece en logs ni en el repo; los tests usan keys ficticias.
10. TS strict sin `any` injustificado; ESLint y Prettier limpios.

## 6. Fuera de alcance

Construcción del prompt/persona (F10), pipeline completo de conversación y persistencia (F9), UI de
transcripción (F11), token efímero/proxy de seguridad (F12/F16), Whisper fallback (F13).
