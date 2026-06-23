# murmur — Fase 4 (Audio real) — Plan de implementación

> REQUIRED SUB-SKILL: superpowers:subagent-driven-development / test-driven-development.
> TDD: test primero (falla) → implementación (pasa). Commit por Task con el trailer
> `Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>`.

**Goal:** Captura/reproducción de audio reales detrás de `@murmur/audio`: utilidades PCM16 24k,
puente push-pull `AudioStream`, providers mock, y providers Web (getUserMedia/AudioContext) en la
app, con niveles reales para el `Waveform`. Repo en verde.

**Spec:** `docs/superpowers/specs/2026-06-23-phase-4-audio.md`.

**Convenciones:** TS strict ESM; errores con `AudioError` de `@murmur/shared`; APIs Web guardadas
y mockeables; sin cpal nativo (documentar).

---

## Task 1: Utilidades PCM puras (`@murmur/audio`)

**Files:** `packages/audio/src/pcm.ts` (+ `pcm.test.ts`).

- [ ] Tests (fallan): `float32ToPcm16`/`pcm16ToFloat32` round-trip con tolerancia (clamp [-1,1]);
  `resampleLinear` (down 48k→24k mitad de muestras aprox, conserva extremos); `rms` de onda
  conocida; `pcm16ToBase64`/`base64ToPcm16` round-trip; `chunkBytes(buf, n)` y `concatChunks`.
- [ ] Implementar `pcm.ts` (usar `DataView`/`Int16Array`/`Float32Array`; base64 con `Buffer` en
  Node y fallback `btoa`/`atob` — usa una implementación que funcione en Node y navegador, p. ej.
  manual sobre `Uint8Array`).
- [ ] `pnpm --filter @murmur/audio test` verde. Commit: `feat(audio): utilidades PCM16 24k`.

## Task 2: Puente push-pull `AudioStream` (`@murmur/audio`)

**Files:** `packages/audio/src/stream.ts` (+ `stream.test.ts`), export en `index.ts`.

```ts
export interface PushPullStream extends AudioStream {
  push(chunk: Uint8Array): void;
  end(): void;
  fail(err: Error): void;
}
export function createPushPullStream(): PushPullStream;
```
- [ ] Tests (fallan): push antes de read entrega en orden; read espera si la cola está vacía y se
  resuelve al hacer push; `end()` termina el `for await`; `fail(e)` hace que la iteración lance `e`;
  `stop()` corta. 
- [ ] Implementar con una cola + promesas (patrón productor/consumidor). 
- [ ] `pnpm --filter @murmur/audio test` verde. Commit: `feat(audio): AudioStream push-pull`.

## Task 3: Providers mock (`@murmur/audio`)

**Files:** `packages/audio/src/mock.ts` (+ `mock.test.ts`), `providers.ts`/`index.ts` (exports).

- [ ] `createMockVoiceInput(chunks: Uint8Array[]): VoiceInputProvider` (su `start()` devuelve un
  `AudioStream` que emite los chunks y termina). `createMemoryVoiceOutput()` (su `play()` consume el
  async iterable y acumula en `chunks()`; `stop()` marca parada). `createMockAudioDeviceManager(devices)`.
- [ ] Tests (fallan→pasan): input emite en orden y termina; output acumula todo lo reproducido;
  device manager devuelve la lista dada.
- [ ] Commit: `feat(audio): providers mock (input/output/device manager)`.

## Task 4: Providers Web + hook de nivel (`apps/desktop`)

**Files:** `apps/desktop/src/audio/web-audio.ts`, `apps/desktop/src/audio/use-audio-level.ts`
(+ tests `web-audio.test.ts`, `use-audio-level.test.ts`), wiring en `App.tsx`.

- [ ] `WebAudioDeviceManager.list()`: `navigator.mediaDevices.enumerateDevices()` → filtra
  `kind audioinput/audiooutput` → `AudioDevice[]`. Sin `navigator.mediaDevices` → `[]`.
- [ ] `WebVoiceInputProvider.start(deviceId?)`: `getUserMedia({ audio: { deviceId?, channelCount:1,
  echoCancellation:true, noiseSuppression:true } })`; crea `AudioContext`, nodo de captura
  (ScriptProcessor o AudioWorklet; ScriptProcessor es más fácil de mockear), en cada bloque
  convierte Float32→PCM16, resamplea a 24k y `push` al `createPushPullStream`. `stop()` para tracks
  y cierra el contexto. Error de permiso → `AudioError`.
- [ ] `WebVoiceOutputProvider`: `AudioContext`, `play(chunks)` decodifica PCM16→Float32 y agenda
  buffers en cola (tiempos contiguos). `stop()` corta.
- [ ] `useAudioLevel(input, active)`: cuando `active`, arranca el input, lee chunks, calcula `rms` →
  estado 0..1; al parar, libera. Testeado con `createMockVoiceInput`.
- [ ] Tests jsdom: `vi.stubGlobal('navigator', { mediaDevices: { enumerateDevices, getUserMedia } })`
  y mock de `AudioContext`/`ScriptProcessorNode`. Verifica mapeo de dispositivos, constraints de
  `getUserMedia`, que `start()` produce un `AudioStream`, teardown en `stop()`, y `AudioError` si
  `getUserMedia` rechaza.
- [ ] Wiring ligero en `App.tsx`: panel dev lista dispositivos (inyectable, default `WebAudioDeviceManager`);
  el `Waveform` puede recibir un nivel (de `useAudioLevel`) cuando se inyecta un input. No romper tests previos.
- [ ] `pnpm --filter @murmur/desktop typecheck && build && test` verde. Commit: `feat(desktop): providers Web Audio y nivel real del Waveform`.

## Task 5: Verificación de fase

- [ ] `pnpm install && pnpm typecheck && pnpm lint && pnpm test && pnpm build` verde.
- [ ] `cd packages/native && cargo test` verde. `pnpm exec prettier --check .` limpio.
- [ ] Criterios de aceptación del spec §4.

---

## Self-Review (mapeo spec → tasks)

- §2 PCM utils → Task 1. Push-pull stream → Task 2. Mocks → Task 3.
- §2 providers Web + nivel + wiring → Task 4. §4 criterios → Task 5. cpal documentado como futuro.
