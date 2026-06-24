# murmur — Spec: Function-calling realtime → plugins (wiring fino)

- **Fecha:** 2026-06-24
- **Producto:** `murmur`
- **Estado:** Aprobado, pendiente de implementación
- **Depende de:** F5 (OpenAI Realtime provider), F9 (orchestrator), F15 (`@murmur/plugins`: registry + `toToolDefinitions()` + `dispatch()`)
- **Contexto:** Pendiente documentado tras las 16 fases. El registry de plugins ya produce tool-defs y ejecuta acciones, pero **el realtime provider no soporta function-calling**. Esta spec lo construye de punta a punta y lo cablea en la app.

---

## 1. Resumen

Dar al asistente la capacidad de **ejecutar acciones durante la conversación de voz**: el modelo
decide llamar a una _tool_, murmur la ejecuta vía el `PluginRegistry` y le devuelve el resultado para
que continúe hablando. Se implementa el protocolo de function-calling de la OpenAI Realtime API en el
provider, se extiende la interfaz `RealtimeModelSession`/`RealtimeConnectOptions`, el orchestrator
orquesta el ciclo tool-call → dispatch → tool-result, el mock realtime gana soporte para tests, y la
app de escritorio registra los plugins de ejemplo con efectos reales del webview. Todo testeable sin
red ni hardware.

## 2. Decisión de arquitectura (desacoplado)

El realtime provider y el orchestrator **no conocen** `@murmur/plugins`. Se inyectan dos cosas
genéricas en el orchestrator: `tools?: RealtimeTool[]` y `dispatchTool?: (name, args) => Promise<string>`.
La app (que ya importa core _y_ plugins) construye el registry y pasa `registry.toToolDefinitions()` como
`tools` y un adaptador `(name, args) => registry.dispatch(name, args).then(r => r.output ?? r.error ?? '')`
como `dispatchTool`. Así `@murmur/core` no gana dependencia de `@murmur/plugins` y la capa realtime solo
sabe que "el modelo puede llamar tools con nombre". Alternativas descartadas: acoplar core→plugins (más
acoplamiento, el realtime se vuelve plugin-aware) o una interfaz `ToolHost` (ceremonia extra sin ganancia
sobre el bag de deps planas que ya usa el orchestrator).

## 3. Protocolo de function-calling (OpenAI Realtime)

| Paso               | Mensaje / evento                                                                                                                                    |
| ------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------- |
| Declarar tools     | `session.update` con `session.tools = RealtimeTool[]` y `session.tool_choice = 'auto'` (junto al resto de la config ya existente).                  |
| Inicio de llamada  | Evento `response.output_item.added` con `item.type === 'function_call'`: se captura `item.name` y `item.call_id` (indexado por `call_id`).          |
| Argumentos         | `response.function_call_arguments.delta` (acumular por `call_id`) y `response.function_call_arguments.done` (`arguments` final como JSON string).   |
| Emitir al host     | En `.done`: parsear `arguments` (JSON; si falla → `{}`), emitir `onToolCall({ callId, name, arguments })`.                                          |
| Devolver resultado | `sendToolResult(callId, output)` → `conversation.item.create` con `{ type:'function_call_output', call_id, output }`, seguido de `response.create`. |

Notas de robustez: `name` se toma de `output_item.added` (fiable); `.done` puede no traerlo en todas las
versiones, pero sí trae `call_id`/`arguments`. Si llega `.done` sin un `name` previo conocido, se ignora la
llamada de forma segura (no se emite `onToolCall`). El parseo de `arguments` nunca lanza.

## 4. Decisiones confirmadas

| Tema                  | Decisión                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| --------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Interfaz realtime     | `RealtimeConnectOptions` gana `tools?: RealtimeTool[]` y `onToolCall?: (call: RealtimeToolCall) => void`. `RealtimeModelSession` gana `sendToolResult(callId: string, output: string): void`. Tipos `RealtimeTool { type:'function'; name; description; parameters: unknown }` y `RealtimeToolCall { callId; name; arguments: Record<string, unknown> }` viven en `realtime-model-provider.ts`. `parameters: unknown` mantiene core desacoplado de `JsonSchema` de plugins (solo se serializa). |
| Provider real         | `openai-realtime.ts`: incluye `tools`/`tool_choice:'auto'` en `session.update` si `options.tools?.length`; maneja `response.output_item.added`/`function_call_arguments.{delta,done}`; implementa `sendToolResult`. Estado: durante la llamada permanece en `thinking` (no audio aún); tras `sendToolResult`+`response.create` llega la respuesta final hablada.                                                                                                                                |
| Orchestrator          | `OrchestratorDeps` gana `tools?: RealtimeTool[]` y `dispatchTool?: (name: string, args: Record<string, unknown>) => Promise<string>`. En `startSession` pasa `tools` al `connect` y un `onToolCall` interno que: `dispatchTool(name, args)` → `session.sendToolResult(callId, output)`. Errores de `dispatchTool` se capturan y se devuelven como `output` (texto de error), nunca rompen la sesión ni cambian a estado `error`.                                                                |
| Doble ciclo respuesta | La respuesta que contiene solo la function-call no produce transcript del asistente → `completeResponse` ya la ignora (`text.length > 0`). La respuesta final tras el tool-result sí persiste. Sin cambios extra de persistencia.                                                                                                                                                                                                                                                               |
| Mock realtime         | `mock-realtime.ts`: la sesión captura `tools` (de connect) y los `sendToolResult` (lista `toolResults`); helper `emitToolCall({ callId, name, arguments })` que invoca `onToolCall`.                                                                                                                                                                                                                                                                                                            |
| App / wiring          | `MurmurDeps` (use-murmur) gana `tools?`/`dispatchTool?` opcionales, pasadas al orchestrator. `App.tsx` construye un `PluginRegistry` con los 3 plugins de ejemplo y los inyecta: hora (puro), portapapeles (`navigator.clipboard.writeText`), abrir app/URL (opener del webview: `window.open`/Tauri si está; si no, `PluginResult` con `error`). Allowlist por defecto habilita las capacidades de esos 3 plugins.                                                                             |
| Seguridad             | El sandbox de capacidades del registry sigue gobernando: un plugin cuya capacidad no esté en la allowlist devuelve error vía `dispatch` (que se convierte en `output` de la tool). La API key nunca se loguea ni viaja en tool-defs.                                                                                                                                                                                                                                                            |

## 5. Entregables

- `@murmur/core`:
  - `providers/realtime-model-provider.ts`: tipos `RealtimeTool`/`RealtimeToolCall`, campos nuevos en
    `RealtimeConnectOptions`, método `sendToolResult` en `RealtimeModelSession`.
  - `providers/openai-realtime.ts`: protocolo de function-calling + `sendToolResult` (+ tests).
  - `providers/mock-realtime.ts`: captura de `tools`/`toolResults` + `emitToolCall` (+ tests).
  - `orchestrator.ts`: deps `tools`/`dispatchTool`, wiring del ciclo tool-call (+ tests).
  - `index.ts`: re-exportar los tipos nuevos.
- `apps/desktop`:
  - `use-murmur.ts`: deps `tools`/`dispatchTool` → orchestrator (+ tests).
  - `App.tsx`: registry de plugins de ejemplo con efectos del webview + inyección.
  - Un módulo pequeño (p. ej. `src/plugins/desktop-plugins.ts`) que construye el registry y el adaptador
    `dispatchTool`, con los side-effects del webview inyectados (+ tests del adaptador).

## 6. Criterios de aceptación

1. `pnpm install && pnpm typecheck && pnpm lint && pnpm test && pnpm build` en verde; `cargo test` intacto.
2. **Provider real:** con `tools` no vacío, el `session.update` incluye `tools` y `tool_choice:'auto'`; una
   secuencia `output_item.added`(function_call)+`function_call_arguments.done` emite `onToolCall` con
   `name`, `callId` y `arguments` parseados; `sendToolResult` envía `conversation.item.create`
   (`function_call_output` con `call_id`+`output`) seguido de `response.create`. Sin `tools`, el
   `session.update` no incluye `tools` (compat F5 intacta).
3. **Orchestrator:** inyectando `tools`+`dispatchTool` y emitiendo una tool-call por el mock, se invoca
   `dispatchTool(name, args)` y luego `session.sendToolResult(callId, <output>)`. Un `dispatchTool` que
   rechaza devuelve un `output` de error y **no** cambia el estado a `error`. La respuesta final hablada se
   persiste; la respuesta de solo-función no genera mensaje del asistente.
4. **Mock:** `emitToolCall` dispara `onToolCall`; `sendToolResult` queda registrado para asserts.
5. **App:** `use-murmur` pasa `tools`/`dispatchTool` al orchestrator; con un mock realtime que emite una
   tool-call, el adaptador del registry ejecuta el plugin (con side-effect inyectado mockeado) y se llama a
   `sendToolResult`. El adaptador convierte `PluginResult` → string (`output ?? error ?? ''`).
6. Compat: `new ConversationOrchestrator()` y las sesiones sin `tools` siguen funcionando igual (F0/F5/F9).
7. TS strict sin `any` injustificado; ESLint y Prettier limpios. Sin secretos en el repo.

## 7. Fuera de alcance (documentado)

- Acciones nativas ricas más allá de las APIs del webview (requieren comandos Tauri/permisos del SO).
- Streaming de múltiples tool-calls en paralelo en una misma respuesta (se soporta una llamada por ciclo;
  varias secuenciales funcionan). Documentar como mejora futura si el modelo las encadena.
- Wake word real, builds nativas de Tauri y publicación en npm (pendientes #1/#2/#3b, bloqueados por
  deps de sistema/credenciales/modelos externos).

## 8. Plan de pruebas (TDD)

- `openai-realtime.test.ts`: tools en `session.update`; ausencia de tools; `output_item.added`+`done` →
  `onToolCall`; `sendToolResult` → mensajes correctos; `.done` sin name previo → no emite.
- `orchestrator.test.ts`: tool-call → `dispatchTool` → `sendToolResult`; error de `dispatchTool` →
  output de error, sin estado `error`; persistencia del turno final.
- `mock-realtime.test.ts`: `emitToolCall`/captura de `tools`/`toolResults`.
- `use-murmur.test.tsx`: inyección de `tools`/`dispatchTool` y dispatch end-to-end con mock realtime.
- `desktop-plugins.test.ts`: el adaptador construye tool-defs y mapea `PluginResult` → string; side-effects
  mockeados.
