# MagicZombie 关卡难度调优指南

> 本指南汇总了调节关卡节奏/强度的所有可控参数，并提供一套操作流程，帮助快速完成从需求 → 配置 → 验证的闭环。参考规范来自 `docs/spec.md` 与 `docs/module_expansion_spec.md` 中的 Stage & Enemy 模块（§3、§4）。

## 1. 难度杠杆总览

| 杠杆 | 位置 | 作用说明 |
| --- | --- | --- |
| `targetScore` | `src/game/data/stages.ts` → `StageDefinition` | 决定 `getSpawnInterval` 的进度百分比。提高该值会让关卡更长、更平缓；降低则更快进入高压阶段。 |
| `baseSpawnInterval` / `minSpawnInterval` | 同上 | 分别控制开局和末期的刷怪间隔（毫秒）。两者差距越大，曲线越陡。 |
| `spawnTable[].weight` | 同上 | 决定敌人类型的出现概率；调高精英/特殊敌权重可快速放大压力。 |
| `spawnTable[].minBatch` / `maxBatch` | 同上 | 控制每波数量区间；适用于微调关卡密度或制造尖峰。 |
| `EnemyDefinitions` 中的数值 | `src/game/data/enemies.ts` | 血量、移速、攻击力、经验等核心属性。通过 `unlockStage` 决定何时引入新敌人。 |
| Profile/武器成长 | `src/state/profileManager.ts`、`src/game/logic/weaponProgression.ts` | 若关卡难度来自玩家输出不足，可通过开局武器/增强配置来平衡。 |

## 2. `getSpawnInterval` 工作方式

```ts
const progress = clamp(score / targetScore, 0, 1)
return baseSpawnInterval + (minSpawnInterval - baseSpawnInterval) * progress
```

- `targetScore` 充当“关卡完成度”。当玩家得分达到目标时，刷怪间隔逼近 `minSpawnInterval`。
- 线性插值意味着：若需要早期更平缓、后期陡增，可适当提高 `targetScore` 或减小 `minSpawnInterval`。
- 当 `targetScore <= 0` 时系统直接使用 `minSpawnInterval`，可用于无尽或挑战模式。

## 3. 调整流程（建议）

1. **确定目标区间**  
   - 设计目标时长：`recommendedDuration`（秒）≈ 关卡体验期望。  
   - 估算平均击杀/得分速度，反推目标 `targetScore`。  
   - 若需要难度曲线 A/B，对多个阶段同时规划目标指标（敌人数量、DPS 要求等）。

2. **规划波次与敌种**  
   - 按 `EnemyDefinitions` 的 `unlockStage` 合理组合敌人。  
   - 先用 `weight` 调节出现频率，再用 `min/maxBatch` 放大或削弱尖峰。  
   - 需要临时禁用某敌人时，将 `weight` 设为 0 保持顺序（满足 §3.2 约束）。

3. **数值回写**  
   - 在 `StageDefinitions` 对应关卡对象中更新字段，保持 `id` 递增且唯一。  
   - 若引入新敌人/武器，先更新类型定义（`src/game/data/types.ts`）再在 `spawnTable` 中引用。  
   - 变更应记录在 PR 描述或此文档的“调优记录”段落（可新增小节以便追踪）。

4. **验证**  
   - 数据层：运行 `npm test -- spawnRules`，确保 `getSpawnInterval` 与 `resolveBatchCount` 行为未被破坏。  
   - 体验层：试玩至少三段时间点（开局/中期/目标终点），记录平均刷怪间隔和在场敌人数。  
   - 若关卡通过 `targetScore` 控制胜利条件，需确认 HUD / 结算逻辑（`PlayScene`) 能正确触发。

## 4. FAQ

- **想快速提高第 N 关难度？**  
  先减小 `minSpawnInterval`（提高密度），再把高阶敌的 `weight` 从低到高递增，同时适度降低奖励类敌人的权重。

- **玩家输出不足导致拖沓？**  
  除了放宽 `targetScore`，也可在 `StageDefinitions` 中增加奖励兔的 `minBatch`=1、`maxBatch`=1 的出现频率，或在武器/增强模块提升基础伤害。

- **如何确保新难度与 spec 对齐？**  
  参考 `docs/module_expansion_spec.md §3.4` 的扩展流程，在添加/修改关卡前先更新 spec，再实施代码修改。

## 5. GitHub 提交流程（示例）

```bash
git add docs/difficulty_tuning_guide.md src/game/data/stages.ts  # 如有一并调参
git commit -m "docs: add difficulty tuning guide"
git push origin <your-branch>
```

提交前请附上：调优目的、关键数据点（例如间隔/权重变化）以及验证方式，方便 Reviewer 对照本指南和模块 spec。
