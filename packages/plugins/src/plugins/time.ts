import type { Plugin } from '../plugin';

/** Dependencias del plugin de hora. */
export interface CurrentTimeDeps {
  /** Reloj inyectable (epoch ms); puro y determinista en tests. */
  now: () => number;
}

/**
 * Plugin puro (sin capacidades) que devuelve la hora actual en ISO 8601 a partir del `now`
 * inyectado, lo que lo hace determinista en tests.
 */
export function currentTimePlugin(deps: CurrentTimeDeps): Plugin {
  return {
    name: 'current_time',
    description: 'Devuelve la fecha y hora actuales en formato ISO 8601.',
    parameters: {
      type: 'object',
      properties: {},
    },
    capabilities: [],
    async run() {
      return { ok: true, output: new Date(deps.now()).toISOString() };
    },
  };
}
