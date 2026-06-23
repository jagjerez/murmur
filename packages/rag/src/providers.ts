import type { MemoryItem } from './types';

export interface EmbeddingProvider {
  readonly id: string;
  embed(texts: string[]): Promise<number[][]>;
}

/** Item a persistir: `createdAt` es opcional (lo fija el store con su reloj si falta). */
export type NewMemoryItem = Omit<MemoryItem, 'createdAt'> & { createdAt?: number };

export interface MemoryStore {
  add(item: NewMemoryItem): Promise<void>;
  all(): Promise<MemoryItem[]>;
  clear(): Promise<void>;
  getByType(type: MemoryItem['type']): Promise<MemoryItem[]>;
  recent(limit: number): Promise<MemoryItem[]>;
  get(id: string): Promise<MemoryItem | undefined>;
  delete(id: string): Promise<void>;
  count(): Promise<number>;
}

export interface RagRetriever {
  retrieve(query: string, options?: { limit?: number }): Promise<MemoryItem[]>;
}

export interface SessionSummarizer {
  summarize(sessionId: string): Promise<string>;
}

export interface FactExtractor {
  extract(text: string): Promise<string[]>;
}
