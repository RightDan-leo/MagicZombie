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
- GitHub Pages deployment builds with `VITE_BASE_PATH=/MagicZombie/` via `.github/workflows/deploy.yml`.

## Deployment

- Public URL: `https://rightdan-leo.github.io/MagicZombie/`
- Deploy pipeline: push to `master` (or trigger manually) to run `.github/workflows/deploy.yml` which builds and publishes `dist` to GitHub Pages.
- Manual build for Pages:
  ```bash
  VITE_BASE_PATH=/MagicZombie/ npm run build
  ```
- Local preview of hosted path: `npm run preview -- --host 0.0.0.0 --port 4173` then open `http://localhost:4173/MagicZombie/`.
