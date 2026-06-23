/**
 * Tipos núcleo del sistema de plugins/skills de murmur.
 *
 * Un `Plugin` declara su interfaz (nombre, descripción, esquema de parámetros) y las
 * `capabilities` que necesita para ejecutarse (p. ej. `clipboard:write`, `system:open`). El
 * registry usa esas capacidades como sandbox: solo deja ejecutar plugins cuyas capacidades estén
 * en la allowlist del host. Todos los efectos secundarios se inyectan al construir el plugin, de
 * modo que la ejecución es 100 % testeable con mocks.
 */

/** Esquema JSON mínimo para describir los parámetros de un plugin. */
export interface JsonSchema {
  type: 'object';
  properties: Record<string, JsonSchemaProperty>;
  required?: string[];
}

/** Una propiedad dentro del esquema de parámetros. */
export interface JsonSchemaProperty {
  type: 'string' | 'number' | 'boolean';
  description?: string;
}

/** Argumentos que recibe `run`, tras la validación mínima contra el esquema. */
export type PluginArgs = Record<string, unknown>;

/** Contexto opcional que el host puede pasar a `run` (reservado para integración). */
export interface PluginContext {
  /** Reloj inyectable; útil para plugins deterministas. */
  now?: () => number;
}

/** Resultado de ejecutar un plugin. */
export interface PluginResult {
  ok: boolean;
  output?: string;
  error?: string;
}

/** Interfaz que implementa cada skill ejecutable. */
export interface Plugin {
  /** Identificador único del plugin (también el `name` de la tool-def). */
  readonly name: string;
  /** Descripción legible para el modelo y para `murmur plugins list`. */
  readonly description: string;
  /** Esquema JSON de los parámetros que acepta `run`. */
  readonly parameters: JsonSchema;
  /** Capacidades que el plugin necesita; `[]` si es puro (sin efectos). */
  readonly capabilities: readonly string[];
  /** Ejecuta la acción con los `args` validados y el contexto del host. */
  run(args: PluginArgs, ctx?: PluginContext): Promise<PluginResult>;
}
