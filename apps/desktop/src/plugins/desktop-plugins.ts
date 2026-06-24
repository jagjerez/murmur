import {
  createPluginRegistry,
  clipboardWritePlugin,
  openAppPlugin,
  currentTimePlugin,
  type PluginRegistry,
} from '@murmur/plugins';
import type { RealtimeTool } from '@murmur/core';

/** Host de tools para el orchestrator: definiciones + despachador. */
export interface ToolHost {
  tools: RealtimeTool[];
  dispatchTool: (name: string, args: Record<string, unknown>) => Promise<string>;
}

/** Efectos secundarios que usan los plugins; inyectables para tests. */
export interface DesktopToolDeps {
  clipboard: { writeText(text: string): void | Promise<void> };
  open: (target: string) => void | Promise<void>;
  now: () => number;
}

/**
 * Efectos por defecto disponibles en el webview del desktop. En `tauri://localhost` (contexto
 * seguro) `navigator.clipboard` y `window.open` existen. Fuera de un contexto seguro el
 * optional-chaining los convierte en no-op silencioso; si eso importa (p. ej. en tests), inyecta
 * deps explícitas vía `createDesktopToolHost(deps)`.
 */
function defaultDeps(): DesktopToolDeps {
  return {
    clipboard: {
      writeText: (text) => globalThis.navigator?.clipboard?.writeText(text),
    },
    open: (target) => {
      globalThis.open?.(target, '_blank');
    },
    now: () => Date.now(),
  };
}

/**
 * Construye el registry con los plugins de ejemplo (hora, portapapeles, abrir app/URL), habilita
 * sus capacidades en la allowlist y expone `tools`/`dispatchTool` para el orchestrator. Un fallo de
 * `dispatch` (permiso/args/efecto) se devuelve como texto para que el modelo lo gestione.
 */
export function createDesktopToolHost(deps: DesktopToolDeps = defaultDeps()): ToolHost {
  const registry: PluginRegistry = createPluginRegistry({
    allowed: ['clipboard:write', 'system:open'],
  });
  registry.register(currentTimePlugin({ now: deps.now }));
  registry.register(clipboardWritePlugin({ clipboard: deps.clipboard }));
  registry.register(openAppPlugin({ open: deps.open }));

  return {
    tools: registry.toToolDefinitions(),
    async dispatchTool(name, args) {
      try {
        const result = await registry.dispatch(name, args);
        return result.output ?? result.error ?? '';
      } catch (err) {
        return err instanceof Error ? err.message : String(err);
      }
    },
  };
}
