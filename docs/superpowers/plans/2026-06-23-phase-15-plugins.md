# murmur — Fase 15 (Plugins) — Plan de implementación

> REQUIRED SUB-SKILL: superpowers:subagent-driven-development / test-driven-development.
> TDD: test primero (falla) → implementación (pasa). Commit por Task con el trailer
> `Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>`.

**Goal:** Sistema de plugins/skills extensible (`@murmur/plugins`): interfaz, registry con sandbox,
tool-defs, plugins de ejemplo, + `PluginError` y `murmur plugins list`. Repo en verde.

**Spec:** `docs/superpowers/specs/2026-06-23-phase-15-plugins.md`.

**Convenciones:** TS strict ESM; sigue el patrón de los paquetes existentes (exports → src, tsup,
vitest); side effects inyectados; NO toques `PROGRESS.md`.

---

## Task 1: `PluginError` (`@murmur/shared`)

**Files:** `packages/shared/src/errors.ts` (+ test).

- [ ] Test (falla→pasa): `new PluginError('x').code==='PLUGIN_ERROR'` e `instanceof MurmurError`.
- [ ] Implementar (patrón de `ConfigError`). Commit: `feat(shared): PluginError`.

## Task 2: Scaffolding del paquete `@murmur/plugins` + interfaz + registry

**Files:** `packages/plugins/{package.json,tsconfig.json,tsup.config.ts}`, `src/plugin.ts`,
`src/registry.ts`, `src/index.ts` (+ tests).

- [ ] `package.json` (`@murmur/plugins`, exports→src, build tsup, test vitest, dep `@murmur/shared`),
  `tsconfig.json` (extiende la base), `tsup.config.ts`. `pnpm install`.
- [ ] `plugin.ts`: `Plugin`, `PluginContext`, `PluginResult`, `JsonSchema`. `registry.ts`:
  `createPluginRegistry({ allowed })` con `register/list/get/dispatch/toToolDefinitions`.
- [ ] Tests (fallan→pasan): register/list/get; dispatch ejecuta permitido y devuelve `PluginResult`;
  capacidad no permitida → `PluginError`; args inválidos → error; `toToolDefinitions` formato correcto.
- [ ] Commit: `feat(plugins): paquete @murmur/plugins con registry y sandbox`.

## Task 3: Plugins de ejemplo

**Files:** `packages/plugins/src/plugins/{clipboard,open-app,time}.ts` (+ tests), export en `index.ts`.

- [ ] `clipboardWritePlugin({ clipboard })` (cap `clipboard:write`), `openAppPlugin({ open })`
  (cap `system:open`), `currentTimePlugin({ now })` (cap `[]`). Cada uno con schema y `run`.
- [ ] Tests (fallan→pasan): clipboard llama `writeText` con el texto; open-app llama `open` con la url;
  time devuelve la hora del `now` inyectado; resultados `ok:true`; errores del efecto → `ok:false`/`PluginError`.
- [ ] Commit: `feat(plugins): plugins de ejemplo (clipboard, open-app, time)`.

## Task 4: `murmur plugins list` (`@murmur/cli`)

**Files:** `packages/cli/src/cli.ts`, `packages/cli/package.json` (dep `@murmur/plugins`) (+ tests).

- [ ] `plugins list`: construye los plugins integrados con deps nulas/seguras y lista nombre +
  descripción + capacidades. Añadir a `help`.
- [ ] Tests (fallan→pasan): `plugins list` muestra los nombres de los plugins integrados.
- [ ] Commit: `feat(cli): comando plugins list`.

## Task 5: Verificación de fase

- [ ] `pnpm install && pnpm typecheck && pnpm lint && pnpm test && pnpm build` verde (incl. el nuevo paquete).
- [ ] `cd packages/native && cargo test` verde. `pnpm exec prettier --check .` limpio.
- [ ] Criterios de aceptación del spec §4.

---

## Self-Review (mapeo spec → tasks)

- §2 error → Task 1. paquete+registry+sandbox → Task 2. plugins ejemplo → Task 3. CLI → Task 4. §4 → Task 5.
