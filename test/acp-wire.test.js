import test from 'node:test'
import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { mkdtempSync, mkdirSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { randomUUID } from 'node:crypto'
import { setTimeout as delay } from 'node:timers/promises'
import { AcpSessions } from '../lib/acp/sessions.js'
import { openAcpTransport } from '../lib/acp/transport.js'

const server = fileURLToPath(new URL('./fixtures/acp-server.mjs', import.meta.url))
async function fixture(t, scenario) {
  const root = mkdtempSync(join(tmpdir(), 'acp-wire-')), workspace = join(root, 'source'); mkdirSync(workspace)
  const runtime = { executable: '/verified/agy', version: '1.5.14', sha256: 'a'.repeat(64), platform: process.platform, architecture: process.arch, env: { ...process.env, ACP_TEST_SCENARIO: scenario } }
  const manager = new AcpSessions({ stateRoot: join(root, 'state'), getConfig: () => ({ transport: 'acp', disposeGraceMs: 200 }), services: {
    inspectRuntime: async () => runtime,
    createWorkspace: async input => ({ ...input, cwd: workspace, sourceCommit: 'a'.repeat(40), branch: 'antigravity/' + input.id }),
    verifyWorkspace: async value => value,
    openTransport: (runtime, cwd, callbacks) => openAcpTransport(runtime, cwd, { ...callbacks, spawnProcess(file, args, options) {
      assert.equal(file, '/verified/agy'); assert.deepEqual(args, ['acp']); assert.equal(options.shell, false)
      return spawn(process.execPath, [server], options)
    } }),
  } })
  const action = (action, extra = {}) => manager.action({ owner: 'wire-owner', workspace }, { version: 2, action, ...extra })
  t.after(async () => { await manager.dispose(); rmSync(root, { recursive: true, force: true }) })
  const session = await action('connect'); assert.equal(session.status, 'ready')
  return { action, session }
}
async function until(action, id, check) {
  const end = Date.now() + 3000
  while (Date.now() < end) { const state = await action('status', { id }); if (check(state)) return state; await delay(10) }
  assert.fail('ACP wire state did not arrive')
}

test('real stdio ACP v1 handles split UTF-8, reentrant permissions and post-root events', async t => {
  const { action, session } = await fixture(t, 'permission')
  await action('prompt', { id: session.id, operationId: randomUUID(), prompt: [{ type: 'text', text: 'A human prompt' }] })
  const permission = await until(action, session.id, state => state.permissions.length === 1)
  await action('permission', { id: session.id, requestId: permission.permissions[0].requestId, optionId: 'once' })
  const finished = await until(action, session.id, state => state.prompt?.state === 'completed' && state.knownWork.tools === 0 && state.messages.some(message => message.text.includes('后台结果')))
  assert.equal(finished.messages.filter(message => message.role === 'assistant').map(message => message.text).join(''), '你好，ACP后台结果')
  assert.equal(finished.connection, 'connected'); assert.equal(finished.canPrompt, true)
  assert.equal(JSON.stringify(finished).includes('secret-that-must-not'), false)
  const closed = await action('disconnect', { id: session.id })
  assert.equal(closed.status, 'disconnected'); assert.equal(closed.cleanup.session, 'closed')
})

test('real stdio cancel is a notification and waits for the native prompt cancellation result', async t => {
  const { action, session } = await fixture(t, 'wait')
  await action('prompt', { id: session.id, operationId: randomUUID(), prompt: [{ type: 'text', text: 'Wait for cancel' }] })
  await until(action, session.id, state => state.knownWork.tools === 1)
  await action('cancel', { id: session.id })
  const cancelled = await until(action, session.id, state => state.prompt?.state === 'cancelled')
  assert.equal(cancelled.prompt.stopReason, 'cancelled')
  assert.equal((await action('disconnect', { id: session.id })).status, 'disconnected')
})

test('real ACP process exit retains an unknown operation and cannot trigger a fallback or replay', async t => {
  const { action, session } = await fixture(t, 'crash')
  await action('prompt', { id: session.id, operationId: randomUUID(), prompt: [{ type: 'text', text: 'Do not replay' }] })
  const unknown = await until(action, session.id, state => state.status === 'unknown' && state.cleanup.process === 'exited')
  assert.equal(unknown.prompt.state, 'unknown'); assert.equal(unknown.canPrompt, false)
  await assert.rejects(action('resume', { id: session.id }), /unknown work/)
})
