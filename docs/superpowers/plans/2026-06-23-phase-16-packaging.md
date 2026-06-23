# murmur — Fase 16 (Packaging y release) — Plan de implementación

> REQUIRED SUB-SKILL: superpowers:subagent-driven-development / test-driven-development.
> Commit por Task con el trailer `Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>`.

**Goal:** murmur listo para distribuir: CLI publicable, bundle Tauri + iconos, CI, versionado, docs y
verificación E2E final. Repo en verde.

**Spec:** `docs/superpowers/specs/2026-06-23-phase-16-packaging.md`.

**Convenciones:** TS strict ESM; sin secretos; la build nativa de Tauri NO se ejecuta aquí.
NO toques `docs/superpowers/PROGRESS.md`.

---

## Task 1: CLI publicable + paquetes internos privados + LICENSE

**Files:** `packages/cli/package.json`, `LICENSE`, `package.json` de los paquetes internos y `apps/desktop`.

- [ ] `packages/cli/package.json`: `description`, `keywords`, `license: "MIT"`, `repository`, `bin`,
      `files: ["dist"]`, `engines`, `publishConfig: { access: "public" }`, `prepack`/`prepublishOnly: "tsup"`.
      (Mantener `noExternal: [/^@murmur\//]` para bundlear las deps internas.)
- [ ] Marcar `"private": true` en `@murmur/{shared,design-system,core,audio,rag,plugins}` y `apps/desktop`
      (no en `murmur`).
- [ ] Crear `LICENSE` (MIT, copyright "murmur contributors", 2026).
- [ ] Verificar: `cd packages/cli && npm pack --dry-run` lista `dist/**` + `package.json` (sin `src`/`.env`);
      tras `pnpm --filter murmur build`, `MURMUR_HOME=$(mktemp -d) node packages/cli/dist/index.js --version` imprime la versión.
- [ ] Commit: `chore(cli): metadatos de publicación npm + LICENSE`.

## Task 2: Bundle Tauri + iconos

**Files:** `apps/desktop/src-tauri/tauri.conf.json`, `apps/desktop/src-tauri/icons/icon.svg`.

- [ ] Completar `bundle` en `tauri.conf.json`: `active: true`, `targets: "all"` (o lista),
      `icon: ["icons/32x32.png","icons/128x128.png","icons/icon.icns","icons/icon.ico"]`, `category`,
      `shortDescription`/`longDescription`, `copyright`. Mantener la ventana/CSP existentes.
- [ ] Crear `icons/icon.svg` (logo simple de murmur: cápsula/onda en terracota `#E0916B`). Documentar
      en un comentario/README que los binarios de icono se generan con `pnpm tauri icon icons/icon.svg`
      (no se commitean; el build de release los crea). La ausencia de los `.png/.icns/.ico` no rompe el pipeline pnpm.
- [ ] Commit: `chore(desktop): bundle Tauri completo + icono fuente`.

## Task 3: CI y release workflows

**Files:** `.github/workflows/ci.yml`, `.github/workflows/release.yml`.

- [ ] `ci.yml`: en `push`/`pull_request`, sobre ubuntu, setup pnpm + Node 20, `pnpm install`,
      `pnpm typecheck`, `pnpm lint`, `pnpm test`, `pnpm build`, `pnpm exec prettier --check .`, y
      `cargo test` en `packages/native` (con toolchain Rust). YAML válido.
- [ ] `release.yml` (plantilla documentada): matriz macOS/Windows/Linux que instala deps de sistema
      del webview, `pnpm tauri build`, sube artefactos; job de `npm publish` del CLI en tags `v*`.
      Comentar que requiere secretos (`NPM_TOKEN`, firma) y no se ejecuta sin ellos.
- [ ] Commit: `ci: workflow de calidad y plantilla de release`.

## Task 4: Docs (README + RELEASING)

**Files:** `README.md`, `docs/RELEASING.md`.

- [ ] README: instalación del CLI (`npm i -g murmur`), app de escritorio (desde releases / `pnpm tauri build`),
      uso (`murmur start/config/status/memory/plugins`), arquitectura (tabla de paquetes ya existente, ampliada
      con `plugins`), y nota de privacidad (F12).
- [ ] `docs/RELEASING.md`: pasos de release (bump de versión, `tauri icon`, build, tag `vX.Y.Z`, CI release,
      `npm publish`), y la verificación E2E.
- [ ] Commit: `docs: instalación, uso y proceso de release`.

## Task 5: Verificación E2E final

- [ ] `pnpm install && pnpm typecheck && pnpm lint && pnpm test && pnpm build` verde.
- [ ] `cd packages/native && cargo test` verde. `pnpm exec prettier --check .` limpio.
- [ ] `cd packages/cli && npm pack --dry-run` OK (dist, sin fuentes/secretos). Smoke del binario.
- [ ] `git grep -nE "sk-[A-Za-z0-9]{6,}"` solo ficticias. Criterios del spec §4.
- [ ] (Si Prettier dejó cambios) `pnpm format` + commit.

---

## Self-Review (mapeo spec → tasks)

- §2 CLI/privados/LICENSE → Task 1. bundle/iconos → Task 2. CI/release → Task 3. docs → Task 4. E2E → Task 5.
