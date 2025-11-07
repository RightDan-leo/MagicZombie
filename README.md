# MagicZombie

A Phaser-based game project. This repository includes gameplay logic, spawn rules, and a growing set of unit tests.

## Development

- Dev server: `npm run dev`
- Build: `npm run build`
- Preview build: `npx vite preview --port 4173`
- Static server (auto-builds if needed): `npm run serve` 或 `npm start`
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
- Deploy pipeline: push to a `release/*` branch (or trigger manually) to run `.github/workflows/deploy.yml` which builds and publishes `dist` to GitHub Pages while keeping `master` untouched.
- Manual build for Pages:
  ```bash
  VITE_BASE_PATH=/MagicZombie/ npm run build
  ```
- Local preview of hosted path: `npm run preview -- --host 0.0.0.0 --port 4173` then open `http://localhost:4173/MagicZombie/`.
- Prepare a release branch for GitHub Pages (keeping changes off `master`):
  1. 创建分支并切换：`git checkout -b release/<feature-name>`
  2. 推送到远端供 Actions 构建发布：`git push origin release/<feature-name>`
  3. 后续如果需要更新，同样在该分支提交并推送，GitHub Pages 会自动部署最新构建。

- Self-host the production build for others:
  1. 需要自定义 `VITE_BASE_PATH` 时可以预先构建，也可以在下一步直接设置环境变量：
     ```bash
     VITE_BASE_PATH=/ npm run build
     ```
     > 如果希望一步完成构建和托管，可跳过此步，在启动命令前添加同样的环境变量。
  2. Start the static server on a shareable host/port（如未预先构建会自动运行 `npm run build`）:
     ```bash
     VITE_BASE_PATH=/ HOST=0.0.0.0 PORT=4173 BASE_PATH=/ npm run serve
     ```
     - 若更习惯使用 `npm start`，也可以在命令末尾替换为 `npm start`，效果相同。
     - 可选：通过 `DIST_DIR=/custom/dist` 指向不同的构建目录。
  3. Share `http://<your LAN or public IP>:4173/` with other players（将 `http://<你的局域网或公网 IP>:4173/` 分享给其他玩家）；如果部署在子目录下，请保持 `BASE_PATH` 与构建时的 `VITE_BASE_PATH` 完全一致。
  4. The server automatically adds long-term caching headers for fingerprinted assets and answers repeat requests with `304 Not Modified`，远程玩家将能更快加载页面。
  5. 玩家首次访问时会看到用户名登录面板：
     - 用户名仅支持字母、数字或下划线，长度不少于 3 个字符，服务器会确保唯一性。
     - 注册成功后会自动登录并记住用户名，后续访问会直接恢复保存的游戏进度。
     - 如果部署在纯静态环境（例如 GitHub Pages）且未连到上述服务，界面会显示“仅保存在当前设备”的提示，此时账号与存档会写入访客浏览器的 `localStorage`，不经过服务器也能体验单机持久化。
  6. 服务器会把玩家账号与进度保存到 `data/users.json`（可通过 `DATA_DIR` 环境变量调整存储目录）。备份/迁移该文件即可在不同机器之间共享账号。
