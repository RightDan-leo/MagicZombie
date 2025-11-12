import type { WeaponEnhancementId } from '../game/data/weaponEnhancements'

export interface EnhancementChoiceView {
  id: WeaponEnhancementId
  weaponId: string
  name: string
  description: string
  stacks: number
  maxStacks: number
  disabled?: boolean
}

export function presentWeaponEnhancements(
  weaponLabel: string,
  choices: EnhancementChoiceView[],
): Promise<WeaponEnhancementId | null> {
  return new Promise((resolve) => {
    const overlay = document.createElement('div')
    overlay.className = 'enhance-gate'

    const cards = choices
      .map((choice, index) => {
        const shortcut =
          index < 3 ? `<span class="enhance-option__shortcut">按 ${index + 1}</span>` : ''
        return `
        <button class="enhance-option ${choice.disabled ? 'enhance-option--disabled' : ''}" type="button" data-enhance-id="${choice.id}" ${
          choice.disabled ? 'disabled' : ''
        }>
          <div class="enhance-option__header">
            <span class="enhance-option__name">${choice.name}</span>
            <span class="enhance-option__stack">${choice.stacks}/${choice.maxStacks}</span>
            ${shortcut}
          </div>
          <p>${choice.description}</p>
        </button>
      `
      })
      .join('')

    overlay.innerHTML = `
      <div class="enhance-gate__panel">
        <h2>${weaponLabel} 武器升级</h2>
        <p>请选择一个增强效果（最多叠加 ${Math.max(...choices.map((c) => c.maxStacks))} 层）。</p>
        <div class="enhance-options">
          ${cards}
        </div>
        <button class="enhance-gate__skip" type="button">放弃本次机会</button>
      </div>
    `

    document.body.appendChild(overlay)

    const optionButtons = Array.from(overlay.querySelectorAll<HTMLButtonElement>('.enhance-option'))

    const handleKeydown = (event: KeyboardEvent) => {
      if (event.repeat) {
        return
      }
      const index = Number(event.key) - 1
      if (!Number.isInteger(index) || index < 0 || index > 2) {
        return
      }
      const button = optionButtons[index]
      if (!button || button.disabled) {
        return
      }
      button.click()
    }

    function cleanup(result: WeaponEnhancementId | null) {
      window.removeEventListener('keydown', handleKeydown)
      overlay.remove()
      resolve(result)
    }

    optionButtons.forEach((button) => {
      button.addEventListener('click', () => {
        const id = button.dataset.enhanceId as WeaponEnhancementId | undefined
        if (!id) {
          return
        }
        cleanup(id)
      })
    })

    window.addEventListener('keydown', handleKeydown)

    const skipBtn = overlay.querySelector<HTMLButtonElement>('.enhance-gate__skip')
    skipBtn?.addEventListener('click', () => cleanup(null))
  })
}
