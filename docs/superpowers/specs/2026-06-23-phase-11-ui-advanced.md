# murmur — Spec: Fase 11 (UI avanzada)

- **Fecha:** 2026-06-23
- **Producto:** `murmur` · app `apps/desktop`
- **Estado:** Aprobado, pendiente de implementación
- **Depende de:** F2 (cápsula), F3 (hotkey), F4 (audio Web), F5 (realtime), F9 (orchestrator), F10 (prompt)

---

## 1. Resumen

Completar la experiencia de escritorio: **onboarding** (API key, permiso de micrófono, hotkey),
**ajustes** (micrófono, voz, modelo, hotkey, tema, estado de conexión), **estados de error/vacío**, y
**visualización de transcripción**. Se cablea por fin el `ConversationOrchestrator` en la app (con
audio Web + realtime, todo inyectable) de modo que la cápsula refleje el estado real y el hotkey
dispare la captura. Todo testeable en jsdom con mocks (sin red ni hardware). Se aplican además los
fixes de robustez del orchestrator anotados en F9.

## 2. Decisiones confirmadas

| Tema | Decisión |
| ---- | -------- |
| Config desde el webview | `ConfigClient` (interfaz): `get()` → vista de config (incluye `hasApiKey`/key redactada, hotkey, model, voice, theme), `setOpenAiKey`, `setHotkey`, `setVoice`, `setModel`, `setTheme`. `createMockConfigClient(initial?)` (en memoria) para tests/dev; `createTauriConfigClient()` invoca comandos Rust y **degrada** fuera de Tauri. La key nunca se devuelve completa al render. |
| Comandos Tauri | `get_config`/`set_config`/`set_openai_key` en `src-tauri` (Rust) + capacidad; build nativa fuera del pipeline (documentado). El `ConfigClient` real los invoca; los tests usan el mock. |
| Onboarding | Pasos: bienvenida → API key (guardada vía `ConfigClient`, nunca en el repo) → permiso de micrófono (`getUserMedia`, manejo de denegado) → elección de hotkey (validada con `parseAccelerator` de F3) → listo. Accesible (foco, teclado, `aria`), completable sin documentación. |
| Ajustes | Formulario: micrófono (lista vía `WebAudioDeviceManager`), voz, modelo, hotkey (validado), tema (`data-theme`), estado de conexión. Persiste vía `ConfigClient`. |
| Estados de error/vacío | Componente dirigido por enum: `no-api-key`, `no-mic`, `no-network`, `mic-denied`. Cada uno con mensaje claro y **acción de recuperación**. |
| Transcripción | Componente que muestra líneas usuario/asistente (de `orchestrator.onTranscript`), con `aria-live`, alternable. |
| Cableado | `useMurmur` (controlador): construye/inyecta el `ConversationOrchestrator` con `WebVoiceInput/Output` (F4), `createOpenAIRealtimeProvider` (F5), `ConfigClient`, `HotkeyManager` (F3); la cápsula refleja `onStateChange`; el hotkey dispara `startListening`/`stopListening`. Todo inyectable (mocks en tests). Si no hay API key → muestra onboarding; si la hay → cápsula + acceso a ajustes. |
| Robustez orchestrator (de F9) | `interrupt()` limpia `assistantBuffer` (no persistir respuesta cancelada); encadenar/await la promesa de `playback` en multi-turno; documentar el contrato fire-and-forget de `startListening`. Con tests. |

## 3. Entregables

- `apps/desktop/src/config/config-client.ts` (`ConfigClient`, mock, Tauri) + tests.
- `apps/desktop/src/components/Onboarding.tsx`, `Settings.tsx`, `ErrorState.tsx`, `Transcript.tsx` (+ tests RTL).
- `apps/desktop/src/use-murmur.ts` (controlador) + test (con orchestrator/realtime/audio/config/hotkey mockeados).
- `apps/desktop/src/App.tsx` actualizado (shell: onboarding vs cápsula+ajustes), estilos.
- `apps/desktop/src-tauri`: comandos Rust de config + capacidad (documentado, no se compila aquí).
- `@murmur/core/src/orchestrator.ts`: fixes de robustez (interrupt buffer, playback, doc) + tests.

## 4. Criterios de aceptación

1. `pnpm install && pnpm typecheck && pnpm lint && pnpm test && pnpm build` en verde (incl. `vite build`). `cargo test` intacto.
2. `ConfigClient` mock: `setOpenAiKey` → `get().hasApiKey===true` y la key NO se expone completa; setters persisten.
3. Onboarding (RTL): avanza por los pasos; guarda la API key vía `ConfigClient`; valida el hotkey; maneja permiso de micrófono denegado con mensaje.
4. Ajustes (RTL): lista micrófonos (mock device manager), cambia voz/modelo/tema/hotkey y persiste; hotkey inválido se rechaza.
5. Estados de error (RTL): cada enum renderiza su mensaje y acción de recuperación; contraste/foco accesibles.
6. App shell (RTL): sin API key → onboarding; con API key (mock config) → cápsula; el hotkey inyectado dispara la captura y la cápsula refleja el estado del orchestrator (vía deps mockeadas).
7. Transcripción (RTL): muestra líneas usuario/asistente; `aria-live`.
8. Orchestrator: `interrupt()` descarta el buffer del asistente (test); contrato de `startListening` documentado.
9. TS strict sin `any` injustificado; ESLint y Prettier limpios; accesibilidad real (no solo cosmética).

## 5. Fuera de alcance

Privacidad/retención/borrado selectivo (F12), Whisper (F13), wake word (F14), plugins (F15),
empaquetado/instaladores (F16). La build nativa de Tauri no se ejecuta aquí (solo config coherente).
