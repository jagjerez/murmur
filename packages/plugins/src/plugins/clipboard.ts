import type { Plugin } from '../plugin';

/** Dependencia inyectable: acceso de escritura al portapapeles. */
export interface Clipboard {
  writeText(text: string): void | Promise<void>;
}

/** Dependencias del plugin de portapapeles. */
export interface ClipboardWriteDeps {
  clipboard: Clipboard;
}

/**
 * Plugin que escribe texto en el portapapeles. El efecto secundario (`clipboard.writeText`) se
 * inyecta, de modo que en tests se verifica con un mock sin tocar el portapapeles real.
 */
export function clipboardWritePlugin(deps: ClipboardWriteDeps): Plugin {
  return {
    name: 'clipboard_write',
    description: 'Copia un texto al portapapeles del sistema.',
    parameters: {
      type: 'object',
      properties: {
        text: { type: 'string', description: 'Texto a copiar al portapapeles' },
      },
      required: ['text'],
    },
    capabilities: ['clipboard:write'],
    async run(args) {
      const text = String(args.text ?? '');
      try {
        await deps.clipboard.writeText(text);
        return { ok: true, output: `Copiado al portapapeles: "${text}"` };
      } catch (err) {
        return { ok: false, error: err instanceof Error ? err.message : String(err) };
      }
    },
  };
}
