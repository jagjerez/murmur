# murmur — Fase 10 (Prompt) — Plan de implementación

> REQUIRED SUB-SKILL: superpowers:subagent-driven-development / test-driven-development.
> TDD: test primero (falla) → implementación (pasa). Commit por Task con el trailer
> `Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>`.

**Goal:** System prompt de murmur: persona cálida + contexto RAG + presupuesto de tokens, cableado
al orchestrator. Repo en verde.

**Spec:** `docs/superpowers/specs/2026-06-23-phase-10-prompt.md`.

**Convenciones:** TS strict ESM; puro y testeable; reutiliza `MemoryItem`/`MEMORY_TYPES` de `@murmur/rag`.

---

## Task 1: `prompt.ts` (persona, tokens, contexto, builder)

**Files:** `packages/core/src/prompt.ts` (+ `prompt.test.ts`), export en `index.ts`.

```ts
export const MURMUR_PERSONA: string; // y/o getPersona(locale)
export function estimateTokens(text: string): number; // ~ceil(chars/4)
export function formatContext(items: MemoryItem[], opts?: { tokenBudget?: number }): string;
export function buildSystemPrompt(opts: {
  context?: MemoryItem[];
  persona?: string;
  locale?: 'es' | 'en';
  tokenBudget?: number;
}): string;
```

- [ ] Tests (fallan→pasan): `estimateTokens('')===0`, monótona, ~chars/4; `buildSystemPrompt` con
  persona+contexto contiene marcadores de persona (calidez/brevedad) y el bloque "recuerdo"; contexto
  vacío → solo persona; `locale:'en'` cambia el idioma base; presupuesto recorta el contexto (no la
  persona) y descarta primero lo menos relevante; `formatContext` ordena por tipo/relevancia.
- [ ] Implementar `prompt.ts` (persona en es/en; orden `long_term_fact`/`explicit_user_memory` →
  `session_summary` → `short_term`; truncado por presupuesto contando `estimateTokens`).
- [ ] Export en `index.ts`. Commit: `feat(core): system prompt con persona, contexto y presupuesto`.

## Task 2: Cableado en el orchestrator

**Files:** `packages/core/src/orchestrator.ts`, `packages/core/src/orchestrator.test.ts`.

- [ ] `startSession`: construir `instructions` con `buildSystemPrompt({ context: retrievedItems, locale? })`
  en lugar del contexto básico de F9. Mantener todo lo demás (tests F9 verdes).
- [ ] Test: `startSession` con un `retriever` mock que devuelve items → las `options` del
  `createMockRealtimeProvider` tienen `instructions` que contiene la persona y el contexto.
- [ ] `pnpm --filter @murmur/core test/typecheck/build` verde. Commit: `feat(core): el orchestrator usa buildSystemPrompt`.

## Task 3: Verificación de fase

- [ ] `pnpm install && pnpm typecheck && pnpm lint && pnpm test && pnpm build` verde.
- [ ] `cd packages/native && cargo test` verde. `pnpm exec prettier --check .` limpio.
- [ ] Criterios de aceptación del spec §4.

---

## Self-Review (mapeo spec → tasks)

- §2 persona/tokens/contexto/builder → Task 1. cableado orchestrator → Task 2. §4 → Task 3.
