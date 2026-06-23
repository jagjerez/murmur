import { defineConfig } from 'tsup';

export default defineConfig({
  entry: ['src/index.ts'],
  format: ['esm'],
  dts: true,
  clean: true,
  // tsup elimina por defecto el prefijo `node:` (`node:sqlite` → `sqlite`), que NO resuelve
  // en runtime porque el módulo solo existe como `node:sqlite`. Lo desactivamos.
  removeNodeProtocol: false,
});
