# PR: Decouple spawn rules from player progression and add unit tests

## Summary

This PR extracts enemy spawn logic into a dedicated module (`src/game/logic/spawnRules.ts`) and integrates it into `PlayScene`. It also adds comprehensive unit tests for spawn rules and player progression to improve confidence and maintainability.

## Changes

- Logic
  - Move `getSpawnInterval` and spawn-related helpers to `src/game/logic/spawnRules.ts`.
  - Remove duplicate `getSpawnInterval` from `playerProgression.ts`.
  - Use `pickEnemyId` and `resolveBatchCount` in `PlayScene.spawnWave` for selection and batching.
  - Expose and reuse typed RNG helpers: `RandomFloatFn`, `RandomIntFn`; annotate usage in `PlayScene`.
  - Publish lightweight `window.__MAGICZOMBIE_DEBUG__` snapshot inside `PlayScene.update` for E2E assertions (player position, HUD text, score, etc.).
  - Add `vite.config.ts` with configurable `base` (driven by `VITE_BASE_PATH`) so GitHub Pages serves assets under `/MagicZombie/`.
  - 新增玩家存档系统：`src/ui/profileGate.ts` 收集玩家 ID，`profileManager` + Firestore/localStorage 绑定玩家进度，可跨设备同步，并提供“切换玩家”按钮与 `?resetProfile=1` 强制重置入口。

- Tests
  - Add `tests/unit/spawnRules.test.ts` covering:
    - Interval interpolation and clamping
    - Unlock filtering (<= stage.id allowed; > stage.id excluded)
    - Exclude `rewardRabbit` when already present
    - Weighted selection boundary behavior
    - Fallback when total weight <= 0
    - Batch count clamping and rabbit singleton rule
  - Expand `tests/unit/playerProgression.test.ts`:
    - Precise multi-level up math (+360 EXP to level 4)
    - Negative EXP clamping at 0
    - `applyDamage` non-mutation and HP lower bound
  - Add Playwright smoke test (`tests/e2e/smoke.spec.ts`) to ensure the game boots without console errors, renders the main canvas, updates HUD text, and responds to movement input.
  - Add GitHub Actions deploy workflow (`.github/workflows/deploy.yml`) to build with `VITE_BASE_PATH=/MagicZombie/` and publish `dist` to GitHub Pages.
  - 新增 `tests/unit/profileStorage.test.ts` 覆盖玩家 ID 规范化逻辑，并更新 E2E 测试通过 `/?profileId=e2e-smoke` 自动登录。

## Rationale

Separating spawn logic clarifies responsibilities: player progression focuses on XP/HP/level, while spawn rules handle pacing and selection. This makes future balancing and feature work (e.g., stage-specific rules, events) easier.

## Risks / Behavior Changes

- Rabbit (`rewardRabbit`) singleton rule is enforced by spawn rules; confirm this matches design intent.
- Batch count for standard enemies now randomizes within [min, max] after clamping.

## Validation

- Build: `npm run build` passes.
- Tests: `npm test` passes (2 suites, 30 tests).
- E2E smoke: `npm run test:e2e` passes (1 Playwright test).
- CI: GitHub Actions workflow (`.github/workflows/ci.yml`) runs unit and Playwright tests on push/PR.
- Deploy: Workflow `.github/workflows/deploy.yml` builds and uploads GitHub Pages artifact (run on push to `master`).
- Player profile: 通过输入玩家 ID 建档，若配置 Firebase，可跨设备访问同一进度；未配置时回退到本地存档。

## Manual Acceptance Checklist

- Gameplay startup
  - Launch dev or preview (`npm run dev` or `vite preview`), load the game without console errors.
  - Player spawns centered, HUD renders with score/time.
- Spawn pacing
  - At score 0, spawn interval equals stage `baseSpawnInterval`.
  - As score increases toward `targetScore`, interval decreases linearly toward `minSpawnInterval`.
- Weighted selection
  - Common enemies appear more frequently than rarer ones (sanity check over ~2–3 minutes).
- Rabbit singleton rule
  - When a `rewardRabbit` is present, no additional rabbits spawn concurrently.
  - After rabbit despawns/removed, it can spawn again.
- Batch counts
  - For standard enemies, simultaneous spawns respect each entry’s `[minBatch, maxBatch]` range.
  - Misconfigured ranges (e.g., `minBatch > maxBatch`) behave safely by clamping at runtime.
- Regressions
  - Movement, collision, hit/damage, XP gain and level-up remain functional.
  - No unexpected spikes in enemy count (respects global limit), no soft locks.

## Checklist

- [x] Remove duplicated spawn interval logic
- [x] Integrate spawn rules in `PlayScene`
- [x] Add and pass unit tests
- [x] Type-safe RNG function usage in `PlayScene`
- [x] Add Playwright smoke test and document workflow
- [x] Expose debug snapshot + enhance Playwright assertions
- [x] Add CI workflow running unit + E2E tests
- [x] Configure Vite base + GitHub Pages deploy workflow
- [x] Implement cloud/local profile storage with login gate
