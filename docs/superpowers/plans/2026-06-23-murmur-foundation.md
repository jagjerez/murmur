# murmur — Fase 0 (Fundamentos + Design System + Brief MVP) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Dejar el monorepo pnpm de murmur compilando, testeando y con scripts funcionando, incluyendo el paquete de design system con los tokens confirmados y el documento de brief del MVP.

**Architecture:** Monorepo pnpm (workspaces + catalog). Paquetes TypeScript ESM estrictos que exportan su **código fuente** (`exports → ./src/index.ts`) para que apps/CLI los empaqueten en el momento (vía Vite/tsup), evitando dependencias de orden de build. Cada paquete tiene un propósito y un test de humo o de lógica. La app de escritorio es un esqueleto Vite+React (la cáscara Tauri se deja preparada pero no entra en `pnpm build`). El crate Rust nativo es autónomo (`cargo test`, fuera del pipeline de pnpm).

**Tech Stack:** pnpm 11, TypeScript 5 (strict, ESM, moduleResolution Bundler), tsup, Vitest, ESLint 9 (flat) + typescript-eslint, Prettier, Vite 6 + React 19 (desktop), Tauri 2 (esqueleto), Rust (crate nativo).

**Convención de commits:** cada commit termina con el trailer:

```
Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
```

---

## File Structure

```
package.json                 # raíz: scripts + devDeps de tooling (catalog)
pnpm-workspace.yaml          # workspaces + catalog de versiones
tsconfig.base.json           # config TS estricta compartida
eslint.config.mjs            # ESLint flat + typescript-eslint
.prettierrc                  # formato
.nvmrc · .env.example        # node version · plantilla de entorno (sin secretos)
README.md

packages/shared/             # state.ts, errors.ts, types.ts (base, sin deps internas)
packages/design-system/      # tokens.ts, tokens.css, state-visuals.ts, README.md (dep: shared)
packages/core/               # providers/*, orchestrator.ts, session.ts (dep: shared)
packages/audio/              # providers.ts (interfaces + null device manager) (dep: shared)
packages/rag/                # types.ts, providers.ts (interfaces) (dep: shared)
packages/cli/                # cli.ts (lógica), index.ts (bin murmur), tsup.config.ts (dep: shared)
packages/native/             # Cargo.toml, src/lib.rs (crate Rust autónomo)
apps/desktop/                # Vite+React skeleton + src-tauri/ (cáscara Tauri) (dep: design-system, shared)
docs/design/mvp-brief.md     # entregable: brief de diseño del MVP
```

Cada paquete TS lleva además: `package.json`, `tsconfig.json` (extiende la base), `src/index.ts`.

---

## Task 1: Scaffolding raíz del workspace

**Files:**

- Create: `package.json`
- Create: `pnpm-workspace.yaml`
- Create: `tsconfig.base.json`
- Create: `eslint.config.mjs`
- Create: `.prettierrc`
- Create: `.nvmrc`
- Create: `.env.example`
- Create: `README.md`

- [ ] **Step 1: Crear `pnpm-workspace.yaml` (workspaces + catalog de versiones)**

```yaml
packages:
  - 'apps/*'
  - 'packages/*'

catalog:
  typescript: ^5.7.2
  tsup: ^8.3.5
  vitest: ^3.0.5
  eslint: ^9.17.0
  '@eslint/js': ^9.17.0
  typescript-eslint: ^8.19.0
  prettier: ^3.4.2
  react: ^19.0.0
  react-dom: ^19.0.0
  '@types/react': ^19.0.2
  '@types/react-dom': ^19.0.2
  '@types/node': ^22.10.5
  vite: ^6.0.7
  '@vitejs/plugin-react': ^4.3.4
  '@tauri-apps/cli': ^2.2.2
  '@tauri-apps/api': ^2.2.0
```

- [ ] **Step 2: Crear `package.json` raíz**

```json
{
  "name": "murmur-monorepo",
  "private": true,
  "version": "0.0.0",
  "type": "module",
  "packageManager": "pnpm@11.5.3",
  "engines": { "node": ">=20" },
  "scripts": {
    "dev": "pnpm --filter @murmur/desktop dev",
    "build": "pnpm -r build",
    "test": "pnpm -r test",
    "typecheck": "pnpm -r typecheck",
    "lint": "eslint .",
    "format": "prettier --write ."
  },
  "devDependencies": {
    "@eslint/js": "catalog:",
    "eslint": "catalog:",
    "prettier": "catalog:",
    "typescript": "catalog:",
    "typescript-eslint": "catalog:"
  }
}
```

- [ ] **Step 3: Crear `tsconfig.base.json`**

```json
{
  "$schema": "https://json.schemastore.org/tsconfig",
  "compilerOptions": {
    "target": "ES2022",
    "lib": ["ES2022", "DOM", "DOM.Iterable"],
    "module": "ESNext",
    "moduleResolution": "Bundler",
    "moduleDetection": "force",
    "strict": true,
    "noUncheckedIndexedAccess": true,
    "noImplicitOverride": true,
    "noUnusedLocals": true,
    "noUnusedParameters": true,
    "verbatimModuleSyntax": true,
    "isolatedModules": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "resolveJsonModule": true,
    "declaration": true,
    "sourceMap": true,
    "noEmit": true
  }
}
```

- [ ] **Step 4: Crear `eslint.config.mjs`**

```js
import js from '@eslint/js';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  {
    ignores: [
      '**/dist/**',
      '**/target/**',
      '**/node_modules/**',
      '**/src-tauri/**',
      '**/*.config.*',
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
);
```

- [ ] **Step 5: Crear `.prettierrc`**

```json
{
  "singleQuote": true,
  "semi": true,
  "printWidth": 100,
  "trailingComma": "all"
}
```

- [ ] **Step 6: Crear `.nvmrc`**

```
20
```

- [ ] **Step 7: Crear `.env.example`**

```
# murmur — copia este archivo a .env para desarrollo (NUNCA commitees .env).
# La API key real se guarda en ~/.murmur/config.json mediante `murmur config` (Fase 1).
# Esta variable es solo para desarrollo y tests locales.
OPENAI_API_KEY=
```

- [ ] **Step 8: Crear `README.md`**

````markdown
# murmur

Asistente de voz con IA a nivel de sistema operativo. Atajo de teclado → hablas → respuesta
por voz de baja latencia, con memoria contextual (RAG local). Instalable por npm, con app de
escritorio ligera (Tauri). Codename del repo: `wish-pear`.

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
| `packages/cli`           | CLI `murmur`                                             |
| `packages/native`        | Crate Rust (hotkeys / audio nativo)                      |
| `apps/desktop`           | App de escritorio (Tauri + React)                        |

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
````

El crate Rust se prueba aparte: `cd packages/native && cargo test`.

## Configuración y secretos

Las API keys **nunca** se guardan en el repo. Van a `~/.murmur/config.json` (Fase 1) o, en
desarrollo, a un `.env` local (ver `.env.example`).

## Estado

En construcción por fases. Ver `docs/superpowers/specs/` y `docs/superpowers/plans/`.

````

- [ ] **Step 9: Instalar y verificar**

Run: `pnpm install`
Expected: instala sin errores y resuelve el `catalog`. (Aún no hay paquetes hijos; se añaden en las siguientes tareas y se reinstala.)

- [ ] **Step 10: Commit**

```bash
git add package.json pnpm-workspace.yaml tsconfig.base.json eslint.config.mjs .prettierrc .nvmrc .env.example README.md pnpm-lock.yaml
git commit -m "chore: scaffolding raíz del monorepo pnpm

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
````

---

## Task 2: `packages/shared` (estados, errores, tipos)

**Files:**

- Create: `packages/shared/package.json`
- Create: `packages/shared/tsconfig.json`
- Create: `packages/shared/src/state.ts`
- Create: `packages/shared/src/errors.ts`
- Create: `packages/shared/src/types.ts`
- Create: `packages/shared/src/index.ts`
- Test: `packages/shared/src/errors.test.ts`, `packages/shared/src/state.test.ts`

- [ ] **Step 1: Crear `package.json` y `tsconfig.json` del paquete**

`packages/shared/package.json`:

```json
{
  "name": "@murmur/shared",
  "version": "0.0.0",
  "type": "module",
  "exports": { ".": { "types": "./src/index.ts", "import": "./src/index.ts" } },
  "scripts": {
    "build": "tsup src/index.ts --format esm --dts --clean",
    "typecheck": "tsc --noEmit",
    "test": "vitest run"
  },
  "devDependencies": {
    "tsup": "catalog:",
    "typescript": "catalog:",
    "vitest": "catalog:"
  }
}
```

`packages/shared/tsconfig.json`:

```json
{
  "extends": "../../tsconfig.base.json",
  "include": ["src"]
}
```

Run: `pnpm install`
Expected: enlaza el nuevo paquete sin errores.

- [ ] **Step 2: Escribir el test de estados (falla)**

`packages/shared/src/state.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { ASSISTANT_STATES } from './state';

describe('AssistantState', () => {
  it('lista los cinco estados en orden', () => {
    expect(ASSISTANT_STATES).toEqual(['idle', 'listening', 'thinking', 'speaking', 'error']);
  });
});
```

- [ ] **Step 3: Ejecutar y ver que falla**

Run: `pnpm --filter @murmur/shared test`
Expected: FAIL — no existe `./state`.

- [ ] **Step 4: Implementar `state.ts`**

`packages/shared/src/state.ts`:

```ts
/** Estado del asistente. Fuente de verdad del ciclo de vida visible. */
export type AssistantState = 'idle' | 'listening' | 'thinking' | 'speaking' | 'error';

export const ASSISTANT_STATES: readonly AssistantState[] = [
  'idle',
  'listening',
  'thinking',
  'speaking',
  'error',
] as const;
```

- [ ] **Step 5: Escribir el test de errores (falla)**

`packages/shared/src/errors.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { MurmurError, ConfigError, AudioError, ModelError, MemoryError } from './errors';

describe('errores', () => {
  it('MurmurError lleva código y es Error', () => {
    const e = new MurmurError('boom');
    expect(e).toBeInstanceOf(Error);
    expect(e.code).toBe('MURMUR_ERROR');
    expect(e.name).toBe('MurmurError');
  });

  it('las subclases fijan su código y son instanceof MurmurError', () => {
    expect(new ConfigError('x').code).toBe('CONFIG_ERROR');
    expect(new AudioError('x').code).toBe('AUDIO_ERROR');
    expect(new ModelError('x').code).toBe('MODEL_ERROR');
    expect(new MemoryError('x').code).toBe('MEMORY_ERROR');
    expect(new ConfigError('x')).toBeInstanceOf(MurmurError);
  });
});
```

- [ ] **Step 6: Ejecutar y ver que falla**

Run: `pnpm --filter @murmur/shared test`
Expected: FAIL — no existe `./errors`.

- [ ] **Step 7: Implementar `errors.ts`**

`packages/shared/src/errors.ts`:

```ts
/** Error base de murmur; todos los errores del dominio heredan de aquí. */
export class MurmurError extends Error {
  readonly code: string;

  constructor(message: string, code = 'MURMUR_ERROR', options?: ErrorOptions) {
    super(message, options);
    this.name = 'MurmurError';
    this.code = code;
  }
}

export class ConfigError extends MurmurError {
  constructor(message: string, options?: ErrorOptions) {
    super(message, 'CONFIG_ERROR', options);
    this.name = 'ConfigError';
  }
}

export class AudioError extends MurmurError {
  constructor(message: string, options?: ErrorOptions) {
    super(message, 'AUDIO_ERROR', options);
    this.name = 'AudioError';
  }
}

export class ModelError extends MurmurError {
  constructor(message: string, options?: ErrorOptions) {
    super(message, 'MODEL_ERROR', options);
    this.name = 'ModelError';
  }
}

export class MemoryError extends MurmurError {
  constructor(message: string, options?: ErrorOptions) {
    super(message, 'MEMORY_ERROR', options);
    this.name = 'MemoryError';
  }
}
```

- [ ] **Step 8: Implementar `types.ts` e `index.ts`**

`packages/shared/src/types.ts`:

```ts
export type Role = 'user' | 'assistant' | 'system';

export interface Message {
  id: string;
  sessionId: string;
  role: Role;
  text: string;
  /** epoch ms */
  createdAt: number;
}

export interface Session {
  id: string;
  /** epoch ms */
  startedAt: number;
  /** epoch ms */
  endedAt?: number;
}
```

`packages/shared/src/index.ts`:

```ts
export * from './state';
export * from './errors';
export * from './types';
```

- [ ] **Step 9: Ejecutar tests, typecheck y build**

Run: `pnpm --filter @murmur/shared test && pnpm --filter @murmur/shared typecheck && pnpm --filter @murmur/shared build`
Expected: tests PASS, typecheck sin errores, build genera `dist/`.

- [ ] **Step 10: Commit**

```bash
git add packages/shared pnpm-lock.yaml
git commit -m "feat(shared): estados, errores y tipos base

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 3: `packages/design-system` (tokens, estados visuales, CSS)

**Files:**

- Create: `packages/design-system/package.json`
- Create: `packages/design-system/tsconfig.json`
- Create: `packages/design-system/src/tokens.ts`
- Create: `packages/design-system/src/state-visuals.ts`
- Create: `packages/design-system/src/tokens.css`
- Create: `packages/design-system/src/index.ts`
- Create: `packages/design-system/README.md`
- Test: `packages/design-system/src/tokens.test.ts`, `packages/design-system/src/state-visuals.test.ts`

- [ ] **Step 1: Crear `package.json` y `tsconfig.json`**

`packages/design-system/package.json`:

```json
{
  "name": "@murmur/design-system",
  "version": "0.0.0",
  "type": "module",
  "exports": {
    ".": { "types": "./src/index.ts", "import": "./src/index.ts" },
    "./tokens.css": "./src/tokens.css"
  },
  "scripts": {
    "build": "tsup src/index.ts --format esm --dts --clean",
    "typecheck": "tsc --noEmit",
    "test": "vitest run"
  },
  "dependencies": {
    "@murmur/shared": "workspace:*"
  },
  "devDependencies": {
    "tsup": "catalog:",
    "typescript": "catalog:",
    "vitest": "catalog:"
  }
}
```

`packages/design-system/tsconfig.json`:

```json
{
  "extends": "../../tsconfig.base.json",
  "include": ["src"]
}
```

Run: `pnpm install`
Expected: enlaza `@murmur/shared` como dependencia del workspace.

- [ ] **Step 2: Escribir el test de tokens (falla)**

`packages/design-system/src/tokens.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { tokens, color } from './tokens';

describe('tokens', () => {
  it('expone el acento base terracota', () => {
    expect(color.accent[400]).toBe('#E0916B');
  });

  it('define los 5 colores de estado', () => {
    expect(color.state).toEqual({
      idle: '#9A9088',
      listening: '#E0916B',
      thinking: '#B79BE8',
      speaking: '#E6B450',
      error: '#D8584E',
    });
  });

  it('agrupa todas las escalas en `tokens`', () => {
    expect(Object.keys(tokens)).toEqual(
      expect.arrayContaining(['color', 'font', 'space', 'radius', 'shadow', 'motion']),
    );
  });
});
```

- [ ] **Step 3: Ejecutar y ver que falla**

Run: `pnpm --filter @murmur/design-system test`
Expected: FAIL — no existe `./tokens`.

- [ ] **Step 4: Implementar `tokens.ts`**

`packages/design-system/src/tokens.ts`:

```ts
export const color = {
  accent: {
    50: '#FBF0E8',
    100: '#F4D4C0',
    200: '#EAB497',
    400: '#E0916B',
    600: '#CF7350',
    700: '#B15A3C',
    900: '#8A4530',
  },
  state: {
    idle: '#9A9088',
    listening: '#E0916B',
    thinking: '#B79BE8',
    speaking: '#E6B450',
    error: '#D8584E',
  },
  dark: {
    surface: '#16141C',
    surfaceRaised: '#241F2B',
    text: '#F4F1EC',
    textMuted: '#9A9088',
    border: 'rgba(255, 255, 255, 0.10)',
    glass: 'rgba(34, 28, 27, 0.82)',
  },
  light: {
    surface: '#F3EFE9',
    surfaceRaised: '#FFFDFA',
    text: '#2A2420',
    textMuted: '#6A635C',
    border: 'rgba(0, 0, 0, 0.08)',
    glass: 'rgba(255, 253, 250, 0.78)',
  },
} as const;

export const font = {
  ui: "'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', system-ui, sans-serif",
  mono: "'JetBrains Mono', ui-monospace, Menlo, Consolas, monospace",
  size: { xs: '11px', sm: '13px', base: '15px', lg: '18px', xl: '24px', '2xl': '32px' },
  weight: { regular: 400, medium: 500, semibold: 600 },
} as const;

export const space = {
  1: '4px',
  2: '8px',
  3: '12px',
  4: '16px',
  5: '20px',
  6: '24px',
  8: '32px',
} as const;

export const radius = { sm: '8px', md: '12px', lg: '18px', full: '999px' } as const;

export const shadow = {
  glass: '0 12px 40px rgba(0, 0, 0, 0.45)',
  glassLight: '0 12px 40px rgba(140, 110, 90, 0.18)',
} as const;

export const motion = {
  duration: { fast: '120ms', base: '200ms', slow: '400ms' },
  easing: {
    standard: 'cubic-bezier(0.4, 0, 0.2, 1)',
    emphasized: 'cubic-bezier(0.2, 0, 0, 1)',
  },
} as const;

export const tokens = { color, font, space, radius, shadow, motion } as const;
```

- [ ] **Step 5: Ejecutar y ver que pasa**

Run: `pnpm --filter @murmur/design-system test`
Expected: PASS.

- [ ] **Step 6: Escribir el test de estados visuales (falla)**

`packages/design-system/src/state-visuals.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { ASSISTANT_STATES } from '@murmur/shared';
import { stateVisuals } from './state-visuals';

describe('stateVisuals', () => {
  it('cubre todos los AssistantState', () => {
    for (const state of ASSISTANT_STATES) {
      expect(stateVisuals[state]).toBeDefined();
    }
  });

  it('mapea listening a coral con respiración', () => {
    expect(stateVisuals.listening.color).toBe('#E0916B');
    expect(stateVisuals.listening.animation).toBe('breathe');
  });

  it('mapea error a rojo con shake', () => {
    expect(stateVisuals.error.color).toBe('#D8584E');
    expect(stateVisuals.error.animation).toBe('shake');
  });
});
```

- [ ] **Step 7: Ejecutar y ver que falla**

Run: `pnpm --filter @murmur/design-system test`
Expected: FAIL — no existe `./state-visuals`.

- [ ] **Step 8: Implementar `state-visuals.ts`**

`packages/design-system/src/state-visuals.ts`:

```ts
import type { AssistantState } from '@murmur/shared';
import { color } from './tokens';

export type StateAnimation = 'none' | 'breathe' | 'pulse' | 'equalize' | 'shake';

export interface StateVisual {
  color: string;
  animation: StateAnimation;
  label: string;
}

/** Única fuente de verdad del mapeo estado → color/animación/etiqueta. */
export const stateVisuals: Record<AssistantState, StateVisual> = {
  idle: { color: color.state.idle, animation: 'none', label: 'En reposo' },
  listening: { color: color.state.listening, animation: 'breathe', label: 'Escuchando…' },
  thinking: { color: color.state.thinking, animation: 'pulse', label: 'Pensando…' },
  speaking: { color: color.state.speaking, animation: 'equalize', label: 'Hablando…' },
  error: { color: color.state.error, animation: 'shake', label: 'Algo falló' },
};
```

- [ ] **Step 9: Crear `tokens.css`, `index.ts` y `README.md`**

`packages/design-system/src/tokens.css`:

```css
/* murmur — variables de diseño. Dark por defecto; light vía [data-theme="light"]
   o prefers-color-scheme. */
:root {
  /* Acento */
  --mur-accent-50: #fbf0e8;
  --mur-accent-100: #f4d4c0;
  --mur-accent-200: #eab497;
  --mur-accent-400: #e0916b;
  --mur-accent-600: #cf7350;
  --mur-accent-700: #b15a3c;
  --mur-accent-900: #8a4530;

  /* Estados */
  --mur-state-idle: #9a9088;
  --mur-state-listening: #e0916b;
  --mur-state-thinking: #b79be8;
  --mur-state-speaking: #e6b450;
  --mur-state-error: #d8584e;

  /* Tipografía */
  --mur-font-ui: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', system-ui, sans-serif;
  --mur-font-mono: 'JetBrains Mono', ui-monospace, Menlo, Consolas, monospace;

  /* Radios / motion */
  --mur-radius-md: 12px;
  --mur-radius-lg: 18px;
  --mur-radius-full: 999px;
  --mur-duration-base: 200ms;
  --mur-easing-standard: cubic-bezier(0.4, 0, 0.2, 1);

  /* Superficies (dark por defecto) */
  --mur-surface: #16141c;
  --mur-surface-raised: #241f2b;
  --mur-text: #f4f1ec;
  --mur-text-muted: #9a9088;
  --mur-border: rgba(255, 255, 255, 0.1);
  --mur-glass: rgba(34, 28, 27, 0.82);
  --mur-shadow-glass: 0 12px 40px rgba(0, 0, 0, 0.45);
}

[data-theme='light'] {
  --mur-surface: #f3efe9;
  --mur-surface-raised: #fffdfa;
  --mur-text: #2a2420;
  --mur-text-muted: #6a635c;
  --mur-border: rgba(0, 0, 0, 0.08);
  --mur-glass: rgba(255, 253, 250, 0.78);
  --mur-shadow-glass: 0 12px 40px rgba(140, 110, 90, 0.18);
}

@media (prefers-color-scheme: light) {
  :root:not([data-theme='dark']) {
    --mur-surface: #f3efe9;
    --mur-surface-raised: #fffdfa;
    --mur-text: #2a2420;
    --mur-text-muted: #6a635c;
    --mur-border: rgba(0, 0, 0, 0.08);
    --mur-glass: rgba(255, 253, 250, 0.78);
    --mur-shadow-glass: 0 12px 40px rgba(140, 110, 90, 0.18);
  }
}
```

`packages/design-system/src/index.ts`:

```ts
export * from './tokens';
export * from './state-visuals';
```

`packages/design-system/README.md`:

````markdown
# @murmur/design-system

Tokens de diseño de murmur (cápsula cálida, system-aware). Fuente de verdad de color,
tipografía, espaciado, motion y del mapeo de estados del asistente.

## Uso

```ts
import { tokens, stateVisuals } from '@murmur/design-system';
import '@murmur/design-system/tokens.css'; // variables --mur-*
```
````

- `tokens` — objeto tipado (`color`, `font`, `space`, `radius`, `shadow`, `motion`).
- `stateVisuals[state]` — `{ color, animation, label }` para `idle | listening | thinking |
speaking | error`.
- `tokens.css` — variables CSS `--mur-*`. Tema vía `data-theme="dark|light"` o
  `prefers-color-scheme`.

## Paleta

- Acento terracota: `#E0916B` (base).
- Estados: idle `#9A9088`, listening `#E0916B`, thinking `#B79BE8`, speaking `#E6B450`,
  error `#D8584E`.
- Tipografía: Inter/SF (UI) · JetBrains Mono (transcripción/CLI).

````

- [ ] **Step 10: Ejecutar tests, typecheck y build**

Run: `pnpm --filter @murmur/design-system test && pnpm --filter @murmur/design-system typecheck && pnpm --filter @murmur/design-system build`
Expected: tests PASS, typecheck OK, build genera `dist/`.

- [ ] **Step 11: Commit**

```bash
git add packages/design-system pnpm-lock.yaml
git commit -m "feat(design-system): tokens, estados visuales y CSS

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
````

---

## Task 4: `packages/core` (interfaces de modelo + orchestrator esqueleto)

**Files:**

- Create: `packages/core/package.json`
- Create: `packages/core/tsconfig.json`
- Create: `packages/core/src/providers/realtime-model-provider.ts`
- Create: `packages/core/src/providers/transcription-provider.ts`
- Create: `packages/core/src/orchestrator.ts`
- Create: `packages/core/src/index.ts`
- Test: `packages/core/src/orchestrator.test.ts`

- [ ] **Step 1: Crear `package.json` y `tsconfig.json`**

`packages/core/package.json`:

```json
{
  "name": "@murmur/core",
  "version": "0.0.0",
  "type": "module",
  "exports": { ".": { "types": "./src/index.ts", "import": "./src/index.ts" } },
  "scripts": {
    "build": "tsup src/index.ts --format esm --dts --clean",
    "typecheck": "tsc --noEmit",
    "test": "vitest run"
  },
  "dependencies": {
    "@murmur/shared": "workspace:*"
  },
  "devDependencies": {
    "tsup": "catalog:",
    "typescript": "catalog:",
    "vitest": "catalog:"
  }
}
```

`packages/core/tsconfig.json`:

```json
{
  "extends": "../../tsconfig.base.json",
  "include": ["src"]
}
```

Run: `pnpm install`

- [ ] **Step 2: Escribir el test del orchestrator (falla)**

`packages/core/src/orchestrator.test.ts`:

```ts
import { describe, it, expect, vi } from 'vitest';
import { ConversationOrchestrator } from './orchestrator';

describe('ConversationOrchestrator', () => {
  it('arranca en idle', () => {
    const orch = new ConversationOrchestrator();
    expect(orch.getState()).toBe('idle');
  });

  it('notifica los cambios de estado', () => {
    const onStateChange = vi.fn();
    const orch = new ConversationOrchestrator({ onStateChange });
    orch.reset();
    expect(onStateChange).toHaveBeenCalledWith('idle');
  });
});
```

- [ ] **Step 3: Ejecutar y ver que falla**

Run: `pnpm --filter @murmur/core test`
Expected: FAIL — no existe `./orchestrator`.

- [ ] **Step 4: Implementar las interfaces de proveedor**

`packages/core/src/providers/realtime-model-provider.ts`:

```ts
import type { AssistantState } from '@murmur/shared';

export interface RealtimeConnectOptions {
  apiKey: string;
  model: string;
  voice?: string;
  onState?: (state: AssistantState) => void;
  onAudio?: (chunk: Uint8Array) => void;
  onError?: (error: Error) => void;
}

export interface RealtimeModelSession {
  sendAudio(chunk: Uint8Array): void;
  commit(): void;
  interrupt(): void;
  close(): Promise<void>;
}

/** Proveedor de modelo realtime (intercambiable: OpenAI Realtime u otros). */
export interface RealtimeModelProvider {
  readonly id: string;
  connect(options: RealtimeConnectOptions): Promise<RealtimeModelSession>;
}
```

`packages/core/src/providers/transcription-provider.ts`:

```ts
export type TranscriptionMode = 'realtime' | 'whisper-api' | 'local-whisper';

/** Proveedor de transcripción (intercambiable: realtime / Whisper API / Whisper local). */
export interface TranscriptionProvider {
  readonly mode: TranscriptionMode;
  transcribe(audio: Uint8Array): Promise<string>;
}
```

- [ ] **Step 5: Implementar `orchestrator.ts`**

`packages/core/src/orchestrator.ts`:

```ts
import type { AssistantState } from '@murmur/shared';

export interface OrchestratorEvents {
  onStateChange?: (state: AssistantState) => void;
}

/**
 * Centraliza el ciclo de conversación. En Fase 0 solo gestiona la máquina de estados.
 * TODO(F9): activar → capturar → modelo → recuperar contexto → responder → guardar turno.
 */
export class ConversationOrchestrator {
  private state: AssistantState = 'idle';

  constructor(private readonly events: OrchestratorEvents = {}) {}

  getState(): AssistantState {
    return this.state;
  }

  reset(): void {
    this.setState('idle');
  }

  protected setState(next: AssistantState): void {
    this.state = next;
    this.events.onStateChange?.(next);
  }
}
```

- [ ] **Step 6: Implementar `index.ts`**

`packages/core/src/index.ts`:

```ts
export * from './orchestrator';
export * from './providers/realtime-model-provider';
export * from './providers/transcription-provider';
```

- [ ] **Step 7: Ejecutar tests, typecheck y build**

Run: `pnpm --filter @murmur/core test && pnpm --filter @murmur/core typecheck && pnpm --filter @murmur/core build`
Expected: tests PASS, typecheck OK, build OK.

- [ ] **Step 8: Commit**

```bash
git add packages/core pnpm-lock.yaml
git commit -m "feat(core): interfaces de modelo y orchestrator esqueleto

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 5: `packages/audio` (interfaces de audio + null device manager)

**Files:**

- Create: `packages/audio/package.json`
- Create: `packages/audio/tsconfig.json`
- Create: `packages/audio/src/providers.ts`
- Create: `packages/audio/src/index.ts`
- Test: `packages/audio/src/providers.test.ts`

- [ ] **Step 1: Crear `package.json` y `tsconfig.json`**

`packages/audio/package.json`:

```json
{
  "name": "@murmur/audio",
  "version": "0.0.0",
  "type": "module",
  "exports": { ".": { "types": "./src/index.ts", "import": "./src/index.ts" } },
  "scripts": {
    "build": "tsup src/index.ts --format esm --dts --clean",
    "typecheck": "tsc --noEmit",
    "test": "vitest run"
  },
  "dependencies": {
    "@murmur/shared": "workspace:*"
  },
  "devDependencies": {
    "tsup": "catalog:",
    "typescript": "catalog:",
    "vitest": "catalog:"
  }
}
```

`packages/audio/tsconfig.json`:

```json
{
  "extends": "../../tsconfig.base.json",
  "include": ["src"]
}
```

Run: `pnpm install`

- [ ] **Step 2: Escribir el test (falla)**

`packages/audio/src/providers.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { createNullAudioDeviceManager } from './providers';

describe('createNullAudioDeviceManager', () => {
  it('devuelve una lista de dispositivos vacía', async () => {
    const manager = createNullAudioDeviceManager();
    await expect(manager.list()).resolves.toEqual([]);
  });
});
```

- [ ] **Step 3: Ejecutar y ver que falla**

Run: `pnpm --filter @murmur/audio test`
Expected: FAIL — no existe `./providers`.

- [ ] **Step 4: Implementar `providers.ts`**

`packages/audio/src/providers.ts`:

```ts
/** Flujo de audio como iterable asíncrono de chunks PCM. */
export interface AudioStream {
  read(): AsyncIterable<Uint8Array>;
  stop(): Promise<void>;
}

export interface VoiceInputProvider {
  readonly id: string;
  start(deviceId?: string): Promise<AudioStream>;
}

export interface VoiceOutputProvider {
  readonly id: string;
  play(chunks: AsyncIterable<Uint8Array>): Promise<void>;
  stop(): Promise<void>;
}

export interface AudioDevice {
  id: string;
  label: string;
  kind: 'input' | 'output';
}

export interface AudioDeviceManager {
  list(): Promise<AudioDevice[]>;
}

/** Placeholder funcional para Fase 0 / tests. Implementación real en Fase 4. */
export function createNullAudioDeviceManager(): AudioDeviceManager {
  return {
    list: async () => [],
  };
}
```

- [ ] **Step 5: Implementar `index.ts`**

`packages/audio/src/index.ts`:

```ts
export * from './providers';
```

- [ ] **Step 6: Ejecutar tests, typecheck y build**

Run: `pnpm --filter @murmur/audio test && pnpm --filter @murmur/audio typecheck && pnpm --filter @murmur/audio build`
Expected: PASS / OK / OK.

- [ ] **Step 7: Commit**

```bash
git add packages/audio pnpm-lock.yaml
git commit -m "feat(audio): interfaces de audio y null device manager

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 6: `packages/rag` (tipos de memoria + interfaces)

**Files:**

- Create: `packages/rag/package.json`
- Create: `packages/rag/tsconfig.json`
- Create: `packages/rag/src/types.ts`
- Create: `packages/rag/src/providers.ts`
- Create: `packages/rag/src/index.ts`
- Test: `packages/rag/src/types.test.ts`

- [ ] **Step 1: Crear `package.json` y `tsconfig.json`**

`packages/rag/package.json`:

```json
{
  "name": "@murmur/rag",
  "version": "0.0.0",
  "type": "module",
  "exports": { ".": { "types": "./src/index.ts", "import": "./src/index.ts" } },
  "scripts": {
    "build": "tsup src/index.ts --format esm --dts --clean",
    "typecheck": "tsc --noEmit",
    "test": "vitest run"
  },
  "dependencies": {
    "@murmur/shared": "workspace:*"
  },
  "devDependencies": {
    "tsup": "catalog:",
    "typescript": "catalog:",
    "vitest": "catalog:"
  }
}
```

`packages/rag/tsconfig.json`:

```json
{
  "extends": "../../tsconfig.base.json",
  "include": ["src"]
}
```

Run: `pnpm install`

- [ ] **Step 2: Escribir el test (falla)**

`packages/rag/src/types.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { MEMORY_TYPES } from './types';

describe('MEMORY_TYPES', () => {
  it('define los cuatro tipos de memoria', () => {
    expect(MEMORY_TYPES).toEqual([
      'short_term',
      'session_summary',
      'long_term_fact',
      'explicit_user_memory',
    ]);
  });
});
```

- [ ] **Step 3: Ejecutar y ver que falla**

Run: `pnpm --filter @murmur/rag test`
Expected: FAIL — no existe `./types`.

- [ ] **Step 4: Implementar `types.ts`**

`packages/rag/src/types.ts`:

```ts
export const MEMORY_TYPES = [
  'short_term',
  'session_summary',
  'long_term_fact',
  'explicit_user_memory',
] as const;

export type MemoryType = (typeof MEMORY_TYPES)[number];

export interface MemoryItem {
  id: string;
  type: MemoryType;
  content: string;
  /** epoch ms */
  createdAt: number;
  sessionId?: string;
}
```

- [ ] **Step 5: Implementar `providers.ts`**

`packages/rag/src/providers.ts`:

```ts
import type { MemoryItem } from './types';

export interface EmbeddingProvider {
  readonly id: string;
  embed(texts: string[]): Promise<number[][]>;
}

export interface MemoryStore {
  add(item: MemoryItem): Promise<void>;
  all(): Promise<MemoryItem[]>;
  clear(): Promise<void>;
}

export interface RagRetriever {
  retrieve(query: string, options?: { limit?: number }): Promise<MemoryItem[]>;
}

export interface SessionSummarizer {
  summarize(sessionId: string): Promise<string>;
}

export interface FactExtractor {
  extract(text: string): Promise<string[]>;
}
```

- [ ] **Step 6: Implementar `index.ts`**

`packages/rag/src/index.ts`:

```ts
export * from './types';
export * from './providers';
```

- [ ] **Step 7: Ejecutar tests, typecheck y build**

Run: `pnpm --filter @murmur/rag test && pnpm --filter @murmur/rag typecheck && pnpm --filter @murmur/rag build`
Expected: PASS / OK / OK.

- [ ] **Step 8: Commit**

```bash
git add packages/rag pnpm-lock.yaml
git commit -m "feat(rag): tipos de memoria e interfaces de RAG

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 7: `packages/cli` (lógica + binario `murmur`)

**Files:**

- Create: `packages/cli/package.json`
- Create: `packages/cli/tsconfig.json`
- Create: `packages/cli/tsup.config.ts`
- Create: `packages/cli/src/cli.ts`
- Create: `packages/cli/src/index.ts`
- Test: `packages/cli/src/cli.test.ts`

- [ ] **Step 1: Crear `package.json`, `tsconfig.json` y `tsup.config.ts`**

`packages/cli/package.json`:

```json
{
  "name": "murmur",
  "version": "0.0.0",
  "type": "module",
  "bin": { "murmur": "./dist/index.js" },
  "files": ["dist"],
  "exports": { ".": { "types": "./src/index.ts", "import": "./src/index.ts" } },
  "scripts": {
    "build": "tsup",
    "typecheck": "tsc --noEmit",
    "test": "vitest run"
  },
  "dependencies": {
    "@murmur/shared": "workspace:*"
  },
  "devDependencies": {
    "tsup": "catalog:",
    "typescript": "catalog:",
    "vitest": "catalog:"
  }
}
```

`packages/cli/tsconfig.json`:

```json
{
  "extends": "../../tsconfig.base.json",
  "include": ["src"]
}
```

`packages/cli/tsup.config.ts` (empaqueta las deps del workspace dentro del binario):

```ts
import { defineConfig } from 'tsup';

export default defineConfig({
  entry: ['src/index.ts'],
  format: ['esm'],
  dts: true,
  clean: true,
  noExternal: [/^@murmur\//],
});
```

Run: `pnpm install`

- [ ] **Step 2: Escribir el test (falla)**

`packages/cli/src/cli.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { run, VERSION } from './cli';

describe('cli run', () => {
  it('devuelve la versión con --version', () => {
    expect(run(['--version'])).toBe(VERSION);
  });

  it('muestra la ayuda por defecto', () => {
    expect(run([])).toContain('murmur');
    expect(run([])).toContain('Comandos');
  });

  it('avisa ante un comando desconocido', () => {
    expect(run(['frobnicate'])).toContain('desconocido');
  });
});
```

- [ ] **Step 3: Ejecutar y ver que falla**

Run: `pnpm --filter murmur test`
Expected: FAIL — no existe `./cli`.

- [ ] **Step 4: Implementar `cli.ts`**

`packages/cli/src/cli.ts`:

```ts
export const VERSION = '0.0.0';

export function helpText(): string {
  return `murmur — asistente de voz con IA

Uso: murmur <comando>

Comandos (próximamente, Fase 1+):
  start     Inicia el asistente
  config    Configura murmur (API key, hotkey, …)
  status    Muestra el estado
  help      Muestra esta ayuda`;
}

/** Punto de entrada puro (sin efectos): recibe argv y devuelve la salida a imprimir. */
export function run(argv: string[]): string {
  const [command] = argv;

  switch (command) {
    case '-v':
    case '--version':
      return VERSION;
    case undefined:
    case 'help':
    case '--help':
      return helpText();
    default:
      // TODO(F1): implementar start, config, config set-openai-key, memory reset, status.
      return `murmur: comando desconocido "${command}". Usa "murmur help".`;
  }
}
```

- [ ] **Step 5: Implementar el binario `index.ts`**

`packages/cli/src/index.ts`:

```ts
#!/usr/bin/env node
import { run } from './cli';

console.log(run(process.argv.slice(2)));
```

- [ ] **Step 6: Ejecutar tests, typecheck y build**

Run: `pnpm --filter murmur test && pnpm --filter murmur typecheck && pnpm --filter murmur build`
Expected: tests PASS, typecheck OK, build genera `dist/index.js` con shebang.

- [ ] **Step 7: Verificar el binario en ejecución**

Run: `node packages/cli/dist/index.js --version`
Expected: imprime `0.0.0`.

Run: `node packages/cli/dist/index.js`
Expected: imprime la ayuda (contiene "murmur" y "Comandos").

- [ ] **Step 8: Commit**

```bash
git add packages/cli pnpm-lock.yaml
git commit -m "feat(cli): binario murmur con ayuda y versión

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 8: `packages/native` (crate Rust autónomo)

**Files:**

- Create: `packages/native/Cargo.toml`
- Create: `packages/native/src/lib.rs`

> Este crate NO entra en el pipeline de pnpm (no tiene `package.json`). Se prueba con `cargo`.

- [ ] **Step 1: Crear `Cargo.toml`**

`packages/native/Cargo.toml`:

```toml
[package]
name = "murmur-native"
version = "0.0.0"
edition = "2021"
description = "Helpers nativos de murmur (hotkeys, audio nativo). Esqueleto para Fase 3+."

[lib]
crate-type = ["rlib"]
```

- [ ] **Step 2: Implementar `src/lib.rs` con su test**

`packages/native/src/lib.rs`:

```rust
//! Helpers nativos de murmur (hotkeys globales, audio nativo). Esqueleto para Fase 3+.

/// Identificador del crate. Placeholder hasta que aterricen las funciones nativas.
pub fn package_name() -> &'static str {
    "murmur-native"
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn exposes_package_name() {
        assert_eq!(package_name(), "murmur-native");
    }
}
```

- [ ] **Step 3: Ejecutar el test de Rust**

Run: `cd packages/native && cargo test && cd ../..`
Expected: compila y el test `exposes_package_name` PASS.

- [ ] **Step 4: Commit**

```bash
git add packages/native
git commit -m "feat(native): crate Rust esqueleto con cargo test

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 9: `apps/desktop` (esqueleto Vite + React + cáscara Tauri)

**Files:**

- Create: `apps/desktop/package.json`
- Create: `apps/desktop/tsconfig.json`
- Create: `apps/desktop/vite.config.ts`
- Create: `apps/desktop/index.html`
- Create: `apps/desktop/src/main.tsx`
- Create: `apps/desktop/src/App.tsx`
- Create: `apps/desktop/src/styles.css`
- Create: `apps/desktop/src-tauri/tauri.conf.json`
- Create: `apps/desktop/src-tauri/Cargo.toml`
- Create: `apps/desktop/src-tauri/build.rs`
- Create: `apps/desktop/src-tauri/src/main.rs`
- Create: `apps/desktop/src-tauri/src/lib.rs`

> `pnpm build` para esta app = `vite build` (frontend). La compilación nativa de Tauri
> (`pnpm --filter @murmur/desktop tauri build`) se ejercita en Fase 2 y requiere las
> dependencias de sistema del webview; queda fuera del pipeline por defecto.

- [ ] **Step 1: Crear `package.json`**

`apps/desktop/package.json`:

```json
{
  "name": "@murmur/desktop",
  "private": true,
  "version": "0.0.0",
  "type": "module",
  "scripts": {
    "dev": "vite",
    "build": "vite build",
    "typecheck": "tsc --noEmit",
    "tauri": "tauri"
  },
  "dependencies": {
    "@murmur/design-system": "workspace:*",
    "@murmur/shared": "workspace:*",
    "react": "catalog:",
    "react-dom": "catalog:"
  },
  "devDependencies": {
    "@tauri-apps/api": "catalog:",
    "@tauri-apps/cli": "catalog:",
    "@types/react": "catalog:",
    "@types/react-dom": "catalog:",
    "@vitejs/plugin-react": "catalog:",
    "typescript": "catalog:",
    "vite": "catalog:"
  }
}
```

`apps/desktop/tsconfig.json`:

```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "jsx": "react-jsx",
    "types": ["vite/client"]
  },
  "include": ["src", "vite.config.ts"]
}
```

`apps/desktop/vite.config.ts`:

```ts
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  clearScreen: false,
  server: { port: 1420, strictPort: true },
});
```

Run: `pnpm install`

- [ ] **Step 2: Crear `index.html`**

`apps/desktop/index.html`:

```html
<!doctype html>
<html lang="es" data-theme="dark">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>murmur</title>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/main.tsx"></script>
  </body>
</html>
```

- [ ] **Step 3: Crear `src/styles.css` y `src/App.tsx` (consume el design system)**

`apps/desktop/src/styles.css`:

```css
* {
  box-sizing: border-box;
  margin: 0;
}
body {
  font-family: var(--mur-font-ui);
  background: var(--mur-surface);
  color: var(--mur-text);
  height: 100vh;
  display: grid;
  place-items: center;
}
.pill {
  display: inline-flex;
  align-items: center;
  gap: 10px;
  padding: 11px 17px;
  border-radius: var(--mur-radius-full);
  background: var(--mur-glass);
  border: 1px solid var(--mur-border);
  box-shadow: var(--mur-shadow-glass);
  backdrop-filter: blur(12px);
}
.pill .dot {
  width: 11px;
  height: 11px;
  border-radius: 50%;
}
.pill .label {
  font-size: var(--mur-font-size, 12px);
  color: var(--mur-text-muted);
}
```

`apps/desktop/src/App.tsx`:

```tsx
import type { AssistantState } from '@murmur/shared';
import { stateVisuals } from '@murmur/design-system';

const STATE: AssistantState = 'idle';

export function App() {
  const visual = stateVisuals[STATE];
  return (
    <div className="pill" role="status" aria-label={`murmur: ${visual.label}`}>
      <span className="dot" style={{ background: visual.color }} />
      <span className="label">murmur · {visual.label}</span>
    </div>
  );
}
```

- [ ] **Step 4: Crear `src/main.tsx`**

`apps/desktop/src/main.tsx`:

```tsx
import React from 'react';
import { createRoot } from 'react-dom/client';
import '@murmur/design-system/tokens.css';
import './styles.css';
import { App } from './App';

const rootEl = document.getElementById('root');
if (!rootEl) {
  throw new Error('No se encontró el elemento #root');
}

createRoot(rootEl).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
```

- [ ] **Step 5: Crear la cáscara Tauri (esqueleto, no se construye en este pipeline)**

`apps/desktop/src-tauri/tauri.conf.json`:

```json
{
  "$schema": "https://schema.tauri.app/config/2",
  "productName": "murmur",
  "version": "0.0.0",
  "identifier": "app.murmur.desktop",
  "build": {
    "frontendDist": "../dist",
    "devUrl": "http://localhost:1420",
    "beforeDevCommand": "pnpm dev",
    "beforeBuildCommand": "pnpm build"
  },
  "app": {
    "windows": [
      {
        "title": "murmur",
        "width": 420,
        "height": 120,
        "resizable": false,
        "decorations": false,
        "transparent": true,
        "alwaysOnTop": true
      }
    ],
    "security": { "csp": null }
  },
  "bundle": { "active": true, "targets": "all" }
}
```

`apps/desktop/src-tauri/Cargo.toml`:

```toml
[package]
name = "murmur-desktop"
version = "0.0.0"
edition = "2021"

[lib]
name = "murmur_desktop_lib"
crate-type = ["staticlib", "cdylib", "rlib"]

[build-dependencies]
tauri-build = { version = "2", features = [] }

[dependencies]
tauri = { version = "2", features = [] }
```

`apps/desktop/src-tauri/build.rs`:

```rust
fn main() {
    tauri_build::build()
}
```

`apps/desktop/src-tauri/src/lib.rs`:

```rust
//! Cáscara Tauri de murmur. La integración nativa (hotkeys, audio) llega en Fase 2+.

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .run(tauri::generate_context!())
        .expect("error al arrancar la app de murmur");
}
```

`apps/desktop/src-tauri/src/main.rs`:

```rust
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

fn main() {
    murmur_desktop_lib::run()
}
```

- [ ] **Step 6: Typecheck y build del frontend**

Run: `pnpm --filter @murmur/desktop typecheck && pnpm --filter @murmur/desktop build`
Expected: typecheck OK; `vite build` genera `apps/desktop/dist/` consumiendo los tokens del
design system sin errores.

- [ ] **Step 7: Commit**

```bash
git add apps/desktop pnpm-lock.yaml
git commit -m "feat(desktop): esqueleto Vite+React con cáscara Tauri

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 10: Brief de diseño del MVP

**Files:**

- Create: `docs/design/mvp-brief.md`

- [ ] **Step 1: Escribir el brief**

`docs/design/mvp-brief.md`:

```markdown
# murmur — Brief de diseño del MVP

> Fecha: 2026-06-23 · Producto: murmur · Dirección: cápsula cálida · Tema: system-aware

## 1. Objetivo del MVP

Que el usuario pulse un atajo, hable y reciba respuesta por voz con baja latencia, viendo en
todo momento el estado del asistente. Cubre Fases 0–6 (fundamentos → realtime → persistencia
local). La memoria semántica (RAG) es post-MVP.

## 2. No-objetivos (MVP)

- Wake word (fases avanzadas).
- RAG / memoria de largo plazo (Fase 7+).
- Acciones del sistema / plugins (Fase 15).
- Multi-idioma de UI (más allá de español/inglés base).

## 3. Personalidad

Íntima, humana, cálida, cercana. Discreta hasta que se la llama. La onda de audio es la
protagonista; el texto, secundario.

## 4. Superficies a diseñar

1. **Cápsula flotante** — componente principal. 5 estados (`idle`, `listening`, `thinking`,
   `speaking`, `error`), dark+light, anclable (esquina / abajo-centro), arrastrable. Modos
   **push-to-talk** y **toggle**.
2. **Onboarding mínimo** — primer arranque: API key de OpenAI (se guarda en `~/.murmur/`,
   nunca en repo), permiso de micrófono, elección de hotkey.
3. **Ajustes** — micrófono, voz/modelo, hotkey, tema, estado de conexión.
4. **Errores / vacíos** — sin API key, sin micrófono, sin red, permiso denegado.

## 5. Flujos

- **Activar → hablar → responder:** hotkey → `listening` → `thinking` → `speaking` → `idle`.
- **Push-to-talk vs toggle:** mantener pulsado (PTT) o pulsar para alternar.
- **Interrupción:** el usuario puede cortar la respuesta hablando o con el hotkey.

## 6. Principios de experiencia

- Invisible hasta que se la llama.
- Feedback de estado inmediato (objetivo < 100 ms desde la pulsación).
- Respuesta por voz breve.
- Cero fricción.
- Accesibilidad: foco visible, contraste AA, navegación por teclado, `aria-label` con el
  estado.

## 7. Especificaciones visuales

Referencia: `@murmur/design-system`.

- Acento terracota `#E0916B`. Estados: idle `#9A9088`, listening `#E0916B`, thinking
  `#B79BE8`, speaking `#E6B450`, error `#D8584E`.
- Tipografía: Inter/SF (UI), JetBrains Mono (transcripción/CLI).
- Cápsula: `radius.full`, superficie glass (`--mur-glass`), sombra `--mur-shadow-glass`,
  `backdrop-filter: blur(12px)`.
- Motion por estado: `listening` respira, `thinking` pulsa, `speaking` ecualiza, `error`
  shake. Duración base 200 ms, easing `standard`.

## 8. Criterios de aceptación del diseño

- Los 5 estados son distinguibles a simple vista en dark y light.
- La cápsula no obstruye el trabajo (tamaño pequeño, arrastrable, always-on-top opcional).
- Onboarding completable sin documentación.
- Todos los estados de error tienen mensaje claro y acción de recuperación.
- Contraste AA en texto e indicadores.
```

- [ ] **Step 2: Verificar que existe**

Run: `test -f docs/design/mvp-brief.md && echo OK`
Expected: `OK`.

- [ ] **Step 3: Commit**

```bash
git add docs/design/mvp-brief.md
git commit -m "docs(design): brief de diseño del MVP

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 11: Verificación completa de la Fase 0

**Files:** (ninguno nuevo; valida el conjunto)

- [ ] **Step 1: Instalar limpio**

Run: `pnpm install`
Expected: sin errores.

- [ ] **Step 2: Typecheck del workspace**

Run: `pnpm typecheck`
Expected: todos los paquetes en strict sin errores.

- [ ] **Step 3: Lint**

Run: `pnpm lint`
Expected: sin errores.

- [ ] **Step 4: Format (comprobación)**

Run: `pnpm format`
Expected: aplica formato sin romper nada (idealmente sin cambios pendientes).

- [ ] **Step 5: Tests**

Run: `pnpm test`
Expected: todos los tests de humo/lógica PASS.

- [ ] **Step 6: Build**

Run: `pnpm build`
Expected: todos los paquetes (incl. `apps/desktop` con `vite build`) compilan.

- [ ] **Step 7: Test del crate Rust**

Run: `cd packages/native && cargo test && cd ../..`
Expected: PASS.

- [ ] **Step 8: Verificación de criterios de aceptación (spec §8)**

Comprobar manualmente:

- Existe la estructura de §4 del spec.
- `@murmur/design-system` exporta los tokens.
- Existen `README.md`, `.env.example`, `.nvmrc`, `.gitignore`.
- Existe `docs/design/mvp-brief.md`.
- No hay secretos en el repo: `git grep -nE "sk-[A-Za-z0-9]" || echo "sin claves"` → "sin claves".

- [ ] **Step 9: Commit final (si format dejó cambios)**

```bash
git add -A
git commit -m "chore: verificación de la Fase 0 (typecheck, lint, test, build verdes)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>" || echo "nada que commitear"
```

---

## Self-Review (autor del plan)

**Cobertura del spec:**

- §4 Arquitectura/tooling → Tasks 1–9. ✓
- §4.3 Interfaces por paquete → core (T4), audio (T5), rag (T6), cli (T7), shared (T2). ✓
- §5 Design system (tokens, state-visuals, CSS, README) → Task 3. ✓
- §6 Brief del MVP → Task 10. ✓
- §7 Tests + mocks → tests de humo/lógica en cada paquete; mocks de OpenAI quedan para las
  fases con red (interfaces ya listas). ✓
- §8 Criterios de aceptación F0 → Task 11. ✓
- Nota de consistencia con el spec: `AssistantState` vive en `@murmur/shared` (tipo de
  dominio sin deps) y `@murmur/design-system` lo importa para `stateVisuals`. Esto resuelve la
  ambigüedad del spec (§4.3 vs §5.2) sin duplicar el tipo.

**Placeholders:** los únicos `TODO(...)` son marcadores explícitos de fase futura
(F1/F9) exigidos por la forma de trabajo ("usa TODOs explícitos para cosas fuera de fase"),
no huecos del plan. Todo paso tiene código/comando concreto.

**Consistencia de tipos/nombres:** `AssistantState`, `ASSISTANT_STATES`, `stateVisuals`,
`StateVisual`, `StateAnimation`, `MEMORY_TYPES`/`MemoryType`, `ConversationOrchestrator`
(`getState`/`reset`/`setState`), `run`/`VERSION`/`helpText`, `createNullAudioDeviceManager`
coinciden entre tareas, tests e implementación.

```

```
