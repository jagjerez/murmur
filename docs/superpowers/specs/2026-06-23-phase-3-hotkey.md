# murmur — Spec: Fase 3 (Hotkey global)

- **Fecha:** 2026-06-23
- **Producto:** `murmur`
- **Estado:** Aprobado, pendiente de implementación
- **Depende de:** Fase 0 (core/native/shared), Fase 1 (config/hotkey por defecto), Fase 2 (cápsula)

---

## 1. Resumen

Activar murmur con un **atajo de teclado global**. Se introduce la abstracción `HotkeyManager`
(registrar/desregistrar un acelerador y disparar un handler), su parser/validador de aceleradores
(en Rust nativo y en TS), un `HotkeyManager` en memoria para tests, y la implementación real
`TauriHotkeyManager` sobre el plugin `global-shortcut` de Tauri 2, cableada para alternar la
captura de la cápsula. Como el registro real de atajos globales requiere compositor/entorno
gráfico, **lo testeable se testea** (parsing en Rust con `cargo test`, parser + manager en memoria
en TS, y el cableado vía inyección con el manager en memoria en RTL); el registro nativo se
implementa y documenta pero no se ejecuta en el pipeline.

## 2. Decisiones confirmadas

| Tema | Decisión |
| ---- | -------- |
| Formato de acelerador | Estilo Tauri/Electron: `"CommandOrControl+Shift+Space"`. Modificadores: `CommandOrControl`/`CmdOrCtrl`, `Control`/`Ctrl`, `Alt`/`Option`, `Shift`, `Super`/`Meta`. Tecla final obligatoria. Case-insensitive en modificadores; se normaliza a forma canónica. |
| Parser nativo | `packages/native`: módulo `accelerator` en Rust que parsea/valida/normaliza a `Accelerator { mods, key }`, con `to_string` canónico. `cargo test` cubre válidos, inválidos (vacío, sin tecla, modificador desconocido, duplicados), y round-trip. |
| Parser TS | `@murmur/core`: `parseAccelerator(s)` con las mismas reglas → `{ modifiers: Modifier[]; key: string }` o lanza `HotkeyError`. |
| Error | Nuevo `HotkeyError` (code `HOTKEY_ERROR`) en `@murmur/shared`, subclase de `MurmurError`. |
| Abstracción | `HotkeyManager { register(accel, handler), unregister(accel), unregisterAll() }` (async). `createMemoryHotkeyManager()` para tests: guarda handlers y expone `trigger(accel)` para simular la pulsación. |
| Implementación real | `apps/desktop`: `TauriHotkeyManager` usa `@tauri-apps/plugin-global-shortcut`. Guarda con detección de entorno: si no hay runtime Tauri (dev/navegador/jsdom), degrada a no-op seguro (loggea) sin romper. |
| Cableado | La app registra el hotkey por defecto (`CommandOrControl+Shift+Space`) y, al dispararse, ejecuta el gesto de captura de la cápsula (press en toggle). El manager se INYECTA en la app (memoria en tests, Tauri en producción). |
| Integración Tauri | Añadir el plugin Rust `tauri-plugin-global-shortcut` a `src-tauri/Cargo.toml`, registrarlo en `lib.rs`, y añadir el permiso/capacidad correspondiente. No se compila en el pipeline (build nativa fuera). |

## 3. Entregables

- `packages/shared`: `HotkeyError` (+ test) y export.
- `packages/native`: `src/accelerator.rs` (+ `mod` en `lib.rs`) con parsing/validación/normalización y `cargo test`.
- `packages/core`: `src/hotkey.ts` — tipos `Modifier`, `ParsedAccelerator`, `HotkeyManager`, `parseAccelerator`, `createMemoryHotkeyManager` (+ export en index). Tests TS.
- `apps/desktop`:
  - `src/hotkey/tauri-hotkey-manager.ts` — `TauriHotkeyManager` (degradación segura fuera de Tauri).
  - Cableado en `App.tsx`/hook: registrar el hotkey por defecto → disparar captura. Manager inyectable.
  - `src-tauri`: plugin Rust + registro en `lib.rs` + capacidad/permiso JSON.
  - Dependencia `@tauri-apps/plugin-global-shortcut` (catalog).
  - Test RTL: con `createMemoryHotkeyManager` inyectado, `trigger(defaultHotkey)` alterna la captura de la cápsula.

## 4. Criterios de aceptación

1. `pnpm install && pnpm typecheck && pnpm lint && pnpm test && pnpm build` en verde.
2. `cd packages/native && cargo test` en verde, con tests nuevos de `accelerator` (válidos/ inválidos/round-trip).
3. `parseAccelerator` (TS) y el parser Rust coinciden en reglas: rechazan vacío/sin tecla/modificador desconocido; normalizan a canónico.
4. El `HotkeyManager` en memoria permite registrar, disparar (handler llamado) y desregistrar.
5. Disparar el hotkey por defecto alterna la captura de la cápsula (test RTL con manager inyectado).
6. `TauriHotkeyManager` no rompe `vite build` ni los tests jsdom (degradación segura sin runtime Tauri).
7. Integración Tauri (plugin Rust + capacidad) presente y coherente, aunque la build nativa no se ejecute.
8. TS strict sin `any` injustificado; ESLint y Prettier limpios.

## 5. Fuera de alcance

Captura de audio real (F4), pipeline de conversación (F9), edición del hotkey desde la UI de
ajustes (F11), lectura del hotkey configurado en `~/.murmur` desde el webview vía comandos Tauri
(F9/F11). Aquí se usa el hotkey por defecto y la inyección del manager.
