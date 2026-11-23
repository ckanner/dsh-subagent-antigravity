import test from 'node:test'
import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, chmodSync, realpathSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, delimiter } from 'node:path'
import { AcpLogin, createAcpLoginForTests } from '../lib/acp/login.js'
import { createAcpRuntimeInspectorForTests } from '../lib/acp/runtime.js'

const delay = ms => new Promise(resolve => setTimeout(resolve, ms))
async function until(check) { for (let i = 0; i < 250; i++) { if (check()) return; await delay(10) } throw new Error('Timed out waiting for login fixture') }
const fixture = readFileSync(new URL('./fixtures/acp/fake-acp-cli.js', import.meta.url))
async function setup(t, mode = 'success', dependencies = {}) {
  const root = realpathSync(mkdtempSync(join(tmpdir(), 'agy-acp-login-')))
  t.after(() => rmSync(root, { recursive: true, force: true }))
  const cwd = join(root, 'work'); mkdirSync(cwd)
  const executable = join(root, 'agy')
  writeFileSync(executable, fixture); chmodSync(executable, 0o755)
  const artifact = { platform: process.platform, architecture: process.arch, version: '1.5.14', binarySha256: createHash('sha256').update(fixture).digest('hex') }
  const inspect = createAcpRuntimeInspectorForTests({ artifacts: [artifact] })
  const env = { HOME: root, PATH: root + delimiter + process.env.PATH, DISPLAY: ':99', WAYLAND_DISPLAY: 'wayland-test', FIXTURE_LOGIN_MODE: mode, FIXTURE_CHILD_PID_FILE: join(root, 'child-pid') }
  const runtime = await inspect({ command: executable, cwd, env })
  const Login = createAcpLoginForTests({ inspect, graceMs: 100, ...dependencies })
  const updates = [], login = new Login({ runtime, cwd, onUpdate: update => updates.push(update) })
  t.after(() => login.cancel())
  return { root, cwd, runtime, env, login, updates }
}
const callback = state => 'https://antigravity.google/oauth-callback?state=' + state + '&code=4%2Ftest-code'

test('the production login constructor cannot launch a fixture posing as a verified runtime', async t => {
  const f = await setup(t)
  const login = new AcpLogin({ runtime: f.runtime, cwd: f.cwd })
  assert.equal((await login.start()).state, 'failed')
  assert.match(login.snapshot().message, /changed|not the verified official/)
})

test('the same official invocation accepts a checked callback, exposing no submitted code or raw output', async t => {
  const f = await setup(t)
  await f.login.start()
  await until(() => f.login.snapshot().state === 'awaiting-input')
  const initial = f.login.snapshot()
  assert.equal(new URL(initial.authUrl).hostname, 'accounts.google.com')
  await f.login.submit(callback('fixture-state'))
  await until(() => f.login.snapshot().state === 'succeeded')
  assert.equal(f.login.snapshot().helperCompleted, true)
  assert.equal(f.login.snapshot().authenticationVerified, false)
  assert.equal(f.login.snapshot().cleanupConfirmed, true)
  assert.equal(f.login.snapshot().authUrl, null)
  assert.equal(f.runtime.env.DISPLAY, ':99')
  assert.equal(f.runtime.env.WAYLAND_DISPLAY, 'wayland-test')
  const serialized = JSON.stringify(f.updates)
  assert.equal(serialized.includes('4/test-code'), false)
  assert.equal(serialized.includes('synthetic-secret'), false)
  assert.equal(serialized.includes('received:'), false)
})

test('wrong state, duplicate callback fields, wrong origin and multiline input never reach stdin', async t => {
  const f = await setup(t)
  await f.login.start(); await until(() => f.login.snapshot().state === 'awaiting-input')
  for (const input of [callback('wrong'), callback('fixture-state') + '&state=fixture-state', callback('fixture-state') + '&code=second', 'https://attacker.example/oauth-callback?state=fixture-state&code=4%2Ftest-code', '4/test-code\nextra']) {
    await assert.rejects(f.login.submit(input), { code: 'ACP_LOGIN_INPUT' })
    assert.equal(f.login.snapshot().state, 'awaiting-input')
  }
  await f.login.submit('4/test-code')
  await until(() => f.login.snapshot().state === 'succeeded')
})

test('cancel wins over an exit-zero SIGTERM handler and releases the helper process group', async t => {
  const f = await setup(t, 'descendant')
  await f.login.start(); await until(() => f.login.snapshot().state === 'awaiting-input')
  await until(() => { try { return readFileSync(f.env.FIXTURE_CHILD_PID_FILE, 'utf8').length > 0 } catch { return false } })
  const pid = Number(readFileSync(f.env.FIXTURE_CHILD_PID_FILE, 'utf8'))
  const result = await f.login.cancel()
  assert.equal(result.state, 'cancelled')
  assert.equal(result.helperCompleted, false)
  assert.equal(result.authUrl, null)
  assert.equal(result.cleanupConfirmed, true)
  assert.throws(() => process.kill(pid, 0), { code: 'ESRCH' })
  assert.equal((await f.login.cancel()).state, 'cancelled')
})

test('invalid authorization URLs and oversized output fail without exposing them', async t => {
  for (const mode of ['bad-url', 'spoof-url', 'large-output']) {
    const f = await setup(t, mode)
    await f.login.start(); await until(() => f.login.snapshot().state === 'failed')
    assert.equal(f.login.snapshot().helperCompleted, false)
    assert.equal(JSON.stringify(f.updates).includes('attacker.example'), false)
  }
})

test('nonzero exit and timeout never become successful authentication', async t => {
  const failed = await setup(t, 'failure')
  await failed.login.start(); await until(() => failed.login.snapshot().state === 'awaiting-input')
  await failed.login.submit('4/test-code')
  await until(() => failed.login.snapshot().state === 'failed')
  assert.equal(failed.login.snapshot().exitCode, 3)
  const expired = await setup(t, 'hang', { timeoutMs: 100 })
  await expired.login.start(); await until(() => expired.login.snapshot().state === 'failed')
  assert.match(expired.login.snapshot().message, /expired/)
})

test('a rotated official URL invalidates callbacks from the earlier attempt', async t => {
  const f = await setup(t, 'rotate')
  await f.login.start(); await until(() => f.login.snapshot().state === 'awaiting-input')
  await f.login.submit('4/test-code')
  await until(() => f.login.snapshot().state === 'awaiting-input' && f.login.snapshot().authUrl.includes('replacement-state'))
  await assert.rejects(f.login.submit(callback('fixture-state')), /different sign-in attempt/)
  await f.login.submit(callback('replacement-state'))
  await until(() => f.login.snapshot().state === 'succeeded')
})

test('cancelling during runtime revalidation never spawns the login helper', async t => {
  const f = await setup(t)
  let release, spawned = false
  const Login = createAcpLoginForTests({ inspect: () => new Promise(resolve => { release = () => resolve(f.runtime) }), spawnProcess: () => { spawned = true; throw new Error('unexpected spawn') } })
  const login = new Login({ runtime: f.runtime, cwd: f.cwd })
  const start = login.start(), cancel = login.cancel()
  release()
  await start; await cancel
  assert.equal(spawned, false)
  assert.equal(login.snapshot().state, 'cancelled')
})

test('unconfirmed cleanup is exposed and a later cancellation can retry it', async t => {
  let attempts = 0
  const f = await setup(t, 'success', { stop: async () => ++attempts > 1 })
  await f.login.start(); await until(() => f.login.snapshot().state === 'awaiting-input')
  await f.login.submit('4/test-code')
  await until(() => f.login.snapshot().state === 'failed')
  assert.equal(f.login.snapshot().cleanupConfirmed, false)
  const retried = await f.login.cancel()
  assert.equal(retried.cleanupConfirmed, true)
  assert.equal(retried.state, 'cancelled')
})
