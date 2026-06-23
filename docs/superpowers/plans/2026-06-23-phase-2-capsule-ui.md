# murmur — Fase 2 (UI Tauri — Cápsula real) — Plan de implementación

> REQUIRED SUB-SKILL: superpowers:subagent-driven-development / test-driven-development.
> TDD: test primero (falla) → implementación (pasa). Commit por Task con el trailer
> `Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>`.

**Goal:** Cápsula cálida real en `apps/desktop`: 5 estados con color+animación, ecualizador como
protagonista, arrastrable, anclable, PTT/toggle, system-aware, con lógica pura testeada y tests
de render (RTL). Repo en verde.

**Spec:** `docs/superpowers/specs/2026-06-23-phase-2-capsule-ui.md` (contrato).

**Convenciones:** TS strict ESM; consumir `@murmur/design-system` (`stateVisuals`, `tokens.css`)
y `@murmur/shared` (`AssistantState`); imports explícitos de `vitest` (sin globals).

---

## Task 1: Setup de testing en `apps/desktop`

**Files:** `pnpm-workspace.yaml`, `apps/desktop/package.json`, `apps/desktop/vite.config.ts`,
`apps/desktop/src/test/setup.ts`, `apps/desktop/tsconfig.json`.

- [ ] Añadir al `catalog` de `pnpm-workspace.yaml`:
      `jsdom: ^25.0.1`, `'@testing-library/react': ^16.1.0`, `'@testing-library/dom': ^10.4.0`,
      `'@testing-library/jest-dom': ^6.6.3`. (`vitest` ya está en catalog.)
- [ ] `apps/desktop/package.json`: añadir `"test": "vitest run"` a scripts; devDeps
      `vitest`, `jsdom`, `@testing-library/react`, `@testing-library/dom`, `@testing-library/jest-dom` (todas `catalog:`).
- [ ] `apps/desktop/vite.config.ts`: importar `defineConfig` de `vitest/config`; añadir
      `test: { environment: 'jsdom', globals: false, setupFiles: ['./src/test/setup.ts'], css: true }`.
- [ ] `apps/desktop/src/test/setup.ts`: `import '@testing-library/jest-dom/vitest';`
- [ ] `pnpm install`. Smoke: crear un test trivial temporal `1+1===2` y `pnpm --filter @murmur/desktop test` PASS; bórralo.
- [ ] Commit: `chore(desktop): setup de Vitest + Testing Library (jsdom)`.

## Task 2: Lógica pura de la cápsula (visual, interacción, anclaje)

**Files:** `src/capsule/visual.ts`, `src/capsule/interaction.ts`, `src/capsule/anchor.ts` (+ tests).

Contratos:

```ts
// visual.ts
export interface CapsuleVisual {
  color: string;
  animation: StateAnimation;
  label: string;
  showEq: boolean;
}
export function deriveVisual(state: AssistantState): CapsuleVisual; // showEq = state==='listening' || state==='speaking'

// interaction.ts
export type InteractionMode = 'push-to-talk' | 'toggle';
export type CaptureEvent = 'press' | 'release' | 'cancel';
export interface CaptureResult {
  capturing: boolean;
  state: AssistantState;
}
export function nextCapture(
  mode: InteractionMode,
  capturing: boolean,
  event: CaptureEvent,
): CaptureResult;
// PTT: press→{true,'listening'}; release(si capturando)→{false,'thinking'}; cancel→{false,'idle'}
// toggle: press→ alterna: si !capturando {true,'listening'} si capturando {false,'thinking'}; cancel→{false,'idle'}

// anchor.ts
export type Anchor = 'bottom-center' | 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right';
export const ANCHORS: readonly Anchor[];
export function anchorStyle(anchor: Anchor): CSSProperties; // position fixed + insets + transform según ancla
```

- [ ] Tests primero (fallan): `deriveVisual` para los 5 estados (color/animation desde
      `stateVisuals`, `showEq` correcto); `nextCapture` cubre PTT y toggle con todas las transiciones;
      `anchorStyle` devuelve la posición esperada para cada ancla (p. ej. bottom-center → `bottom`
      fijado + `left:50%` + `translateX(-50%)`).
- [ ] Implementar los tres módulos.
- [ ] `pnpm --filter @murmur/desktop test` verde.
- [ ] Commit: `feat(desktop): lógica pura de la cápsula (visual, interacción, anclaje)`.

## Task 3: Componentes `Waveform` y `Capsule` + hook `useCapsule`

**Files:** `src/components/Waveform.tsx`, `src/components/Capsule.tsx`, `src/capsule/useCapsule.ts`,
`src/components/Capsule.test.tsx`.

- [ ] `Waveform.tsx`: render de N barras (`<span class="eq-bar">`), prop `active: boolean` y
      `state`; cuando no activo, barras quietas. Usa `aria-hidden` (decorativo).
- [ ] `useCapsule.ts`: `useReducer` con `{ state, mode, anchor }` + acciones `setState`,
      `setMode`, `setAnchor`, `press`, `release`, `cancel` (usa `nextCapture`).
- [ ] `Capsule.tsx`: consume `deriveVisual` y `anchorStyle`. Contenedor con
      `data-tauri-drag-region`, `role="status"`, `aria-live="polite"`, `aria-label`=label. En modo
      toggle, cuerpo interactivo `button` con `aria-pressed`. Maneja mouse/teclado (Space/Enter)
      para press/release. Aplica clase de animación según `visual.animation` y color al punto.
- [ ] Tests RTL (`Capsule.test.tsx`, fallan primero): para cada estado renderiza con el
      `aria-label` correcto y el color del punto correcto; clase de animación presente; EQ presente
      en listening/speaking y ausente/quieto en idle; en toggle, pulsar cambia `aria-pressed`.
- [ ] `pnpm --filter @murmur/desktop test` verde.
- [ ] Commit: `feat(desktop): componentes Capsule + Waveform y hook useCapsule`.

## Task 4: `App.tsx` (panel dev), estilos/animaciones y CSP de Tauri

**Files:** `src/App.tsx`, `src/styles.css`, `src-tauri/tauri.conf.json`.

- [ ] `styles.css`: estilos de cápsula (glass, blur, radius full), `.eq-bar` y keyframes
      `breathe`, `pulse`, `equalize` (varias barras con delays), `shake`; bloque
      `@media (prefers-reduced-motion: reduce)` que desactiva/atenúa animaciones; estilos del panel
      dev y `:focus-visible`.
- [ ] `App.tsx`: usar `useCapsule` + `<Capsule/>` + panel dev (botones de estado, toggle modo,
      selector de ancla, selector de tema que fija `document.documentElement.dataset.theme`).
- [ ] `tauri.conf.json`: `security.csp` →
      `"default-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'self' https: wss:"`
      (permite el realtime de F5 vía wss). Mantener props de ventana.
- [ ] `pnpm --filter @murmur/desktop typecheck && pnpm --filter @murmur/desktop build` verde.
- [ ] Commit: `feat(desktop): cápsula en App con panel dev, animaciones y CSP de Tauri`.

## Task 5: Verificación de fase

- [ ] `pnpm install && pnpm typecheck && pnpm lint && pnpm test && pnpm build` → verde.
- [ ] `pnpm exec prettier --check .` → limpio (si no, `pnpm format` + commit).
- [ ] `cd packages/native && cargo test` → verde (no tocado).
- [ ] Revisar criterios de aceptación del spec §5.

---

## Self-Review (mapeo spec → tasks)

- §2 testing UI → Task 1. Lógica pura (visual/interacción/anclaje) → Task 2.
- §3 cápsula/EQ/interacción/accesibilidad → Task 3. Panel dev/animaciones/tema → Task 4.
- §2 Tauri CSP → Task 4. §5 criterios → Task 5.
