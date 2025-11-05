## MagicZombie 开发规格（Spec）

### 1. 项目概要
- **类型**：俯视角生存射击 / Roguelite 元素的波次战斗游戏  
- **引擎**：Phaser 3.90 + Vite + TypeScript  
- **目标平台**：桌面浏览器（WebGL + Web Audio）  
- **基础分辨率**：960×540，自动缩放居中显示  
- **现状概览**：玩家可操控角色移动、自动攻击；敌人按关卡波次生成，具备基础 AI；已有三种武器（闪电链、火焰喷射、水炮）；HUD 提示分数、生命、敌人数量与武器信息；关卡、敌人、武器数据已表格化。

### 2. 术语约定
| 术语 | 定义 |
| --- | --- |
| **Scene / 场景** | Phaser 中的逻辑单元；当前使用 `BootScene` 负责资源与纹理创建，`PlayScene` 负责主玩法。场景 key 必须保持一致。 |
| **Stage / 关卡** | `StageDefinition`，包含目标分数、刷怪节奏、敌人表。按序依次推进。 |
| **Wave / 波次** | 关卡中的一次刷怪事件；受 `stage.baseSpawnInterval`、`stage.minSpawnInterval` 控制。 |
| **Enemy** | 敌方单位，引用 `EnemyDefinition`，包括生命值、移动速度、AI 行为、分数与经验奖励。 |
| **Weapon** | 玩家装备，定义于 `WeaponDefinition`，含基础伤害、攻速、射程及附加参数（链数、穿透、弹速等）。 |
| **Projectile / 投射物** | 水炮等武器产生的实体，具备速度、穿透次数、元素类型、生命周期。 |
| **Player State / 玩家状态** | 包含 HP、速度、等级、经验、当前武器等。死亡或升级时会更新。 |
| **HUD** | 屏幕显示层，包括关卡信息、玩家属性、敌人数量、当前武器信息。 |
| **Overlay** | 玩家死亡 / 关卡完成时显示的覆盖提示层。 |
| **Rabbit / 奖励兔子** | 特殊敌人，击杀后应掉落奖励（占位需求）。 |
| **Weapon Switch Keys** | 键盘 `1/2/3` 对应闪电链、火焰喷射、水炮。 |
| **TimerEvent** | Phaser 计时器，用于攻击节奏与波次刷新，需调用 `remove(false)` 停止。 |

### 3. 游戏体验目标
- **节奏**：持续移动与规避，10~30 秒刷新一波怪，关卡目标分数逐步提升。  
- **武器体验**：三种武器差异明显；闪电链适合多目标、火焰喷射近战群伤、水炮远程高伤穿透并减速。  
- **反馈**：被击中、击杀、武器命中要有视觉/音效反馈；升级与通关需要显著提示。  
- **难度曲线**：随着关卡提升，敌人血量、数量、种类逐步增加；目标时长 3~5 分钟可达关卡终点。  
- **操作性**：WASD / 方向键移动；武器自动攻击；提供重开（R）、下一关（N）快捷键。

### 4. 系统设计细节

#### 4.1 玩家系统
- **状态**：`maxHp`、`hp`、`speed`、`level`、`exp`、`nextExp`、`alive`。  
- **升级公式**：`nextExp = 80 + (level - 1) * 40`；升级时 `maxHp+5`、`hp+5`。  
- **无敌时间**：受 `PLAYER_INVULNERABLE_TIME`（600ms）控制。  
- **击中反馈**：角色被击中时变色并短暂击退，击退速度 140。  
- **重开与下一关**：`R` 重置当前关卡，`N` 进入下一关（仅当通关时可触发）。

#### 4.2 武器系统
- **数据驱动**：`WeaponDefinitions` 记录武器关键参数。  
- **切换机制**：数字键切换；切换后调用 `setupAttackTimer()` 重置攻击速度。  
- **武器类型**：  
  - `lightningChain`：自动寻找最近敌人链式贯穿，链数 `chainTargets=3`。  
  - `flamethrower`：对前方扇形范围内最多 6 个敌人造成瞬时伤害，绘制火焰扇形。  
  - `waterCannon`：发射穿透投射物，附带减速 (`slowExpire = now + 900ms`)；投射物具有 `penetration`、`projectileSpeed`、`expire`。  
- **攻击节奏**：`TimerEvent` 以 `attacksPerSecond` 控制；若玩家死亡或关卡结束需移除计时器。  
- **待扩展**：武器升级、解锁、冷却 UI、DOT 效果等。

#### 4.3 投射物系统
- **Group**：`this.projectiles = this.physics.add.group({ runChildUpdate: false })`。  
- **数据字段**：`damage`、`penetration`、`element`、`expire`、`recentHits(Set<EnemySprite>)`。  
- **生命周期**：`updateProjectiles()` 每帧检查过期/越界并销毁。  
- **碰撞处理**：`onProjectileHitsEnemy` 处理伤害、减速、穿透计数。重复命中通过 `recentHits` 去重。  

#### 4.4 敌人与 AI
- **组管理**：`this.enemies = this.physics.add.group({ runChildUpdate: false })`。  
- **AI 行为**：`aiBehavior` 支持 `chaser`、`tank`、`pouncer`、`boss`、`evader` 及扩展。  
- **减速效果**：若敌人 `slowExpire > now`，移动速度乘以 0.65。  
- **特殊逻辑**：  
  - `pouncer`：距离 >220 追踪，近距离冲刺并设置冷却 1400ms。  
  - `evader`：保持距离 260~360；兔子存在时调整理想距离。  
  - `boss`：当前仅实现“接近”阶段，后续可扩展多阶段。  

#### 4.5 关卡与刷怪
- **定义**：`StageDefinitions`，包含 `id`、`targetScore`、`recommendedDuration`、`baseSpawnInterval`、`minSpawnInterval`、`spawnTable`。  
- **Spawn Timer**：通过 `scheduleNextSpawn(useBaseDelay)` 控制，调用 `spawnWave()` 后递归调度下一次，避免直接修改 `TimerEvent.delay`。  
- **波次限制**：`ENEMY_LIMIT = 60`，超过则跳过本轮刷怪。  
- **兔子生成**：关卡刷怪表中 `rewardRabbit` 权重低，场上已有兔子时不再生成。  
- **通关条件**：`score >= stage.targetScore`；暂停攻击与刷怪，显示下一关提示。  

#### 4.6 HUD 与 UI
- **文本显示**：左上角 HUD 显示关卡、分数、生命、等级、经验、时间、敌人数、当前武器。  
- **Overlay**：死亡或通关时显示遮罩与提示，调用 `showOverlayMessage(title, subtitle)`。  
- **Banner**：关卡开始时显示标题 `关卡 <id>：<name>`，持续 2.2 秒。  
- **待办**：血条、经验条可视化、武器冷却指示、拾取提示。  

#### 4.7 帧更新流程
```
update(time, delta):
  if player alive:
    handlePlayerMovement()
    updateEnemiesAI(delta)
    updateProjectiles(delta)
    elapsedTime += delta / 1000
    updateHud()
```

### 5. 资源与构建
- **纹理**：当前使用 `BootScene` 生成圆形/矩形简易贴图；可扩展自定义图像或 spritesheet。  
- **样式**：`src/style.css` 控制全局背景、字体。  
- **构建脚本**：`npm run dev`（开发热更新）、`npm run build`（生产构建）。  
- **注意**：在 Windows PowerShell 需确保 Node.js/npm 在 PATH 中；缺失会导致命令无法执行。

### 6. 测试与调试
- **手动回归**：  
  - 验证三个武器切换、攻击表现与 HUD 显示。  
  - 检查死亡后重开、通关后进入下一关是否正常。  
  - 水炮投射物减速是否有效，穿透计数是否准确。  
- **浏览器调试**：关注控制台输出、防止未捕获异常；确保 `Phaser.Scene` key 正确注册。  
- **未来计划**：引入自动化测试（数值测试、AI 行为单测）、UI 快照等。

### 7. 后续迭代路线（参考）
1. **战斗多样性**：Boss 多阶段、精英敌人、战斗事件。  
2. **武器升级树**：每次升级可选择升级武器属性或解锁新技能。  
3. **奖励系统**：兔子掉落经验球、临时 Buff、武器碎片；添加拾取动画。  
4. **UI/音效强化**：音效、粒子效果、屏幕震动。  
5. **性能优化**：大量敌人时的性能检测、批量绘制优化。  
6. **CI/CD**：GitHub Actions 进行 lint/build；引入 Prettier、ESLint 规则。

### 8. 版本与工作流规范
- **分支策略**：建议 `master/main` 用于稳定版本，特性开发使用 `feature/*` 分支。  
- **提交信息**：约定使用中文，格式可参考 `类型: 简述`（如 `fix: 修复场景未注册问题`、`feat: 新增火焰喷射特效`）。  
- **PR 审查**：每个功能提交 PR，包含说明、截图/录像、测试项，完成后合入主分支。

---

此 Spec 将作为后续开发的基准文档；若新增系统或变更需求，请同步更新此文档，保持团队协作一致。

