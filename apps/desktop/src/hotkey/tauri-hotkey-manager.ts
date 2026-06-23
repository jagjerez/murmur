import { type HotkeyManager, parseAccelerator } from '@murmur/core';

/**
 * Implementación real de `HotkeyManager` sobre el plugin `global-shortcut` de Tauri 2.
 *
 * El plugin se importa de forma PEREZOSA (`await import(...)`) para que su módulo no se evalúe al
 * cargar este archivo ni en tests jsdom/`vite build`. Fuera de un runtime Tauri (dev en navegador,
 * jsdom) degrada a un no-op seguro: valida el acelerador (lanza `HotkeyError` si es inválido) pero
 * no toca el sistema, y avisa una sola vez por la consola.
 */

/** Forma mínima del plugin que usamos (cargado perezosamente). */
interface GlobalShortcutPlugin {
  register(
    shortcuts: string | string[],
    handler: (event: { shortcut: string; state: 'Pressed' | 'Released' }) => void,
  ): Promise<void>;
  unregister(shortcuts: string | string[]): Promise<void>;
  unregisterAll(): Promise<void>;
}

/** ¿Hay un runtime Tauri disponible? Detecta `window.__TAURI_INTERNALS__`. */
export function isTauri(): boolean {
  return (
    typeof window !== 'undefined' &&
    (window as { __TAURI_INTERNALS__?: unknown }).__TAURI_INTERNALS__ !== undefined
  );
}

let warned = false;
function warnOnce(): void {
  if (warned) return;
  warned = true;
  console.info('[murmur] fuera de un runtime Tauri: los atajos globales quedan inactivos (no-op).');
}

/**
 * Crea un `HotkeyManager` respaldado por el plugin global-shortcut de Tauri.
 * El acceso al plugin está encapsulado en una función async con `await import(...)`.
 */
export function createTauriHotkeyManager(): HotkeyManager {
  // Handlers vivos para poder limpiarlos en unregisterAll y mapear Pressed → handler.
  const handlers = new Map<string, () => void>();

  async function loadPlugin(): Promise<GlobalShortcutPlugin> {
    return (await import('@tauri-apps/plugin-global-shortcut')) as unknown as GlobalShortcutPlugin;
  }

  return {
    async register(accelerator, handler) {
      // Validar y canonicalizar siempre (lanza HotkeyError si es inválido), dentro y fuera de Tauri.
      const acc = parseAccelerator(accelerator);
      const canonical = [...acc.modifiers, acc.key].join('+');
      handlers.set(canonical, handler);

      if (!isTauri()) {
        warnOnce();
        return;
      }

      const plugin = await loadPlugin();
      await plugin.register(canonical, (event) => {
        // El plugin dispara en Pressed y Released; tratamos el atajo como un gesto único (Pressed).
        if (event.state === 'Pressed') handler();
      });
    },

    async unregister(accelerator) {
      const acc = parseAccelerator(accelerator);
      const canonical = [...acc.modifiers, acc.key].join('+');
      handlers.delete(canonical);

      if (!isTauri()) {
        warnOnce();
        return;
      }

      const plugin = await loadPlugin();
      await plugin.unregister(canonical);
    },

    async unregisterAll() {
      handlers.clear();

      if (!isTauri()) {
        warnOnce();
        return;
      }

      const plugin = await loadPlugin();
      await plugin.unregisterAll();
    },
  };
}
