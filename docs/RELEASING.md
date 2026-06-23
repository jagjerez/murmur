# Proceso de release de murmur

Este documento describe el flujo manual de release. No usamos changesets (YAGNI); la versión
del producto se gestiona a mano y se documenta aquí. La build nativa de Tauri y la publicación
real en npm quedan fuera del CI por defecto y requieren credenciales.

## Prerrequisitos

- Working tree limpio en la rama de integración (p. ej. `main`), con la puerta de calidad en
  verde (ver [Verificación](#verificación)).
- Acceso de publicación al paquete `murmur` en npm (`NPM_TOKEN`).
- Para los bundles de escritorio: Rust + dependencias de sistema del webview por plataforma.
- (Opcional) Claves de firma de Tauri si se firman/notarizan los binarios.

## 1. Bump de versión

La versión del producto vive en dos sitios y debe coincidir:

- `packages/cli/package.json` → `version`
- `apps/desktop/src-tauri/tauri.conf.json` → `version`

Actualiza ambos a la nueva versión (semver), p. ej. `0.1.0` → `0.1.1`. Si añades comandos o
cambias el `VERSION` mostrado por el CLI, actualiza también `packages/cli/src/cli.ts`.

```bash
# Edita las versiones, luego verifica que coinciden:
grep -n '"version"' packages/cli/package.json
grep -n '"version"' apps/desktop/src-tauri/tauri.conf.json
```

## 2. Verificación

Ejecuta la puerta de calidad completa desde la raíz:

```bash
pnpm install \
  && pnpm typecheck \
  && pnpm lint \
  && pnpm test \
  && pnpm build \
  && pnpm exec prettier --check . \
  && (cd packages/native && cargo test)
```

Verifica el empaquetado del CLI (tarball solo con `dist/` + metadatos, sin fuentes ni `.env`):

```bash
cd packages/cli
pnpm build
npm pack --dry-run        # debe listar dist/** y package.json; no src/ ni .env
MURMUR_HOME=$(mktemp -d) node dist/index.js --version   # imprime la versión
MURMUR_HOME=$(mktemp -d) node dist/index.js status      # exit 0
cd ../..
```

## 3. Commit y tag

```bash
git add -A
git commit -m "release: vX.Y.Z"
git tag vX.Y.Z
git push origin <rama> --tags
```

El push del tag `vX.Y.Z` dispara `.github/workflows/release.yml` (si los secretos están
configurados): construye los bundles de Tauri por plataforma y publica el CLI en npm.

## 4. Generar iconos (app de escritorio)

Los binarios de icono no se commitean; se generan desde el SVG fuente:

```bash
cd apps/desktop
pnpm tauri icon src-tauri/icons/icon.svg
```

Esto crea `src-tauri/icons/{32x32.png,128x128.png,128x128@2x.png,icon.icns,icon.ico}`,
referenciados por `bundle.icon` en `tauri.conf.json`.

## 5. Build de los bundles de Tauri

Por plataforma (macOS / Windows / Linux), con las deps de sistema del webview instaladas:

```bash
cd apps/desktop
pnpm tauri build
```

Los artefactos quedan en `apps/desktop/src-tauri/target/release/bundle/`. Súbelos a la
release de GitHub correspondiente al tag.

## 6. Publicar el CLI en npm

El CLI se publica con `prepack`/`prepublishOnly` reconstruyendo el bundle (tsup):

```bash
cd packages/cli
npm publish --access public   # requiere estar autenticado (npm login / NPM_TOKEN)
```

Comprueba que la versión publicada es instalable:

```bash
npm i -g murmur && murmur --version
```

## 7. Publicar la release de GitHub

Crea la release a partir del tag `vX.Y.Z`, adjunta los bundles de escritorio y enlaza el CLI
publicado. Actualiza el `README` si cambió la instalación o el uso.
