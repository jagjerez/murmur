import type { Plugin } from '../plugin';

/** Dependencia inyectable: abre una app o URL en el sistema (p. ej. `open`/`xdg-open`). */
export type OpenFn = (target: string) => void | Promise<void>;

/** Dependencias del plugin de apertura. */
export interface OpenAppDeps {
  open: OpenFn;
}

/**
 * Plugin que abre una aplicación o URL. El efecto (`open`) se inyecta para poder verificarlo con
 * un mock en tests sin abrir nada real.
 */
export function openAppPlugin(deps: OpenAppDeps): Plugin {
  return {
    name: 'open_app',
    description: 'Abre una aplicación o URL en el sistema.',
    parameters: {
      type: 'object',
      properties: {
        target: { type: 'string', description: 'URL o identificador de la app a abrir' },
      },
      required: ['target'],
    },
    capabilities: ['system:open'],
    async run(args) {
      const target = String(args.target ?? '');
      try {
        await deps.open(target);
        return { ok: true, output: `Abriendo: ${target}` };
      } catch (err) {
        return { ok: false, error: err instanceof Error ? err.message : String(err) };
      }
    },
  };
}
