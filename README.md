# murmur

Asistente de voz con IA a nivel de sistema operativo. Atajo de teclado → hablas → respuesta
por voz de baja latencia, con memoria contextual (RAG local). Instalable por npm, con app de
escritorio ligera (Tauri). Codename del repo: `wish-pear`.

## Instalación

### CLI (`murmur`)

```bash
npm i -g murmur
murmur --version
murmur status
```

El CLI guarda su configuración en `~/.murmur/` (ver [Configuración y secretos](#configuración-y-secretos)).
Requiere Node ≥ 20.

### App de escritorio

Descarga el instalador de tu plataforma desde la página de
[releases](https://github.com/murmur/murmur/releases) (`.dmg`/`.app` en macOS,
`.msi`/`.exe` en Windows, `.AppImage`/`.deb` en Linux).

Para construirla desde el código (requiere Rust y las dependencias de sistema del webview):

```bash
pnpm install
cd apps/desktop
pnpm tauri icon src-tauri/icons/icon.svg   # genera los iconos por plataforma
pnpm tauri build                            # produce el bundle nativo
```

## Uso (CLI)

```bash
murmur start                       # comprueba prerequisitos para arrancar el asistente
murmur config                      # muestra la configuración (API key redactada)
murmur config set-openai-key <key> # guarda la API key de OpenAI
murmur config set-hotkey <combo>   # guarda el atajo de teclado global
murmur status                      # estado de murmur
murmur memory list                 # lista la memoria guardada
murmur memory add <texto>          # añade una memoria explícita
murmur memory export [ruta]        # exporta memoria + sesiones + mensajes (JSON)
murmur plugins list                # lista los plugins (skills) integrados
```

Usa `murmur help` para la lista completa de comandos.

## Requisitos

- Node ≥ 20 (recomendado: la versión de `.nvmrc`)
- pnpm 11+
- Rust (solo para la app de escritorio Tauri y el crate nativo)

## Estructura (monorepo pnpm)

| Paquete                  | Responsabilidad                                          |
| ------------------------ | -------------------------------------------------------- |
| `packages/shared`        | Tipos comunes, errores, utilidades                       |
| `packages/design-system` | Tokens de diseño (color, tipografía, motion) + estados   |
| `packages/core`          | ConversationOrchestrator, sesiones, interfaces de modelo |
| `packages/audio`         | Interfaces de entrada/salida de audio                    |
| `packages/rag`           | Memoria semántica: store, embeddings, retriever          |
| `packages/plugins`       | Plugins (skills) integrados del asistente                |
| `packages/cli`           | CLI `murmur` (único paquete publicable)                  |
| `packages/native`        | Crate Rust (hotkeys / audio nativo)                      |
| `apps/desktop`           | App de escritorio (Tauri + React)                        |

Los paquetes `@murmur/*` son privados (`private: true`): no se publican en npm. El CLI los
bundlea (tsup) dentro de su `dist`, de modo que `murmur` es autocontenido.

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
desarrollo, a un `.env` local (ver `.env.example`). La memoria es **local** por defecto y se
puede borrar (`murmur memory reset`); ver el control de privacidad de la Fase 12.

## Release

El proceso de publicación (bump de versión, tag `vX.Y.Z`, publicación del CLI en npm y build
de los bundles de Tauri) está documentado en [`docs/RELEASING.md`](docs/RELEASING.md). La CI
(`.github/workflows/ci.yml`) ejecuta la puerta de calidad completa en cada push/PR.

## Licencia

[MIT](LICENSE) © murmur contributors.

## Estado

En construcción por fases. Ver `docs/superpowers/specs/` y `docs/superpowers/plans/`.
