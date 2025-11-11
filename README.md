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

## Player Profiles & Cloud Save

- 每位玩家在进入游戏前需输入一个 2~32 字的玩家 ID（支持中文名称）。系统会根据该 ID 绑定角色等级、最高得分与已解锁关卡。
- 默认存档会保存在浏览器 `localStorage`。若要跨设备共享，请在 `.env` 中配置 Firebase：
  ```bash
  VITE_FIREBASE_API_KEY=your-api-key
  VITE_FIREBASE_AUTH_DOMAIN=your-project.firebaseapp.com
  VITE_FIREBASE_PROJECT_ID=your-project-id
  ```
  然后重新 `npm run build` 或 `npm run dev`。
- 可选：设置 `VITE_DEFAULT_PROFILE_ID=dev-player` 方便本地调试；Playwright 通过访问 `/?profileId=e2e-smoke` 自动跳过输入。
- 若要重新输入或切换玩家，可使用页面右上角的“切换玩家”按钮，或在地址栏添加 `?resetProfile=1` 重新加载登记界面。
- 玩家登录后立即弹出武器选择界面，可从闪电链/火焰喷射/水枪三种武器中挑选开局武器；可随时在游戏中按 1/2/3 切换，当前选择会同步到个人存档。

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
