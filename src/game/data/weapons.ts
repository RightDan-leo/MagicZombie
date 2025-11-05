import type { WeaponDefinition } from './types'

export const WeaponDefinitions: Record<WeaponDefinition['id'], WeaponDefinition> = {
  lightningChain: {
    id: 'lightningChain',
    label: '闪电链条',
    baseDamage: 28,
    attacksPerSecond: 1.2,
    range: 220,
    chainTargets: 3,
    notes: '高伤害大范围弹射，适合群体控制',
  },
  flamethrower: {
    id: 'flamethrower',
    label: '火焰喷射',
    baseDamage: 8,
    attacksPerSecond: 10,
    range: 160,
    notes: '近距离持续喷射，可叠加点燃伤害',
  },
  waterCannon: {
    id: 'waterCannon',
    label: '水枪',
    baseDamage: 45,
    attacksPerSecond: 0.8,
    range: 360,
    penetration: 4,
    projectileSpeed: 520,
    notes: '穿透直线高额伤害，附带减速',
  },
}

