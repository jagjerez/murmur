# murmur — Spec: Fase 10 (Prompt)

- **Fecha:** 2026-06-23
- **Producto:** `murmur`
- **Estado:** Aprobado, pendiente de implementación
- **Depende de:** F9 (orchestrator usa `instructions`), F7/F8 (MemoryItem/contexto), marca (persona cálida)

---

## 1. Resumen

Construir el **system prompt** (`instructions`) que murmur envía al modelo realtime: la **persona
cálida** de la marca, la **inyección del contexto** recuperado por RAG, y un **presupuesto de tokens**
que recorta el contexto sin sacrificar la persona. Se cablea al `ConversationOrchestrator` (que en F9
usaba un contexto básico). Todo puro y testeable.

## 2. Decisiones confirmadas

| Tema                 | Decisión                                                                                                                                                                                                                                                                                                                   |
| -------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Ubicación            | `@murmur/core/src/prompt.ts` (lo consume el orchestrator). Usa `MemoryItem` de `@murmur/rag` (core ya depende de rag).                                                                                                                                                                                                     |
| Persona              | `MURMUR_PERSONA`: íntima, humana, cálida, cercana; **respuestas habladas breves** y naturales; no divaga; reconoce lo que recuerda con naturalidad; tono conversacional; evita listas/markdown al hablar; responde en el idioma del usuario (es/en base). Texto en español por defecto, parametrizable por `locale`.       |
| Estimación de tokens | `estimateTokens(text)` heurística (~`ceil(chars/4)`), monótona. Suficiente para presupuestar sin dependencias de tokenizer.                                                                                                                                                                                                |
| Formato de contexto  | `formatContext(items, { tokenBudget })`: ordena por relevancia/tipo/recencia (`long_term_fact` y `explicit_user_memory` priorizados, luego `session_summary`, luego `short_term`), formatea como un bloque "Lo que recuerdo…" y **trunca al presupuesto** (descarta primero lo menos relevante). Sin items → bloque vacío. |
| Construcción         | `buildSystemPrompt({ context, persona?, locale?, tokenBudget? })` → string = persona + (bloque de contexto si cabe). La **persona nunca se trunca**; el presupuesto se aplica solo al contexto. `tokenBudget` por defecto razonable (p. ej. 1500).                                                                         |
| Cableado             | El orchestrator `startSession` usa `buildSystemPrompt` con los items recuperados por el `retriever` como `instructions`.                                                                                                                                                                                                   |

## 3. Entregables

- `@murmur/core`: `src/prompt.ts` (`MURMUR_PERSONA`, `estimateTokens`, `formatContext`,
  `buildSystemPrompt`), export en `index.ts`. `orchestrator.ts` usa `buildSystemPrompt`. Tests puros + del cableado.

## 4. Criterios de aceptación

1. `pnpm install && pnpm typecheck && pnpm lint && pnpm test && pnpm build` en verde. `cargo test` intacto.
2. `estimateTokens`: monótona y ~`chars/4`; `''`→0.
3. `buildSystemPrompt`: incluye la persona (marcadores de calidez/brevedad presentes) + el bloque de
   contexto cuando hay items; contexto vacío → solo persona; respeta `locale` (cambia el idioma base).
4. Presupuesto de tokens: con muchos items, el contexto se recorta para no exceder `tokenBudget`; la
   persona se conserva íntegra; se descartan primero los items menos relevantes (orden documentado).
5. `formatContext`: ordena por tipo/relevancia, etiqueta el bloque, y trunca correctamente.
6. Orchestrator: `startSession` envía un `instructions` que contiene la persona y (si hay) el contexto
   recuperado (verificado en test con `createMockRealtimeProvider` inspeccionando las options).
7. TS strict sin `any` injustificado; ESLint y Prettier limpios.

## 5. Fuera de alcance

Tokenizer exacto (BPE), few-shot/herramientas (plugins F15), UI de ajustes de persona (F11),
traducción completa de la persona a más idiomas (solo es/en base).
