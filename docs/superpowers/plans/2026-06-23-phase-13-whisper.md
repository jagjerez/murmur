# murmur — Fase 13 (Whisper) — Plan de implementación

> REQUIRED SUB-SKILL: superpowers:subagent-driven-development / test-driven-development.
> TDD: test primero (falla) → implementación (pasa). Commit por Task con el trailer
> `Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>`.

**Goal:** `TranscriptionProvider` whisper-api + local-whisper + mock + selector, seleccionable por
config, como alternativa al realtime. Repo en verde, tests sin red.

**Spec:** `docs/superpowers/specs/2026-06-23-phase-13-whisper.md`.

**Convenciones:** TS strict ESM; `ModelError` de `@murmur/shared`; sin red en tests (HTTP/ejecutor
mockeados); sin deps nuevas (`globalThis.fetch`/`FormData`/`Blob`). NO toques `PROGRESS.md`.

---

## Task 1: Providers de transcripción (`@murmur/core/src/providers/whisper.ts`)

**Files:** `packages/core/src/providers/whisper.ts` (+ `whisper.test.ts`), export en `index.ts`.

- [ ] `createOpenAIWhisperProvider({ apiKey, model?, fetchFn?, format? })` (mode `'whisper-api'`):
  POST `/v1/audio/transcriptions`, `Authorization: Bearer`, `FormData` con `file` (Blob) + `model`
  (default `whisper-1`); parsea `{ text }`; error → `ModelError`; key no logueada.
- [ ] `createLocalWhisperProvider({ run })` (mode `'local-whisper'`): delega en `run(audio)`; sin `run` → error.
- [ ] `createMockTranscriptionProvider(text, mode?)`. `selectTranscriptionProvider(mode, deps)`.
- [ ] Tests (fallan→pasan): OpenAI con `fetchFn` mock (verifica URL/headers/FormData/parseo; error→`ModelError`;
  key no logueada); local con `run` mock; mock provider; selector elige correctamente; `'realtime'` documentado.
- [ ] Export en `index.ts`. Commit: `feat(core): TranscriptionProvider whisper-api/local/mock + selector`.

## Task 2: Config de transcripción (`@murmur/cli`)

**Files:** `packages/cli/src/config.ts`, `packages/cli/src/cli.ts` (+ tests).

- [ ] `MurmurConfig.transcription: TranscriptionMode` (default `'realtime'`), normalizada/validada en
  `ConfigStore`; `config set-transcription <mode>` (valida enum); `config`/`status` la muestran.
- [ ] Tests (fallan→pasan): default `'realtime'`; `set-transcription whisper-api` persiste; valor
  inválido → error/exitCode≠0; `config` lo refleja.
- [ ] Commit: `feat(cli): config de modo de transcripción`.

## Task 3: Verificación de fase

- [ ] `pnpm install && pnpm typecheck && pnpm lint && pnpm test && pnpm build` verde.
- [ ] `cd packages/native && cargo test` verde. `pnpm exec prettier --check .` limpio.
- [ ] `git grep -nE "sk-[A-Za-z0-9]{6,}"` solo ficticias. Criterios del spec §4.

---

## Self-Review (mapeo spec → tasks)

- §2 providers/selector → Task 1. config → Task 2. §4 → Task 3. Documentar enchufe del whisper local.
