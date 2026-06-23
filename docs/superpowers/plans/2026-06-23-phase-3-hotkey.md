# murmur — Fase 3 (Hotkey global) — Plan de implementación

> REQUIRED SUB-SKILL: superpowers:subagent-driven-development / test-driven-development.
> TDD: test primero (falla) → implementación (pasa). Commit por Task con el trailer
> `Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>`.

**Goal:** Atajo global que activa murmur. Parser de aceleradores en Rust (`cargo test`) y TS,
`HotkeyManager` (interfaz + memoria + Tauri), cableado a la captura de la cápsula. Repo en verde.

**Spec:** `docs/superpowers/specs/2026-06-23-phase-3-hotkey.md`.

**Convenciones:** TS strict ESM; errores en `@murmur/shared`; tests sin entorno gráfico (lo
nativo se prueba con `cargo test` y mocks; la build nativa de Tauri NO se ejecuta).

---

## Task 1: `HotkeyError` en `@murmur/shared`

**Files:** `packages/shared/src/errors.ts`, `packages/shared/src/errors.test.ts` (ampliar), index ya re-exporta.

- [ ] Test (falla): `new HotkeyError('x').code === 'HOTKEY_ERROR'` y es `instanceof MurmurError`.
- [ ] Implementar `HotkeyError` (mismo patrón que `ConfigError`).
- [ ] `pnpm --filter @murmur/shared test` verde. Commit: `feat(shared): HotkeyError`.

## Task 2: Parser de aceleradores en Rust (`packages/native`)

**Files:** `packages/native/src/accelerator.rs`, `packages/native/src/lib.rs` (añadir `mod accelerator;`).

- [ ] En `accelerator.rs`: `enum Modifier`, `struct Accelerator { mods: Vec<Modifier>, key: String }`,
  `fn parse(s: &str) -> Result<Accelerator, AcceleratorError>`, `impl Display` (forma canónica
  `Mod+Mod+Key`), normalización (`CmdOrCtrl`/`CommandOrControl` equivalentes; `Ctrl`→`Control`;
  `Option`→`Alt`; `Meta`/`Super` equivalentes). Validación: cadena vacía, sin tecla final,
  modificador desconocido, modificadores duplicados → error.
- [ ] `#[cfg(test)] mod tests`: parsear `"CommandOrControl+Shift+Space"` OK; rechazar `""`,
  `"Shift+"`, `"Foo+A"`, `"Ctrl+Ctrl+A"`; round-trip `parse(to_string) == parse`.
- [ ] `cd packages/native && cargo test` verde. Commit: `feat(native): parser de aceleradores con cargo test`.

## Task 3: `HotkeyManager` + `parseAccelerator` en `@murmur/core`

**Files:** `packages/core/src/hotkey.ts`, `packages/core/src/hotkey.test.ts`, `packages/core/src/index.ts` (export).

Contrato:
```ts
export type Modifier = 'CommandOrControl' | 'Control' | 'Alt' | 'Shift' | 'Super';
export interface ParsedAccelerator { modifiers: Modifier[]; key: string; }
export function parseAccelerator(s: string): ParsedAccelerator; // lanza HotkeyError
export interface HotkeyManager {
  register(accelerator: string, handler: () => void): Promise<void>;
  unregister(accelerator: string): Promise<void>;
  unregisterAll(): Promise<void>;
}
export interface MemoryHotkeyManager extends HotkeyManager { trigger(accelerator: string): void; registered(): string[]; }
export function createMemoryHotkeyManager(): MemoryHotkeyManager;
```

- [ ] Tests (fallan): `parseAccelerator` válidos (normaliza a canónico, p. ej. `cmdorctrl+shift+space`
  → modifiers `['CommandOrControl','Shift']`, key `'Space'`) e inválidos (vacío/sin tecla/mod
  desconocido → `HotkeyError`). `createMemoryHotkeyManager`: register + trigger llama al handler;
  unregister deja de llamarlo; unregisterAll limpia; registrar acelerador inválido lanza.
- [ ] Implementar `hotkey.ts`. Export en `index.ts`.
- [ ] `pnpm --filter @murmur/core test` verde. Commit: `feat(core): HotkeyManager y parseAccelerator`.

## Task 4: `TauriHotkeyManager` + cableado en `apps/desktop`

**Files:** `apps/desktop/src/hotkey/tauri-hotkey-manager.ts`, `apps/desktop/src/App.tsx`,
`apps/desktop/src/hotkey/tauri-hotkey-manager.test.ts` o test de App, `apps/desktop/package.json`,
`pnpm-workspace.yaml` (catalog `@tauri-apps/plugin-global-shortcut: ^2.2.0`).

- [ ] `TauriHotkeyManager implements HotkeyManager`: importa `@tauri-apps/plugin-global-shortcut`
  de forma perezosa (`await import`) y solo actúa si `isTauri()` (detecta `window.__TAURI_INTERNALS__`);
  fuera de Tauri degrada a no-op (loggea una vez). No debe romper jsdom/vite.
- [ ] `App.tsx`: aceptar prop opcional `hotkeys?: HotkeyManager` (default: `TauriHotkeyManager`).
  En un `useEffect`, registrar el hotkey por defecto (`CommandOrControl+Shift+Space`) cuyo handler
  dispara la captura de la cápsula (equivalente a press en toggle). Limpieza con `unregisterAll`.
- [ ] Test RTL: render `<App hotkeys={createMemoryHotkeyManager()} />`; `act(() => hk.trigger('CommandOrControl+Shift+Space'))`
  alterna `aria-pressed`/estado de la cápsula a capturando.
- [ ] `src-tauri`: añadir `tauri-plugin-global-shortcut` a `Cargo.toml`, `.plugin(tauri_plugin_global_shortcut::Builder::new().build())` en `lib.rs`, y la capacidad/permiso (`capabilities/*.json` o `tauri.conf.json`). Documentar que la build nativa queda fuera del pipeline.
- [ ] `pnpm --filter @murmur/desktop typecheck && build && test` verde. Commit: `feat(desktop): TauriHotkeyManager y cableado del hotkey a la cápsula`.

## Task 5: Verificación de fase

- [ ] `pnpm install && pnpm typecheck && pnpm lint && pnpm test && pnpm build` verde.
- [ ] `cd packages/native && cargo test` verde. `pnpm exec prettier --check .` limpio.
- [ ] Criterios de aceptación del spec §4.

---

## Self-Review (mapeo spec → tasks)

- §2 error → Task 1. Parser Rust → Task 2. Parser TS + manager memoria → Task 3.
- §2 TauriHotkeyManager + cableado + integración Tauri → Task 4. §4 criterios → Task 5.
