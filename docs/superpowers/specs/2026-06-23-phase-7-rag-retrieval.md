# murmur — Spec: Fase 7 (RAG — embeddings + retrieval)

- **Fecha:** 2026-06-23
- **Producto:** `murmur`
- **Estado:** Aprobado, pendiente de implementación
- **Depende de:** Fase 6 (SQLite store), Fase 0 (`EmbeddingProvider`/`RagRetriever` interfaces)

---

## 1. Resumen

Añadir memoria semántica: un `EmbeddingProvider` real (OpenAI embeddings, con HTTP inyectable y un
mock determinista para tests sin red), almacenamiento de vectores en SQLite, y un `RagRetriever`
que recupera los `MemoryItem` más relevantes por **similitud coseno**. La búsqueda es un escaneo
lineal en JS (escala local; la vector DB es reemplazable detrás de `RagRetriever`). Post-MVP per el
brief, pero la infraestructura se construye aquí.

## 2. Decisiones confirmadas

| Tema            | Decisión                                                                                                                                                                                                                                                                                                                                                        |
| --------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Provider OpenAI | `createOpenAIEmbeddingProvider({ apiKey, model?, fetchFn? })`. Endpoint `POST https://api.openai.com/v1/embeddings`, header `Authorization: Bearer <key>`, body `{ model, input: string[] }`. Modelo por defecto `text-embedding-3-small`. `fetchFn` inyectable (default `globalThis.fetch`, Node 26). Error HTTP/parse → `ModelError`. La key nunca se loguea. |
| Provider mock   | `createMockEmbeddingProvider({ dim? })`: vector **determinista** y normalizado derivado del texto (hash estable de tokens). Mismo texto → mismo vector; textos similares comparten componentes. Para tests y modo offline.                                                                                                                                      |
| Vectores        | `vector.ts`: `cosineSimilarity(a, b)`, y serialización `float32ToBytes`/`bytesToFloat32` (Float32 LE ↔ `Uint8Array`) para guardar en BLOB. Puro.                                                                                                                                                                                                                |
| Almacenamiento  | Tabla `embeddings(memory_item_id TEXT PK REFERENCES memory_items(id) ON DELETE CASCADE, model TEXT, dim INTEGER, vector BLOB)`. Migración a `user_version = 2`, idempotente y preserva datos.                                                                                                                                                                   |
| API del store   | El store de F6 expone además: `upsertEmbedding(memoryItemId, vector, model)`, `getEmbedding(id)`, `allEmbeddings(model?)` → `{ id, vector }[]`.                                                                                                                                                                                                                 |
| Retriever       | `createSqliteRagRetriever({ store, embeddings, model? })` → `RagRetriever`. `index(item)` = `store.memory.add(item)` + `embed(content)` + `upsertEmbedding`. `retrieve(query, { limit })` = embed query → cosine contra `allEmbeddings(model)` → top-k → `MemoryItem[]` (orden desc por score). `retrieveScored(query, opts)` opcional → `{ item, score }[]`.   |
| Determinismo    | Tests con el mock determinista; el ranking es predecible. Sin red.                                                                                                                                                                                                                                                                                              |

## 3. Entregables

- `@murmur/rag`: `src/embeddings.ts` (OpenAI + mock providers), `src/vector.ts` (cosine + serde),
  extensión del store SQLite (tabla `embeddings` + métodos), `src/sqlite/retriever.ts`
  (`createSqliteRagRetriever`). Exports en `index.ts`. Tests sin red.

## 4. Criterios de aceptación

1. `pnpm install && pnpm typecheck && pnpm lint && pnpm test && pnpm build` en verde. `cargo test` intacto.
2. `cosineSimilarity`: idénticos→1, ortogonales→0, opuestos→−1 (tolerancia). `float32ToBytes`/`bytesToFloat32` round-trip exacto.
3. Mock embedding determinista: mismo texto → mismo vector (normalizado); textos distintos → vectores distintos.
4. OpenAI provider (fetch mockeado): hace la petición correcta (URL, `Authorization`, body con `model`+`input`), parsea `data[].embedding`; error → `ModelError`. Sin red real. Key nunca logueada.
5. Almacenamiento: `upsertEmbedding`/`getEmbedding`/`allEmbeddings` correctos; borrar el `MemoryItem` borra su embedding (cascade); migración `v2` idempotente y preserva datos previos.
6. `RagRetriever`: indexar varios items y `retrieve(query, {limit})` devuelve los más similares primero, respetando `limit` (verificado con el mock).
7. TS strict sin `any` injustificado; ESLint y Prettier limpios; sin SQL por concatenación (parámetros vinculados).

## 5. Fuera de alcance

Resúmenes de sesión y extracción de hechos (F8), pipeline del orchestrator (F9), construcción del
prompt con el contexto recuperado (F10), índices vectoriales avanzados/ANN (futuro, detrás de
`RagRetriever`).
