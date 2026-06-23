# murmur — Spec: Fase 8 (RAG — summaries + facts)

- **Fecha:** 2026-06-23
- **Producto:** `murmur`
- **Estado:** Aprobado, pendiente de implementación
- **Depende de:** Fase 6 (ConversationStore/MemoryStore), Fase 7 (retriever/embeddings), Fase 0 (interfaces `SessionSummarizer`/`FactExtractor`)

---

## 1. Resumen

Completar la memoria de largo plazo: un `SessionSummarizer` que resume una sesión y la guarda como
`session_summary`, y un `FactExtractor` que extrae hechos persistentes y los guarda como
`long_term_fact`. Ambos usan un LLM de chat (OpenAI chat completions) detrás de una abstracción
`ChatProvider` **inyectable**, con un mock determinista para tests sin red. Los items generados se
guardan vía el store y, opcionalmente, se indexan (embed) para ser recuperables por el retriever de
F7 — alimentando el contexto del orchestrator (F9/F10).

## 2. Decisiones confirmadas

| Tema                | Decisión                                                                                                                                                                                                                                                                                                                                                                                          |
| ------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `ChatProvider`      | `complete(messages: ChatMessage[], opts?: { temperature?; maxTokens?; responseFormat? }): Promise<string>`. `createOpenAIChatProvider({ apiKey, model?, fetchFn? })` → POST `https://api.openai.com/v1/chat/completions`, `Authorization: Bearer`, modelo por defecto `gpt-4o-mini`. Error/parse → `ModelError`. Key nunca logueada. `createMockChatProvider(responder)` determinista para tests. |
| `SessionSummarizer` | `createSessionSummarizer({ chat, conversation, sink? })`. `summarize(sessionId)`: lee los mensajes de la sesión (ConversationStore), construye un prompt de resumen, llama al chat, guarda un `MemoryItem` `type:'session_summary'` (con `sessionId`) vía `sink` y devuelve el texto. Sesión vacía → resumen vacío o nota, sin llamar al LLM (decisión documentada).                              |
| `FactExtractor`     | `createFactExtractor({ chat, sink? })`. `extract(text)`: pide al LLM una **lista JSON** de hechos atómicos; parsea de forma robusta (tolera fences ```json y texto alrededor); guarda cada hecho como `MemoryItem` `type:'long_term_fact'`; devuelve `string[]`. Sin hechos → `[]`.                                                                                                               |
| `sink`              | `sink: (item: NewMemoryItem) => Promise<void>`. Default: `store.memory.add`. F9 puede pasar `retriever.index` para que además se embeba y sea recuperable. Esto desacopla generación de indexación.                                                                                                                                                                                               |
| Tipos de memoria    | `session_summary` y `long_term_fact` de `MEMORY_TYPES` (ya definidos). IDs `randomUUID`, `now()` inyectable.                                                                                                                                                                                                                                                                                      |
| Robustez de parseo  | El `FactExtractor` no debe romperse si el LLM añade prosa o bloques de código; extrae el primer array JSON válido; si no hay, `[]` (documentado).                                                                                                                                                                                                                                                 |

## 3. Entregables

- `@murmur/rag`: `src/chat.ts` (`ChatProvider`, OpenAI + mock), `src/summarizer.ts`
  (`createSessionSummarizer`), `src/facts.ts` (`createFactExtractor`). Exports en `index.ts`. Tests sin red.

## 4. Criterios de aceptación

1. `pnpm install && pnpm typecheck && pnpm lint && pnpm test && pnpm build` en verde. `cargo test` intacto.
2. `createOpenAIChatProvider` (fetch mockeado): petición correcta (URL/`Authorization`/body con `model`+`messages`), parsea `choices[0].message.content`; error → `ModelError`; key nunca logueada. Sin red.
3. `SessionSummarizer.summarize(sessionId)`: lee los mensajes, llama al chat con ellos, guarda un `session_summary` con el `sessionId` correcto y devuelve el resumen; sesión vacía no llama al LLM.
4. `FactExtractor.extract(text)`: parsea correctamente una lista JSON de hechos (incl. con fences/prosa alrededor), guarda un `long_term_fact` por hecho, devuelve la lista; entrada sin hechos → `[]`.
5. El `sink` por defecto usa `store.memory.add`; al inyectar otro `sink` (p. ej. un spy o `retriever.index`), se invoca con los items correctos.
6. Tests deterministas con el `ChatProvider` mock; sin red; sin keys reales.
7. TS strict sin `any` injustificado; ESLint y Prettier limpios.

## 5. Fuera de alcance

Pipeline del orchestrator que dispara resumen/extracción al cerrar turno/sesión (F9), construcción
del prompt con el contexto recuperado (F10), UI de memoria (F11), retención/borrado selectivo (F12).
