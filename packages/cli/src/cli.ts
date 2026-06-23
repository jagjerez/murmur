export const VERSION = '0.0.0';

export function helpText(): string {
  return `murmur — asistente de voz con IA

Uso: murmur <comando>

Comandos (próximamente, Fase 1+):
  start     Inicia el asistente
  config    Configura murmur (API key, hotkey, …)
  status    Muestra el estado
  help      Muestra esta ayuda`;
}

/** Punto de entrada puro (sin efectos): recibe argv y devuelve la salida a imprimir. */
export function run(argv: string[]): string {
  const [command] = argv;

  switch (command) {
    case '-v':
    case '--version':
      return VERSION;
    case undefined:
    case 'help':
    case '--help':
      return helpText();
    default:
      // TODO(F1): implementar start, config, config set-openai-key, memory reset, status.
      return `murmur: comando desconocido "${command}". Usa "murmur help".`;
  }
}
