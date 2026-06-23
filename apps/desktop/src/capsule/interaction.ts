import type { AssistantState } from '@murmur/shared';

/** Modo de captura de voz. PTT mantiene pulsado; toggle alterna. */
export type InteractionMode = 'push-to-talk' | 'toggle';

/** Gestos que llegan al reductor de captura. */
export type CaptureEvent = 'press' | 'release' | 'cancel';

/** Resultado puro de una transición de captura. */
export interface CaptureResult {
  capturing: boolean;
  state: AssistantState;
}

/**
 * Reductor puro de la captura de voz.
 *
 * push-to-talk:
 *   - press  → empieza a capturar (listening)
 *   - release (si capturaba) → fin de captura (thinking); si no, idle
 *   - cancel → idle
 * toggle:
 *   - press alterna: si no capturaba → listening; si capturaba → thinking
 *   - release no altera (se mantiene el estado de captura)
 *   - cancel → idle
 */
export function nextCapture(
  mode: InteractionMode,
  capturing: boolean,
  event: CaptureEvent,
): CaptureResult {
  if (event === 'cancel') {
    return { capturing: false, state: 'idle' };
  }

  if (mode === 'push-to-talk') {
    if (event === 'press') {
      return { capturing: true, state: 'listening' };
    }
    // release
    return capturing
      ? { capturing: false, state: 'thinking' }
      : { capturing: false, state: 'idle' };
  }

  // toggle
  if (event === 'press') {
    return capturing
      ? { capturing: false, state: 'thinking' }
      : { capturing: true, state: 'listening' };
  }
  // release: mantiene el estado actual del toggle
  return capturing
    ? { capturing: true, state: 'listening' }
    : { capturing: false, state: 'idle' };
}
