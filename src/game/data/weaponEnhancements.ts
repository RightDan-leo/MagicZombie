import type { WeaponId } from './types'

export type WeaponEnhancementId =
  | 'flame_range'
  | 'flame_burn'
  | 'flame_density'
  | 'flame_heat'
  | 'flame_speed'
  | 'water_velocity'
  | 'water_damage'
  | 'water_burst'
  | 'water_freeze'
  | 'water_ripple'
  | 'chain_jump'
  | 'chain_range'
  | 'chain_overload'
  | 'chain_crit'
  | 'chain_speed'

export interface WeaponEnhancementDefinition {
  id: WeaponEnhancementId
  weaponId: WeaponId
  name: string
  description: string
  maxStacks: number
}

export const WeaponEnhancementPools: Record<WeaponId, WeaponEnhancementDefinition[]> = {
  flamethrower: [
    { id: 'flame_range', weaponId: 'flamethrower', name: '火焰延伸', description: '射程 +20%', maxStacks: 3 },
    { id: 'flame_burn', weaponId: 'flamethrower', name: '灼烧效果', description: '附带持续灼烧', maxStacks: 3 },
    { id: 'flame_density', weaponId: 'flamethrower', name: '喷流密度', description: '喷射命中数量 +2', maxStacks: 3 },
    { id: 'flame_heat', weaponId: 'flamethrower', name: '过热加成', description: '持续攻击获得额外伤害', maxStacks: 3 },
    { id: 'flame_speed', weaponId: 'flamethrower', name: '高温推进', description: '喷射时移动速度 +10%', maxStacks: 3 },
  ],
  waterCannon: [
    { id: 'water_velocity', weaponId: 'waterCannon', name: '超临界喷流', description: '子弹速度与飞行时间 +25%', maxStacks: 3 },
    { id: 'water_damage', weaponId: 'waterCannon', name: '水压打击', description: '水枪伤害 +20%', maxStacks: 3 },
    { id: 'water_burst', weaponId: 'waterCannon', name: '冲击水核', description: '子弹离开战场时产生爆裂', maxStacks: 3 },
    { id: 'water_freeze', weaponId: 'waterCannon', name: '强冷液体', description: '命中时有概率冻结敌人', maxStacks: 3 },
    { id: 'water_ripple', weaponId: 'waterCannon', name: '涟漪侵蚀', description: '命中敌人时额外造成持续侵蚀', maxStacks: 3 },
  ],
  lightningChain: [
    { id: 'chain_jump', weaponId: 'lightningChain', name: '超级导电', description: '连锁跳跃数 +2', maxStacks: 3 },
    { id: 'chain_range', weaponId: 'lightningChain', name: '感应扩大', description: '每跳范围 +20%', maxStacks: 3 },
    { id: 'chain_overload', weaponId: 'lightningChain', name: '过载电流', description: '留下短暂电场', maxStacks: 3 },
    { id: 'chain_crit', weaponId: 'lightningChain', name: '闪击暴走', description: '连锁附加暴击率', maxStacks: 3 },
    { id: 'chain_speed', weaponId: 'lightningChain', name: '雷神降临', description: '冷却 -15%，伤害 -10%', maxStacks: 3 },
  ],
}
