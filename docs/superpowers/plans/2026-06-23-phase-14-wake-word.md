# murmur — Fase 14 (Wake word) — Plan de implementación

> REQUIRED SUB-SKILL: superpowers:subagent-driven-development / test-driven-development.
> TDD: test primero (falla) → implementación (pasa). Commit por Task con el trailer
> `Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>`.

**Goal:** Activación por wake word: lógica nativa testeable (Rust), interfaz `WakeWordDetector` + mock
(TS), toggle en config, cableado a la activación. Repo en verde.

**Spec:** `docs/superpowers/specs/2026-06-23-phase-14-wake-word.md`.

**Convenciones:** TS strict ESM; `cargo test` para lo nativo; mocks en TS; sin hardware en tests.
NO toques `docs/superpowers/PROGRESS.md`.

---

## Task 1: Lógica nativa `wakeword` (`packages/native/src/wakeword.rs`)

**Files:** `packages/native/src/wakeword.rs`, `packages/native/src/lib.rs` (`mod wakeword;`).

- [ ] `RingBuffer` (push/len/iter, capacidad fija), `frame_energy(&[i16]) -> f32`,
      `normalize_phrase(&str) -> String` (lowercase/trim/colapso de espacios), `WakeWordGate { sensitivity }`
      con `evaluate(score: f32, energy: f32) -> bool` (dispara si `score >= sensitivity` y energía > umbral).
- [ ] `#[cfg(test)] mod tests`: ring buffer (wrap-around), energía (señal conocida), normalización,
      gate (umbral/sensibilidad/energía baja no dispara).
- [ ] `cd packages/native && cargo test` verde. Commit: `feat(native): lógica de wake word (ring buffer, energía, gate)`.

## Task 2: `WakeWordDetector` (`@murmur/core/src/wake-word.ts`)

**Files:** `packages/core/src/wake-word.ts` (+ test), export en `index.ts`.

- [ ] `WakeWordDetector` (interfaz), `createMockWakeWordDetector()` (`start(onDetected)`,
      `triggerDetection()`, `stop()`, `enabled`), `createNullWakeWordDetector()` (no-op).
- [ ] Tests (fallan→pasan): mock `start`+`triggerDetection`→llama `onDetected`; `stop` lo desactiva
      (trigger ya no llama); null no hace nada.
- [ ] Commit: `feat(core): WakeWordDetector + mock + null`.

## Task 3: Config de wake word (`@murmur/cli`)

**Files:** `packages/cli/src/config.ts`, `packages/cli/src/cli.ts` (+ tests).

- [ ] `MurmurConfig.wakeWord` (defaults del spec) normalizada/validada; `config set-wakeword <campo> <valor>`
      (`enabled` bool, `phrase` string no vacía, `sensitivity` 0..1); `config`/`status` lo muestran.
- [ ] Tests (fallan→pasan): defaults; `set-wakeword enabled true` y phrase/sensitivity persisten y validan;
      valor inválido → error; `config` lo refleja.
- [ ] Commit: `feat(cli): config de wake word`.

## Task 4: Cableado en `useMurmur` (`apps/desktop`)

**Files:** `apps/desktop/src/use-murmur.ts` (+ test).

- [ ] `useMurmur` acepta `wakeWord?: WakeWordDetector`; si `config.wakeWord.enabled`, `start(onDetected)`
      con `onDetected` = disparar la captura (igual que el hotkey); limpieza con `stop`.
- [ ] Test (renderHook/RTL): con detector mock y `enabled`, `triggerDetection()` → captura (`listening`);
      deshabilitado → no arranca. Tests previos verdes.
- [ ] Commit: `feat(desktop): activación por wake word en useMurmur`.

## Task 5: Verificación de fase

- [ ] `pnpm install && pnpm typecheck && pnpm lint && pnpm test && pnpm build` verde.
- [ ] `cd packages/native && cargo test` verde. `pnpm exec prettier --check .` limpio.
- [ ] Criterios de aceptación del spec §4.

---

## Self-Review (mapeo spec → tasks)

- §2 native → Task 1. detector TS → Task 2. config → Task 3. cableado → Task 4. §4 → Task 5.
