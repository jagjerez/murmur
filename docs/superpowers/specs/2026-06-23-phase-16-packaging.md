# murmur — Spec: Fase 16 (Packaging y release)

- **Fecha:** 2026-06-23
- **Producto:** `murmur`
- **Estado:** Aprobado, pendiente de implementación
- **Depende de:** Todas las fases anteriores (0–15)

---

## 1. Resumen

Dejar murmur **listo para distribuir**: el CLI publicable en npm, la app de escritorio empaquetable
con Tauri por plataforma (config + iconos), **CI** que ejecuta la puerta de calidad, **versionado**
coherente, **documentación** de instalación y release, y una **verificación E2E final** de todo el
monorepo. La build nativa de Tauri sigue fuera del pipeline de CI por defecto (requiere deps de
sistema); se deja la configuración y un workflow de release documentado.

## 2. Decisiones confirmadas

| Tema | Decisión |
| ---- | -------- |
| CLI publicable | `packages/cli` (`murmur`): `package.json` con `description`, `keywords`, `license: MIT`, `repository`, `bin`, `files: ["dist"]`, `engines`, `publishConfig.access: public`, y `prepack`/`prepublishOnly` que ejecuta el build (tsup, bundlea `@murmur/*`). `npm pack --dry-run` produce un tarball solo con `dist` + metadatos (sin fuentes ni secretos). |
| Paquetes internos | Los `@murmur/*` (shared/design-system/core/audio/rag/plugins) y `@murmur/desktop` se marcan `"private": true` (no se publican; el CLI los bundlea). |
| Versionado | Versión del producto **0.1.0** (CLI). Documentar el proceso de release (bump + tag `vX.Y.Z`). Sin changesets (YAGNI); se documenta el flujo manual. |
| Tauri bundle | `tauri.conf.json` completo: `identifier`, `productName`, `version`, `category`, `bundle.targets`, `bundle.icon` (rutas a iconos), descripción larga, copyright. Iconos: fuente vectorial (`src-tauri/icons/icon.svg`) + documentar `pnpm tauri icon` para generar `.png/.icns/.ico` (binarios no commiteados; se generan en el build de release). |
| CI | `.github/workflows/ci.yml`: en push/PR ejecuta `pnpm install`, `typecheck`, `lint`, `test`, `build`, `prettier --check`, y `cargo test` en `packages/native`. YAML válido. |
| Release (Tauri) | `.github/workflows/release.yml` (documentado): matriz macOS/Windows/Linux que construye los bundles de Tauri y el publish del CLI a npm en un tag. No se ejecuta aquí; queda como plantilla. |
| Licencia | `LICENSE` MIT en la raíz. |
| Docs | README actualizado (instalación CLI `npm i -g murmur`, app de escritorio desde releases, uso, arquitectura) + `docs/RELEASING.md` (proceso de release paso a paso). |

## 3. Entregables

- `packages/cli/package.json` (metadatos de publicación + `prepack`), `.npmignore` o `files` allowlist.
- `private: true` en los paquetes internos y en `apps/desktop`.
- `LICENSE` (MIT) en la raíz.
- `apps/desktop/src-tauri/tauri.conf.json` (bundle completo) + `src-tauri/icons/icon.svg` + nota de `tauri icon`.
- `.github/workflows/ci.yml` (puerta de calidad) y `.github/workflows/release.yml` (plantilla documentada).
- `README.md` actualizado + `docs/RELEASING.md`.
- Verificación E2E final documentada.

## 4. Criterios de aceptación

1. `pnpm install && pnpm typecheck && pnpm lint && pnpm test && pnpm build` en verde. `cargo test` intacto.
2. `pnpm exec prettier --check .` limpio. Sin secretos en el repo.
3. `cd packages/cli && npm pack --dry-run` lista un tarball con `dist/` + `package.json` (y no fuentes/.env);
   el binario empaquetado funciona (`MURMUR_HOME=tmp node dist/index.js --version` → versión; `status` → exit 0).
4. Los paquetes internos y `apps/desktop` están marcados `private: true`; solo `murmur` es publicable.
5. `tauri.conf.json` tiene `identifier`, `productName`, `bundle` con `targets` e `icon`; existe `icons/icon.svg`.
6. `.github/workflows/ci.yml` es YAML válido y ejecuta la puerta de calidad completa (incl. cargo).
7. `LICENSE` (MIT) y `README`/`docs/RELEASING.md` presentes y coherentes (instalación + release).
8. Verificación E2E final: la puerta completa del monorepo verde y los criterios anteriores cumplidos.

## 5. Fuera de alcance

Ejecutar la build nativa de Tauri / firmar binarios / publicar de verdad en npm (requiere
credenciales y deps de sistema; queda como workflow de release documentado), notarización macOS,
auto-update server.
