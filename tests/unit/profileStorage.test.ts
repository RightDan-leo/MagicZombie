import { normalizeProfileId } from '../../src/services/profileStorage'

describe('normalizeProfileId', () => {
  it('trims whitespace and allows chinese characters', () => {
    expect(normalizeProfileId('  夜行者  ')).toBe('夜行者')
  })

  it('rejects short ids', () => {
    expect(() => normalizeProfileId('a')).toThrow('玩家 ID 需要 2~32 个字符')
  })

  it('rejects invalid characters', () => {
    expect(() => normalizeProfileId('bad/id')).toThrow()
  })
})
