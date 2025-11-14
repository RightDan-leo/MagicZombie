# MagicZombie

A Phaser-based game project. This repository includes gameplay logic, spawn rules, and a growing set of unit tests.

## Development

- Dev server: `npm run dev`
- Build: `npm run build`
- Preview build: `npx vite preview --port 4173`
- Telemetry server (dev): `npm run server:dev`
- Telemetry server (build): `npm run server:build` then `npm run server:start`
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
- 武器经验：击杀敌人会根据武器贡献累积经验，HUD 右侧会显示三种武器的等级与经验条；每次升级会触发武器增强三选一界面。
- 武器增强：针对当前使用的武器随机提供 3 个增益（如射程、穿透、DOT 等），可叠加多次；若不满意可选择“放弃本次机会”保留到下次升级。
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

## Telemetry & Admin Dashboard

鏁版嵁鍙戝竷鍛婄鐞嗗彲閫夋嫨鍦╨locally 鍚姩鏂板鐨勬暟鎹鐞嗙鐞嗕富鍙告湇鍔★紝鍙鐞嗘槑渚е汉鍙互鐧诲綍锛岀綉渚х數鑴戞父鎴忓彲鍚姩鏁版嵁鎶ュ憡銆?

### Setup

1. 灏嗘牴鎹敤閫傜殑瀵瑰簲閲嶇粍 `.env.example` 涓坊鍔犳柊鐜鍙傛暟锛氳繘鍏?`.env` 鍚庨厤缃?`SERVER_PORT`锛?`SESSION_SECRET`锛?`ADMIN_USERNAME`锛?`ADMIN_PASSWORD`锛岃娲诲姩鐨?`TELEMETRY_INGEST_TOKEN` 浠ュ強瀹炵幇瀛樻。鐨?`VITE_TELEMETRY_API_URL` / `VITE_TELEMETRY_TOKEN`銆傝鏃惰兘閲嶅惎閫変腑鐩瀛樻。鐨?`TELEMETRY_DB_PATH`銆?
2. 鍚姩鏈嶅姟鍣ㄦ墽琛岋細`npm run server:dev`锛岄渶瑕佹墽琛岄噸鎴愬垎鍓茬殑鏈嶅姟鍣ㄧ洰浼欑锛岀敤 `npm run server:build && npm run server:start`銆?
3. 閫氳繃 `http://localhost:5050/admin` 鐧诲綍锛岀户缁強鍔ㄥ崟鐨勬暟鎹細鍦ㄦ瘡寮€鑷磋⒓绾﹂噺鍏叅鏇存柊銆?

### Data capture

- 鐜╁ ID / 鍗囧悕 / 浠峰€?鎬敮鎸佹墜鏈虹偣鍑讹紝鍚屾椂璁板綍褰撳墠閫夋嫨鐨勬鍣ㄩ€夋嫨銆?
- 鍗囩骇杩涘害锛氭瘮渚嬪叏姝︿釜妯″潡鐨勯噾搴︺€佹瘮杈冨畬鎴愯兘鑳藉強绗﹀悎鍑哄彴鍒嗙被鍖栥€備綅鏈虹殑鎺ユ敹銆?
- 鏃堕棿鍜岃皟楠岄檮浣撱€佹瘮鍗冪洿鎺ュ懡鍚嶇殑鑷虫в寤虹珯锛屾敮鎸佹悳绱㈢洿鏂版寔鐢ㄤ細鍙嶄綔鐮达紙鍚屼箟 Progress Log锛?
- 鍗囩骇涓棬鐨勬爣璇嗕綔鐢ㄦ暟鎹富鐞嗙鐞嗭紝钂欐槸鍙樻崲鍚庤兘澶熻捣鐢熺墿鍡嗗姏鐨勬暟鎹笌鍔ㄦ€佹爣鍑嗙洰缂??銆?

### Dashboard

- **Player overview**: 鎺掑簭鏃堕挓鏃ユ湡鍜宲ast seen锛岃鎸佷縺娆＄敤瀵规鑰屾敮鎸佷腑鏂囩偣鍑讹紝鎰忓緱鍒濆淇℃伅銆?
- **Runs table**: 鏍规嵁鎴樺眬鏈€鏂板姞鍏ヨ€佺牬鐪嬩笌鎯呭喌鎺掑簭锛岃嚜鍔ㄨ浆鍙戙€?
- **Detail card**: 鑾峰緱鐢熸椿淇℃伅锛孖P/Level/Exp銆佷笁绉嶆鍣ㄧ殑绛夌骇鍗犵敤閫夋嫨锛屽悓鏃惰鐩樼敵璇蜂簡鎵€鏈夋満鍣ㄥ埌鐜╁競鍦ㄧ殑鏁版嵁銆?
- **Security**: 鎵€鏈夎闂€夋嫨閮芥槸 session 鐧诲綍淇濇寔锛岀數鑴戞父鎴忓彲鐢辨渶鍚庝竴娆℃湇鍔″伐鍏昏€呴獙璇侊紝鍖呭惈鍚屾椂璁块棶鐨勫姛鑳藉吋瀹圭┖闂村寘鍚瓙鐨勮姹傦紝鑰屽簲鍖栥€?

鏁版嵁鏈簤鍦↗ata/telemetry.db 鎴栫殑涓€瀹氳缃殑璺緞涓瓨鍌ㄣ€傚彲涓嬪亣鎻愬崌锛屼负鍚屼簯鍧囪埗鏁版嵁鍙戞槑鎴愪綋鏁欒偛鎸囩ず锛岃€屽叾浠栧姙鍖洪噴鏀惧疄鐜板伐浣溿€?
