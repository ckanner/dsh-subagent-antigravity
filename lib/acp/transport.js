import { spawn } from 'node:child_process'
import { Readable, Writable } from 'node:stream'
import { setTimeout as delay } from 'node:timers/promises'
import * as acp from '@agentclientprotocol/sdk'
import { stopGroup } from '../runner.js'

export const CLIENT_INFO = Object.freeze({ name: 'dsh-antigravity', title: 'Antigravity for DSH / Flywheel', version: '0.3.0' })
export const CLIENT_CAPABILITIES = Object.freeze({
  fs: { readTextFile: false, writeTextFile: false }, terminal: false,
  auth: { terminal: true }, subagents: {}, session: { configOptions: { boolean: {} } },
})

export async function deadline(promise, milliseconds, label) {
  let timer
  try {
    return await Promise.race([promise, new Promise((_, reject) => {
      timer = setTimeout(() => { const error = new Error(`${label} timed out; its outcome is not confirmed`); error.code = 'TIMEOUT'; reject(error) }, milliseconds)
      timer.unref?.()
    })])
  } finally { clearTimeout(timer) }
}

/** Long-lived stable ACP v1 connection. Never has an agent loop or tool bridge. */
export function openAcpTransport(runtime, cwd, { args = [], onUpdate, onPermission, onClose, spawnProcess = spawn } = {}) {
  const child = spawnProcess(runtime.executable, ['acp', ...args], { cwd, env: runtime.env,
    shell: false, detached: process.platform !== 'win32', stdio: ['pipe', 'pipe', 'pipe'] })
  let exited = false, exit, closing = false, closedNotified = false, stopPromise
  const exitedPromise = new Promise(resolve => {
    const finish = value => { if (!exited) { exited = true; exit = value; resolve(value) } }
    child.once('error', error => finish({ code: null, signal: null, error: error.message }))
    child.once('exit', (code, signal) => finish({ code, signal }))
  })
  // Native stderr is not a credential-safe diagnostic API. Drain it without
  // copying OAuth links, codes, user configuration or prompts into host logs.
  child.stderr?.resume()
  child.stdin.on('error', () => {})
  child.stdout.on('error', () => {})
  const app = acp.client({ name: CLIENT_INFO.name })
    .onNotification(acp.methods.client.session.update, context => onUpdate?.(context.params))
    .onRequest(acp.methods.client.session.requestPermission, context => onPermission?.(context.params) ?? { outcome: { outcome: 'cancelled' } })
  const connection = app.connect(acp.ndJsonStream(Writable.toWeb(child.stdin), Readable.toWeb(child.stdout), { maxMessageBytes: 24 * 1024 * 1024 }))
  connection.closed.then(async () => {
    // Let the last queued notification and matching prompt result reach their
    // handlers before reporting loss of the transport. SDK dispatch is async.
    await delay(0)
    if (!closedNotified) { closedNotified = true; onClose?.({ intentional: closing, exited, exit }) }
  }).catch(() => {})
  return {
    pid: child.pid,
    get exited() { return exited }, get exit() { return exit },
    request: (method, params) => connection.agent.request(method, params),
    notify: (method, params) => connection.agent.notify(method, params),
    stop(graceMs = 2000, { graceful = false } = {}) {
      return stopPromise ??= (async () => {
      closing = true
      if (graceful) {
        child.stdin.end()
        try { await deadline(exitedPromise, Math.min(graceMs, 500), 'ACP graceful exit') } catch {}
      }
      connection.close()
      if (!graceful) child.stdin.destroy()
      // The group can outlive its leader. Always supervise the owned PGID,
      // including when the root has already emitted its exit event.
      const groupConfirmed = process.platform === 'win32' ? false : await stopGroup(child.pid, graceMs)
      try { await deadline(exitedPromise, graceMs, 'ACP process exit') } catch {}
      child.stdout.destroy(); child.stderr?.destroy()
      // Only this owned process group has been observed. Detached native tasks
      // need successful session/close; process exit alone does not prove it.
      return { exited: exited && groupConfirmed, rootExited: exited, groupConfirmed, exit }
      })()
    },
  }
}
