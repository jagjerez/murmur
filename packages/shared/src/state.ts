/** Estado del asistente. Fuente de verdad del ciclo de vida visible. */
export type AssistantState = 'idle' | 'listening' | 'thinking' | 'speaking' | 'error';

export const ASSISTANT_STATES: readonly AssistantState[] = [
  'idle',
  'listening',
  'thinking',
  'speaking',
  'error',
] as const;
