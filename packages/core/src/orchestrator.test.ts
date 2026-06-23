import { describe, it, expect, vi } from 'vitest';
import { ConversationOrchestrator } from './orchestrator';

describe('ConversationOrchestrator', () => {
  it('arranca en idle', () => {
    const orch = new ConversationOrchestrator();
    expect(orch.getState()).toBe('idle');
  });

  it('notifica los cambios de estado', () => {
    const onStateChange = vi.fn();
    const orch = new ConversationOrchestrator({ onStateChange });
    orch.reset();
    expect(onStateChange).toHaveBeenCalledWith('idle');
  });
});
