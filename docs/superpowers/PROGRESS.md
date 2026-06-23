# murmur — Progreso de construcción (Fases 0–16)

> Tracker durable para ejecución autónoma orquestada por subagentes.
> Fuente de verdad de resumibilidad: este archivo + `git log` + ramas `phase-N`.
> Cadena por fase: **rama `phase-N` → spec → plan → implementación (TDD, subagentes) →
> review (spec + calidad) → puerta de calidad verde → merge a `main`**.
>
> Puerta de calidad (debe quedar verde al cerrar cada fase):
> `pnpm install && pnpm typecheck && pnpm lint && pnpm test && pnpm build` y, si toca crate
> Rust, `cd packages/native && cargo test`. Sin secretos en el repo.

## Estado

| Fase | Tema                                                                                                     | Estado                  |
| ---- | -------------------------------------------------------------------------------------------------------- | ----------------------- |
| 0    | Fundamentos + design system + brief                                                                      | ✅ COMPLETA (en `main`) |
| 1    | CLI real (`start`, `config`, `config set-openai-key`, `memory reset`, `status`, `~/.murmur/config.json`) | ⬜ pendiente            |
| 2    | UI Tauri: cápsula real (5 estados, animaciones, dark/light, draggable, PTT/toggle)                       | ⬜ pendiente            |
| 3    | Hotkey global (native Rust + Tauri global-shortcut)                                                      | ⬜ pendiente            |
| 4    | Audio real (captura/reproducción, AudioStream PCM, enumeración de dispositivos)                          | ⬜ pendiente            |
| 5    | OpenAI Realtime (RealtimeModelProvider sobre WebSocket, mockeado en tests)                               | ⬜ pendiente            |
| 6    | SQLite (MemoryStore persistente, sesiones/mensajes/memoria, migraciones)                                 | ⬜ pendiente            |
| 7    | RAG embeddings + retrieval (EmbeddingProvider, vectores en SQLite, RagRetriever)                         | ⬜ pendiente            |
| 8    | RAG summaries + facts (SessionSummarizer, FactExtractor, alimenta contexto)                              | ⬜ pendiente            |
| 9    | Orchestrator completo (hotkey→captura→modelo→contexto→respuesta→persistir)                               | ⬜ pendiente            |
| 10   | Prompt (persona cálida, construcción de contexto RAG, presupuesto de tokens)                             | ⬜ pendiente            |
| 11   | UI avanzada (onboarding, ajustes, estados de error/vacío, transcripción)                                 | ⬜ pendiente            |
| 12   | Privacidad (modo local, retención, borrado/exportación, memoria explícita)                               | ⬜ pendiente            |
| 13   | Whisper (TranscriptionProvider local/whisper-api como fallback)                                          | ⬜ pendiente            |
| 14   | Wake word ("hey murmur", native, toggle en config)                                                       | ⬜ pendiente            |
| 15   | Plugins (sistema de skills/acciones, registry, ejemplos)                                                 | ⬜ pendiente            |
| 16   | Packaging (npm publish CLI, bundling Tauri por plataforma, CI, iconos, docs)                             | ⬜ pendiente            |

## Reglas de fase

1. Todo detrás de interfaces; OpenAI/Whisper/SQLite/audio/native reemplazables.
2. Tests **sin red**: APIs externas mockeadas a través de las interfaces.
3. Native/plataforma: implementar y testear lo testeable (unit Rust / mocks TS); documentar lo
   que requiere hardware/entorno gráfico. Mantener `cargo test` y el pipeline pnpm verdes.
4. Secretos solo en `~/.murmur/config.json` / env; nunca en el repo.
5. Cada commit termina con el trailer `Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>`.
6. Cada fase deja el repo compilando y en verde antes de mergear.

## Bitácora

- Fase 0: completada y mergeada en `main` (commit `1dc1aae`).
