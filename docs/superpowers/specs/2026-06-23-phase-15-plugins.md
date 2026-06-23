# murmur — Spec: Fase 15 (Plugins / skills)

- **Fecha:** 2026-06-23
- **Producto:** `murmur`
- **Estado:** Aprobado, pendiente de implementación
- **Depende de:** F0 (errores `@murmur/shared`), F5 (function-calling del realtime), F9 (orchestrator)

---

## 1. Resumen

Dar a murmur la capacidad de **ejecutar acciones** ("skills") mediante un sistema de **plugins**
extensible: una interfaz `Plugin`, un **registry** con **sandbox** de capacidades (allowlist), la
conversión a **definiciones de herramienta** para el function-calling del modelo, y plugins de
ejemplo (portapapeles, abrir app/URL, hora). Todos los efectos secundarios se inyectan, de modo que
todo es testeable sin tocar el sistema real. Se entrega como paquete nuevo `@murmur/plugins`.

## 2. Decisiones confirmadas

| Tema | Decisión |
| ---- | -------- |
| Paquete | Nuevo `packages/plugins` (`@murmur/plugins`), TS strict ESM, tsup + Vitest, dep `@murmur/shared`. |
| Plugin | `Plugin { name: string; description: string; parameters: JsonSchema; capabilities: string[]; run(args, ctx): Promise<PluginResult> }`. `PluginResult { ok: boolean; output?: string; error?: string }`. `JsonSchema` = objeto JSON-schema mínimo para los parámetros. |
| Error | `PluginError` (code `PLUGIN_ERROR`) en `@murmur/shared`, subclase de `MurmurError`. |
| Registry | `createPluginRegistry({ allowed: string[] })`: `register(plugin)`, `list()`, `get(name)`, `dispatch(name, args)` (valida que `plugin.capabilities ⊆ allowed`, si no → `PluginError` permiso denegado; valida args mínimamente contra el schema), `toToolDefinitions()` → `[{ type:'function', name, description, parameters }]` (formato del realtime de F5). |
| Sandbox | Cada plugin declara `capabilities` (p. ej. `['clipboard:write']`, `['system:open']`, `[]`). El registry permite registrar todo pero **deniega la ejecución** de un plugin cuyas capacidades no estén en `allowed`. La allowlist se decide en el host (config/usuario). |
| Plugins de ejemplo | `clipboardWritePlugin({ clipboard })` (`clipboard.writeText` inyectable), `openAppPlugin({ open })` (`open(url)` inyectable), `currentTimePlugin({ now })` (puro). Cada uno con su schema y capabilities. Side effects 100% inyectados (mock en tests). |
| Integración | `toToolDefinitions()` produce el esquema que el orchestrator puede pasar al realtime; el manejo de los eventos `function_call` del modelo → `registry.dispatch` se documenta como punto de integración (cableado fino opcional en esta fase). |
| CLI | `murmur plugins list` lista los plugins integrados (nombre + descripción + capacidades), construidos con deps nulas/seguras. |

## 3. Entregables

- `packages/plugins` (`@murmur/plugins`): `plugin.ts`, `registry.ts`, `plugins/{clipboard,open-app,time}.ts`,
  `index.ts`, `package.json`/`tsconfig.json`/`tsup.config.ts`. Tests.
- `@murmur/shared`: `PluginError` (+ export + test).
- `@murmur/cli`: `plugins list` (+ test).

## 4. Criterios de aceptación

1. `pnpm install && pnpm typecheck && pnpm lint && pnpm test && pnpm build` en verde. `cargo test` intacto.
2. El nuevo paquete entra en el pipeline (`pnpm -r` lo incluye) y compila.
3. `PluginError`: code `PLUGIN_ERROR`, `instanceof MurmurError`.
4. Registry: `register`/`list`/`get`; `dispatch` ejecuta el plugin permitido y devuelve su `PluginResult`;
   plugin con capacidad **no** permitida → `PluginError`; args inválidos → error claro; `toToolDefinitions`
   produce el formato `{ type:'function', name, description, parameters }`.
5. Plugins de ejemplo: clipboard usa el `clipboard.writeText` inyectado; open-app usa `open` inyectado;
   time devuelve la hora del `now` inyectado. Verificados con mocks (sin efectos reales).
6. CLI: `murmur plugins list` muestra los plugins integrados.
7. TS strict sin `any` injustificado; ESLint y Prettier limpios.

## 5. Fuera de alcance

Cableado completo de los eventos `function_call` del realtime en el orchestrator (se deja
`toToolDefinitions` + `dispatch` listos y documentados), descubrimiento/carga dinámica de plugins de
terceros desde disco (futuro), marketplace de plugins, permisos por-conversación en la UI (F-futura).
