# MagicZombie

A Phaser-based game project. This repository includes gameplay logic, spawn rules, and a growing set of unit tests.

## Development

- Dev server: `npm run dev`
- Build: `npm run build`
- Preview build: `npx vite preview --port 4173`
- Unit tests: `npm test`
- Coverage: `npm run test:coverage`
- E2E smoke tests:
  1. Install browsers once: `npx playwright install --with-deps chromium`
  2. Run: `npm run test:e2e`

## Continuous Integration

- GitHub Actions workflow `.github/workflows/ci.yml` runs unit tests and Playwright smoke tests on every push/PR.

## Manual Acceptance Checklist (Completed)

- [x] Gameplay startup: preview loads without console errors; player spawns centered; HUD renders.
- [x] Spawn pacing: at score 0 interval equals `baseSpawnInterval`; increases toward `targetScore` linearly reduces to `minSpawnInterval`.
- [x] Weighted selection: common enemies appear more frequently than rarer ones.
- [x] Rabbit singleton rule: only one `rewardRabbit` concurrently; can respawn after despawn/removal.
- [x] Batch counts: simultaneous spawns respect each entry’s `[minBatch, maxBatch]`; misconfigured ranges are clamped safely.
- [x] Regressions: movement, collision, damage, XP gain, and level-up remain functional; enemy cap enforced; no soft locks.

## Notes

- Enemy spawn rules are decoupled into `src/game/logic/spawnRules.ts` and integrated into `PlayScene`.
- Unit tests cover player progression and spawn rule edge cases.
