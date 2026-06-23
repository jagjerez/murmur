# murmur — Spec: Fase 12 (Privacidad)

- **Fecha:** 2026-06-23
- **Producto:** `murmur`
- **Estado:** Aprobado, pendiente de implementación
- **Depende de:** F1 (config/CLI), F6 (store), F9/F10 (orchestrator/prompt)

---

## 1. Resumen

Dar al usuario control sobre sus datos: **modo local**, **retención/pruning**, **redacción** de
datos sensibles antes de persistir, **gestión de memoria explícita** (listar/añadir/olvidar/exportar)
y **borrado**. La configuración de privacidad vive en `~/.murmur/config.json`; el orchestrator honra
los flags. Todo local-first y testeable sin red.

## 2. Decisiones confirmadas

| Tema | Decisión |
| ---- | -------- |
| Config de privacidad | `MurmurConfig.privacy`: `{ localOnlyMode: boolean (default false); storeTranscripts: boolean (default true); redactBeforeStore: boolean (default false); retentionDays: number (0 = sin límite, default 0) }`. `ConfigStore` lo valida/normaliza con defaults; setters/`config` lo muestran. |
| Modo local | `localOnlyMode: true` → el orchestrator **no inyecta** contexto RAG en el prompt (no se envía memoria al modelo). El audio sigue yendo al modelo realtime (es inherente al producto); se documenta el alcance. |
| Retención | `pruneOlderThan(beforeMs)` en el store borra `memory_items`, `messages` (y `sessions` vacías) anteriores. `retentionDays>0` aplica la poda (al arrancar / vía `murmur memory prune`). |
| Redacción | `redactSensitive(text)` en `@murmur/shared`: sustituye emails, claves tipo `sk-…`, secuencias largas de dígitos (tarjetas/teléfonos) por marcadores (`[email]`, `[clave]`, `[número]`). Con `redactBeforeStore: true`, el orchestrator redacta los mensajes antes de `addMessage`. Determinista, pura. |
| Memoria explícita (CLI) | Nuevos subcomandos: `murmur memory list`, `murmur memory add <texto>` (guarda `explicit_user_memory`), `murmur memory forget <id>`, `murmur memory export [ruta]` (JSON con memoria+sesiones+mensajes), `murmur memory prune`, además del `memory reset` existente. Store inyectable en tests. |
| Export | `store.exportAll()` → `{ memory: MemoryItem[]; sessions: Session[]; messages: Message[] }` serializable. `memory export` lo escribe (a stdout o a `ruta`). |

## 3. Entregables

- `@murmur/shared`: `src/redact.ts` (`redactSensitive`) + export + test.
- `@murmur/rag` store: `pruneOlderThan(beforeMs)`, `exportAll()` (+ tests).
- `@murmur/cli`: `privacy` en `MurmurConfig`/`ConfigStore` + setters; subcomandos `memory list/add/forget/export/prune`; `config` muestra privacidad (+ tests).
- `@murmur/core` orchestrator: honra `localOnlyMode` (sin contexto RAG), `storeTranscripts` (no persiste texto si false), `redactBeforeStore` (redacta antes de persistir) (+ tests).

## 4. Criterios de aceptación

1. `pnpm install && pnpm typecheck && pnpm lint && pnpm test && pnpm build` en verde. `cargo test` intacto.
2. `redactSensitive`: redacta email/clave/número y deja intacto el resto; idempotente; pura.
3. `ConfigStore`: `privacy` con defaults; setters persisten; JSON con privacidad parcial se normaliza.
4. Store: `pruneOlderThan` borra solo lo anterior al umbral; `exportAll` devuelve memoria+sesiones+mensajes.
5. CLI: `memory add` crea `explicit_user_memory`; `memory list` lo muestra; `memory forget <id>` lo borra; `memory export` produce el JSON; `memory prune` aplica retención. Tests con store temporal.
6. Orchestrator: con `localOnlyMode` no inyecta contexto (instructions sin bloque "recuerdo"); con
   `storeTranscripts:false` no persiste texto de mensajes; con `redactBeforeStore` los mensajes se
   redactan antes de persistir (verificado en tests).
7. TS strict sin `any` injustificado; ESLint y Prettier limpios; sin datos sensibles en el repo.

## 5. Fuera de alcance

Cifrado en reposo de la db (futuro; documentar), proxy/token efímero para la API (F16), borrado
remoto en OpenAI (no aplica; murmur es local-first), UI completa de privacidad (un panel mínimo
puede vivir en Ajustes, pero la superficie testeable principal es el CLI).
