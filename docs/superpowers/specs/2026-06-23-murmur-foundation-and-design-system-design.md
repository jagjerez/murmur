# murmur — Spec: Fundamentos (Fase 0), Design System y Brief del MVP

- **Fecha:** 2026-06-23
- **Codename del repo:** wish-pear
- **Producto / marca / CLI:** `murmur`
- **Estado:** Aprobado en brainstorming, pendiente de plan de implementación

---

## 1. Resumen

murmur es un asistente de voz con IA a nivel de sistema operativo: el usuario lo activa con
un atajo de teclado, habla, y recibe respuesta hablada con baja latencia. Mantiene memoria
contextual mediante RAG local. Se instala como paquete npm y ofrece una interfaz de escritorio
ligera (Tauri) tipo Wispr Flow.

Este spec cubre **el primer ciclo de trabajo**:

1. **Fase 0** — base del monorepo, compilando y con scripts funcionando.
2. **Design system** entregado como paquete de código (`packages/design-system`).
3. **Brief de diseño del MVP** como documento de referencia.

El proyecto completo se construye por fases (0–16). Cada fase posterior tendrá su propio ciclo
spec → plan → implementación y debe dejar el repo funcional.

## 2. Decisiones confirmadas

| Decisión                 | Valor                                                                           |
| ------------------------ | ------------------------------------------------------------------------------- |
| Nombre de producto / CLI | **murmur** (`murmur start`, `murmur config`, …)                                 |
| Personalidad de marca    | Íntima, humana, cálida, cercana                                                 |
| Dirección visual         | **Cápsula cálida** (pill flotante discreta, la onda de audio como protagonista) |
| Tema                     | **System-aware**: dark + light desde el design system                           |
| Plataformas              | **Cross-platform estricto** (macOS, Windows, Linux desde el inicio)             |
| Acento                   | Terracota / coral `#E0916B`                                                     |
| Tipografía               | Inter/SF (UI) · JetBrains Mono (transcripción/CLI)                              |

## 3. Principios de diseño técnico

- **Modularidad e interfaces limpias.** OpenAI, Whisper, SQLite, la vector DB y el frontend
  deben ser reemplazables sin romper el resto. Se programan contra interfaces, no contra
  implementaciones concretas.
- **Baja latencia primero.** Las capas de audio y modelo se diseñan para streaming.
- **YAGNI / evitar sobreingeniería.** Se añade tooling solo cuando aporta valor real.
- **Cada fase deja el repo compilando** (`build`, `typecheck`, `lint`, `test` en verde).
- **Sin secretos en el repo.** Las API keys viven en `~/.murmur/config.json` y en variables de
  entorno; nunca se commitean.
- **Unidades pequeñas y testeables.** Cada paquete tiene un propósito claro y un contrato
  explícito.

## 4. Arquitectura del monorepo (Fase 0)

```
wish-pear/
├─ apps/
│  └─ desktop/            # App Tauri (esqueleto en F0; UI real en F2)
├─ packages/
│  ├─ shared/             # tipos comunes, errores, utils — base sin dependencias internas
│  ├─ design-system/      # tokens (color/tipo/espacio/motion) + componentes (luego)
│  ├─ core/               # ConversationOrchestrator, sesiones, interfaces de modelo
│  ├─ audio/              # interfaces de entrada/salida de audio
│  ├─ rag/                # SQLite store, embeddings, retriever, summaries, facts (interfaces)
│  ├─ cli/                # CLI `murmur` (comandos reales en F1)
│  └─ native/             # crate Rust para hotkeys/audio nativo (real en F3+)
├─ docs/
│  └─ superpowers/specs/  # specs por ciclo
├─ pnpm-workspace.yaml
├─ tsconfig.base.json
├─ eslint.config.mjs
├─ .prettierrc
├─ vitest.config.ts (o config por paquete)
├─ .env.example
├─ .nvmrc
├─ package.json           # raíz: scripts + devDeps compartidas
└─ README.md
```

### 4.1 Tooling

| Aspecto            | Elección                                      | Notas                                                                          |
| ------------------ | --------------------------------------------- | ------------------------------------------------------------------------------ |
| Gestor de paquetes | **pnpm workspaces**                           | `pnpm -r` / `--filter` para tareas; sin Turborepo aún (TODO si el grafo crece) |
| Lenguaje           | **TypeScript strict**, ESM nativo             | `tsconfig.base.json` heredado por cada paquete                                 |
| Build de paquetes  | **tsup**                                      | bundling rápido + `.d.ts`                                                      |
| Typecheck          | **tsc --noEmit**                              | puerta de calidad                                                              |
| Lint               | **ESLint 9 (flat config)**                    | + `@typescript-eslint`                                                         |
| Formato            | **Prettier**                                  |                                                                                |
| Tests              | **Vitest**                                    | mocks de OpenAI desde el inicio                                                |
| Node               | **≥ 20** (entorno actual: 26)                 | `.nvmrc` + `engines`                                                           |
| pnpm               | fijado vía `packageManager` en `package.json` |                                                                                |

### 4.2 Scripts raíz

`dev`, `build`, `test`, `lint`, `format`, `typecheck` — todos operando sobre el workspace
recursivamente.

### 4.3 Responsabilidades e interfaces por paquete

Las interfaces se definen como contratos (tipos) en Fase 0; la implementación llega en su fase.

- **shared** — `AssistantState`, tipos de mensajes/sesión, jerarquía de errores
  (`MurmurError` y subtipos), utilidades puras. Sin dependencias internas.
- **design-system** — tokens y el tipo `AssistantState` (fuente de verdad del mapeo
  estado→color/animación). Ver §5.
- **core** — `ConversationOrchestrator`, gestión de sesiones, e interfaces:
  - `RealtimeModelProvider` (intercambiable: OpenAI Realtime / futuros)
  - `TranscriptionProvider` (realtime / whisper-api / local-whisper)
- **audio** — `VoiceInputProvider`, `VoiceOutputProvider`, `AudioStream`,
  `AudioDeviceManager`. Diseñadas para streaming de baja latencia.
- **rag** — `EmbeddingProvider`, `MemoryStore`, `RagRetriever`, `SessionSummarizer`,
  `FactExtractor`. Tipos de memoria: `short_term | session_summary | long_term_fact |
explicit_user_memory`.
- **cli** — binario `murmur`; `ConfigStore` que lee/escribe `~/.murmur/config.json`.
- **native** — crate Rust para hotkeys globales y audio nativo donde aporte valor.

> En Fase 0 cada paquete exporta un esqueleto válido que compila y tiene un test mínimo de
> humo. Nada de lógica de negocio todavía.

## 5. Design system (`packages/design-system`)

Entregado como **TypeScript + CSS variables**, consumible desde la app Tauri (React/web) y,
para colores, desde el CLI.

### 5.1 Tokens

- **Acento (terracota):**
  `50 #FBF0E8` · `100 #F4D4C0` · `200 #EAB497` · `400 #E0916B` (base) · `600 #CF7350`
  · `700 #B15A3C` · `900 #8A4530`
- **Estados del asistente:**
  `idle #9A9088` · `listening #E0916B` · `thinking #B79BE8` · `speaking #E6B450`
  · `error #D8584E`
- **Neutros cálidos** dark + light (superficies, texto, bordes) y **superficies glass**
  (fondos translúcidos + blur para la cápsula).
- **Tipografía:** familias (Inter/SF, JetBrains Mono) + escala modular + pesos.
- **Espaciado:** escala base 4px. **Radios:** incluye `full` (pill). **Elevación:** sombras
  cálidas + glass.
- **Motion:** tokens de duración/easing + animaciones de estado (`breathe`, `eq`, `ripple`).

### 5.2 Entregables del paquete

- `tokens.ts` — tokens tipados.
- `tokens.css` — variables CSS `--mur-*`.
- `AssistantState` + mapa `stateVisuals` (estado → color/animación), única fuente de verdad
  compartida entre UI y core.
- Theming vía `data-theme="dark|light"` + `prefers-color-scheme`.
- `README.md` del sistema.

## 6. Brief de diseño del MVP

### 6.1 Definición del MVP (producto)

Mantener pulsado un atajo → hablar → recibir respuesta por voz con baja latencia, con la
cápsula reflejando el estado en todo momento. Cubre Fases 0–6 (fundamentos → realtime →
persistencia local). La memoria RAG (Fase 7+) es **post-MVP**.

### 6.2 Superficies a diseñar

1. **Cápsula flotante** — componente principal. 5 estados, dark+light, anclable
   (esquina / abajo-centro), arrastrable. Soporta **push-to-talk** y **toggle**.
2. **Onboarding mínimo** — primer arranque: API key de OpenAI (se guarda en `~/.murmur/`,
   nunca en repo), permiso de micrófono, elección de hotkey.
3. **Ajustes** — micrófono, voz/modelo, hotkey, tema, estado de conexión.
4. **Estados de error / vacío** — sin API key, sin micrófono, sin red, permiso denegado.

### 6.3 Principios de experiencia

- Invisible hasta que se la llama.
- Feedback de estado inmediato (objetivo < 100 ms desde la pulsación del hotkey).
- Respuesta por voz breve.
- Cero fricción.
- Accesible: foco visible, contraste AA, navegación por teclado.

### 6.4 Contenido del brief (documento a producir)

Objetivos, no-objetivos, flujos (activar→hablar→responder; push-to-talk vs toggle;
interrupción del usuario), inventario de pantallas/estados, specs visuales (referenciando los
tokens), y criterios de aceptación del diseño.

## 7. Estrategia de tests y calidad

- **Fase 0:** un test de humo por paquete (Vitest) que valide el esqueleto/exports.
- **Mocks de OpenAI** desde el principio (a través de las interfaces) para no depender de red.
- Puerta de cada fase: `typecheck` + `lint` + `test` + `build` en verde.

## 8. Criterios de aceptación de la Fase 0

1. `pnpm install` instala sin errores.
2. `pnpm build` compila todos los paquetes.
3. `pnpm typecheck` pasa en strict.
4. `pnpm lint` y `pnpm format` ejecutan sin errores.
5. `pnpm test` pasa (tests de humo verdes).
6. Existe la estructura completa de carpetas/paquetes descrita en §4.
7. `packages/design-system` exporta los tokens de §5.
8. Existen `README.md`, `.env.example`, `.nvmrc`, `.gitignore`.
9. Existe el documento de brief del MVP (§6) en `docs/`.
10. No hay secretos en el repositorio.

## 9. Riesgos y decisiones pendientes (fuera de Fase 0)

- **Audio en streaming con Tauri** (F4/F5): la baja latencia puede requerir Rust
  (`packages/native`) o Web Audio según plataforma. Solo se dejan interfaces ahora.
- **Hotkey global cross-platform** (F3): Linux/Wayland (entorno actual) es lo más delicado.
- **Reemplazo de vector DB**: SQLite + búsqueda semántica en F7; si escala, migrar detrás de
  `MemoryStore`/`RagRetriever` sin tocar consumidores.

## 10. Fuera de alcance (este ciclo)

Fases 1–16. Wake word no se implementa hasta fases avanzadas. Whisper es fallback futuro, no
prioridad inicial.
