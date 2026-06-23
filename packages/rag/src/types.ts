export const MEMORY_TYPES = [
  'short_term',
  'session_summary',
  'long_term_fact',
  'explicit_user_memory',
] as const;

export type MemoryType = (typeof MEMORY_TYPES)[number];

export interface MemoryItem {
  id: string;
  type: MemoryType;
  content: string;
  /** epoch ms */
  createdAt: number;
  sessionId?: string;
}
