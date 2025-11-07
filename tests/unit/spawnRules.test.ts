import { StageDefinitions } from '../../src/game/data/stages'
import type { EnemyId } from '../../src/game/data/types'
import {
  getAvailableSpawnEntries,
  getSpawnInterval,
  pickEnemyId,
  resolveBatchCount,
} from '../../src/game/logic/spawnRules'

const stage1 = StageDefinitions[0]

describe('spawnRules', () => {
  describe('getSpawnInterval', () => {
    it('returns base interval when score is zero', () => {
      const interval = getSpawnInterval(stage1, 0)
      expect(interval).toBe(stage1.baseSpawnInterval)
    })

    it('returns min interval when score reaches target', () => {
      const interval = getSpawnInterval(stage1, stage1.targetScore)
      expect(interval).toBe(stage1.minSpawnInterval)
    })

    it('clamps progress when score exceeds target', () => {
      const interval = getSpawnInterval(stage1, stage1.targetScore * 2)
      expect(interval).toBe(stage1.minSpawnInterval)
    })

    it('interpolates linearly between base and min interval', () => {
      const midScore = stage1.targetScore / 2
      const interval = getSpawnInterval(stage1, midScore)
      expect(interval).toBeCloseTo((stage1.baseSpawnInterval + stage1.minSpawnInterval) / 2, 5)
    })
  })

  describe('getAvailableSpawnEntries', () => {
    it('excludes reward rabbit when one already exists', () => {
      const entries = getAvailableSpawnEntries(stage1, ['rewardRabbit'] as EnemyId[])
      expect(entries.some((entry) => entry.enemyId === 'rewardRabbit')).toBe(false)
    })

    it('filters entries based on unlock stage', () => {
      const entries = getAvailableSpawnEntries(stage1, [])
      const ids = entries.map((entry) => entry.enemyId)
      expect(ids).toContain('zombieSmall')
      expect(ids).not.toContain('zombieLarge')
    })

    it('includes enemies with unlockStage equal to stage id, excludes greater than stage id', () => {
      // fabricate two entries: one exactly unlocked, one locked
      const exactUnlock = { ...stage1.spawnTable[0], enemyId: 'zombieSmall' as EnemyId }
      const locked = { ...stage1.spawnTable[0], enemyId: 'zombieLarge' as EnemyId }
      const fakeStage = {
        ...stage1,
        id: stage1.id,
        spawnTable: [exactUnlock, locked],
      }
      const ids = getAvailableSpawnEntries(fakeStage, []).map((e) => e.enemyId)
      expect(ids).toContain(exactUnlock.enemyId)
      expect(ids).not.toContain(locked.enemyId)
    })

    it('filters out entries whose definitions are missing', () => {
      const unknown = { ...stage1.spawnTable[0], enemyId: 'unknown' as EnemyId }
      const fakeStage = { ...stage1, spawnTable: [unknown] }
      const entries = getAvailableSpawnEntries(fakeStage, [])
      expect(entries.length).toBe(0)
    })
  })

  describe('pickEnemyId', () => {
    it('returns undefined when no spawn entries exist', () => {
      const emptyStage = { ...stage1, spawnTable: [] }
      expect(pickEnemyId(emptyStage, [], () => 0)).toBeUndefined()
    })

    it('respects rabbit exclusion when one already exists', () => {
      const enemyId = pickEnemyId(stage1, ['rewardRabbit'], () => 0)
      expect(enemyId).not.toBe('rewardRabbit')
    })

    it('returns first entry when roll is at lower bound', () => {
      const enemyId = pickEnemyId(stage1, [], () => 0)
      expect(enemyId).toBe(stage1.spawnTable[0]?.enemyId)
    })

    it('falls back to first available when total weight <= 0', () => {
      const zeroWeightStage = {
        ...stage1,
        spawnTable: stage1.spawnTable
          .filter((e) => e.enemyId !== 'rewardRabbit')
          .map((e) => ({ ...e, weight: 0 })),
      }
      const enemyId = pickEnemyId(zeroWeightStage, [], () => 0)
      expect(enemyId).toBe(zeroWeightStage.spawnTable[0]?.enemyId)
    })

    it('respects weight ranges for selection', () => {
      const a = { ...stage1.spawnTable[0], enemyId: 'zombieSmall' as EnemyId, weight: 1 }
      const b = { ...stage1.spawnTable[0], enemyId: 'zombieMedium' as EnemyId, weight: 3 }
      const fakeStage = { ...stage1, id: 99, spawnTable: [a, b] }

      // roll in [0,1] should land in 'a'
      expect(pickEnemyId(fakeStage, [], () => 0.0)).toBe(a.enemyId)
      expect(pickEnemyId(fakeStage, [], () => 0.999)).toBe(a.enemyId)
      // boundary at 1 also selects 'a' because of <= check
      expect(pickEnemyId(fakeStage, [], () => 1.0)).toBe(a.enemyId)

      // roll just above 1 should land in 'b'
      expect(pickEnemyId(fakeStage, [], () => 1.0001)).toBe(b.enemyId)
      // near total 4 should still land in 'b'
      expect(pickEnemyId(fakeStage, [], () => 3.9999)).toBe(b.enemyId)
    })
  })

  describe('resolveBatchCount', () => {
    const zombieEntry = stage1.spawnTable[0]
    const rabbitEntry = stage1.spawnTable.find((entry) => entry.enemyId === 'rewardRabbit')!

    it('returns zero when rule is missing', () => {
      expect(resolveBatchCount('zombieSmall', undefined, [], () => 1)).toBe(0)
    })

    it('returns one for rabbit when none exists', () => {
      expect(resolveBatchCount('rewardRabbit', rabbitEntry, [], () => 1)).toBe(1)
    })

    it('returns zero for rabbit when one already exists', () => {
      expect(resolveBatchCount('rewardRabbit', rabbitEntry, ['rewardRabbit'], () => 1)).toBe(0)
    })

    it('uses provided random integer for standard enemies', () => {
      const min = zombieEntry.minBatch
      const max = zombieEntry.maxBatch
      const batch = resolveBatchCount('zombieSmall', zombieEntry, [], (a, b) => {
        expect(a).toBe(min)
        expect(b).toBe(max)
        return a + 1
      })
      expect(batch).toBe(min + 1)
    })

    it('clamps min batch to at least 1', () => {
      const rule = { ...zombieEntry, minBatch: 0, maxBatch: 0 }
      const batch = resolveBatchCount('zombieSmall', rule, [], (a, b) => {
        expect(a).toBe(1)
        expect(b).toBe(1)
        return 1
      })
      expect(batch).toBe(1)
    })

    it('clamps max to be >= min when misconfigured', () => {
      const rule = { ...zombieEntry, minBatch: 3, maxBatch: 1 }
      const batch = resolveBatchCount('zombieSmall', rule, [], (a, b) => {
        expect(a).toBe(3)
        expect(b).toBe(3)
        return 3
      })
      expect(batch).toBe(3)
    })
  })
})

