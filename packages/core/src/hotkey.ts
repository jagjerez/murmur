import { HotkeyError } from '@murmur/shared';

/**
 * Gestión de atajos de teclado globales. El parser/validador `parseAccelerator` replica EXACTAMENTE
 * las reglas del parser nativo en Rust (`packages/native/src/accelerator.rs`): mismos alias de
 * modificadores, mismo orden canónico, misma normalización de tecla y mismos casos de error.
 * Mantener ambos sincronizados.
 */

/** Modificador de un acelerador, en su forma canónica. */
export type Modifier = 'CommandOrControl' | 'Control' | 'Alt' | 'Shift' | 'Super';

/** Acelerador parseado y normalizado: modificadores en orden canónico + tecla. */
export interface ParsedAccelerator {
  modifiers: Modifier[];
  key: string;
}

/** Orden canónico estable de los modificadores en la forma `Mod+Mod+Key`. */
const CANONICAL_ORDER: readonly Modifier[] = [
  'CommandOrControl',
  'Control',
  'Alt',
  'Shift',
  'Super',
];

/** Reconoce un token (case-insensitive) como modificador canónico, o `null` si no lo es. */
function modifierFromToken(token: string): Modifier | null {
  switch (token.toLowerCase()) {
    case 'commandorcontrol':
    case 'cmdorctrl':
      return 'CommandOrControl';
    case 'control':
    case 'ctrl':
      return 'Control';
    case 'alt':
    case 'option':
      return 'Alt';
    case 'shift':
      return 'Shift';
    case 'super':
    case 'meta':
      return 'Super';
    default:
      return null;
  }
}

/**
 * Normaliza el nombre de una tecla a su forma canónica.
 * Una sola letra/dígito → mayúscula. Teclas con nombre (Space, Enter, …) → Title-case.
 */
function normalizeKey(token: string): string {
  if (token.length === 1) {
    return token.toUpperCase();
  }
  return token[0]!.toUpperCase() + token.slice(1).toLowerCase();
}

/**
 * Parsea, valida y normaliza un acelerador estilo Tauri/Electron (`"CommandOrControl+Shift+Space"`).
 * Lanza `HotkeyError` si la cadena está vacía, falta la tecla, hay un modificador desconocido o
 * un modificador duplicado. Reglas idénticas al parser nativo en Rust.
 */
export function parseAccelerator(s: string): ParsedAccelerator {
  const tokens = s.split('+').map((t) => t.trim());

  if (tokens.every((t) => t.length === 0)) {
    throw new HotkeyError('acelerador vacío');
  }

  // El último token es la tecla; el resto deben ser modificadores.
  const keyToken = tokens[tokens.length - 1]!;
  const modTokens = tokens.slice(0, -1);

  if (keyToken.length === 0 || modifierFromToken(keyToken) !== null) {
    throw new HotkeyError(`falta la tecla final del acelerador: "${s}"`);
  }

  const modifiers: Modifier[] = [];
  for (const token of modTokens) {
    if (token.length === 0) {
      throw new HotkeyError(`falta la tecla final del acelerador: "${s}"`);
    }
    const mod = modifierFromToken(token);
    if (mod === null) {
      throw new HotkeyError(`modificador desconocido: "${token}"`);
    }
    if (modifiers.includes(mod)) {
      throw new HotkeyError(`modificador duplicado: "${token}"`);
    }
    modifiers.push(mod);
  }

  modifiers.sort((a, b) => CANONICAL_ORDER.indexOf(a) - CANONICAL_ORDER.indexOf(b));

  return { modifiers, key: normalizeKey(keyToken) };
}

/** Serializa un acelerador parseado a su forma canónica `Mod+Mod+Key`. */
export function formatAccelerator(acc: ParsedAccelerator): string {
  return [...acc.modifiers, acc.key].join('+');
}

/** Devuelve la forma canónica de un acelerador (parsea + serializa). Lanza `HotkeyError`. */
export function canonicalizeAccelerator(s: string): string {
  return formatAccelerator(parseAccelerator(s));
}

/** Gestor de atajos globales. Registra/desregistra aceleradores y dispara handlers. */
export interface HotkeyManager {
  register(accelerator: string, handler: () => void): Promise<void>;
  unregister(accelerator: string): Promise<void>;
  unregisterAll(): Promise<void>;
}

/** Gestor en memoria para tests: además permite disparar handlers e inspeccionar registros. */
export interface MemoryHotkeyManager extends HotkeyManager {
  /** Dispara el handler del acelerador (si está registrado). No lanza si no existe. */
  trigger(accelerator: string): void;
  /** Aceleradores registrados, en forma canónica. */
  registered(): string[];
}

/**
 * Crea un `HotkeyManager` en memoria. Valida y canonicaliza los aceleradores con `parseAccelerator`,
 * de modo que formas equivalentes (`cmdorctrl+shift+space` vs `CommandOrControl+Shift+Space`)
 * registran y disparan el mismo handler.
 */
export function createMemoryHotkeyManager(): MemoryHotkeyManager {
  const handlers = new Map<string, () => void>();

  return {
    async register(accelerator, handler) {
      const key = canonicalizeAccelerator(accelerator);
      handlers.set(key, handler);
    },
    async unregister(accelerator) {
      const key = canonicalizeAccelerator(accelerator);
      handlers.delete(key);
    },
    async unregisterAll() {
      handlers.clear();
    },
    trigger(accelerator) {
      const key = canonicalizeAccelerator(accelerator);
      handlers.get(key)?.();
    },
    registered() {
      return [...handlers.keys()];
    },
  };
}
