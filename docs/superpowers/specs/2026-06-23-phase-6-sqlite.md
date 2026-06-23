# murmur — Spec: Fase 6 (SQLite — persistencia local)

- **Fecha:** 2026-06-23
- **Producto:** `murmur`
- **Estado:** Aprobado, pendiente de implementación
- **Depende de:** Fase 0 (`@murmur/rag` interfaces, `@murmur/shared` Session/Message), Fase 1 (CLI/config, `memory reset`)

---

## 1. Resumen

Implementar la persistencia local sobre **SQLite**: un `SqliteMemoryStore` (implementa la interfaz
`MemoryStore` de `@murmur/rag`) y un `ConversationStore` para sesiones y mensajes, con migraciones
idempotentes. Se cablea el `murmur memory reset` (Fase 1) para que **borre de verdad** y `murmur
status` para que informe del nº de elementos de memoria. Tests con base de datos temporal/`:memory:`.

## 2. Decisiones confirmadas

| Tema                | Decisión                                                                                                                                                                                                                                                                                                                                                                       |
| ------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Motor SQLite        | **`node:sqlite`** (integrado en Node ≥ 22.5; el entorno es Node 26) → cero dependencias nuevas, sin build nativo. `import { DatabaseSync } from 'node:sqlite'`. **Fallback**: si el runner de tests no lo soporta (flag/availability), usar `better-sqlite3` (prebuilt) detrás de la misma capa de acceso. El implementer verifica `node:sqlite` bajo Vitest antes de decidir. |
| Ubicación           | El store vive en `@murmur/rag` (proceso Node: CLI y, en F9, el orchestrator). El webview accede vía IPC en fases futuras (F9/F11).                                                                                                                                                                                                                                             |
| Esquema             | Tablas `memory_items(id PK, type, content, created_at, session_id NULL)`, `sessions(id PK, started_at, ended_at NULL)`, `messages(id PK, session_id FK, role, text, created_at)`. `PRAGMA user_version` para versión de esquema. Índices por `session_id` y `type`.                                                                                                            |
| Migraciones         | `migrate(db)` idempotente: crea tablas/índices si faltan y sube `user_version`. Reabrir una db existente no pierde datos.                                                                                                                                                                                                                                                      |
| API                 | `createSqliteStore(path)` → `{ memory: MemoryStore, conversation: ConversationStore, reset(), close(), path }`. `path` puede ser un fichero o `':memory:'`.                                                                                                                                                                                                                    |
| `MemoryStore`       | Mantiene la interfaz (`add`, `all`, `clear`) y añade: `getByType(type)`, `recent(limit)`, `get(id)`, `delete(id)`, `count()`.                                                                                                                                                                                                                                                  |
| `ConversationStore` | `createSession()→Session`, `endSession(id)`, `getSession(id)`, `recentSessions(limit)`, `addMessage(msg)`, `getMessages(sessionId)`. Usa `Session`/`Message`/`Role` de `@murmur/shared`.                                                                                                                                                                                       |
| CLI                 | `murmur memory reset --yes` borra de verdad (abre el store en `<base>/memory.db` y `reset()`, o elimina el fichero); `murmur status` muestra "memoria: N elementos". Store path desde `ConfigStore.dataPath('memory.db')`, inyectable en tests.                                                                                                                                |
| IDs/tiempo          | IDs vía `crypto.randomUUID()`; tiempos epoch ms (inyectables `now()` para tests deterministas).                                                                                                                                                                                                                                                                                |

## 3. Entregables

- `@murmur/rag`: `src/sqlite/db.ts` (apertura + `migrate`), `src/sqlite/memory-store.ts`
  (`SqliteMemoryStore`), `src/sqlite/conversation-store.ts` (`ConversationStore`),
  `src/sqlite/index.ts` (`createSqliteStore`). Exports en `index.ts`. Tests con db temporal/`:memory:`.
- `@murmur/rag` `package.json`: dep `@murmur/shared` (ya declarada) usada de verdad ahora.
- CLI (`murmur`): `memory reset` real + `status` con conteo; depende de `@murmur/rag`. Tests con
  store sobre directorio temporal.

## 4. Criterios de aceptación

1. `pnpm install && pnpm typecheck && pnpm lint && pnpm test && pnpm build` en verde. `cargo test` intacto.
2. `createSqliteStore(':memory:')` y sobre fichero temporal: `migrate` idempotente (reabrir conserva
   datos); persistencia real verificada reabriendo el fichero.
3. `MemoryStore`: add/all/clear/getByType/recent/get/delete/count correctos (cubierto por tests).
4. `ConversationStore`: crear sesión, añadir mensajes, recuperarlos por sesión, finalizar sesión.
5. `murmur memory reset --yes` deja la memoria vacía (verificado: count 0 tras reset); sin `--yes`
   no borra. `murmur status` muestra el conteo correcto.
6. Tests usan db temporal/`:memory:`; no tocan datos reales del usuario.
7. TS strict sin `any` injustificado; ESLint y Prettier limpios. Si se usa `node:sqlite`, los
   warnings experimentales (si los hubiera) no rompen el pipeline; si se usa el fallback, queda
   documentado por qué.

## 5. Fuera de alcance

Embeddings/búsqueda semántica (F7), resúmenes/hechos (F8), pipeline del orchestrator (F9), cifrado
en reposo y retención (F12), acceso desde el webview vía IPC (F9/F11).
