# Iconos de la app de escritorio

La fuente vectorial del icono es [`icon.svg`](./icon.svg): una cápsula cálida en
terracota (`#E0916B`) con una onda de voz centrada, en línea con la marca de murmur.

## Generar los binarios de icono

Los binarios por plataforma (`.png`, `.icns`, `.ico`) **no se commitean**: se generan
durante el build de release a partir del SVG con la CLI de Tauri.

```bash
# Desde apps/desktop
pnpm tauri icon src-tauri/icons/icon.svg
```

Esto produce, en este mismo directorio, los ficheros referenciados por
`bundle.icon` en `tauri.conf.json`:

- `32x32.png`
- `128x128.png`
- `128x128@2x.png`
- `icon.icns` (macOS)
- `icon.ico` (Windows)

La ausencia de estos binarios no rompe el pipeline `pnpm` (typecheck/lint/test/build);
solo son necesarios para `pnpm tauri build` (build nativa, fuera del CI por defecto).
