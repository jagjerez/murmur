# murmur — Fase 7 (RAG embeddings + retrieval) — Plan de implementación

> REQUIRED SUB-SKILL: superpowers:subagent-driven-development / test-driven-development.
> TDD: test primero (falla) → implementación (pasa). Commit por Task con el trailer
> `Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>`.

**Goal:** Memoria semántica: `EmbeddingProvider` (OpenAI + mock), vectores en SQLite, y
`SqliteRagRetriever` por similitud coseno. Repo en verde, tests sin red.

**Spec:** `docs/superpowers/specs/2026-06-23-phase-7-rag-retrieval.md`.

**Convenciones:** TS strict ESM; `ModelError` de `@murmur/shared`; sin red en tests; sin deps nuevas
(usa `globalThis.fetch`); SQL con parámetros vinculados.

---

## Task 1: `vector.ts` (coseno + serialización)

**Files:** `packages/rag/src/vector.ts` (+ `vector.test.ts`).

- [ ] Tests (fallan): `cosineSimilarity` idénticos→1, ortogonales→0, opuestos→−1; longitudes
      distintas → error o 0 (decide y documenta). `float32ToBytes`/`bytesToFloat32` round-trip exacto.
- [ ] Implementar (Float32Array/DataView). Commit: `feat(rag): utilidades de vector (coseno + serde)`.

## Task 2: Providers de embedding (`embeddings.ts`)

**Files:** `packages/rag/src/embeddings.ts` (+ `embeddings.test.ts`), export en `index.ts`.

- [ ] `createMockEmbeddingProvider({ dim? })`: determinista (hash estable de tokens → vector
      normalizado de `dim` dims, default p. ej. 64). `createOpenAIEmbeddingProvider({ apiKey, model?, fetchFn? })`:
      POST a `/v1/embeddings`, `Authorization: Bearer`, body `{model, input}`, parsea `data[].embedding`;
      error → `ModelError`.
- [ ] Tests (fallan→pasan): mock determinista (mismo texto→mismo vector, normalizado; distinto→distinto);
      OpenAI con `fetchFn` mock: verifica URL/headers/body y parseo; respuesta de error → `ModelError`;
      la key no aparece en ningún log.
- [ ] Commit: `feat(rag): EmbeddingProvider OpenAI + mock determinista`.

## Task 3: Almacenamiento de vectores (extensión del store SQLite)

**Files:** `packages/rag/src/sqlite/db.ts` (migración v2), `packages/rag/src/sqlite/embeddings-store.ts`
o ampliar `memory-store.ts`/`index.ts` (+ tests).

- [ ] Migración: `embeddings(memory_item_id PK FK ON DELETE CASCADE, model, dim, vector BLOB)`;
      `user_version = 2`; idempotente; preserva datos de v1.
- [ ] Métodos en el store: `upsertEmbedding(id, vector, model)`, `getEmbedding(id)`,
      `allEmbeddings(model?)` → `{ id, vector: Float32Array }[]`. `createSqliteStore` los expone.
- [ ] Tests (fallan→pasan): upsert/get/all; cascade (borrar memory item borra embedding); migración
      v2 sobre una db v1 con datos conserva los datos y añade la tabla.
- [ ] Commit: `feat(rag): almacenamiento de embeddings en SQLite (migración v2)`.

## Task 4: `SqliteRagRetriever` (`retriever.ts`)

**Files:** `packages/rag/src/sqlite/retriever.ts` (+ `retriever.test.ts`), export en `index.ts`.

- [ ] `createSqliteRagRetriever({ store, embeddings, model? })` → `RagRetriever`:
      `index(item)` añade el item y guarda su embedding; `retrieve(query, { limit })` embebe la query,
      puntúa coseno contra `allEmbeddings(model)`, ordena desc y devuelve los `MemoryItem` top-k;
      `retrieveScored` opcional con `{ item, score }`.
- [ ] Tests (fallan→pasan): indexar 3–4 items, `retrieve` devuelve el más similar primero y respeta
      `limit`; query sin coincidencias devuelve [] o los menos disímiles (documenta); usa el mock.
- [ ] Export en `index.ts`. Commit: `feat(rag): SqliteRagRetriever por similitud coseno`.

## Task 5: Verificación de fase

- [ ] `pnpm install && pnpm typecheck && pnpm lint && pnpm test && pnpm build` verde.
- [ ] `cd packages/native && cargo test` verde. `pnpm exec prettier --check .` limpio.
- [ ] `git grep -nE "sk-[A-Za-z0-9]{6,}"` solo ficticias. Criterios del spec §4.

---

## Self-Review (mapeo spec → tasks)

- §2 vectores → Task 1. providers → Task 2. almacenamiento → Task 3. retriever → Task 4. §4 → Task 5.
