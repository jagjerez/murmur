# Modo offline (STT + LLM + TTS locales) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Que murmur pueda conversar **sin nube** mediante un loop por turnos STT→LLM→TTS local, manteniendo la nube (OpenAI Realtime) como modo por defecto.

**Architecture:** Se reutilizan las costuras inyectables existentes (`TranscriptionProvider`, `ChatProvider`, `VoiceInputProvider`/`VoiceOutputProvider`, prompt, RAG/memoria). Se añade una interfaz nueva (`TextToSpeechProvider`) y un orquestador por turnos (`OfflineConversationOrchestrator`). Motores: whisper.cpp vía `whisper-rs` (Rust, feature-gated) para STT; Ollama HTTP para LLM; Piper (subproceso) para TTS. Modelos/motores son externos y auto-descargados; los nativos van tras feature flags para no romper el gate por defecto.

**Tech Stack:** TypeScript strict ESM, Vitest, React 19, Rust (`packages/native` + `apps/desktop/src-tauri`), pnpm monorepo, Node 26.

**Spec:** `docs/superpowers/specs/2026-06-24-offline-mode-design.md`

**Convenciones:** tests por paquete `pnpm --filter <pkg> test`; un archivo `pnpm --filter <pkg> exec vitest run <ruta>`. Gate: `pnpm typecheck && pnpm lint && pnpm test && pnpm build && pnpm exec prettier --check .` (+ `cargo test`, con la feature `whisper` **off** por defecto). TS strict, sin `any`. IDs con `globalThis.crypto.randomUUID()`. No commitear modelos.

---

## File Structure

| Archivo                                                | Responsabilidad                                                    | Acción          |
| ------------------------------------------------------ | ------------------------------------------------------------------ | --------------- |
| `packages/core/src/providers/tts-provider.ts`          | Interfaz `TextToSpeechProvider` + `createMockTextToSpeechProvider` | Crear           |
| `packages/core/src/offline-orchestrator.ts`            | `OfflineConversationOrchestrator` (loop por turnos)                | Crear           |
| `packages/core/src/index.ts`                           | Re-exportar lo nuevo                                               | Modificar       |
| `packages/rag/src/chat.ts`                             | `createOllamaChatProvider`                                         | Modificar       |
| `packages/native/Cargo.toml`                           | feature `whisper` + dep `whisper-rs` opcional                      | Modificar       |
| `packages/native/src/whisper.rs`                       | módulo de transcripción (feature `whisper`)                        | Crear           |
| `packages/native/src/lib.rs`                           | `#[cfg(feature)] pub mod whisper;`                                 | Modificar       |
| `apps/desktop/src-tauri/src/whisper_cmd.rs` + `lib.rs` | comando Tauri `transcribe` (feature)                               | Crear/Modificar |
| `apps/desktop/src-tauri/src/tts_cmd.rs` + `lib.rs`     | comando Tauri `tts` (shell a piper)                                | Crear/Modificar |
| `apps/desktop/src/offline/local-whisper-run.ts`        | adaptador `run` (resample + invoke)                                | Crear           |
| `apps/desktop/src/offline/piper-tts-run.ts`            | adaptador `run` TTS (invoke)                                       | Crear           |
| `apps/desktop/src/offline/use-offline-murmur.ts`       | hook que cablea el `OfflineConversationOrchestrator`               | Crear           |
| `packages/cli/src/config.ts`                           | `mode` + `setMode` + validación                                    | Modificar       |
| `packages/cli/src/cli.ts`                              | `config set-mode`, `models download`                               | Modificar       |
| `packages/cli/src/models.ts`                           | descarga/caché de modelos en `~/.murmur/models/`                   | Crear           |
| `apps/desktop/src/App.tsx` + `use-murmur.ts`           | selección de orquestador por modo                                  | Modificar       |
| `README.md`, `docs/superpowers/PROGRESS.md`            | requisitos del modo offline + tracker                              | Modificar       |

---

## FASE R1 — Arquitectura offline (con mocks)

### Task 1: `TextToSpeechProvider` + mock

**Files:**

- Create: `packages/core/src/providers/tts-provider.ts`
- Test: `packages/core/src/providers/tts-provider.test.ts`
- Modify: `packages/core/src/index.ts`

- [ ] **Step 1: Test (falla)** — `packages/core/src/providers/tts-provider.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { createMockTextToSpeechProvider } from './tts-provider';

describe('createMockTextToSpeechProvider', () => {
  it('devuelve el PCM fijo dado', async () => {
    const pcm = new Uint8Array([1, 2, 3, 4]);
    const tts = createMockTextToSpeechProvider(pcm);
    expect(await tts.synthesize('hola')).toEqual(pcm);
  });

  it('por defecto devuelve PCM no vacío y registra el último texto', async () => {
    const tts = createMockTextToSpeechProvider();
    const out = await tts.synthesize('hola mundo');
    expect(out.length).toBeGreaterThan(0);
    expect(tts.lastText).toBe('hola mundo');
  });
});
```

- [ ] **Step 2:** `pnpm --filter @murmur/core exec vitest run src/providers/tts-provider.test.ts` → FAIL.

- [ ] **Step 3: Implementar** — `packages/core/src/providers/tts-provider.ts`:

```ts
/**
 * `TextToSpeechProvider` — síntesis de voz. `synthesize` devuelve PCM16 mono 24 kHz (formato
 * canónico de F4), listo para `VoiceOutputProvider.play`. Implementaciones reales (Piper) viven
 * fuera de core; aquí solo el contrato y un mock determinista para tests/offline.
 */
export interface TextToSpeechProvider {
  synthesize(text: string): Promise<Uint8Array>;
}

/** Mock determinista: devuelve `pcm` (o 8 bytes constantes) y recuerda el último texto. */
export interface MockTextToSpeechProvider extends TextToSpeechProvider {
  lastText: string | undefined;
}

export function createMockTextToSpeechProvider(pcm?: Uint8Array): MockTextToSpeechProvider {
  const fixed = pcm ?? new Uint8Array([0, 1, 2, 3, 4, 5, 6, 7]);
  const provider: MockTextToSpeechProvider = {
    lastText: undefined,
    synthesize(text: string): Promise<Uint8Array> {
      provider.lastText = text;
      return Promise.resolve(fixed);
    },
  };
  return provider;
}
```

- [ ] **Step 4:** add to `packages/core/src/index.ts`: `export * from './providers/tts-provider';`

- [ ] **Step 5:** `pnpm --filter @murmur/core exec vitest run src/providers/tts-provider.test.ts` → PASS.

- [ ] **Step 6: Commit**

```bash
git add packages/core/src/providers/tts-provider.ts packages/core/src/providers/tts-provider.test.ts packages/core/src/index.ts
git commit -m "feat(core): interfaz TextToSpeechProvider + mock (R1)"
```

### Task 2: `OfflineConversationOrchestrator`

**Files:**

- Create: `packages/core/src/offline-orchestrator.ts`
- Test: `packages/core/src/offline-orchestrator.test.ts`
- Modify: `packages/core/src/index.ts`

Modela el flujo según `ConversationOrchestrator` (mismos patrones: `Partial<Deps>`, `require`, `setState`, `buildInstructions`, persistencia con privacidad, `persistMemory`). El asistente NO viene por audio del modelo sino por `chat.complete`.

- [ ] **Step 1: Test (falla)** — `packages/core/src/offline-orchestrator.test.ts`:

```ts
import { describe, it, expect, vi } from 'vitest';
import type { AssistantState } from '@murmur/shared';
import { createMockVoiceInput, createMemoryVoiceOutput } from '@murmur/audio';
import { createSqliteStore, createMockChatProvider } from '@murmur/rag';
import { createMockTranscriptionProvider } from './providers/whisper';
import { createMockTextToSpeechProvider } from './providers/tts-provider';
import { OfflineConversationOrchestrator } from './offline-orchestrator';

function build() {
  const store = createSqliteStore(':memory:');
  const states: AssistantState[] = [];
  const transcripts: { role: 'user' | 'assistant'; text: string }[] = [];
  const tts = createMockTextToSpeechProvider(new Uint8Array([9, 9]));
  const output = createMemoryVoiceOutput();
  const orch = new OfflineConversationOrchestrator({
    input: createMockVoiceInput([new Uint8Array([1, 2, 3, 4])]),
    transcription: createMockTranscriptionProvider('hola, soy Ana', 'local-whisper'),
    chat: createMockChatProvider(() => 'Encantado, Ana.'),
    tts,
    output,
    conversation: store.conversation,
    onStateChange: (s) => states.push(s),
    onTranscript: (e) => transcripts.push(e),
  });
  return { orch, store, states, transcripts, tts, output };
}

describe('OfflineConversationOrchestrator', () => {
  it('compat: arranca en idle', () => {
    expect(new OfflineConversationOrchestrator().getState()).toBe('idle');
  });

  it('un turno completo: STT → chat → TTS → salida, persiste y emite estados', async () => {
    const h = build();
    const session = await h.orch.startSession();
    await h.orch.startListening();
    await h.orch.stopListening();
    await h.orch.flush();

    // transcripts emitidos
    expect(h.transcripts).toEqual([
      { role: 'user', text: 'hola, soy Ana' },
      { role: 'assistant', text: 'Encantado, Ana.' },
    ]);
    // persistencia
    const msgs = h.store.conversation
      .getMessages(session.id)
      .map((m) => ({ role: m.role, text: m.text }));
    expect(msgs).toEqual([
      { role: 'user', text: 'hola, soy Ana' },
      { role: 'assistant', text: 'Encantado, Ana.' },
    ]);
    // TTS recibió el texto del asistente y su PCM salió por el output
    expect(h.tts.lastText).toBe('Encantado, Ana.');
    expect(h.output.chunks()).toEqual([new Uint8Array([9, 9])]);
    // estados
    expect(h.states).toEqual(['listening', 'thinking', 'speaking', 'idle']);
  });

  it('un fallo del chat lleva a estado error vía onError', async () => {
    const store = createSqliteStore(':memory:');
    const errors: Error[] = [];
    const states: AssistantState[] = [];
    const orch = new OfflineConversationOrchestrator({
      input: createMockVoiceInput([new Uint8Array([1])]),
      transcription: createMockTranscriptionProvider('x', 'local-whisper'),
      chat: { complete: () => Promise.reject(new Error('LLM caído')) },
      tts: createMockTextToSpeechProvider(),
      output: createMemoryVoiceOutput(),
      conversation: store.conversation,
      onError: (e) => errors.push(e),
      onStateChange: (s) => states.push(s),
    });
    await orch.startSession();
    await orch.startListening();
    await orch.stopListening();
    await orch.flush();
    expect(errors.map((e) => e.message)).toContain('LLM caído');
    expect(states).toContain('error');
  });
});
```

- [ ] **Step 2:** `pnpm --filter @murmur/core exec vitest run src/offline-orchestrator.test.ts` → FAIL.

- [ ] **Step 3: Implementar** — `packages/core/src/offline-orchestrator.ts`:

```ts
import { MurmurError, redactSensitive, type AssistantState, type Session } from '@murmur/shared';
import { concatChunks, type VoiceInputProvider, type VoiceOutputProvider } from '@murmur/audio';
import type {
  ChatMessage,
  ChatProvider,
  ConversationStore,
  FactExtractor,
  NewMemoryItem,
  RagRetriever,
  SessionSummarizer,
} from '@murmur/rag';
import type { TranscriptionProvider } from './providers/transcription-provider';
import type { TextToSpeechProvider } from './providers/tts-provider';
import { buildSystemPrompt, type PromptLocale } from './prompt';
import type { OrchestratorPrivacy } from './orchestrator';

export type IndexingRetriever = RagRetriever & { index?(item: NewMemoryItem): Promise<void> };

export interface OfflineOrchestratorDeps {
  input: VoiceInputProvider;
  transcription: TranscriptionProvider;
  chat: ChatProvider;
  tts: TextToSpeechProvider;
  output: VoiceOutputProvider;
  conversation: ConversationStore;
  retriever?: IndexingRetriever;
  summarizer?: SessionSummarizer;
  factExtractor?: FactExtractor;
  privacy?: OrchestratorPrivacy;
  locale?: PromptLocale;
  onStateChange?: (state: AssistantState) => void;
  onTranscript?: (event: { role: 'user' | 'assistant'; text: string }) => void;
  onError?: (error: Error) => void;
  now?: () => number;
}

const CONTEXT_LIMIT = 5;

function newId(): string {
  return globalThis.crypto.randomUUID();
}

function missing(dep: string): MurmurError {
  return new MurmurError(
    `OfflineConversationOrchestrator: falta la dependencia '${dep}' para esta operación.`,
    'ORCHESTRATOR_MISSING_DEP',
  );
}

/**
 * Orquestador de conversación **offline** por turnos: captura → STT → (prompt+RAG) → LLM → TTS →
 * reproducción, persistiendo el turno y la memoria. Equivale al `ConversationOrchestrator` realtime
 * pero sin nube. Deps inyectables; testeable con mocks.
 */
export class OfflineConversationOrchestrator {
  private state: AssistantState = 'idle';
  private readonly deps: Partial<OfflineOrchestratorDeps>;
  private readonly now: () => number;
  private currentSession: Session | undefined;
  private capture: Uint8Array[] = [];
  private playback: Promise<void> | undefined;

  constructor(deps: Partial<OfflineOrchestratorDeps> = {}) {
    this.deps = deps;
    this.now = deps.now ?? Date.now;
  }

  getState(): AssistantState {
    return this.state;
  }
  reset(): void {
    this.setState('idle');
  }
  private setState(next: AssistantState): void {
    this.state = next;
    this.deps.onStateChange?.(next);
  }

  async startSession(): Promise<Session> {
    const conversation = this.require('conversation');
    this.currentSession = conversation.createSession();
    return this.currentSession;
  }

  /** Captura audio del input acumulando PCM. Fire-and-forget como el realtime. */
  async startListening(deviceId?: string): Promise<void> {
    const input = this.require('input');
    this.requireSession();
    this.capture = [];
    this.setState('listening');
    const stream = await input.start(deviceId);
    for await (const chunk of stream.read()) {
      this.capture.push(chunk);
    }
  }

  /** Cierra la captura y procesa el turno completo (STT→LLM→TTS→salida). */
  async stopListening(): Promise<void> {
    const session = this.requireSession();
    const audio = concatChunks(this.capture);
    this.capture = [];
    try {
      this.setState('thinking');
      const userText = await this.require('transcription').transcribe(audio);
      this.persistAndEmit('user', userText);

      const messages = await this.buildMessages(session, userText);
      const assistantText = await this.require('chat').complete(messages);
      this.persistAndEmit('assistant', assistantText);

      this.setState('speaking');
      const pcm = await this.require('tts').synthesize(assistantText);
      const output = this.require('output');
      this.playback = output.play(this.once(pcm));
      await this.playback;
      this.setState('idle');
    } catch (err) {
      this.setState('error');
      this.deps.onError?.(err instanceof Error ? err : new Error(String(err)));
    }
  }

  async endSession(): Promise<void> {
    const conversation = this.require('conversation');
    const session = this.currentSession;
    if (session === undefined) throw missing('session');
    conversation.endSession(session.id);
    await this.persistMemory(conversation, session.id);
    this.currentSession = undefined;
    this.setState('idle');
  }

  /** Espera la reproducción en curso (tests). */
  async flush(): Promise<void> {
    await this.playback;
  }

  // --- internos ---

  private async *once(pcm: Uint8Array): AsyncIterable<Uint8Array> {
    yield pcm;
  }

  private persistAndEmit(role: 'user' | 'assistant', text: string): void {
    const privacy = this.deps.privacy;
    const conversation = this.deps.conversation;
    const session = this.currentSession;
    if (conversation && session && privacy?.storeTranscripts !== false) {
      const stored = privacy?.redactBeforeStore ? redactSensitive(text) : text;
      conversation.addMessage({ sessionId: session.id, role, text: stored });
    }
    this.deps.onTranscript?.({ role, text });
  }

  private async buildMessages(session: Session, userText: string): Promise<ChatMessage[]> {
    const retriever = this.deps.retriever;
    const localOnly = this.deps.privacy?.localOnlyMode === true;
    const context =
      retriever === undefined || localOnly
        ? []
        : await retriever.retrieve(userText, { limit: CONTEXT_LIMIT });
    const locale = this.deps.locale;
    const system = buildSystemPrompt({ context, ...(locale !== undefined ? { locale } : {}) });
    const history: ChatMessage[] = (this.deps.conversation?.getMessages(session.id) ?? []).map(
      (m) => ({
        role: m.role,
        content: m.text,
      }),
    );
    return [{ role: 'system', content: system }, ...history];
  }

  private async persistMemory(conversation: ConversationStore, sessionId: string): Promise<void> {
    const { summarizer, factExtractor, retriever } = this.deps;
    const index = retriever?.index?.bind(retriever);
    if (summarizer) {
      const summary = await summarizer.summarize(sessionId);
      if (summary.length > 0 && index)
        await index({
          id: newId(),
          type: 'session_summary',
          content: summary,
          createdAt: this.now(),
          sessionId,
        });
    }
    if (factExtractor) {
      const transcript = conversation
        .getMessages(sessionId)
        .map((m) => `${m.role}: ${m.text}`)
        .join('\n');
      const facts = await factExtractor.extract(transcript);
      if (index)
        for (const content of facts)
          await index({ id: newId(), type: 'long_term_fact', content, createdAt: this.now() });
    }
  }

  private require<K extends keyof OfflineOrchestratorDeps>(
    key: K,
  ): NonNullable<OfflineOrchestratorDeps[K]> {
    const value = this.deps[key];
    if (value === undefined) throw missing(String(key));
    return value as NonNullable<OfflineOrchestratorDeps[K]>;
  }

  private requireSession(): Session {
    if (this.currentSession === undefined) throw missing('session (llama a startSession primero)');
    return this.currentSession;
  }
}
```

Nota: `buildMessages` incluye el system + historial (el turno del usuario ya está persistido antes de llamarla, así que aparece como último mensaje del historial). Verifica que `Session` se exporta desde `@murmur/shared` (lo usa el orchestrator realtime).

- [ ] **Step 4:** add to `packages/core/src/index.ts`: `export * from './offline-orchestrator';`

- [ ] **Step 5:** `pnpm --filter @murmur/core exec vitest run src/offline-orchestrator.test.ts` → PASS. Luego `pnpm --filter @murmur/core typecheck`.

- [ ] **Step 6: Commit**

```bash
git add packages/core/src/offline-orchestrator.ts packages/core/src/offline-orchestrator.test.ts packages/core/src/index.ts
git commit -m "feat(core): OfflineConversationOrchestrator — loop por turnos STT→LLM→TTS (R1)"
```

---

## FASE R3 — LLM local (Ollama)

### Task 3: `createOllamaChatProvider`

**Files:**

- Modify: `packages/rag/src/chat.ts`
- Test: `packages/rag/src/chat.test.ts`

- [ ] **Step 1: Test (falla)** — añade a `packages/rag/src/chat.test.ts`:

```ts
import { createOllamaChatProvider } from './chat';

describe('createOllamaChatProvider', () => {
  it('hace POST a /api/chat y parsea message.content', async () => {
    const calls: { url: string; body: unknown }[] = [];
    const fetchFn = (async (url: string, init: RequestInit) => {
      calls.push({ url, body: JSON.parse(String(init.body)) });
      return new Response(JSON.stringify({ message: { role: 'assistant', content: 'hola' } }), {
        status: 200,
      });
    }) as unknown as typeof globalThis.fetch;
    const chat = createOllamaChatProvider({ model: 'llama3', fetchFn });
    const out = await chat.complete([{ role: 'user', content: 'hey' }]);
    expect(out).toBe('hola');
    expect(calls[0]!.url).toBe('http://localhost:11434/api/chat');
    expect(calls[0]!.body).toMatchObject({ model: 'llama3', stream: false });
  });

  it('estado HTTP no-ok → ModelError', async () => {
    const fetchFn = (async () =>
      new Response('nope', { status: 500 })) as unknown as typeof globalThis.fetch;
    const chat = createOllamaChatProvider({ model: 'llama3', fetchFn });
    await expect(chat.complete([{ role: 'user', content: 'x' }])).rejects.toThrow(/Ollama/i);
  });
});
```

- [ ] **Step 2:** `pnpm --filter @murmur/rag exec vitest run src/chat.test.ts` → FAIL.

- [ ] **Step 3: Implementar** — añade a `packages/rag/src/chat.ts` (junto a `createOpenAIChatProvider`):

```ts
export interface OllamaChatOptions {
  /** Modelo de Ollama (p. ej. `llama3`, `qwen2.5`). */
  model: string;
  /** Endpoint base de Ollama. Por defecto `http://localhost:11434`. */
  endpoint?: string;
  /** `fetch` inyectable. Por defecto `globalThis.fetch`. */
  fetchFn?: typeof globalThis.fetch;
}

interface OllamaChatResponse {
  message?: { role?: string; content?: string };
}

const DEFAULT_OLLAMA_ENDPOINT = 'http://localhost:11434';

/**
 * `ChatProvider` contra Ollama local. `POST {endpoint}/api/chat` con `{ model, messages, stream:false }`
 * y parsea `message.content`. Errores de red/HTTP/parseo → `ModelError`. No corre red en tests (`fetchFn`).
 */
export function createOllamaChatProvider(options: OllamaChatOptions): ChatProvider {
  const endpoint = (options.endpoint ?? DEFAULT_OLLAMA_ENDPOINT).replace(/\/$/, '');
  const fetchFn = options.fetchFn ?? globalThis.fetch;
  if (typeof fetchFn !== 'function') {
    throw new ModelError('No hay fetch disponible para Ollama (globalThis.fetch).');
  }
  return {
    async complete(messages: ChatMessage[], opts?: ChatCompleteOptions): Promise<string> {
      let response: Response;
      try {
        response = await fetchFn(`${endpoint}/api/chat`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            model: options.model,
            messages,
            stream: false,
            ...(opts?.temperature !== undefined
              ? { options: { temperature: opts.temperature } }
              : {}),
          }),
        });
      } catch {
        throw new ModelError(
          'No se pudo contactar con Ollama (¿está corriendo en localhost:11434?).',
        );
      }
      if (!response.ok) {
        throw new ModelError(`Ollama respondió con estado ${response.status}.`);
      }
      let payload: OllamaChatResponse;
      try {
        payload = (await response.json()) as OllamaChatResponse;
      } catch {
        throw new ModelError('No se pudo parsear la respuesta de Ollama.');
      }
      const content = payload.message?.content;
      if (typeof content !== 'string') {
        throw new ModelError('Respuesta inesperada de Ollama (falta message.content).');
      }
      return content.trim();
    },
  };
}
```

- [ ] **Step 4:** `pnpm --filter @murmur/rag exec vitest run src/chat.test.ts` → PASS; `pnpm --filter @murmur/rag typecheck`.

- [ ] **Step 5: Commit**

```bash
git add packages/rag/src/chat.ts packages/rag/src/chat.test.ts
git commit -m "feat(rag): createOllamaChatProvider — ChatProvider local por HTTP (R3)"
```

---

## FASE R4 — TTS local (Piper)

### Task 4: `createPiperTtsProvider`

**Files:**

- Create: `packages/core/src/providers/piper-tts.ts`
- Test: `packages/core/src/providers/piper-tts.test.ts`
- Modify: `packages/core/src/index.ts`

- [ ] **Step 1: Test (falla)** — `packages/core/src/providers/piper-tts.test.ts`:

```ts
import { describe, it, expect, vi } from 'vitest';
import { ModelError } from '@murmur/shared';
import { createPiperTtsProvider } from './piper-tts';

describe('createPiperTtsProvider', () => {
  it('delega en run y devuelve su PCM', async () => {
    const pcm = new Uint8Array([1, 2, 3]);
    const run = vi.fn(async (t: string) => pcm);
    const tts = createPiperTtsProvider({ run });
    expect(await tts.synthesize('hola')).toBe(pcm);
    expect(run).toHaveBeenCalledWith('hola');
  });

  it('un fallo de run → ModelError', async () => {
    const tts = createPiperTtsProvider({
      run: async () => {
        throw new Error('piper no encontrado');
      },
    });
    await expect(tts.synthesize('x')).rejects.toBeInstanceOf(ModelError);
  });

  it('exige run', () => {
    expect(() => createPiperTtsProvider({} as never)).toThrow(ModelError);
  });
});
```

- [ ] **Step 2:** `pnpm --filter @murmur/core exec vitest run src/providers/piper-tts.test.ts` → FAIL.

- [ ] **Step 3: Implementar** — `packages/core/src/providers/piper-tts.ts`:

```ts
import { ModelError } from '@murmur/shared';
import type { TextToSpeechProvider } from './tts-provider';

/** Ejecutor del TTS local (Piper): texto → PCM16. Lo aporta el host (subproceso/comando Tauri). */
export type PiperRun = (text: string) => Promise<Uint8Array>;

export interface PiperTtsOptions {
  run: PiperRun;
}

/**
 * `TextToSpeechProvider` que delega en un `run` inyectado (Piper local). No empaqueta binario ni voz;
 * el host aporta `run`. Sin `run` lanza `ModelError`. Fallos del `run` → `ModelError`.
 */
export function createPiperTtsProvider(options: PiperTtsOptions): TextToSpeechProvider {
  if (typeof options?.run !== 'function') {
    throw new ModelError(
      'createPiperTtsProvider requiere un ejecutor `run`; el TTS local no se empaqueta aquí.',
    );
  }
  const run = options.run;
  return {
    async synthesize(text: string): Promise<Uint8Array> {
      try {
        return await run(text);
      } catch (cause) {
        throw new ModelError('El TTS local (Piper) falló al sintetizar.', { cause });
      }
    },
  };
}
```

- [ ] **Step 4:** add to `packages/core/src/index.ts`: `export * from './providers/piper-tts';`

- [ ] **Step 5:** `pnpm --filter @murmur/core exec vitest run src/providers/piper-tts.test.ts` → PASS; `pnpm --filter @murmur/core typecheck`.

- [ ] **Step 6: Commit**

```bash
git add packages/core/src/providers/piper-tts.ts packages/core/src/providers/piper-tts.test.ts packages/core/src/index.ts
git commit -m "feat(core): createPiperTtsProvider — TTS local inyectable (R4)"
```

---

## FASE R2/R4 nativos — STT (whisper-rs) y comandos Tauri

> Estos tocan Rust y dependen de modelos/binarios externos. Van **feature-gated**: el `cargo test` y el bundle por defecto NO los compilan. Su verificación real necesita el modelo/binario en la máquina; aquí se compila bajo la feature y se documenta el smoke.

### Task 5: Adaptadores TS de la app (resample + invoke) — SIN nativo

**Files:**

- Create: `apps/desktop/src/offline/local-whisper-run.ts`, `apps/desktop/src/offline/piper-tts-run.ts`
- Test: `apps/desktop/src/offline/local-whisper-run.test.ts`, `apps/desktop/src/offline/piper-tts-run.test.ts`

- [ ] **Step 1: Tests (fallan)** — `local-whisper-run.test.ts`:

```ts
import { describe, it, expect, vi } from 'vitest';
import { float32ToPcm16, PCM_SAMPLE_RATE } from '@murmur/audio';
import { createTauriLocalWhisperRun } from './local-whisper-run';

describe('createTauriLocalWhisperRun', () => {
  it('resamplea 24k→16k, pasa f32 al comando y devuelve el texto', async () => {
    const invoke = vi.fn(async (_cmd: string, args: { samples: number[] }) => {
      // el comando recibe f32 a 16k; con 24 muestras a 24k → 16 a 16k
      expect(args.samples.length).toBe(16);
      return 'hola mundo';
    });
    const run = createTauriLocalWhisperRun({ invoke, targetRate: 16000 });
    const pcm = float32ToPcm16(new Float32Array(24).fill(0.1)); // 24 muestras @ 24k
    const text = await run(pcm);
    expect(text).toBe('hola mundo');
    expect(invoke).toHaveBeenCalledWith(
      'transcribe',
      expect.objectContaining({ samples: expect.any(Array) }),
    );
  });
});
```

`piper-tts-run.test.ts`:

```ts
import { describe, it, expect, vi } from 'vitest';
import { createTauriPiperRun } from './piper-tts-run';

describe('createTauriPiperRun', () => {
  it('invoca el comando tts y devuelve PCM (Uint8Array)', async () => {
    const invoke = vi.fn(async () => [1, 2, 3, 4]);
    const run = createTauriPiperRun({ invoke });
    const pcm = await run('hola');
    expect(Array.from(pcm)).toEqual([1, 2, 3, 4]);
    expect(invoke).toHaveBeenCalledWith('tts', { text: 'hola' });
  });
});
```

- [ ] **Step 2:** run both → FAIL.

- [ ] **Step 3: Implementar** — `apps/desktop/src/offline/local-whisper-run.ts`:

```ts
import { pcm16ToFloat32, resampleLinear, PCM_SAMPLE_RATE } from '@murmur/audio';
import type { LocalWhisperRun } from '@murmur/core';

/** `invoke` de Tauri inyectable (en tests, un mock). */
export type TauriInvoke = <T>(cmd: string, args?: Record<string, unknown>) => Promise<T>;

export interface LocalWhisperRunOptions {
  invoke: TauriInvoke;
  /** Frecuencia que espera whisper (16 kHz). */
  targetRate?: number;
}

/**
 * Adaptador `run` para `local-whisper`: convierte el PCM16 24 kHz capturado a f32 16 kHz (lo que
 * espera whisper.cpp) y delega en el comando Tauri `transcribe`, que corre whisper-rs en nativo.
 */
export function createTauriLocalWhisperRun(options: LocalWhisperRunOptions): LocalWhisperRun {
  const target = options.targetRate ?? 16000;
  return async (audio: Uint8Array): Promise<string> => {
    const f32at24 = pcm16ToFloat32(audio);
    const f32at16 = resampleLinear(f32at24, PCM_SAMPLE_RATE, target);
    return options.invoke<string>('transcribe', { samples: Array.from(f32at16) });
  };
}
```

`apps/desktop/src/offline/piper-tts-run.ts`:

```ts
import type { PiperRun } from '@murmur/core';
import type { TauriInvoke } from './local-whisper-run';

export interface PiperRunOptions {
  invoke: TauriInvoke;
}

/** Adaptador `run` de Piper: invoca el comando Tauri `tts` y normaliza la respuesta a `Uint8Array`. */
export function createTauriPiperRun(options: PiperRunOptions): PiperRun {
  return async (text: string): Promise<Uint8Array> => {
    const bytes = await options.invoke<number[] | Uint8Array>('tts', { text });
    return bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  };
}
```

- [ ] **Step 4:** run both → PASS; `pnpm --filter @murmur/desktop typecheck`.

- [ ] **Step 5: Commit**

```bash
git add apps/desktop/src/offline/local-whisper-run.ts apps/desktop/src/offline/piper-tts-run.ts apps/desktop/src/offline/*.test.ts
git commit -m "feat(desktop): adaptadores run de whisper local y Piper (resample + invoke) (R2/R4)"
```

### Task 6: Módulo Rust `whisper` (feature-gated) + comandos Tauri

**Files:**

- Modify: `packages/native/Cargo.toml`, `packages/native/src/lib.rs`
- Create: `packages/native/src/whisper.rs`
- Modify: `apps/desktop/src-tauri/src/lib.rs` (registrar comandos `transcribe`/`tts` tras la feature `offline`)
- Create: `apps/desktop/src-tauri/src/offline_cmd.rs`

- [ ] **Step 1: Cargo feature.** En `packages/native/Cargo.toml`, añade:

```toml
[features]
default = []
whisper = ["dep:whisper-rs"]

[dependencies]
whisper-rs = { version = "0.12", optional = true }
```

- [ ] **Step 2: Módulo Rust** — `packages/native/src/whisper.rs`:

```rust
//! Transcripción local con whisper.cpp (vía `whisper-rs`). Compila solo con la feature `whisper`.
//! El modelo (ggml) lo aporta el usuario; aquí solo se carga y se ejecuta.
use whisper_rs::{FullParams, SamplingStrategy, WhisperContext, WhisperContextParameters};

/// Transcribe muestras f32 mono a 16 kHz usando el modelo ggml en `model_path`.
pub fn transcribe(samples: &[f32], model_path: &str) -> Result<String, String> {
    let ctx = WhisperContext::new_with_params(model_path, WhisperContextParameters::default())
        .map_err(|e| format!("no se pudo cargar el modelo whisper: {e}"))?;
    let mut state = ctx.create_state().map_err(|e| format!("estado whisper: {e}"))?;
    let mut params = FullParams::new(SamplingStrategy::Greedy { best_of: 1 });
    params.set_print_progress(false);
    state.full(params, samples).map_err(|e| format!("fallo al transcribir: {e}"))?;
    let n = state.full_n_segments().map_err(|e| format!("segmentos: {e}"))?;
    let mut out = String::new();
    for i in 0..n {
        if let Ok(seg) = state.full_get_segment_text(i) {
            out.push_str(&seg);
        }
    }
    Ok(out.trim().to_string())
}
```

- [ ] **Step 3:** En `packages/native/src/lib.rs` añade: `#[cfg(feature = "whisper")] pub mod whisper;`

- [ ] **Step 4: Verificar compilación bajo la feature** (no entra en el `cargo test` por defecto):

```bash
cd packages/native && cargo build --features whisper 2>&1 | tail -20
```

Expected: compila (whisper-rs construye whisper.cpp; requiere cmake/clang). **Si el entorno no tiene cmake/clang**, documenta el requisito en el reporte y deja la feature definida (no rompe el `cargo test` por defecto, que NO usa la feature). NO añadas la feature al pipeline pnpm ni al CI por defecto.

- [ ] **Step 5: Comandos Tauri** — `apps/desktop/src-tauri/src/offline_cmd.rs` (registrados solo si la feature está activa en el bundle; el modelo/voz vienen de `~/.murmur/models/`). Implementa `transcribe(samples: Vec<f32>) -> Result<String,String>` llamando a `murmur_native::whisper::transcribe` con el `model_path` de config, y `tts(text: String) -> Result<Vec<u8>,String>` haciendo shell a `piper`. Regístralo en `lib.rs` con `tauri::generate_handler!`. (Detalle de paths/lectura de config: usa el dir `~/.murmur/models/` resuelto por el comando; documenta en RELEASING/README.)

- [ ] **Step 6: Commit**

```bash
git add packages/native/Cargo.toml packages/native/src/whisper.rs packages/native/src/lib.rs apps/desktop/src-tauri/src/offline_cmd.rs apps/desktop/src-tauri/src/lib.rs
git commit -m "feat(native): módulo whisper (feature-gated) + comandos Tauri transcribe/tts (R2/R4)"
```

---

## FASE R5 — Gestión de modelos, config de modo y wiring

### Task 7: Config `mode` + `config set-mode`

**Files:**

- Modify: `packages/cli/src/config.ts`, `packages/cli/src/cli.ts`
- Test: `packages/cli/src/config.test.ts` (o el test de cli existente)

- [ ] **Step 1: Test (falla)** — añade a `packages/cli/src/config.test.ts`:

```ts
it('setMode valida y persiste el modo', () => {
  const store = makeConfig(); // helper existente en el test
  expect(store.get().mode).toBe('cloud'); // default
  store.setMode('offline');
  expect(store.get().mode).toBe('offline');
  expect(() => store.setMode('xxx' as never)).toThrow();
});
```

(Si no existe `makeConfig`, usa el patrón del test de `setTranscription`.)

- [ ] **Step 2:** `pnpm --filter murmur exec vitest run src/config.test.ts` → FAIL.

- [ ] **Step 3: Implementar** — en `packages/cli/src/config.ts`: añade `mode: 'cloud' | 'offline'` a `MurmurConfig` (default `'cloud'`), `VALID_MODES`, `isMode`, y `setMode(mode)` validado (espejo de `setTranscription` en líneas ~158). En `cli.ts` añade el subcomando `config set-mode <cloud|offline>`.

- [ ] **Step 4:** test → PASS; `pnpm --filter murmur typecheck`.

- [ ] **Step 5: Commit**

```bash
git add packages/cli/src/config.ts packages/cli/src/cli.ts packages/cli/src/config.test.ts
git commit -m "feat(cli): config mode (cloud/offline) + config set-mode (R5)"
```

### Task 8: Descargador de modelos

**Files:**

- Create: `packages/cli/src/models.ts`
- Test: `packages/cli/src/models.test.ts`
- Modify: `packages/cli/src/cli.ts` (`models download`)

- [ ] **Step 1: Test (falla)** — `models.test.ts`:

```ts
import { describe, it, expect, vi } from 'vitest';
import { MODEL_CATALOG, downloadModel } from './models';

describe('downloadModel', () => {
  it('descarga al destino con fetch y fs inyectados', async () => {
    const written: { path: string; bytes: number }[] = [];
    const fetchFn = (async () =>
      new Response(new Uint8Array([1, 2, 3]), {
        status: 200,
      })) as unknown as typeof globalThis.fetch;
    const writeFile = async (path: string, data: Uint8Array) => {
      written.push({ path, bytes: data.length });
    };
    const dest = await downloadModel('whisper-large-v3', {
      dir: '/tmp/m',
      fetchFn,
      writeFile,
      exists: () => false,
    });
    expect(dest).toContain('whisper');
    expect(written[0]!.bytes).toBe(3);
  });

  it('si ya existe no re-descarga', async () => {
    const fetchFn = vi.fn();
    await downloadModel('whisper-large-v3', {
      dir: '/tmp/m',
      fetchFn: fetchFn as never,
      writeFile: async () => {},
      exists: () => true,
    });
    expect(fetchFn).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2:** `pnpm --filter murmur exec vitest run src/models.test.ts` → FAIL.

- [ ] **Step 3: Implementar** — `packages/cli/src/models.ts`: `MODEL_CATALOG` (entradas `whisper-large-v3` con su URL de Hugging Face `ggml-org/whisper.cpp` y tamaño; nota informativa para el LLM/voz Piper que se gestionan vía Ollama/Piper, no descarga directa). `downloadModel(name, { dir, fetchFn?, writeFile?, exists? })` que: resuelve la ruta destino en `dir` (default `~/.murmur/models/`), si `exists` la salta, si no hace `fetch` y `writeFile`. Deps (`fetchFn`/`writeFile`/`exists`) inyectables para tests; defaults a `globalThis.fetch` + `node:fs/promises`. En `cli.ts`: `murmur models download <name>` con barra/aviso de tamaño.

- [ ] **Step 4:** test → PASS; `pnpm --filter murmur typecheck`.

- [ ] **Step 5: Commit**

```bash
git add packages/cli/src/models.ts packages/cli/src/models.test.ts packages/cli/src/cli.ts
git commit -m "feat(cli): descargador de modelos (~/.murmur/models) + models download (R5)"
```

### Task 9: Wiring de la app — seleccionar orquestador por modo

**Files:**

- Create: `apps/desktop/src/offline/use-offline-murmur.ts`
- Test: `apps/desktop/src/offline/use-offline-murmur.test.tsx`
- Modify: `apps/desktop/src/App.tsx`

- [ ] **Step 1: Test (falla)** — `use-offline-murmur.test.tsx`: renderiza el hook con providers mock (input/transcription/chat/tts/output), dispara `startCapture`/`stopCapture` y verifica que `capsuleState` recorre `listening→thinking→speaking→idle` y que el transcript acumula usuario+asistente. (Modela sobre `use-murmur.test.tsx`.)

- [ ] **Step 2:** run → FAIL.

- [ ] **Step 3: Implementar** — `use-offline-murmur.ts`: hook análogo a `useMurmur` pero construyendo `OfflineConversationOrchestrator` con `transcription` (local-whisper vía `createTauriLocalWhisperRun`), `chat` (`createOllamaChatProvider`), `tts` (`createPiperTtsProvider` + `createTauriPiperRun`), `input`/`output` Web Audio, `conversation` en memoria. En `App.tsx`: leer `config.mode`; si `offline`, usar `useOfflineMurmur`, si no `useMurmur` (selección por modo; mantener ambos inyectables para tests).

- [ ] **Step 4:** run → PASS; `pnpm --filter @murmur/desktop typecheck`.

- [ ] **Step 5: Commit**

```bash
git add apps/desktop/src/offline/use-offline-murmur.ts apps/desktop/src/offline/use-offline-murmur.test.tsx apps/desktop/src/App.tsx
git commit -m "feat(desktop): hook offline + selección de orquestador por modo (R5)"
```

### Task 10: Docs + tracker + puerta de calidad

**Files:**

- Modify: `README.md`, `docs/superpowers/PROGRESS.md`

- [ ] **Step 1:** README: sección "Modo offline" con requisitos (Ollama instalado + modelo; whisper large-v3 auto-descargado ~3 GB; Piper + voz; RAM ~8–16 GB; mejor GPU/Apple Silicon) y cómo activarlo (`murmur config set-mode offline`, `murmur models download whisper-large-v3`). Deja claro que la nube es el default.

- [ ] **Step 2:** Puerta de calidad completa:

```bash
pnpm typecheck && pnpm lint && pnpm test && pnpm build && pnpm exec prettier --check . && (cd packages/native && cargo test)
```

Expected: verde (la feature `whisper` NO se compila en el `cargo test` por defecto).

- [ ] **Step 3:** PROGRESS.md: entrada del modo offline (R1–R5, qué quedó verificado con mocks y qué necesita modelos/motores del usuario).

- [ ] **Step 4: Commit**

```bash
git add README.md docs/superpowers/PROGRESS.md
git commit -m "docs: modo offline — requisitos, uso y tracker (R5)"
```

---

## Self-Review (cobertura del spec)

- §4.1 `TextToSpeechProvider` → Task 1. ✅
- §4.2 `OfflineConversationOrchestrator` → Task 2. ✅
- §4.3 `createOllamaChatProvider` → Task 3. ✅
- §4.5 TTS Piper (`createPiperTtsProvider`) → Task 4; comando Tauri `tts` → Task 6; adaptador run → Task 5. ✅
- §4.4 STT (whisper-rs + comando Tauri + adaptador run) → Tasks 5 (TS adapter) + 6 (Rust + comando). ✅
- §4.6 config `mode` + descarga + selección de orquestador → Tasks 7, 8, 9. ✅
- §5 criterios: gate (Task 10), R1 loop (Task 2), Ollama (Task 3), adaptadores/native (Tasks 5/6), Piper (Task 4), config/descarga/wiring (Tasks 7/8/9), docs (Task 10). ✅
- §7 fuera de alcance (modelos no commiteados, sin tools en el loop, sin streaming, wake word aparte): respetado.

Notas: Tasks 1–5, 7, 8 son **totalmente verificables** con mocks/Vitest. Task 6 (Rust whisper-rs + comandos Tauri) y la ejecución real del modo offline dependen de modelos/motores externos y de cmake/clang en la máquina; se compilan bajo feature y se documentan. Sin placeholders en las tareas verificables; las partes nativas indican el comando de compilación y el requisito externo explícitamente.
