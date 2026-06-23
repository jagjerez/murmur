# murmur

Asistente de voz con IA a nivel de sistema operativo. Atajo de teclado → hablas → respuesta
por voz de baja latencia, con memoria contextual (RAG local). Instalable por npm, con app de
escritorio ligera (Tauri). Codename del repo: `wish-pear`.

## Requisitos

- Node ≥ 20 (recomendado: la versión de `.nvmrc`)
- pnpm 11+
- Rust (solo para la app de escritorio Tauri y el crate nativo)

## Estructura (monorepo pnpm)

| Paquete | Responsabilidad |
|---|---|
| `packages/shared` | Tipos comunes, errores, utilidades |
| `packages/design-system` | Tokens de diseño (color, tipografía, motion) + estados |
| `packages/core` | ConversationOrchestrator, sesiones, interfaces de modelo |
| `packages/audio` | Interfaces de entrada/salida de audio |
| `packages/rag` | Memoria semántica: store, embeddings, retriever |
| `packages/cli` | CLI `murmur` |
| `packages/native` | Crate Rust (hotkeys / audio nativo) |
| `apps/desktop` | App de escritorio (Tauri + React) |

## Scripts

```bash
pnpm install      # instala dependencias
pnpm build        # compila todos los paquetes
pnpm test         # ejecuta tests (Vitest)
pnpm typecheck    # comprobación de tipos (strict)
pnpm lint         # ESLint
pnpm format       # Prettier
pnpm dev          # arranca la app de escritorio en modo dev (frontend)
```

El crate Rust se prueba aparte: `cd packages/native && cargo test`.

## Configuración y secretos

Las API keys **nunca** se guardan en el repo. Van a `~/.murmur/config.json` (Fase 1) o, en
desarrollo, a un `.env` local (ver `.env.example`).

## Estado

En construcción por fases. Ver `docs/superpowers/specs/` y `docs/superpowers/plans/`.
