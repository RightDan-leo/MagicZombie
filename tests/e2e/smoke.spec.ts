import { test, expect } from '@playwright/test'

type DebugInfo = {
  stageId: number | null
  score: number
  player: { x: number; y: number }
  enemyCount: number
  hudText: string
}

declare global {
  interface Window {
    __MAGICZOMBIE_DEBUG__?: DebugInfo
  }
}

test.describe('Game smoke test', () => {
  test('boots PlayScene, updates HUD, and responds to movement', async ({ page }) => {
    const consoleErrors: string[] = []
    page.on('console', (message) => {
      if (message.type() === 'error') {
        consoleErrors.push(message.text())
      }
    })

    await page.goto('/?profileId=e2e-smoke')

    const weaponChoice = page.locator('[data-weapon-id="flamethrower"]')
    await weaponChoice.waitFor({ state: 'visible' })
    await weaponChoice.click()
    await page.locator('.weapon-gate__confirm').click()

    const canvas = page.locator('#app canvas')
    await expect(canvas).toHaveCount(1)

    const size = await canvas.evaluate((element) => ({
      width: (element as HTMLCanvasElement | null)?.width ?? 0,
      height: (element as HTMLCanvasElement | null)?.height ?? 0,
    }))
    expect(size.width).toBeGreaterThan(0)
    expect(size.height).toBeGreaterThan(0)

    // Wait for debug info to populate.
    const debugHandle = await page.waitForFunction(
      () => window.__MAGICZOMBIE_DEBUG__,
      undefined,
      { timeout: 5000 },
    )
    const debugInfo = (await debugHandle?.jsonValue()) as DebugInfo | undefined
    expect(debugInfo?.stageId).toBe(1)
    expect(debugInfo?.hudText).toContain('关卡')

    const initialPlayer = debugInfo?.player
    expect(initialPlayer?.x).toBeGreaterThan(0)
    expect(initialPlayer?.y).toBeGreaterThan(0)

    // Simulate pressing right to move the player.
    await page.keyboard.down('ArrowRight')
    await page.waitForTimeout(400)
    await page.keyboard.up('ArrowRight')
    await page.waitForTimeout(100)

    const movedInfo = await page.evaluate<DebugInfo | undefined>(() => window.__MAGICZOMBIE_DEBUG__)
    expect(movedInfo?.player.x).toBeGreaterThan((initialPlayer?.x ?? 0) + 5)

    // Short soak to surface runtime errors.
    await page.waitForTimeout(600)
    expect(consoleErrors).toEqual([])
  })
})
