import { spawn } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import path from 'node:path'
import fs from 'node:fs'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const projectRoot = path.resolve(__dirname, '..')
const distDir = path.resolve(projectRoot, process.env.DIST_DIR ?? 'dist')

function runCommand(command, args, options = {}) {
  const child = spawn(command, args, { stdio: 'inherit', ...options })
  return new Promise((resolve, reject) => {
    child.on('exit', (code, signal) => {
      if (signal) {
        reject(new Error(`Command terminated with signal ${signal}`))
      } else if (code !== 0) {
        reject(new Error(`Command failed with exit code ${code}`))
      } else {
        resolve()
      }
    })
    child.on('error', reject)
  })
}

async function ensureBuild() {
  if (fs.existsSync(distDir)) {
    return
  }

  console.log(`Production build not found at "${distDir}". Running "npm run build" before starting the server...`)
  const npmExecutable = process.platform === 'win32' ? 'npm.cmd' : 'npm'
  await runCommand(npmExecutable, ['run', 'build'], { cwd: projectRoot, env: process.env })
}

async function startServer() {
  await ensureBuild()

  const serverProcess = spawn(process.execPath, [...process.execArgv, path.join(projectRoot, 'server.js')], {
    stdio: 'inherit',
    cwd: projectRoot,
    env: process.env,
  })

  serverProcess.on('exit', (code, signal) => {
    if (signal) {
      process.kill(process.pid, signal)
    } else {
      process.exit(code ?? 0)
    }
  })
  serverProcess.on('error', (error) => {
    console.error('Failed to start the static server:', error)
    process.exit(1)
  })
}

startServer().catch((error) => {
  console.error(error.message)
  process.exit(1)
})
