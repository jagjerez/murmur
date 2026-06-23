export type Role = 'user' | 'assistant' | 'system';

export interface Message {
  id: string;
  sessionId: string;
  role: Role;
  text: string;
  /** epoch ms */
  createdAt: number;
}

export interface Session {
  id: string;
  /** epoch ms */
  startedAt: number;
  /** epoch ms */
  endedAt?: number;
}
