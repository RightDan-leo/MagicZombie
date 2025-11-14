const state = {
  authenticated: false,
  selectedRunId: null,
  runs: [],
  players: [],
  pollTimer: null,
  pollInterval: 8000,
}

const loginPanel = document.getElementById('loginPanel')
const dashboard = document.getElementById('dashboard')
const loginForm = document.getElementById('loginForm')
const loginError = document.getElementById('loginError')
const logoutBtn = document.getElementById('logoutBtn')
const playersTable = document.getElementById('playersTable')
const runsTable = document.getElementById('runsTable')
const detailContainer = document.getElementById('runDetail')
const detailLabel = document.getElementById('detailLabel')
const playersUpdatedAt = document.getElementById('playersUpdatedAt')
const runsUpdatedAt = document.getElementById('runsUpdatedAt')

const statusLabels = {
  in_progress: '进行中',
  cleared: '已通关',
  failed: '已阵亡',
}

const timeFormatter = new Intl.DateTimeFormat('zh-CN', {
  dateStyle: 'short',
  timeStyle: 'medium',
})

init()

function init() {
  if (loginForm) {
    loginForm.addEventListener('submit', handleLogin)
  }
  if (logoutBtn) {
    logoutBtn.addEventListener('click', handleLogout)
  }
  if (runsTable) {
    runsTable.addEventListener('click', (event) => {
      const target = event.target
      if (!(target instanceof HTMLElement)) {
        return
      }
      const row = target.closest('tr[data-run-id]')
      if (!row) {
        return
      }
      const runId = row.dataset.runId
      if (runId) {
        selectRun(runId)
      }
    })
  }
  refreshSession()
}

async function refreshSession() {
  try {
    const session = await apiFetch('/api/auth/session')
    setAuthenticated(Boolean(session?.authenticated))
  } catch (error) {
    console.error('检查会话失败', error)
    setAuthenticated(false)
  }
}

function setAuthenticated(authenticated) {
  state.authenticated = authenticated
  if (loginPanel) loginPanel.classList.toggle('hidden', authenticated)
  if (dashboard) dashboard.classList.toggle('hidden', !authenticated)
  if (logoutBtn) logoutBtn.classList.toggle('hidden', !authenticated)
  if (authenticated) {
    startPolling()
  } else {
    stopPolling()
    state.runs = []
    state.players = []
    state.selectedRunId = null
    renderPlayers()
    renderRuns()
    renderRunDetail(null)
  }
}

async function handleLogin(event) {
  event.preventDefault()
  toggleLoginError('')
  const formData = new FormData(loginForm)
  const username = String(formData.get('username') ?? '')
  const password = String(formData.get('password') ?? '')
  if (!username || !password) {
    toggleLoginError('请输入用户名和密码')
    return
  }
  try {
    await apiFetch('/api/auth/login', {
      method: 'POST',
      body: { username, password },
    })
    setAuthenticated(true)
  } catch (error) {
    toggleLoginError(error.message ?? '登录失败')
  }
}

async function handleLogout() {
  try {
    await apiFetch('/api/auth/logout', { method: 'POST' })
  } catch (error) {
    console.warn('注销失败', error)
  } finally {
    setAuthenticated(false)
  }
}

function toggleLoginError(message) {
  if (!loginError) {
    return
  }
  if (message) {
    loginError.textContent = message
    loginError.classList.remove('hidden')
  } else {
    loginError.textContent = ''
    loginError.classList.add('hidden')
  }
}

function startPolling() {
  refreshData()
  stopPolling()
  state.pollTimer = window.setInterval(() => {
    refreshData()
  }, state.pollInterval)
}

function stopPolling() {
  if (state.pollTimer) {
    clearInterval(state.pollTimer)
    state.pollTimer = null
  }
}

async function refreshData() {
  if (!state.authenticated) {
    return
  }
  try {
    const [playersRes, runsRes] = await Promise.all([apiFetch('/api/admin/players'), apiFetch('/api/admin/runs?limit=40')])
    state.players = playersRes?.players ?? []
    state.runs = runsRes?.runs ?? []
    renderPlayers()
    renderRuns()
    const selected = state.selectedRunId
    if (selected) {
      const run = state.runs.find((entry) => entry.id === selected)
      if (run) {
        renderRunDetail(run)
      } else {
        const detail = await apiFetch(`/api/admin/runs/${selected}`)
        renderRunDetail(detail?.run ?? null)
      }
    } else if (state.runs.length) {
      renderRunDetail(state.runs[0])
      state.selectedRunId = state.runs[0].id
    } else {
      renderRunDetail(null)
    }
    if (playersUpdatedAt) {
      playersUpdatedAt.textContent = `更新于 ${formatTime(Date.now())}`
    }
    if (runsUpdatedAt) {
      runsUpdatedAt.textContent = `更新于 ${formatTime(Date.now())}`
    }
    syncSelectedRow()
  } catch (error) {
    console.error('刷新数据失败', error)
  }
}

function renderPlayers() {
  if (!playersTable) {
    return
  }
  if (!state.players.length) {
    playersTable.innerHTML = `<tr><td colspan="6" class="muted">暂无玩家数据</td></tr>`
    return
  }
  playersTable.innerHTML = ''
  state.players.forEach((player) => {
    const row = document.createElement('tr')
    const stageSuffix = player.latestRun?.stageName ? ` · ${player.latestRun.stageName}` : ''
    const stageLabel = player.latestRun ? `关卡 ${player.latestRun.stageId}${stageSuffix}` : '—'
    row.innerHTML = `
      <td>${escapeHtml(player.playerId)}</td>
      <td>${escapeHtml(stageLabel)}</td>
      <td>${player.latestRun ? renderStatusPill(player.latestRun.status) : '<span class="muted">暂无</span>'}</td>
      <td>${formatDuration(player.totalPlaySeconds)}</td>
      <td>${player.totalRuns}</td>
      <td>${formatTime(player.lastSeenAt)}</td>
    `
    if (player.latestRun?.runId) {
      row.addEventListener('click', () => selectRun(player.latestRun.runId))
    } else {
      row.style.cursor = 'default'
    }
    playersTable.appendChild(row)
  })
}

function renderRuns() {
  if (!runsTable) {
    return
  }
  if (!state.runs.length) {
    runsTable.innerHTML = `<tr><td colspan="7" class="muted">暂无战局</td></tr>`
    return
  }
  runsTable.innerHTML = ''

  state.runs.forEach((run) => {
    const row = document.createElement('tr')
    row.dataset.runId = run.id
    const progress = `${run.score}/${run.targetScore}`
    const stageLabel = `关卡 ${run.stageId}${run.stageName ? ` · ${run.stageName}` : ''}`
    row.innerHTML = `
      <td>${escapeHtml(run.playerId)}</td>
      <td>${escapeHtml(stageLabel)}</td>
      <td>${escapeHtml(progress)}</td>
      <td>${escapeHtml(run.selectedWeapon)}</td>
      <td>${formatDuration(run.elapsedSeconds)}</td>
      <td>${renderStatusPill(run.status)}</td>
      <td>${formatTime(run.updatedAt)}</td>
    `
    runsTable.appendChild(row)
  })
  syncSelectedRow()
}

function syncSelectedRow() {
  const rows = runsTable?.querySelectorAll('tr[data-run-id]') ?? []
  rows.forEach((row) => {
    if (!(row instanceof HTMLTableRowElement)) {
      return
    }
    const runId = row.dataset.runId
    const isSelected = state.selectedRunId === runId
    row.classList.toggle('selected', Boolean(isSelected))
  })
}

async function selectRun(runId) {
  state.selectedRunId = runId
  const existing = state.runs.find((run) => run.id === runId)
  if (existing) {
    renderRunDetail(existing)
    syncSelectedRow()
    return
  }
  try {
    const detail = await apiFetch(`/api/admin/runs/${runId}`)
    renderRunDetail(detail?.run ?? null)
    syncSelectedRow()
  } catch (error) {
    console.error('加载战局详情失败', error)
  }
}

function renderRunDetail(run) {
  if (!detailContainer || !detailLabel) {
    return
  }
  if (!run) {
    detailContainer.innerHTML = `<p class="muted">请选择战局记录。</p>`
    detailLabel.textContent = '选择一条战局记录查看实时数据'
    return
  }
  detailLabel.textContent = `${run.playerId} · 关卡 ${run.stageId} (${statusLabels[run.status] ?? run.status})`

  const overview = `
    <div class="detail-card">
      <h3>战局概览</h3>
      ${statLine('分数', `${run.score} / ${run.targetScore}`)}
      ${statLine('状态', statusLabels[run.status] ?? run.status)}
      ${statLine('首选武器', run.selectedWeapon)}
      ${statLine('用时', formatDuration(run.elapsedSeconds))}
      ${statLine('开始时间', formatTime(run.startedAt))}
      ${statLine('更新时间', formatTime(run.updatedAt))}
    </div>
  `

  const player = `
    <div class="detail-card">
      <h3>玩家状态</h3>
      ${statLine('生命', `${Math.ceil(run.playerState.hp)}/${run.playerState.maxHp}`)}
      ${statLine('等级', `${run.playerState.level}`)}
      ${statLine('经验', `${Math.floor(run.playerState.exp)}/${run.playerState.nextExp}`)}
      ${statLine('速度', `${Math.round(run.playerState.speed)}`)}
      ${statLine('存活', run.playerState.alive ? '是' : '否')}
    </div>
  `

  const weaponProgress = `
    <div class="detail-card">
      <h3>武器进度</h3>
      ${renderWeaponProgress(run)}
    </div>
  `

  const weaponEnhance = `
    <div class="detail-card">
      <h3>武器养成</h3>
      ${renderWeaponEnhancements(run)}
    </div>
  `

  const kills = `
    <div class="detail-card">
      <h3>击杀统计</h3>
      ${renderKills(run)}
    </div>
  `

  const progress = `
    <div class="detail-card" style="grid-column: 1 / -1;">
      <h3>进度采样</h3>
      ${renderProgressSamples(run)}
    </div>
  `

  detailContainer.innerHTML = overview + player + weaponProgress + weaponEnhance + kills + progress
}

function renderWeaponProgress(run) {
  const entries = Object.entries(run.weaponProgress ?? {})
  if (!entries.length) {
    return `<p class="muted">暂无数据</p>`
  }
  return `
    <ul class="list">
      ${entries
        .map(([weaponId, summary]) => {
          const levelInfo = summary.max
            ? `Lv${summary.level} (MAX)`
            : `Lv${summary.level} · ${Math.round(summary.exp)}/${summary.next}`
          return `<li><span>${escapeHtml(weaponId)}</span><span class="highlight">${escapeHtml(levelInfo)}</span></li>`
        })
        .join('')}
    </ul>
  `
}

function renderWeaponEnhancements(run) {
  const entries = Object.entries(run.weaponEnhancements ?? {})
  if (!entries.length) {
    return `<p class="muted">暂无强化记录</p>`
  }
  return `
    <ul class="list">
      ${entries
        .map(([weaponId, enh]) => {
          const list = Object.entries(enh ?? {})
            .map(([key, value]) => `${key}: ${value}`)
            .join('，')
          return `<li><span>${escapeHtml(weaponId)}</span><span class="highlight">${escapeHtml(list || '—')}</span></li>`
        })
        .join('')}
    </ul>
  `
}

function renderKills(run) {
  const entries = Object.entries(run.kills ?? {}).sort((a, b) => (b[1] ?? 0) - (a[1] ?? 0))
  if (!entries.length) {
    return `<p class="muted">暂无击杀数据</p>`
  }
  return `
    <ul class="list">
      ${entries
        .map(([enemyId, count]) => `<li><span>${escapeHtml(enemyId)}</span><span class="highlight">${escapeHtml(String(count))}</span></li>`)
        .join('')}
    </ul>
  `
}

function renderProgressSamples(run) {
  const samples = run.progressSamples ?? []
  if (!samples.length) {
    return `<p class="muted">暂无采样</p>`
  }
  const lastEntries = samples.slice(-12).reverse()
  return `
    <div class="progress-logs">
      ${lastEntries
        .map((entry) => `[${formatDuration(entry.elapsedSeconds)}] 分数 ${entry.score}`)
        .join('<br />')}
    </div>
  `
}

function statLine(label, value) {
  return `<div class="stat-line"><span>${escapeHtml(label)}</span><span class="highlight">${escapeHtml(value)}</span></div>`
}

function renderStatusPill(status) {
  return `<span class="status-pill status--${status}">${statusLabels[status] ?? status}</span>`
}

function formatDuration(seconds) {
  if (!Number.isFinite(seconds)) {
    return '—'
  }
  const total = Math.max(0, Math.floor(seconds))
  const h = Math.floor(total / 3600)
  const m = Math.floor((total % 3600) / 60)
  const s = total % 60
  if (h > 0) {
    return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
  }
  return `${m}:${String(s).padStart(2, '0')}`
}

function formatTime(timestamp) {
  if (!Number.isFinite(timestamp)) {
    return '—'
  }
  return timeFormatter.format(new Date(timestamp))
}

function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, (char) => {
    switch (char) {
      case '&':
        return '&amp;'
      case '<':
        return '&lt;'
      case '>':
        return '&gt;'
      case '"':
        return '&quot;'
      case "'":
        return '&#39;'
      default:
        return char
    }
  })
}

async function apiFetch(url, options = {}) {
  const init = {
    credentials: 'same-origin',
    ...options,
  }

  if (init.body && typeof init.body !== 'string') {
    init.body = JSON.stringify(init.body)
  }

  const headers = new Headers(options.headers ?? {})
  if (init.body && !headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json')
  }
  init.headers = headers

  const response = await fetch(url, init)
  if (!response.ok) {
    let message = `请求失败 (${response.status})`
    try {
      const payload = await response.json()
      if (payload?.error) {
        message = payload.error
      }
    } catch {
      // ignore
    }
    throw new Error(message)
  }
  if (response.status === 204) {
    return null
  }
  return response.json()
}
