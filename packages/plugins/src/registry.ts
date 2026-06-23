import { PluginError } from '@murmur/shared';
import type { JsonSchema, Plugin, PluginArgs, PluginContext, PluginResult } from './plugin';

/** Definición de herramienta en el formato del realtime de OpenAI (F5). */
export interface ToolDefinition {
  type: 'function';
  name: string;
  description: string;
  parameters: JsonSchema;
}

/** Opciones de construcción del registry. */
export interface PluginRegistryOptions {
  /** Allowlist de capacidades que el host autoriza a ejecutar. */
  allowed: readonly string[];
}

/** Registry de plugins con sandbox de capacidades y conversión a tool-defs. */
export interface PluginRegistry {
  /** Registra un plugin; lanza `PluginError` si el nombre ya existe. */
  register(plugin: Plugin): void;
  /** Lista los plugins registrados en orden de registro. */
  list(): Plugin[];
  /** Recupera un plugin por nombre, o `undefined` si no existe. */
  get(name: string): Plugin | undefined;
  /**
   * Ejecuta un plugin: valida que exista, que sus capacidades estén permitidas y que los args
   * cumplan el esquema; luego delega en `plugin.run`. Lanza `PluginError` en cualquier fallo de
   * validación/permiso.
   */
  dispatch(name: string, args: PluginArgs, ctx?: PluginContext): Promise<PluginResult>;
  /** Convierte los plugins a definiciones de herramienta para el function-calling del modelo. */
  toToolDefinitions(): ToolDefinition[];
}

/** Comprueba que cada `cap` del plugin esté en la allowlist. */
function capabilitiesAllowed(capabilities: readonly string[], allowed: readonly string[]): boolean {
  return capabilities.every((cap) => allowed.includes(cap));
}

/** Valida los `args` contra el esquema mínimo: requeridos presentes y tipos correctos. */
function validateArgs(name: string, schema: JsonSchema, args: PluginArgs): void {
  for (const key of schema.required ?? []) {
    if (args[key] === undefined || args[key] === null) {
      throw new PluginError(`plugin "${name}": falta el argumento requerido "${key}".`);
    }
  }

  for (const [key, prop] of Object.entries(schema.properties)) {
    const value = args[key];
    if (value === undefined || value === null) {
      continue;
    }
    if (typeof value !== prop.type) {
      throw new PluginError(
        `plugin "${name}": el argumento "${key}" debe ser ${prop.type} (recibido ${typeof value}).`,
      );
    }
  }
}

/** Crea un registry de plugins con la allowlist de capacidades dada. */
export function createPluginRegistry(options: PluginRegistryOptions): PluginRegistry {
  const allowed = [...options.allowed];
  const plugins = new Map<string, Plugin>();

  return {
    register(plugin: Plugin): void {
      if (plugins.has(plugin.name)) {
        throw new PluginError(`plugin "${plugin.name}": ya está registrado.`);
      }
      plugins.set(plugin.name, plugin);
    },

    list(): Plugin[] {
      return [...plugins.values()];
    },

    get(name: string): Plugin | undefined {
      return plugins.get(name);
    },

    async dispatch(name: string, args: PluginArgs, ctx?: PluginContext): Promise<PluginResult> {
      const plugin = plugins.get(name);
      if (plugin === undefined) {
        throw new PluginError(`plugin "${name}": no está registrado.`);
      }
      if (!capabilitiesAllowed(plugin.capabilities, allowed)) {
        throw new PluginError(
          `plugin "${name}": permiso denegado (capacidades [${plugin.capabilities.join(
            ', ',
          )}] no permitidas).`,
        );
      }
      validateArgs(name, plugin.parameters, args);
      return plugin.run(args, ctx);
    },

    toToolDefinitions(): ToolDefinition[] {
      return [...plugins.values()].map((plugin) => ({
        type: 'function',
        name: plugin.name,
        description: plugin.description,
        parameters: plugin.parameters,
      }));
    },
  };
}
