import type { AssistantState } from '@murmur/shared';

export interface OrchestratorEvents {
  onStateChange?: (state: AssistantState) => void;
}

/**
 * Centraliza el ciclo de conversación. En Fase 0 solo gestiona la máquina de estados.
 * TODO(F9): activar → capturar → modelo → recuperar contexto → responder → guardar turno.
 */
export class ConversationOrchestrator {
  private state: AssistantState = 'idle';

  constructor(private readonly events: OrchestratorEvents = {}) {}

  getState(): AssistantState {
    return this.state;
  }

  reset(): void {
    this.setState('idle');
  }

  protected setState(next: AssistantState): void {
    this.state = next;
    this.events.onStateChange?.(next);
  }
}
