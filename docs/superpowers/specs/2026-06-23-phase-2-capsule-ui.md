# murmur — Spec: Fase 2 (UI Tauri — Cápsula real)

- **Fecha:** 2026-06-23
- **Producto:** `murmur` · app `apps/desktop`
- **Estado:** Aprobado, pendiente de implementación
- **Depende de:** Fase 0 (design-system, app esqueleto), Fase 1 (CLI/config)

---

## 1. Resumen

Convertir la "pill" estática de la Fase 0 en la **cápsula cálida real**: el componente principal
de murmur. Refleja los 5 estados del asistente con su color y animación, con la **onda de
audio/ecualizador como protagonista**, es **arrastrable** y **anclable**, soporta los modos de
interacción **push-to-talk** y **toggle**, y es **system-aware** (dark/light). La lógica
stateful se extrae a módulos puros testeables; el componente React es la cáscara. No hay audio ni
hotkey real todavía (F3/F4): aquí se construye y se demuestra la UI con un panel de control de
desarrollo que permite recorrer los estados.

## 2. Decisiones confirmadas

| Tema | Decisión |
| ---- | -------- |
| Lógica vs vista | Lógica pura en `src/capsule/*.ts` (visual, interacción, anclaje), testeada sin DOM. El componente `Capsule.tsx` es glue fino. |
| Animaciones | CSS keyframes en `styles.css`: `breathe` (listening), `pulse` (thinking), `equalize` (speaking, barras EQ), `shake` (error), reposo sin animación (idle). Respetar `prefers-reduced-motion: reduce` (desactiva/atenúa). |
| Ecualizador | Componente `Waveform` con N barras animadas; es el foco visual. Activo/intenso en `listening` y `speaking`; quieto en idle/thinking/error. |
| Arrastre | Atributo `data-tauri-drag-region` en el contenedor (nativo en Tauri; no-op en navegador/dev). |
| Anclaje | Función pura `anchorStyle(anchor)` → CSS de posición. Anclas: `bottom-center` (default), `top-left`, `top-right`, `bottom-left`, `bottom-right`. (La colocación real de la ventana nativa es F11; aquí es layout dentro del viewport.) |
| Interacción | `mode: 'push-to-talk' \| 'toggle'`. Reductor puro `nextCapture(mode, capturing, event)` con eventos `press`/`release`/`cancel`. PTT: press→capturando (listening), release→fin (thinking). Toggle: press alterna listening/idle. El pipeline completo es F9. |
| Estado | Hook `useCapsule()` (`useReducer`) con `{ state, mode, anchor }` y acciones (`setState`, `setMode`, `setAnchor`, `press`, `release`). |
| Tema | `data-theme` en `<html>` (ya soportado por `tokens.css`) + `prefers-color-scheme`. El panel dev permite forzar dark/light/system. |
| Tests UI | Añadir Vitest + jsdom + `@testing-library/react` + `@testing-library/jest-dom` a `apps/desktop`. `vite.config.ts` con `test` (entorno jsdom, setup jest-dom). Script `test: "vitest run"` → entra en `pnpm -r test`. |
| Tauri | Fijar `security.csp` a un valor sano (cerrar `TODO(F2)`); mantener ventana transparente, sin decoración, always-on-top, 420×120. |

## 3. Superficie y comportamiento

- **Cápsula**: contenedor `radius.full`, superficie glass (`--mur-glass`), borde `--mur-border`,
  sombra `--mur-shadow-glass`, `backdrop-filter: blur(12px)`. Contiene: indicador de estado
  (punto con el color del estado), `Waveform` (EQ), y etiqueta (`JetBrains Mono` para texto
  técnico, `Inter` para UI). Tamaño compacto, no obstructivo.
- **Estados** (de `@murmur/design-system` `stateVisuals`, única fuente de verdad):
  `idle #9A9088 (none)`, `listening #E0916B (breathe)`, `thinking #B79BE8 (pulse)`,
  `speaking #E6B450 (equalize)`, `error #D8584E (shake)`. Cada estado debe ser distinguible a
  simple vista en dark y light (color + animación + etiqueta).
- **Interacción**: en modo toggle, el cuerpo de la cápsula es un `button` con `aria-pressed`
  reflejando si está capturando; en PTT, mantener pulsado (mouse/Space) captura y soltar termina.
  Teclado: `Space`/`Enter` disparan el gesto; `focus-visible` con anillo de foco accesible.
- **Accesibilidad**: `role="status"` + `aria-live="polite"` para anunciar cambios de estado;
  `aria-label` con la etiqueta del estado; contraste AA; navegable por teclado.
- **Panel dev** (en `App.tsx`, provisional hasta F11): botones para fijar cada estado, alternar
  modo (PTT/toggle), cambiar ancla y tema. Permite verificar los 5 estados sin audio.

## 4. Entregables

Código:
- `src/capsule/visual.ts` — `deriveVisual(state)` → `{ color, animation, label, showEq }`.
- `src/capsule/interaction.ts` — `nextCapture(mode, capturing, event)` y tipos.
- `src/capsule/anchor.ts` — `ANCHORS`, `anchorStyle(anchor)`.
- `src/capsule/useCapsule.ts` — hook de estado.
- `src/components/Waveform.tsx` — barras EQ animadas.
- `src/components/Capsule.tsx` — cápsula completa.
- `src/App.tsx` — cápsula + panel dev.
- `src/styles.css` — keyframes + estilos (reduced-motion incluido).
- `src/test/setup.ts` — `@testing-library/jest-dom/vitest`.
- `vite.config.ts` — `defineConfig` de `vitest/config` con bloque `test` (jsdom + setup).
- `package.json` (desktop) — script `test` + devDeps de testing.
- `pnpm-workspace.yaml` — catalog: `jsdom`, `@testing-library/react`, `@testing-library/dom`, `@testing-library/jest-dom`.
- `src-tauri/tauri.conf.json` — `csp` definido.

Tests:
- `visual.test.ts`, `interaction.test.ts`, `anchor.test.ts` (puros).
- `Capsule.test.tsx` (RTL): por cada estado, el color/clase de animación y `aria-label`
  correctos; EQ presente en listening/speaking; en toggle `aria-pressed` cambia al pulsar.

## 5. Criterios de aceptación

1. `pnpm install && pnpm typecheck && pnpm lint && pnpm test && pnpm build` en verde (incluye los
   nuevos tests de `apps/desktop` y `vite build`).
2. Prettier limpio (`prettier --check .`).
3. Los 5 estados son distinguibles (color + animación) y la cápsula es arrastrable (atributo
   presente) y anclable (lógica testeada).
4. PTT y toggle funcionan según el reductor (testeado); `aria-pressed`/`aria-label` correctos.
5. `prefers-reduced-motion` respetado.
6. `security.csp` definido en `tauri.conf.json` (sin `TODO(F2)` pendiente sobre CSP).
7. TS strict sin `any` injustificado; ESLint sin errores. La build nativa de Tauri sigue fuera
   del pipeline (no se ejecuta aquí).

## 6. Fuera de alcance

Audio real (F4), hotkey global (F3), onboarding/ajustes completos (F11), colocación de ventana
nativa por ancla (F11), conexión al modelo (F5/F9). El panel dev es provisional.
