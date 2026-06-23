# murmur — Spec: Fase 9 (Orchestrator completo)

- **Fecha:** 2026-06-23
- **Producto:** `murmur`
- **Estado:** Aprobado, pendiente de implementación
- **Depende de:** F4 (audio/streams/mocks), F5 (realtime/FakeWebSocket), F6 (ConversationStore), F7 (RagRetriever), F8 (Summarizer/FactExtractor)

---

## 1. Resumen

Convertir el `ConversationOrchestrator` esqueleto (F0) en el **cerebro del pipeline de conversación**:
activar → capturar audio → enviar al modelo realtime → reproducir la respuesta → persistir el turno →
recuperar/guardar memoria, todo gobernando la máquina de estados (`AssistantState`). Todas las
dependencias se **inyectan** (providers de audio, provider realtime, stores, retriever, summarizer,
fact extractor), de modo que el flujo completo se testea **sin red ni hardware** con mocks. Un
`createMockRealtimeProvider` reutilizable permite dirigir los eventos del modelo en los tests.

## 2. Responsabilidades del orchestrator

1. **Sesión**: `startSession()` crea una `Session` (ConversationStore), recupera contexto (RAG) si hay
   `retriever`, y conecta el provider realtime pasándole las opciones (`apiKey/model/voice` + un
   `instructions` con el contexto — el texto de prompt definitivo es F10). Registra los callbacks.
2. **Captura**: `startListening()` arranca el `VoiceInputProvider`, itera el `AudioStream` y envía
   cada chunk PCM al `RealtimeModelSession.sendAudio`. `stopListening()` para la captura y hace
   `commit()`.
3. **Reproducción**: ante `onAudio(chunk)` del modelo, empuja el chunk a un `createPushPullStream`
   cuyo `read()` alimenta `VoiceOutputProvider.play(...)`; al terminar la respuesta, cierra el stream.
4. **Estados**: la máquina de estados se actualiza con los `onState` del modelo
   (`listening→thinking→speaking→idle`) y notifica vía `onStateChange`. `error` ante `onError`.
5. **Persistencia de turno**: `onUserTranscript` → `conversation.addMessage(role:'user')`;
   al completar la respuesta → `conversation.addMessage(role:'assistant')` con el texto acumulado de
   `onAssistantTranscript`.
6. **Interrupción (barge-in)**: `interrupt()` → `session.interrupt()` + `output.stop()`.
7. **Fin de sesión**: `endSession()` → `conversation.endSession()`; si hay `summarizer`/`factExtractor`,
   genera `session_summary` y `long_term_fact` (con `sink` → `retriever.index` cuando hay retriever,
   para que sean recuperables); cierra la sesión realtime.

## 3. Diseño (inyección)

```ts
export interface OrchestratorDeps {
  realtime: RealtimeModelProvider;
  input: VoiceInputProvider;
  output: VoiceOutputProvider;
  conversation: ConversationStore;
  connection: { apiKey: string; model: string; voice?: string };
  retriever?: RagRetriever & { index?(item): Promise<void> };
  summarizer?: SessionSummarizer;
  factExtractor?: FactExtractor;
  onStateChange?: (s: AssistantState) => void;
  onTranscript?: (e: { role: 'user' | 'assistant'; text: string }) => void;
  now?: () => number;
}
```

- Se mantiene compatibilidad con el uso de F0 (state machine): `getState()`, `reset()` y
  `onStateChange` siguen funcionando; las dependencias son opcionales salvo cuando se usa el pipeline.
  (Si se prefiere, `ConversationOrchestrator` acepta `Partial<OrchestratorDeps>` y los métodos del
  pipeline exigen las deps necesarias, lanzando un error claro si faltan.)
- `createMockRealtimeProvider()` (en `@murmur/core`): provider cuyo `connect` captura los callbacks y
  devuelve una sesión que registra `sendAudio`/`commit`/`interrupt`/`close`; expone helpers para
  emitir `state`/`audio`/`userTranscript`/`assistantTranscript`/`responseDone`/`error` desde el test.

## 4. Entregables

- `@murmur/core`: `orchestrator.ts` reescrito (pipeline completo, deps inyectadas), 
  `providers/mock-realtime.ts` (`createMockRealtimeProvider`), exports en `index.ts`.
- `@murmur/core` `package.json`: dep `@murmur/rag` (tipos de store/retriever/summarizer/fact).
- Tests de integración con todos los providers mockeados.

## 5. Criterios de aceptación

1. `pnpm install && pnpm typecheck && pnpm lint && pnpm test && pnpm build` en verde. `cargo test` intacto.
2. Compatibilidad: `new ConversationOrchestrator()` arranca en `idle`; `reset()` notifica (tests F0 siguen verdes).
3. Flujo completo (mocks): `startSession()` crea sesión y conecta el realtime con `instructions`
   (incluye el contexto del `retriever` si existe); `startListening()` envía los chunks del input al
   `sendAudio`; los `onState` del modelo conducen `listening→thinking→speaking→idle` vía `onStateChange`.
4. Reproducción: los `onAudio` del modelo llegan a `VoiceOutputProvider.play` (verificable con
   `createMemoryVoiceOutput` acumulando los bytes).
5. Persistencia: tras un turno, `ConversationStore` contiene el mensaje de usuario y el de asistente,
   en orden, con el texto de los transcripts.
6. `interrupt()` llama a `session.interrupt()` y `output.stop()`.
7. `endSession()` marca la sesión finalizada y, con `summarizer`/`factExtractor`, guarda un
   `session_summary` y los `long_term_fact` (vía `sink`/`retriever.index`).
8. Errores del modelo → estado `error` y `onError` propagado; no deja streams colgados.
9. TS strict sin `any` injustificado; ESLint y Prettier limpios. Sin red ni audio real en tests.

## 6. Fuera de alcance

Texto/persona del prompt definitivo (F10), UI de transcripción/ajustes (F11), Whisper como
transcripción alternativa (F13), wake word (F14). Aquí el `instructions` es un contexto básico que
F10 refina.
