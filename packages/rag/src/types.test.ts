import { describe, it, expect } from 'vitest';
import { MEMORY_TYPES } from './types';

describe('MEMORY_TYPES', () => {
  it('define los cuatro tipos de memoria', () => {
    expect(MEMORY_TYPES).toEqual([
      'short_term',
      'session_summary',
      'long_term_fact',
      'explicit_user_memory',
    ]);
  });
});
