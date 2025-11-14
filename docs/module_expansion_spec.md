# MagicZombie 可扩展功能 Spec

> 本文档用于约束武器、武器增强、关卡、敌人以及玩家成长五大模块的扩展方式。任何涉及这几个模块的需求在实现前必须先核对对应的 spec，并在 PR 描述中引用相关小节（例如 “依据 module_expansion_spec.md §1.4 扩展武器”）。

## 使用方式
- **需求立项**：编写需求或任务时，先在本 spec 中确认字段、约束与流程是否已覆盖；若无覆盖，先扩展 spec，再落地代码。
- **评审基线**：Code Review 时以本 spec 作为 “Definition of Ready/Done”。评审者需逐条确认扩展流程与校验清单已执行。
- **版本同步**：若实现需要修改已有约束（例如新增字段或放宽数值边界），必须先在 spec 中更新对应条目并说明兼容策略。

## 通用设计原则
- **数据驱动**：所有基础配置（武器、增强、关卡、敌人）均存放于 `src/game/data` 下的常量映射，运行期逻辑只读取定义，不直接写死数值。
- **ID 稳定性**：`id` 字段一经加入需保持向后兼容，且与翻译、存档、UI 选择器共用；新增项请使用 `kebabCase` 或 `camelCase`（与现有保持一致）。
- **单位约定**：时间使用毫秒，距离/速度使用 Phaser 世界单位（像素/秒），概率使用 0~1 浮点或百分比字符串需在描述中声明。
- **依赖顺序**：模块间依赖关系为「玩家成长 → 武器 → 武器增强 → 敌人 → 关卡」。扩展下游模块前需确认上游已支持所需字段及取值范围。
- **验证要求**：除单元测试外，所有影响战斗节奏的修改需提供最小可复现步骤（例如特定武器、关卡、波次）以便手动验收。

---

## 1. 武器模块（Weapon Module）

### 1.1 范围与目标
- 负责定义武器基础数据、运行期切换、攻击频率计算与经验成长。
- 代码位置：`src/game/data/weapons.ts`、`src/game/logic/weaponProgression.ts`、`src/game/scenes/PlayScene.ts`（武器切换与攻击定时逻辑）。

### 1.2 数据模型
| 字段 | 类型 | 说明/约束 |
| --- | --- | --- |
| `id` | `WeaponId` | 全局唯一，需同步更新 `src/game/data/types.ts` 以及 `WEAPON_ORDER`（PlayScene）。 |
| `label` | `string` | HUD/UI 显示名称，保持与 UI 文案一致。 |
| `baseDamage` | `number` | 单次命中初始伤害，不含成长与增强。 |
| `attacksPerSecond` | `number` | 基础攻速。`PlayScene#getAttackRateForWeapon` 可根据增强或特性调整。 |
| `range` | `number` | 取决于武器类型：近战/直线发射/链式搜索半径。 |
| `projectileSpeed` | `number?` | 投射物武器必填，单位 px/s。 |
| `chainTargets` | `number?` | 链式武器最大跳跃数。 |
| `penetration` | `number?` | 可穿透的目标数量。 |
| `notes` | `string?` | 设计意图或调试提示。 |

### 1.3 运行期行为
- **初始化**：`createInitialWeaponProgress` 根据 `WEAPON_ORDER` 构建 `WeaponProgressMap`，每把武器起始等级 1。
- **切换**：PlayScene 监听 `1/2/3` 键或 Profile 默认值（`profileManager`），切换后调用 `setupAttackTimer()` 依据 `attacksPerSecond` 重新注册 `TimerEvent`。
- **经验与升级**：击杀敌人后调用 `addWeaponExperience`，命中 `EXP_THRESHOLDS` 时触发 `enqueueWeaponEnhancements` 进入增强流程。
- **UI 展示**：HUD 通过 `getWeaponProgressSummary` 显示当前武器等级/经验。

### 1.4 扩展流程
1. **定义 ID**：在 `src/game/data/types.ts` 的 `WeaponId` 联合类型中加入新 ID。
2. **添加配置**：在 `WeaponDefinitions` 内填写完整字段，并补充 `notes` 说明特殊交互。
3. **排序与默认值**：将新武器加入 `WEAPON_ORDER`，必要时更新 `profileManager` 默认选择与 UI 显示顺序。
4. **实现攻击逻辑**：在 `PlayScene#performWeaponAttack` 中新增 case，复用现有 Helper（生成投射物、链式搜索等）或新增私有方法。
5. **成长与平衡**：如需自定义经验曲线，在 `weaponProgression.ts` 中添加特例或新的系数；若沿用默认规则，说明其预期定位。
6. **联动增强**：准备对应的增强条目（详见 §2），并确定升级触发阈值是否需要自定义。

### 1.5 校验清单
- `npm run typecheck`（或 `npm run build`）通过，确保新 ID 已在类型系统注册。
- 手动测试：进入战斗，切换到新武器，验证攻速、范围、成长提示。
- 如引入新资源，确认 `public/` 或加载管线中已有引用，避免 Phaser 报错。

### 1.6 未来扩展 Hook
- 可在 `WeaponDefinition` 中追加 `element`, `statusEffects`, `cooldownOverride` 等字段；添加前需更新本节表格与 `WeaponDefinitions` 消耗点。
- 若需要多段攻击或蓄力，可在 spec 中定义新的攻击状态机并在 PlayScene 中实现。
- **测试同步开关**：将环境变量 `VITE_ENABLE_WEAPON_LEVEL_SYNC` 设为 `true` 时，可在测试环境中启用“任一武器升级即同步其余武器等级”的调试功能；默认值为 `false`，以避免影响主干平衡。

---

## 2. 武器增强模块（Weapon Enhancement Module）

### 2.1 范围与目标
- 管理武器专属的随机增强池、堆叠上限以及 UI 选择流程。
- 代码位置：`src/game/data/weaponEnhancements.ts`、`src/ui/weaponEnhanceGate.ts`、`PlayScene` 中的增强队列逻辑。

### 2.2 数据模型
| 字段 | 类型 | 说明/约束 |
| --- | --- | --- |
| `id` | `WeaponEnhancementId` | 需加入类型联合，命名推荐 `weapon_effect` 前缀以便分组。 |
| `weaponId` | `WeaponId` | 表示归属武器，UI 用于渲染标题。 |
| `name` | `string` | 选项标题。 |
| `description` | `string` | 简述实际效果，若涉及数值建议带百分比。 |
| `maxStacks` | `number` | 最大叠层数，UI 会在达到上限后禁用按钮。 |

### 2.3 运行期行为
- `WeaponEnhancementPools` 将定义按武器划分，PlayScene 在武器升级时调用 `pickEnhancementChoices` 随机抽取 3 项；已满层的选项会标记 `disabled`。
- UI 通过 `presentWeaponEnhancements` 阻塞游戏流程，玩家可按键或点击选择；也可跳过（返回 `null`）。
- `incrementEnhancement` 在栈数变化后立即更新 `weaponEnhancements` 映射，并调用 `syncEquippedWeaponEnhancements`（若存在）刷新当前武器表现。

### 2.4 扩展流程
1. 新增 `WeaponEnhancementId` 联合类型常量。
2. 在对应武器的 `WeaponEnhancementPools` 数组中追加定义。
3. 在 `PlayScene` 中实现效果：通常通过调整 `getAttackRateForWeapon`、特定武器的攻击逻辑或状态修饰符（例如修改火焰投射数量）。
4. 若增强适用于多武器，考虑抽象公共字段或在 spec 中新增 “泛用增强池” 方案，再在代码中实现联动。

### 2.5 校验清单
- 确认 UI 显示文字/描述与效果一致。
- 验证 `maxStacks` 达成后按钮置灰，且不会再进入抽选集合。
- 若增强改变数值曲线，补充平衡说明（推荐给出最小/最大堆叠后的关键指标）。

---

## 3. 关卡模块（Stage & Wave Module）

### 3.1 范围与目标
- 负责整体节奏控制：关卡元数据、目标分数、波次生成以及刷怪间隔。
- 代码位置：`src/game/data/stages.ts`、`src/game/logic/spawnRules.ts`。

### 3.2 数据模型
| 字段 | 类型 | 说明/约束 |
| --- | --- | --- |
| `id` | `number` | 关卡顺序，需连续或在 UI 层保证排序。 |
| `name` | `string` | UI 展示名称。 |
| `backgroundKey` | `string` | Phaser 贴图 key，新增关卡需先在加载表中注册。 |
| `targetScore` | `number` | 用于 `getSpawnInterval` 计算难度递进，同时也是胜利条件。 |
| `recommendedDuration` | `number` | 设计时长（秒），用于 UX 提示。 |
| `baseSpawnInterval` | `number` | 起始刷怪间隔（ms）。 |
| `minSpawnInterval` | `number` | 进程末期最小间隔（ms）。 |
| `spawnTable` | `StageSpawnRule[]` | 关卡内可用敌人配重。 |

`StageSpawnRule` 字段：`enemyId`, `weight`, `minBatch`, `maxBatch`。权重仅限正数；若需临时禁用，可保持条目并将 `weight` 设为 0 以保留排序。

### 3.3 运行期行为
- `getSpawnInterval` 按当前得分与 `targetScore` 的比例线性插值，确保后期压力增大。
- `getAvailableSpawnEntries` 会过滤未解锁的敌人与重复的奖励兔子。
- `resolveBatchCount` 根据规则决定一次刷出数量，对奖励类敌人做唯一性限制。

### 3.4 扩展流程
1. 在 `StageDefinitions` 中追加关卡对象，确保 `id` 唯一并维持递增。
2. 添加背景资源并在 `BootScene` 加载。
3. 为新关卡准备 `spawnTable`：引用已解锁的 `EnemyId`，并根据阶段设置 `weight` 与批量范围。
4. 如需特殊机制（天气、陷阱等），在 spec 中新增字段并实现于 `PlayScene` 或独立系统，避免将逻辑硬编码在 Scene。

### 3.5 校验清单
- 手动游玩至目标分数，确认刷怪节奏符合预期，`rewardRabbit` 不会重复出现。
- 若调整 `targetScore` 或时间，更新 UI 提示与成就条件。
- 运行 `npm run lint`/`npm run build` 确认新资源 key 已在 `PlayScene`/`BootScene` 中引用。

---

## 4. 敌人模块（Enemy Module）

### 4.1 范围与目标
- 定义敌人属性、解锁关卡、行为模式以及击杀奖励。
- 代码位置：`src/game/data/enemies.ts`，AI 行为在 `PlayScene` 中实现。

### 4.2 数据模型
| 字段 | 类型 | 说明/约束 |
| --- | --- | --- |
| `id` | `EnemyId` | 更新 `src/game/data/types.ts` 联合类型。 |
| `label` | `string` | HUD/掉落提示用名称。 |
| `category` | `'common' \| 'elite' \| 'boss' \| 'reward'` | 影响 UI 与掉落表现。 |
| `maxHp` | `number` | 初始生命。 |
| `moveSpeed` | `number` | px/s。 |
| `attackDamage` | `number` | 触碰玩家时造成的伤害。 |
| `experience` | `number` | 玩家经验收益。 |
| `score` | `number` | 记分板积分。 |
| `unlockStage` | `number` | 首次出现的关卡 ID。 |
| `aiBehavior` | `'chaser' \| 'pouncer' \| 'tank' \| 'boss' \| 'evader'` | 对应 PlayScene 的行为分支。 |
| `weaponExpMultiplier?` | `number` | 决定武器经验掉落，默认 1。 |

### 4.3 扩展流程
1. 增加 `EnemyId` 类型并在 `EnemyDefinitions` 添条目。
2. 若新增行为模式，在 PlayScene 中实现对应的移动/攻击逻辑，并更新 `aiBehavior` 枚举。
3. 在关卡 `spawnTable` 中添加引用，确保 `unlockStage` ≤ 引用该敌人的所有关卡 ID。
4. 调整掉落（经验/积分/武器经验倍数）时，请在 spec 或 PR 描述中给出平衡理由。

### 4.4 校验清单
- 与新关卡联动测试，确保不会越级出现。
- 验证 `weaponExpMultiplier` 与 `calculateWeaponExpGain` 结果是否符合预期。
- 若敌人具备特殊死亡效果（爆炸等），在 spec 中说明事件顺序与安全检查（例如多次触发保护）。

---

## 5. 玩家成长模块（Player Growth Module）

### 5.1 范围与目标
- 维护玩家基础属性、受击与等级成长公式。
- 代码位置：`src/game/logic/playerProgression.ts`、`src/game/types/player.ts`。

### 5.2 数据模型与公式
| 字段 | 类型 | 说明 |
| --- | --- | --- |
| `maxHp` | `number` | 起始 100，随等级每级 +5（`LEVEL_UP_HP_BONUS`）。 |
| `hp` | `number` | 当前生命，受到伤害后扣减，升级可回春。 |
| `speed` | `number` | 移动速度（px/s），当前为常量。 |
| `level` | `number` | 玩家等级，从 1 起算。 |
| `exp` | `number` | 当前经验条累积值。 |
| `nextExp` | `number` | 升至下一级所需经验，`80 + (level-1)*40`。 |
| `alive` | `boolean` | 玩家存活状态。 |

辅助接口：
- `applyExperience`：在循环中处理多级升级、生命回春与 `nextExp` 递推。
- `applyDamage`：执行纯扣血逻辑，保持不可变式返回。
- `createInitialPlayerState`：生成战局起始状态。

### 5.3 扩展流程
1. 新增基础属性（如护盾、能量）时，需先更新 `PlayerState` 与 `PlayerProgressState` 接口，并在本节记录公式与默认值。
2. 若调整经验曲线或升级奖励，需描述新公式、过往存档兼容策略以及 UI 显示方式。
3. 所有成长相关的可视提示（HUD、升级面板）必须同步更新，避免显示旧阈值。

### 5.4 校验清单
- 单元测试：为 `applyExperience`、`applyDamage` 添加覆盖，验证边界（多级升级、负经验输入等）。
- 手动验证：在游戏中多次升级，确认 `maxHp`、`hp`、`nextExp` 均符合公式。
- 若新增属性影响武器或敌人模块，确保相应 spec 小节也已更新。

---

## 6. 扩展提交模板（建议）
在 PR 描述中附上以下要点，便于 reviewer 对照 spec：
1. **模块 & 小节**：如 “武器模块 §1.4”。
2. **数据更新点**：列出改动的配置文件（例如 `weapons.ts`、`stages.ts`）。
3. **验证记录**：包含最小复现步骤与截图/录像（若适用）。
4. **平衡说明**：涉及数值变化时，提供对战时长、DPS、刷怪节奏等核心指标。

遵循以上规范可以确保后续扩展先阅读 spec，再进行实现，降低回归风险并提升团队协作效率。
