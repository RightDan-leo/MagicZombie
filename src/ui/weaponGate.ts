import type { WeaponId } from '../game/data/types'
import { WeaponDefinitions } from '../game/data/weapons'
import { profileManager } from '../state/profileManager'

const SELECTABLE_WEAPONS: WeaponId[] = ['lightningChain', 'flamethrower', 'waterCannon']

export async function ensureWeaponSelected() {
  const profile = profileManager.getProfile()
  if (!profile) {
    throw new Error('Profile must be loaded before selecting weapon')
  }

  const existing = profile.selectedWeapon ?? 'lightningChain'

  return new Promise<void>((resolve) => {
    const overlay = document.createElement('div')
    overlay.className = 'weapon-gate'

    const cardsHtml = SELECTABLE_WEAPONS.map((id) => {
      const weapon = WeaponDefinitions[id]
      const tagLabel = id === 'lightningChain' ? '默认' : '可选'
      const noteText = weapon.notes ?? ''
      return [
        '<button class="weapon-option" type="button" data-weapon-id="',
        id,
        '">',
        '<div class="weapon-option__title">',
        '<span class="weapon-option__label">',
        weapon.label,
        '</span>',
        '<span class="weapon-option__tag">',
        tagLabel,
        '</span>',
        '</div>',
        '<p class="weapon-option__notes">',
        noteText,
        '</p>',
        '<div class="weapon-option__stats">',
        '<span>伤害 ',
        weapon.baseDamage.toString(),
        '</span>',
        '<span>攻速 ',
        weapon.attacksPerSecond.toFixed(1),
        '/s</span>',
        '<span>射程 ',
        weapon.range.toString(),
        '</span>',
        '</div>',
        '</button>',
      ].join('')
    }).join('')

    overlay.innerHTML = `
      <div class="weapon-gate__panel">
        <h2>请选择开局武器</h2>
        <p>不同武器拥有独特的射程、攻速与特效，可在战斗中随时按 1/2/3 切换。</p>
        <div class="weapon-options">
          ${cardsHtml}
        </div>
        <button class="weapon-gate__confirm" type="button">确认武器</button>
      </div>
    `

    document.body.appendChild(overlay)
    const options = Array.from(overlay.querySelectorAll<HTMLButtonElement>('.weapon-option'))
    const confirmBtn = overlay.querySelector<HTMLButtonElement>('.weapon-gate__confirm')!

    let selected: WeaponId | null = existing

    function updateSelection() {
      options.forEach((btn) => {
        const id = btn.dataset.weaponId as WeaponId | undefined
        const active = id === selected
        btn.classList.toggle('weapon-option--selected', active)
      })
      confirmBtn.disabled = !selected
    }

    options.forEach((btn) => {
      btn.addEventListener('click', () => {
        const choice = btn.dataset.weaponId as WeaponId | undefined
        if (!choice) {
          return
        }
        selected = choice
        updateSelection()
      })
    })

    confirmBtn.addEventListener('click', () => {
      if (!selected) {
        return
      }
      profileManager.setSelectedWeapon(selected)
      overlay.remove()
      resolve()
    })

    updateSelection()
  })
}
