# murmur — Fase 8 (RAG summaries + facts) — Plan de implementación

> REQUIRED SUB-SKILL: superpowers:subagent-driven-development / test-driven-development.
> TDD: test primero (falla) → implementación (pasa). Commit por Task con el trailer
> `Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>`.

**Goal:** `SessionSummarizer` + `FactExtractor` sobre un `ChatProvider` inyectable (OpenAI + mock),
que guardan memoria de largo plazo. Repo en verde, tests sin red.

**Spec:** `docs/superpowers/specs/2026-06-23-phase-8-rag-summaries-facts.md`.

**Convenciones:** TS strict ESM; `ModelError` de `@murmur/shared`; sin red en tests; sin deps nuevas
(`globalThis.fetch`); reutiliza `MEMORY_TYPES`/`NewMemoryItem`/stores de F6-F7.

---

## Task 1: `ChatProvider` (`chat.ts`)

**Files:** `packages/rag/src/chat.ts` (+ `chat.test.ts`), export en `index.ts`.

```ts
export interface ChatMessage { role: 'system' | 'user' | 'assistant'; content: string; }
export interface ChatProvider { complete(messages: ChatMessage[], opts?: { temperature?: number; maxTokens?: number }): Promise<string>; }
export function createOpenAIChatProvider(cfg: { apiKey: string; model?: string; fetchFn?: typeof fetch }): ChatProvider;
export function createMockChatProvider(responder: (messages: ChatMessage[]) => string): ChatProvider;
```

- [ ] Tests (fallan→pasan): OpenAI con `fetchFn` mock → URL `/v1/chat/completions`, `Authorization: Bearer`,
  body `{model, messages}`; parsea `choices[0].message.content`; error HTTP/parse → `ModelError`; key no
  logueada. Mock determinista llama al `responder`.
- [ ] Commit: `feat(rag): ChatProvider OpenAI + mock`.

## Task 2: `SessionSummarizer` (`summarizer.ts`)

**Files:** `packages/rag/src/summarizer.ts` (+ `summarizer.test.ts`), export en `index.ts`.

- [ ] `createSessionSummarizer({ chat, conversation, sink?, now? })` → `SessionSummarizer`.
  `summarize(sessionId)`: `conversation.getMessages(sessionId)`; si vacío, no llama al LLM (devuelve
  '' o nota); si no, construye `ChatMessage[]` (system de resumen + transcript) → `chat.complete` →
  guarda `MemoryItem { type:'session_summary', content, sessionId }` vía `sink` (default `store.memory.add`)
  → devuelve el texto.
- [ ] Tests (fallan→pasan): con mensajes, llama al chat y guarda un `session_summary` con `sessionId`
  correcto + devuelve el resumen; sesión vacía no llama al chat; `sink` inyectado recibe el item.
- [ ] Commit: `feat(rag): SessionSummarizer`.

## Task 3: `FactExtractor` (`facts.ts`)

**Files:** `packages/rag/src/facts.ts` (+ `facts.test.ts`), export en `index.ts`.

- [ ] `createFactExtractor({ chat, sink?, now? })` → `FactExtractor`. `extract(text)`: prompt que pide
  un array JSON de hechos atómicos; parseo ROBUSTO (extrae el primer array JSON válido aunque venga
  con fences ```json o prosa; si no hay array, `[]`); guarda cada hecho como `long_term_fact`; devuelve `string[]`.
- [ ] Tests (fallan→pasan): respuesta `["a","b"]` → 2 facts guardados + devueltos; respuesta con fences
  y prosa alrededor → parsea igual; respuesta sin JSON → `[]` (no lanza); `sink` inyectado recibe los items.
- [ ] Commit: `feat(rag): FactExtractor con parseo robusto de JSON`.

## Task 4: Verificación de fase

- [ ] `pnpm install && pnpm typecheck && pnpm lint && pnpm test && pnpm build` verde.
- [ ] `cd packages/native && cargo test` verde. `pnpm exec prettier --check .` limpio.
- [ ] Sin keys reales. Criterios del spec §4.

---

## Self-Review (mapeo spec → tasks)

- §2 ChatProvider → Task 1. SessionSummarizer → Task 2. FactExtractor → Task 3. §4 → Task 4.
- `sink` desacopla generación de indexación (F9 inyectará `retriever.index`).
