import { describe, it, expect } from 'vitest';
import { ASSISTANT_STATES } from './state';

describe('AssistantState', () => {
  it('lista los cinco estados en orden', () => {
    expect(ASSISTANT_STATES).toEqual(['idle', 'listening', 'thinking', 'speaking', 'error']);
  });
});
