# Function-calling realtime → plugins — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Que el asistente pueda ejecutar acciones (tools/plugins) durante la conversación de voz: el modelo decide llamar a una tool, murmur la ejecuta vía el `PluginRegistry` y le devuelve el resultado para que siga hablando.

**Architecture:** El protocolo de function-calling de la OpenAI Realtime API se implementa en el provider; `@murmur/core` se mantiene **desacoplado** de `@murmur/plugins` — el orchestrator recibe `tools: RealtimeTool[]` y `dispatchTool: (name, args) => Promise<string>` genéricos. La app de escritorio adapta el `PluginRegistry` a esa interfaz (`createDesktopToolHost`) y lo inyecta.

**Tech Stack:** TypeScript strict ESM, Vitest, React 19 (Testing Library), monorepo pnpm. OpenAI Realtime API sobre WebSocket (mockeado con `FakeWebSocket`/`createMockRealtimeProvider`).

**Spec:** `docs/superpowers/specs/2026-06-24-realtime-function-calling.md`

**Convenciones del repo:**

- Tests por paquete: `pnpm --filter <pkg> test`. Un solo archivo: `pnpm --filter <pkg> exec vitest run <ruta>`.
- Puerta de calidad: `pnpm typecheck && pnpm lint && pnpm test && pnpm build && pnpm exec prettier --check .` (+ `cargo test` si se toca Rust; aquí **no** se toca).
- TS strict, sin `any` injustificado. IDs con `globalThis.crypto.randomUUID()` (nunca `node:crypto`).

---

## File Structure

| Archivo                                                  | Responsabilidad                                                                         | Acción    |
| -------------------------------------------------------- | --------------------------------------------------------------------------------------- | --------- |
| `packages/core/src/providers/realtime-model-provider.ts` | Tipos `RealtimeTool`/`RealtimeToolCall`; campos `tools`/`onToolCall`; `sendToolResult`. | Modificar |
| `packages/core/src/providers/mock-realtime.ts`           | Captura de `tools`/`toolResults`, `emitToolCall`, `sendToolResult`.                     | Modificar |
| `packages/core/src/providers/openai-realtime.ts`         | Tools en `session.update`, manejo de eventos function-call, `sendToolResult`.           | Modificar |
| `packages/core/src/orchestrator.ts`                      | Deps `tools`/`dispatchTool`; ciclo tool-call → dispatch → sendToolResult.               | Modificar |
| `apps/desktop/src/plugins/desktop-plugins.ts`            | `createDesktopToolHost`: registry de ejemplo + adaptador `dispatchTool`.                | Crear     |
| `apps/desktop/src/use-murmur.ts`                         | Deps `tools`/`dispatchTool` → orchestrator.                                             | Modificar |
| `apps/desktop/src/App.tsx`                               | Prop `toolHost` (default `createDesktopToolHost`) → `useMurmur`.                        | Modificar |
| `apps/desktop/package.json`                              | Añadir dependencia `@murmur/plugins`.                                                   | Modificar |

`index.ts` de core ya hace `export * from './providers/realtime-model-provider'`, así que los tipos nuevos se exportan automáticamente (sin cambios).

---

## Task 1: Interfaz de tools + soporte en el mock + envío en el provider real

Añade los tipos y la interfaz de function-calling, el soporte en el mock (captura + `emitToolCall`) y el lado **saliente** del provider real (declarar tools, `sendToolResult`).

**Files:**

- Modify: `packages/core/src/providers/realtime-model-provider.ts`
- Modify: `packages/core/src/providers/mock-realtime.ts`
- Modify: `packages/core/src/providers/openai-realtime.ts`
- Test: `packages/core/src/providers/mock-realtime.test.ts` (crear si no existe), `packages/core/src/providers/openai-realtime.test.ts`

- [ ] **Step 1: Añadir tipos e interfaz (no es TDD; es contrato de tipos)**

En `packages/core/src/providers/realtime-model-provider.ts`, añadir **antes** de `RealtimeConnectOptions`:

```ts
/** Definición de una tool que el modelo puede invocar (formato function-calling del realtime). */
export interface RealtimeTool {
  type: 'function';
  name: string;
  description: string;
  /** JSON Schema de los parámetros; sólo se serializa, de ahí `unknown` (desacopla de @murmur/plugins). */
  parameters: unknown;
}

/** Una llamada a tool emitida por el modelo, con los argumentos ya parseados. */
export interface RealtimeToolCall {
  /** Identificador de la llamada; debe devolverse en `sendToolResult`. */
  callId: string;
  /** Nombre de la tool (coincide con `RealtimeTool.name`). */
  name: string;
  /** Argumentos parseados del JSON enviado por el modelo. */
  arguments: Record<string, unknown>;
}
```

Dentro de `RealtimeConnectOptions`, añadir (tras `onOpen?`):

```ts
  /** Tools que el modelo puede invocar (function-calling). Si se omite, no se declaran tools. */
  tools?: RealtimeTool[];
  /** El modelo pidió ejecutar una tool; el host la ejecuta y responde con `sendToolResult`. */
  onToolCall?: (call: RealtimeToolCall) => void;
```

Dentro de `RealtimeModelSession`, añadir (tras `interrupt(): void;`):

```ts
  /** Devuelve al modelo el resultado (texto) de una tool, identificada por `callId`. */
  sendToolResult(callId: string, output: string): void;
```

- [ ] **Step 2: Escribir tests del mock (fallan)**

Crear/editar `packages/core/src/providers/mock-realtime.test.ts`:

```ts
import { describe, it, expect, vi } from 'vitest';
import { createMockRealtimeProvider } from './mock-realtime';
import type { RealtimeTool } from './realtime-model-provider';

const tool: RealtimeTool = { type: 'function', name: 'demo', description: 'd', parameters: {} };

describe('createMockRealtimeProvider — function-calling', () => {
  it('la sesión captura las tools pasadas en connect', async () => {
    const provider = createMockRealtimeProvider();
    await provider.connect({ apiKey: 'k', model: 'm', tools: [tool] });
    expect(provider.lastSession?.tools?.map((t) => t.name)).toEqual(['demo']);
  });

  it('emitToolCall invoca onToolCall con la llamada', async () => {
    const provider = createMockRealtimeProvider();
    const onToolCall = vi.fn();
    await provider.connect({ apiKey: 'k', model: 'm', onToolCall });
    provider.emitToolCall({ callId: 'c1', name: 'demo', arguments: { a: 1 } });
    expect(onToolCall).toHaveBeenCalledWith({ callId: 'c1', name: 'demo', arguments: { a: 1 } });
  });

  it('sendToolResult queda registrado en toolResults', async () => {
    const provider = createMockRealtimeProvider();
    const session = await provider.connect({ apiKey: 'k', model: 'm' });
    session.sendToolResult('c1', 'resultado');
    expect(provider.lastSession?.toolResults).toEqual([{ callId: 'c1', output: 'resultado' }]);
  });
});
```

- [ ] **Step 3: Ejecutar tests del mock (verificar que fallan)**

Run: `pnpm --filter @murmur/core exec vitest run src/providers/mock-realtime.test.ts`
Expected: FAIL (`tools`/`toolResults`/`emitToolCall`/`sendToolResult` no existen).

- [ ] **Step 4: Implementar el soporte en el mock**

En `packages/core/src/providers/mock-realtime.ts`:

Importar los tipos nuevos:

```ts
import type {
  RealtimeConnectOptions,
  RealtimeModelProvider,
  RealtimeModelSession,
  RealtimeTool,
  RealtimeToolCall,
} from './realtime-model-provider';
```

Extender `MockRealtimeSession` (añadir tras `closes`):

```ts
  /** Tools recibidas en `connect` (vía las opciones). */
  readonly tools: RealtimeTool[] | undefined;
  /** Resultados devueltos vía `sendToolResult`, en orden. */
  readonly toolResults: { callId: string; output: string }[];
```

Extender `MockRealtimeProvider` (añadir tras `emitError`):

```ts
  /** Emite una llamada a tool del modelo (`onToolCall`). */
  emitToolCall(call: RealtimeToolCall): void;
```

Reemplazar `createSession` por:

```ts
function createSession(tools: RealtimeTool[] | undefined): MockRealtimeSession {
  const sentAudio: Uint8Array[] = [];
  const toolResults: { callId: string; output: string }[] = [];
  let commits = 0;
  let interrupts = 0;
  let closes = 0;
  return {
    sentAudio,
    tools,
    toolResults,
    get commits() {
      return commits;
    },
    get interrupts() {
      return interrupts;
    },
    get closes() {
      return closes;
    },
    sendAudio(chunk: Uint8Array): void {
      sentAudio.push(chunk);
    },
    commit(): void {
      commits++;
    },
    interrupt(): void {
      interrupts++;
    },
    sendToolResult(callId: string, output: string): void {
      toolResults.push({ callId, output });
    },
    close(): Promise<void> {
      closes++;
      return Promise.resolve();
    },
  };
}
```

En `connect`, cambiar `const session = createSession();` por:

```ts
const session = createSession(options.tools);
```

Añadir el método `emitToolCall` al objeto devuelto por `createMockRealtimeProvider` (tras `emitError`):

```ts
    emitToolCall(call: RealtimeToolCall): void {
      lastOptions?.onToolCall?.(call);
    },
```

- [ ] **Step 5: Ejecutar tests del mock (verificar que pasan)**

Run: `pnpm --filter @murmur/core exec vitest run src/providers/mock-realtime.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 6: Escribir tests del provider real — lado saliente (fallan)**

Añadir a `packages/core/src/providers/openai-realtime.test.ts` (dentro del `describe` existente):

```ts
it('declara las tools en session.update cuando se pasan', async () => {
  const { provider, getWs } = setup();
  const tools = [{ type: 'function' as const, name: 'demo', description: 'd', parameters: {} }];
  const sessionPromise = provider.connect({ ...baseOptions, tools });
  const ws = getWs();
  ws.simulateOpen();
  await sessionPromise;

  const update = parseSent(ws).find((m) => m.type === 'session.update')!;
  const session = update.session as Record<string, unknown>;
  expect(session.tools).toEqual(tools);
  expect(session.tool_choice).toBe('auto');
});

it('sin tools, session.update no incluye tools (compat F5)', async () => {
  const { provider, getWs } = setup();
  const sessionPromise = provider.connect(baseOptions);
  const ws = getWs();
  ws.simulateOpen();
  await sessionPromise;

  const update = parseSent(ws).find((m) => m.type === 'session.update')!;
  const session = update.session as Record<string, unknown>;
  expect(session.tools).toBeUndefined();
  expect(session.tool_choice).toBeUndefined();
});

it('sendToolResult envía function_call_output + response.create', async () => {
  const { provider, getWs } = setup();
  const sessionPromise = provider.connect(baseOptions);
  const ws = getWs();
  ws.simulateOpen();
  const session = await sessionPromise;

  session.sendToolResult('call_1', 'son las 12');

  const sent = parseSent(ws);
  const item = sent.find((m) => m.type === 'conversation.item.create')!;
  expect(item.item).toEqual({
    type: 'function_call_output',
    call_id: 'call_1',
    output: 'son las 12',
  });
  // El último mensaje pide una nueva respuesta para continuar el turno.
  expect(sent[sent.length - 1]!.type).toBe('response.create');
});
```

- [ ] **Step 7: Ejecutar (verificar que fallan)**

Run: `pnpm --filter @murmur/core exec vitest run src/providers/openai-realtime.test.ts`
Expected: FAIL (tools no se envían; `sendToolResult` no existe → además error de tipo).

- [ ] **Step 8: Implementar el lado saliente en el provider real**

En `packages/core/src/providers/openai-realtime.ts`, dentro de `handleOpen`, tras el bloque de `instructions` y antes de `this.send({ type: 'session.update', session });`:

```ts
if (this.options.tools !== undefined && this.options.tools.length > 0) {
  session.tools = this.options.tools;
  session.tool_choice = 'auto';
}
```

Añadir el método `sendToolResult` a la clase `OpenAIRealtimeSession` (tras `interrupt`):

```ts
  sendToolResult(callId: string, output: string): void {
    this.send({
      type: 'conversation.item.create',
      item: { type: 'function_call_output', call_id: callId, output },
    });
    this.send({ type: 'response.create' });
  }
```

- [ ] **Step 9: Ejecutar (verificar que pasan)**

Run: `pnpm --filter @murmur/core exec vitest run src/providers/openai-realtime.test.ts src/providers/mock-realtime.test.ts`
Expected: PASS (incluye los 3 nuevos del provider + 3 del mock).

- [ ] **Step 10: typecheck + commit**

```bash
pnpm --filter @murmur/core typecheck
git add packages/core/src/providers/realtime-model-provider.ts \
        packages/core/src/providers/mock-realtime.ts \
        packages/core/src/providers/mock-realtime.test.ts \
        packages/core/src/providers/openai-realtime.ts \
        packages/core/src/providers/openai-realtime.test.ts
git commit -m "feat(core): interfaz de tools en el realtime + envío (session.update/sendToolResult) y soporte en el mock"
```

---

## Task 2: Provider real — recepción de eventos function-call → `onToolCall`

Implementa el lado **entrante**: parsear `response.output_item.added` (function_call), acumular `function_call_arguments.delta` y emitir `onToolCall` en `.done`.

**Files:**

- Modify: `packages/core/src/providers/openai-realtime.ts`
- Test: `packages/core/src/providers/openai-realtime.test.ts`

- [ ] **Step 1: Escribir tests (fallan)**

Añadir a `packages/core/src/providers/openai-realtime.test.ts`:

```ts
it('emite onToolCall al completar los argumentos de una function_call', async () => {
  const { provider, getWs } = setup();
  const onToolCall = vi.fn();
  const sessionPromise = provider.connect({ ...baseOptions, onToolCall });
  const ws = getWs();
  ws.simulateOpen();
  await sessionPromise;

  ws.emitServerEvent({
    type: 'response.output_item.added',
    item: { type: 'function_call', name: 'current_time', call_id: 'call_1' },
  });
  ws.emitServerEvent({
    type: 'response.function_call_arguments.delta',
    call_id: 'call_1',
    delta: '{"city":',
  });
  ws.emitServerEvent({
    type: 'response.function_call_arguments.done',
    call_id: 'call_1',
    arguments: '{"city":"madrid"}',
  });

  expect(onToolCall).toHaveBeenCalledWith({
    callId: 'call_1',
    name: 'current_time',
    arguments: { city: 'madrid' },
  });
});

it('argumentos no-JSON se entregan como objeto vacío (no lanza)', async () => {
  const { provider, getWs } = setup();
  const onToolCall = vi.fn();
  const sessionPromise = provider.connect({ ...baseOptions, onToolCall });
  const ws = getWs();
  ws.simulateOpen();
  await sessionPromise;

  ws.emitServerEvent({
    type: 'response.output_item.added',
    item: { type: 'function_call', name: 'demo', call_id: 'call_2' },
  });
  ws.emitServerEvent({
    type: 'response.function_call_arguments.done',
    call_id: 'call_2',
    arguments: 'no-es-json',
  });

  expect(onToolCall).toHaveBeenCalledWith({ callId: 'call_2', name: 'demo', arguments: {} });
});

it('un .done sin output_item.added previo se ignora (no emite)', async () => {
  const { provider, getWs } = setup();
  const onToolCall = vi.fn();
  const sessionPromise = provider.connect({ ...baseOptions, onToolCall });
  const ws = getWs();
  ws.simulateOpen();
  await sessionPromise;

  ws.emitServerEvent({
    type: 'response.function_call_arguments.done',
    call_id: 'huérfano',
    arguments: '{}',
  });

  expect(onToolCall).not.toHaveBeenCalled();
});
```

- [ ] **Step 2: Ejecutar (verificar que fallan)**

Run: `pnpm --filter @murmur/core exec vitest run src/providers/openai-realtime.test.ts`
Expected: FAIL (`onToolCall` nunca se invoca).

- [ ] **Step 3: Implementar la recepción**

En `packages/core/src/providers/openai-realtime.ts`:

Añadir un campo privado a la clase `OpenAIRealtimeSession` (junto a los otros campos, p. ej. tras `private closed = false;`):

```ts
  /** Llamadas a tool en curso, indexadas por `call_id` (nombre + args acumulados). */
  private readonly pendingToolCalls = new Map<string, { name: string; args: string }>();
```

En el `switch` de `dispatch`, añadir estos `case` antes de `case 'error':`:

```ts
      case 'response.output_item.added':
        this.handleOutputItemAdded(event);
        break;
      case 'response.function_call_arguments.delta':
        this.handleToolArgsDelta(event);
        break;
      case 'response.function_call_arguments.done':
        this.handleToolArgsDone(event);
        break;
```

Añadir estos métodos privados a la clase (p. ej. tras `handleAudioDelta`):

```ts
  private handleOutputItemAdded(event: ServerEvent): void {
    const item = event.item as { type?: string; name?: string; call_id?: string } | undefined;
    if (item?.type !== 'function_call') return;
    if (typeof item.call_id !== 'string' || typeof item.name !== 'string') return;
    this.pendingToolCalls.set(item.call_id, { name: item.name, args: '' });
  }

  private handleToolArgsDelta(event: ServerEvent): void {
    const callId = event.call_id;
    const delta = event.delta;
    if (typeof callId !== 'string' || typeof delta !== 'string') return;
    const pending = this.pendingToolCalls.get(callId);
    if (pending !== undefined) pending.args += delta;
  }

  private handleToolArgsDone(event: ServerEvent): void {
    const callId = event.call_id;
    if (typeof callId !== 'string') return;
    const pending = this.pendingToolCalls.get(callId);
    if (pending === undefined) return; // .done sin output_item.added previo → se ignora
    this.pendingToolCalls.delete(callId);
    const raw = typeof event.arguments === 'string' ? event.arguments : pending.args;
    this.options.onToolCall?.({ callId, name: pending.name, arguments: parseToolArgs(raw) });
  }
```

Añadir el helper a nivel de módulo (junto a `buildProtocols`):

```ts
function parseToolArgs(raw: string): Record<string, unknown> {
  if (raw.length === 0) return {};
  try {
    const parsed = JSON.parse(raw) as unknown;
    return typeof parsed === 'object' && parsed !== null ? (parsed as Record<string, unknown>) : {};
  } catch {
    return {};
  }
}
```

Nota: `ServerEvent` ya tiene `[key: string]: unknown`, así que `event.call_id`/`event.item`/`event.arguments` son accesibles sin cambiar la interfaz.

- [ ] **Step 4: Ejecutar (verificar que pasan)**

Run: `pnpm --filter @murmur/core exec vitest run src/providers/openai-realtime.test.ts`
Expected: PASS (incluye los 3 nuevos).

- [ ] **Step 5: typecheck + commit**

```bash
pnpm --filter @murmur/core typecheck
git add packages/core/src/providers/openai-realtime.ts packages/core/src/providers/openai-realtime.test.ts
git commit -m "feat(core): el provider realtime emite onToolCall al recibir function-call del modelo"
```

---

## Task 3: Orchestrator — ciclo tool-call → dispatch → sendToolResult

El orchestrator pasa `tools` al `connect` y, al recibir `onToolCall`, despacha vía `dispatchTool` y devuelve el resultado con `sendToolResult`. Un fallo del dispatch se convierte en output de error, sin cambiar a estado `error`.

**Files:**

- Modify: `packages/core/src/orchestrator.ts`
- Test: `packages/core/src/orchestrator.test.ts`

- [ ] **Step 1: Escribir tests (fallan)**

Añadir a `packages/core/src/orchestrator.test.ts` (al final del `describe('ConversationOrchestrator (pipeline)')` o en un `describe` nuevo; usa el helper `build` existente para las tools, pero como `build` no admite `tools`/`dispatchTool`, construye el orchestrator a mano):

```ts
describe('ConversationOrchestrator (function-calling)', () => {
  it('pasa las tools al realtime y despacha una tool-call devolviendo el resultado', async () => {
    const realtime = createMockRealtimeProvider();
    const store = createSqliteStore(':memory:');
    const dispatchTool = vi.fn(async () => 'son las 12');
    const tools = [
      { type: 'function' as const, name: 'current_time', description: 'd', parameters: {} },
    ];
    const orch = new ConversationOrchestrator({
      realtime,
      input: createMockVoiceInput([]),
      output: createMemoryVoiceOutput(),
      conversation: store.conversation,
      connection: { apiKey: 'k', model: 'm' },
      tools,
      dispatchTool,
    });

    await orch.startSession();
    expect(realtime.lastSession?.tools?.map((t) => t.name)).toEqual(['current_time']);

    realtime.emitToolCall({ callId: 'c1', name: 'current_time', arguments: { tz: 'utc' } });
    await vi.waitFor(() =>
      expect(dispatchTool).toHaveBeenCalledWith('current_time', { tz: 'utc' }),
    );
    await vi.waitFor(() =>
      expect(realtime.lastSession?.toolResults).toEqual([{ callId: 'c1', output: 'son las 12' }]),
    );
  });

  it('un dispatchTool que rechaza devuelve un output de error y no cambia a estado error', async () => {
    const realtime = createMockRealtimeProvider();
    const store = createSqliteStore(':memory:');
    const states: AssistantState[] = [];
    const dispatchTool = vi.fn(async () => {
      throw new Error('boom');
    });
    const orch = new ConversationOrchestrator({
      realtime,
      input: createMockVoiceInput([]),
      output: createMemoryVoiceOutput(),
      conversation: store.conversation,
      connection: { apiKey: 'k', model: 'm' },
      tools: [{ type: 'function' as const, name: 'x', description: 'd', parameters: {} }],
      dispatchTool,
      onStateChange: (s) => states.push(s),
    });

    await orch.startSession();
    realtime.emitToolCall({ callId: 'c1', name: 'x', arguments: {} });

    await vi.waitFor(() =>
      expect(realtime.lastSession?.toolResults).toEqual([{ callId: 'c1', output: 'boom' }]),
    );
    expect(states).not.toContain('error');
  });
});
```

- [ ] **Step 2: Ejecutar (verificar que fallan)**

Run: `pnpm --filter @murmur/core exec vitest run src/orchestrator.test.ts`
Expected: FAIL (`tools`/`dispatchTool` no existen en `OrchestratorDeps`; no se llama a `dispatchTool`).

- [ ] **Step 3: Implementar en el orchestrator**

En `packages/core/src/orchestrator.ts`:

Ampliar el import de tipos del provider:

```ts
import type {
  RealtimeModelProvider,
  RealtimeModelSession,
  RealtimeTool,
  RealtimeToolCall,
} from './providers/realtime-model-provider';
```

Añadir a `OrchestratorDeps` (tras `factExtractor?`):

```ts
  /** Tools que el modelo puede invocar; se pasan al realtime al conectar. */
  tools?: RealtimeTool[];
  /** Ejecuta una tool por nombre con los args parseados y devuelve su salida como texto. */
  dispatchTool?: (name: string, args: Record<string, unknown>) => Promise<string>;
```

En `startSession`, dentro del objeto que se pasa a `realtime.connect`, añadir (tras la línea de `voice`, junto a los demás callbacks):

```ts
      ...(this.deps.tools !== undefined ? { tools: this.deps.tools } : {}),
      onToolCall: (call) => this.handleToolCall(call),
```

Añadir estos métodos privados (p. ej. tras `handleError`):

```ts
  /**
   * El modelo pidió ejecutar una tool. Se despacha de forma fire-and-forget: un fallo del
   * `dispatchTool` se convierte en un output de error (que el modelo gestiona), nunca cambia el
   * estado a `error` ni rompe la sesión.
   */
  private handleToolCall(call: RealtimeToolCall): void {
    void this.runToolCall(call);
  }

  private async runToolCall(call: RealtimeToolCall): Promise<void> {
    const dispatchTool = this.deps.dispatchTool;
    const session = this.session;
    if (dispatchTool === undefined || session === undefined) return;
    let output: string;
    try {
      output = await dispatchTool(call.name, call.arguments);
    } catch (err) {
      output = err instanceof Error ? err.message : String(err);
    }
    session.sendToolResult(call.callId, output);
  }
```

- [ ] **Step 4: Ejecutar (verificar que pasan)**

Run: `pnpm --filter @murmur/core exec vitest run src/orchestrator.test.ts`
Expected: PASS (incluye los 2 nuevos; los existentes siguen verdes).

- [ ] **Step 5: typecheck + commit**

```bash
pnpm --filter @murmur/core typecheck
git add packages/core/src/orchestrator.ts packages/core/src/orchestrator.test.ts
git commit -m "feat(core): el orchestrator despacha tool-calls del modelo (dispatchTool) y devuelve el resultado"
```

---

## Task 4: Adaptador de la app — `createDesktopToolHost`

Construye el `PluginRegistry` con los plugins de ejemplo (efectos del webview inyectables) y lo adapta a `{ tools, dispatchTool }`.

**Files:**

- Modify: `apps/desktop/package.json` (añadir dep `@murmur/plugins`)
- Create: `apps/desktop/src/plugins/desktop-plugins.ts`
- Test: `apps/desktop/src/plugins/desktop-plugins.test.ts`

- [ ] **Step 1: Añadir la dependencia y enlazarla**

En `apps/desktop/package.json`, dentro de `"dependencies"`, añadir (orden alfabético, tras `@murmur/design-system`):

```json
    "@murmur/plugins": "workspace:*",
```

Luego enlazar el workspace:

```bash
pnpm install
```

Expected: instala sin errores; `@murmur/plugins` queda enlazado en `apps/desktop`.

- [ ] **Step 2: Escribir los tests del adaptador (fallan)**

Crear `apps/desktop/src/plugins/desktop-plugins.test.ts`:

```ts
import { describe, it, expect, vi } from 'vitest';
import { createDesktopToolHost } from './desktop-plugins';

function host() {
  return createDesktopToolHost({
    clipboard: { writeText: vi.fn(async () => undefined) },
    open: vi.fn(async () => undefined),
    now: () => 0,
  });
}

describe('createDesktopToolHost', () => {
  it('expone tool-defs de los 3 plugins de ejemplo', () => {
    const names = host()
      .tools.map((t) => t.name)
      .sort();
    expect(names).toEqual(['clipboard_write', 'current_time', 'open_app']);
    expect(host().tools.every((t) => t.type === 'function')).toBe(true);
  });

  it('dispatchTool ejecuta el plugin permitido y devuelve su output', async () => {
    const writeText = vi.fn(async () => undefined);
    const h = createDesktopToolHost({ clipboard: { writeText }, open: vi.fn(), now: () => 0 });
    const out = await h.dispatchTool('clipboard_write', { text: 'hola' });
    expect(writeText).toHaveBeenCalledWith('hola');
    expect(out).toContain('hola');
  });

  it('current_time usa el now inyectado', async () => {
    const out = await host().dispatchTool('current_time', {});
    expect(out).toBe(new Date(0).toISOString());
  });

  it('una tool desconocida devuelve el mensaje de error (no lanza)', async () => {
    const out = await host().dispatchTool('no_existe', {});
    expect(out).toMatch(/no está registrado/i);
  });
});
```

- [ ] **Step 3: Ejecutar (verificar que fallan)**

Run: `pnpm --filter @murmur/desktop exec vitest run src/plugins/desktop-plugins.test.ts`
Expected: FAIL (`./desktop-plugins` no existe).

- [ ] **Step 4: Implementar el adaptador**

Crear `apps/desktop/src/plugins/desktop-plugins.ts`:

```ts
import {
  createPluginRegistry,
  clipboardWritePlugin,
  openAppPlugin,
  currentTimePlugin,
  type PluginRegistry,
} from '@murmur/plugins';
import type { RealtimeTool } from '@murmur/core';

/** Host de tools para el orchestrator: definiciones + despachador. */
export interface ToolHost {
  tools: RealtimeTool[];
  dispatchTool: (name: string, args: Record<string, unknown>) => Promise<string>;
}

/** Efectos secundarios que usan los plugins; inyectables para tests. */
export interface DesktopToolDeps {
  clipboard: { writeText(text: string): void | Promise<void> };
  open: (target: string) => void | Promise<void>;
  now: () => number;
}

/** Efectos por defecto disponibles en el webview del desktop. */
function defaultDeps(): DesktopToolDeps {
  return {
    clipboard: {
      writeText: (text) => globalThis.navigator?.clipboard?.writeText(text),
    },
    open: (target) => {
      globalThis.open?.(target, '_blank');
    },
    now: () => Date.now(),
  };
}

/**
 * Construye el registry con los plugins de ejemplo (hora, portapapeles, abrir app/URL), habilita
 * sus capacidades en la allowlist y expone `tools`/`dispatchTool` para el orchestrator. Un fallo de
 * `dispatch` (permiso/args/efecto) se devuelve como texto para que el modelo lo gestione.
 */
export function createDesktopToolHost(deps: DesktopToolDeps = defaultDeps()): ToolHost {
  const registry: PluginRegistry = createPluginRegistry({
    allowed: ['clipboard:write', 'system:open'],
  });
  registry.register(currentTimePlugin({ now: deps.now }));
  registry.register(clipboardWritePlugin({ clipboard: deps.clipboard }));
  registry.register(openAppPlugin({ open: deps.open }));

  return {
    tools: registry.toToolDefinitions(),
    async dispatchTool(name, args) {
      try {
        const result = await registry.dispatch(name, args);
        return result.output ?? result.error ?? '';
      } catch (err) {
        return err instanceof Error ? err.message : String(err);
      }
    },
  };
}
```

- [ ] **Step 5: Ejecutar (verificar que pasan)**

Run: `pnpm --filter @murmur/desktop exec vitest run src/plugins/desktop-plugins.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 6: typecheck + commit**

```bash
pnpm --filter @murmur/desktop typecheck
git add apps/desktop/package.json pnpm-lock.yaml \
        apps/desktop/src/plugins/desktop-plugins.ts apps/desktop/src/plugins/desktop-plugins.test.ts
git commit -m "feat(desktop): createDesktopToolHost adapta el PluginRegistry a tools/dispatchTool"
```

---

## Task 5: `useMurmur` — pasar `tools`/`dispatchTool` al orchestrator

**Files:**

- Modify: `apps/desktop/src/use-murmur.ts`
- Test: `apps/desktop/src/use-murmur.test.tsx`

- [ ] **Step 1: Escribir el test (falla)**

Añadir a `apps/desktop/src/use-murmur.test.tsx`. Primero, ampliar el import de vitest a `import { describe, it, expect, afterEach, vi } from 'vitest';`. Luego añadir el test:

```ts
it('pasa las tools al realtime y despacha una tool-call del modelo', async () => {
  const hotkey = createMemoryHotkeyManager();
  const realtime = createMockRealtimeProvider();
  const config = createMockConfigClient({ apiKey: 'sk-test-key-abcdef' });
  const dispatchTool = vi.fn(async () => 'resultado-tool');
  const tools = [{ type: 'function' as const, name: 'demo', description: 'd', parameters: {} }];
  const { result } = renderHook(() =>
    useMurmur(makeDeps({ hotkey, realtime, config, tools, dispatchTool })),
  );

  await waitFor(() => expect(hotkey.registered().length).toBeGreaterThan(0));
  await act(async () => {
    hotkey.trigger(hotkey.registered()[0]!);
  });
  await waitFor(() => expect(result.current.connection).toBe('connected'));

  expect(realtime.lastSession?.tools?.map((t) => t.name)).toEqual(['demo']);

  await act(async () => {
    realtime.emitToolCall({ callId: 'c1', name: 'demo', arguments: { a: 1 } });
  });

  await waitFor(() => expect(dispatchTool).toHaveBeenCalledWith('demo', { a: 1 }));
  await waitFor(() =>
    expect(realtime.lastSession?.toolResults).toEqual([{ callId: 'c1', output: 'resultado-tool' }]),
  );
});
```

- [ ] **Step 2: Ejecutar (verificar que falla)**

Run: `pnpm --filter @murmur/desktop exec vitest run src/use-murmur.test.tsx`
Expected: FAIL (las tools no llegan al realtime; `MurmurDeps` no admite `tools`/`dispatchTool`).

- [ ] **Step 3: Implementar en `useMurmur`**

En `apps/desktop/src/use-murmur.ts`:

Ampliar el import de `@murmur/core` para incluir el tipo:

```ts
import {
  ConversationOrchestrator,
  type HotkeyManager,
  type RealtimeModelProvider,
  type RealtimeTool,
  type WakeWordDetector,
} from '@murmur/core';
```

Añadir a `MurmurDeps` (tras `wakeWord?`):

```ts
  /** Tools que el modelo puede invocar; se pasan al orchestrator. Opcional. */
  tools?: RealtimeTool[];
  /** Despachador de tools; ejecuta una tool y devuelve su salida como texto. Opcional. */
  dispatchTool?: (name: string, args: Record<string, unknown>) => Promise<string>;
```

En `ensureSession`, cambiar la desestructuración y la construcción del orchestrator:

```ts
const { config, realtime, input, output, tools, dispatchTool } = depsRef.current;
```

y dentro de `new ConversationOrchestrator({ ... })`, añadir (tras la línea de `connection`):

```ts
      ...(tools !== undefined ? { tools } : {}),
      ...(dispatchTool !== undefined ? { dispatchTool } : {}),
```

- [ ] **Step 4: Ejecutar (verificar que pasa)**

Run: `pnpm --filter @murmur/desktop exec vitest run src/use-murmur.test.tsx`
Expected: PASS (incluye el nuevo; los existentes siguen verdes).

- [ ] **Step 5: typecheck + commit**

```bash
pnpm --filter @murmur/desktop typecheck
git add apps/desktop/src/use-murmur.ts apps/desktop/src/use-murmur.test.tsx
git commit -m "feat(desktop): useMurmur pasa tools/dispatchTool al orchestrator"
```

---

## Task 6: `App.tsx` — inyectar el tool host por defecto

**Files:**

- Modify: `apps/desktop/src/App.tsx`
- Test: `apps/desktop/src/App.test.tsx`

- [ ] **Step 1: Escribir el test (falla)**

Añadir a `apps/desktop/src/App.test.tsx` (el import de vitest ya incluye `vi`):

```ts
  it('el modelo puede invocar una tool y recibe el resultado (function-calling end-to-end)', async () => {
    const hotkey = createMemoryHotkeyManager();
    const realtime = createMockRealtimeProvider();
    const config = createMockConfigClient({ apiKey: 'sk-test-key-abcdef' });
    const dispatchTool = vi.fn(async () => 'son las 12');
    const toolHost = {
      tools: [{ type: 'function' as const, name: 'current_time', description: 'h', parameters: {} }],
      dispatchTool,
    };
    render(<App {...baseProps({ hotkey, realtime, config, toolHost })} />);

    await screen.findByRole('status');
    await waitFor(() => expect(hotkey.registered().length).toBeGreaterThan(0));
    await act(async () => {
      hotkey.trigger(hotkey.registered()[0]!);
    });
    await waitFor(() => expect(realtime.lastSession).toBeDefined());

    await act(async () => {
      realtime.emitToolCall({ callId: 'c1', name: 'current_time', arguments: {} });
    });

    await waitFor(() => expect(dispatchTool).toHaveBeenCalledWith('current_time', {}));
    await waitFor(() =>
      expect(realtime.lastSession?.toolResults).toEqual([{ callId: 'c1', output: 'son las 12' }]),
    );
  });
```

- [ ] **Step 2: Ejecutar (verificar que falla)**

Run: `pnpm --filter @murmur/desktop exec vitest run src/App.test.tsx`
Expected: FAIL (`AppProps` no admite `toolHost`; la tool-call no se despacha).

- [ ] **Step 3: Implementar en `App.tsx`**

En `apps/desktop/src/App.tsx`:

Añadir el import:

```ts
import { createDesktopToolHost, type ToolHost } from './plugins/desktop-plugins';
```

Añadir a `AppProps` (tras `requestMic?`):

```ts
  /** Host de tools (plugins) para function-calling. Por defecto los plugins del webview. */
  toolHost?: ToolHost;
```

Añadir `toolHost` a la desestructuración de props de `App({ ... })`:

```ts
export function App({
  config,
  realtime,
  input,
  output,
  hotkey,
  devices,
  requestMic,
  toolHost,
}: AppProps = {}) {
```

Construir el host por defecto una vez (junto a los demás `useRef` de defaults, tras `devicesRef`):

```ts
const toolHostRef = useRef<ToolHost | null>(null);
if (toolHostRef.current === null) toolHostRef.current = toolHost ?? createDesktopToolHost();
```

Pasar `tools`/`dispatchTool` a `useMurmur`:

```ts
const murmur = useMurmur({
  config: configRef.current,
  realtime: realtimeRef.current,
  input: inputRef.current,
  output: outputRef.current,
  hotkey: hotkeyRef.current,
  tools: toolHostRef.current.tools,
  dispatchTool: toolHostRef.current.dispatchTool,
});
```

- [ ] **Step 4: Ejecutar (verificar que pasa)**

Run: `pnpm --filter @murmur/desktop exec vitest run src/App.test.tsx`
Expected: PASS (incluye el nuevo; los existentes siguen verdes).

- [ ] **Step 5: typecheck + commit**

```bash
pnpm --filter @murmur/desktop typecheck
git add apps/desktop/src/App.tsx apps/desktop/src/App.test.tsx
git commit -m "feat(desktop): App inyecta el tool host de plugins (function-calling end-to-end)"
```

---

## Task 7: Puerta de calidad completa + tracker

Verificación integral de que todo el monorepo queda verde y actualización del tracker.

**Files:**

- Modify: `docs/superpowers/PROGRESS.md`

- [ ] **Step 1: Puerta de calidad completa**

```bash
pnpm typecheck && pnpm lint && pnpm test && pnpm build && pnpm exec prettier --check .
```

Expected: todo PASS. (No se toca Rust: `cargo test` no es necesario, pero sigue intacto.)

- [ ] **Step 2: Si prettier marca formato, corregirlo**

```bash
pnpm exec prettier --write .
```

Luego re-ejecutar `pnpm exec prettier --check .` → PASS.

- [ ] **Step 3: Anotar en el tracker**

Añadir al final de `docs/superpowers/PROGRESS.md` una entrada que documente: function-calling end-to-end implementado (provider real entrante/saliente, orchestrator, mock, adaptador `createDesktopToolHost`, wiring en `useMurmur`/`App`), arquitectura desacoplada (`tools`/`dispatchTool`), número de tests final, y que la puerta de calidad quedó verde.

- [ ] **Step 4: Commit final**

```bash
git add docs/superpowers/PROGRESS.md
git commit -m "docs: function-calling realtime → plugins completo; tracker actualizado"
```

---

## Self-Review (cobertura del spec)

- Spec §3 (protocolo): Task 1 (tools en `session.update`, `sendToolResult`) + Task 2 (`output_item.added`/`function_call_arguments.{delta,done}` → `onToolCall`). ✓
- Spec §4 interfaz realtime: Task 1 Step 1. ✓
- Spec §4 provider real: Task 1 (saliente) + Task 2 (entrante). ✓
- Spec §4 orchestrator: Task 3. ✓
- Spec §4 doble ciclo de respuesta: cubierto por la lógica existente (`completeResponse` ignora buffer vacío); no requiere cambios — verificado implícitamente por los tests del orchestrator que no rompen. ✓
- Spec §4 mock realtime: Task 1 (Steps 2–5). ✓
- Spec §4 app/wiring: Task 4 (adaptador) + Task 5 (`useMurmur`) + Task 6 (`App`). ✓
- Spec §4 seguridad (sandbox): preservado — `createDesktopToolHost` usa `allowed` y el `dispatch` del registry; tool desconocida/denegada → texto de error (Task 4 test). ✓
- Spec §6 criterios de aceptación 1–7: Task 7 (puerta completa) + tests de Tasks 1–6. ✓
- Spec §6 compat F0/F5/F9: tests existentes intactos (Tasks 1–3 sólo añaden; sin tools, comportamiento idéntico — test "sin tools, session.update no incluye tools"). ✓
- Spec §8 plan de pruebas: openai-realtime (Tasks 1–2), orchestrator (Task 3), mock-realtime (Task 1), use-murmur (Task 5), desktop-plugins (Task 4). ✓

Sin placeholders. Tipos consistentes: `RealtimeTool`/`RealtimeToolCall`/`ToolHost`/`dispatchTool(name, args)` usados con la misma firma en todas las tareas.
