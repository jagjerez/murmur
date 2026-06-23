import type { MemoryItem } from './types';

export interface EmbeddingProvider {
  readonly id: string;
  embed(texts: string[]): Promise<number[][]>;
}

export interface MemoryStore {
  add(item: MemoryItem): Promise<void>;
  all(): Promise<MemoryItem[]>;
  clear(): Promise<void>;
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
