import test from 'node:test'
import assert from 'node:assert/strict'
import { chmodSync, existsSync, mkdtempSync, mkdirSync, readFileSync, realpathSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { runMachine, recoverMachine, parseMachineRequest, MACHINE_CAPABILITIES } from '../lib/machine.js'

const command = resolve('test/fixtures/acp/fake-acp-machine.js')
chmodSync(command, 0o755)
const PNG_BASE64 = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Wl6X8sAAAAASUVORK5CYII='

function fixture(t, scenario = 'success') {
  const home = realpathSync(mkdtempSync(join(tmpdir(), 'agy-acp-machine-')))
  t.after(() => rmSync(home, { recursive: true, force: true }))
  const cwd = join(home, 'work')
  const journals = join(home, 'journals')
  mkdirSync(cwd)
  mkdirSync(journals, { mode: 0o700 })
  mkdirSync(join(home, '.gemini', 'antigravity-cli'), { recursive: true })
  const env = {
    PATH: process.env.PATH,
    HOME: home,
    FIXTURE_SCENARIO: scenario,
    FIXTURE_CALLS: join(home, 'calls'),
    FIXTURE_INPUT: join(home, 'input'),
    FIXTURE_PID: join(home, 'pid'),
  }
  const request = {
    protocol: 1,
    requestId: 'acp-task-1',
    transport: 'acp',
    cwd,
    command,
    prompt: 'hello over acp',
    model: 'gemini-4-neon-high',
    effort: 'high',
    executionMode: 'plan',
    permissionMode: 'always-proceed',
    sandbox: false,
    sessionMode: 'new',
    timeoutMs: 10000,
    disposeGraceMs: 200,
    subscriptionPolicy: { version: 1, mode: 'subscription-only' },
  }
  return { home, cwd, env, request, runtime: { env, recoveryDirectory: join(journals, 'run') } }
}

test('ACP machine runs unattended session/new, configures model/mode, streams images and supports resume', async t => {
  assert.deepEqual(MACHINE_CAPABILITIES.supportedTransports, ['acp', 'headless'])
  assert.equal(MACHINE_CAPABILITIES.acpImages, true)
  const f = fixture(t, 'success')
  const events = []
  let progress = ''
  const receipt = await runMachine(
    { ...f.request, images: [{ mimeType: 'image/png', data: PNG_BASE64 }] },
    { ...f.runtime, onLifecycle: e => events.push(e), onProgress: text => { progress += text } },
  )
  assert.equal(receipt.ok, true, JSON.stringify(receipt.failure))
  assert.equal(receipt.configuration.source, 'acp-init')
  assert.equal(receipt.configuration.observed.model, 'gemini-4-neon-high')
  assert.equal(receipt.output[0].text, 'acp-done:gemini-4-neon-high:images=1')
  assert.equal(progress, 'acp-done:gemini-4-neon-high:images=1')
  assert.equal(receipt.usage.totalTokens, 180)
  assert.equal(receipt.usage.status, 'complete')
  assert.equal(receipt.usage.scope, 'turn')
  assert.deepEqual(events.map(e => e.event), ['dispatch-intent', 'dispatch-possible', 'terminal', 'cleanup-confirmed'])
  const sent = JSON.parse(readFileSync(f.env.FIXTURE_INPUT, 'utf8').trim())
  assert.equal(sent.prompt.length, 2)
  assert.equal(sent.prompt[1].type, 'image')
  assert.equal(sent.prompt[1].mimeType, 'image/png')

  const recovered = await recoverMachine({ protocol: 1, requestId: receipt.requestId, runId: receipt.runId, recoveryDirectory: f.runtime.recoveryDirectory })
  assert.deepEqual(recovered.receipt, receipt)

  const resumed = await runMachine(
    { ...f.request, requestId: 'acp-task-2', sessionMode: 'resume', sessionId: receipt.session.id },
    { env: f.env },
  )
  assert.equal(resumed.ok, true, JSON.stringify(resumed.failure))
  assert.equal(resumed.session.id, receipt.session.id)
  assert.equal(resumed.output[0].text, 'acp-done:gemini-4-neon-high:plan')
})

test('ACP machine validates images strictly and rejects images on headless transport', t => {
  const f = fixture(t)
  assert.throws(() => parseMachineRequest({ ...f.request, transport: 'headless', images: [{ mimeType: 'image/png', data: PNG_BASE64 }] }), /transport: acp/)
  assert.throws(() => parseMachineRequest({ ...f.request, images: [] }), /1 to 4/)
  assert.throws(() => parseMachineRequest({ ...f.request, images: [{ mimeType: 'image/svg+xml', data: PNG_BASE64 }] }), /mimeType/)
  assert.throws(() => parseMachineRequest({ ...f.request, images: [{ mimeType: 'image/png', data: 'not-base64!!!' }] }), /base64/)
})

test('ACP machine validates structured output with ajv and fails closed on schema mismatch', async t => {
  const schema = { type: 'object', properties: { answer: { type: 'string' } }, required: ['answer'], additionalProperties: false }
  const okFixture = fixture(t, 'schema-ok')
  const okReceipt = await runMachine({ ...okFixture.request, outputSchema: schema }, okFixture.runtime)
  assert.equal(okReceipt.ok, true, JSON.stringify(okReceipt.failure))
  assert.deepEqual(okReceipt.structured, { answer: 'acp-ok' })

  const badFixture = fixture(t, 'schema-bad')
  const badReceipt = await runMachine({ ...badFixture.request, outputSchema: schema }, badFixture.runtime)
  assert.equal(badReceipt.ok, false)
  assert.match(badReceipt.failure.detail, /schema/)
})

test('ACP machine enforces evidence-only without touching user cwd and rejects tool steps', async t => {
  const f = fixture(t, 'illegal-tool')
  const r = await runMachine({ ...f.request, toolPolicy: 'evidence-only', permissionMode: 'request-review' }, f.runtime)
  assert.equal(r.ok, false)
  assert.match(r.failure.detail, /evidence-only/)
  assert.equal(existsSync(join(f.cwd, '.agents')), false)

  const ok = fixture(t, 'success')
  const okReceipt = await runMachine({ ...ok.request, toolPolicy: 'evidence-only', permissionMode: 'request-review' }, ok.runtime)
  assert.equal(okReceipt.ok, true, JSON.stringify(okReceipt.failure))
  assert.equal(existsSync(join(ok.cwd, '.agents')), false)
  assert.equal(okReceipt.native.managedAgent.cleanup, 'confirmed')
  assert.equal(existsSync(okReceipt.native.managedAgent.path), false)
})

test('ACP machine handles request-review denial, auth-required, quota, and abort cleanly', async t => {
  const denied = fixture(t, 'permission-request')
  const dr = await runMachine({ ...denied.request, permissionMode: 'request-review' }, denied.runtime)
  assert.equal(dr.ok, false)
  assert.equal(dr.failure.category, 'permission-denied')

  const allowed = fixture(t, 'permission-request')
  const ar = await runMachine({ ...allowed.request, permissionMode: 'always-proceed' }, allowed.runtime)
  assert.equal(ar.ok, true, JSON.stringify(ar.failure))

  const auth = fixture(t, 'auth-required')
  const authReceipt = await runMachine(auth.request, auth.runtime)
  assert.equal(authReceipt.ok, false)
  assert.equal(authReceipt.failure.category, 'auth')
  assert.equal(authReceipt.execution.dispatch, 'not-dispatched')

  const quota = fixture(t, 'quota')
  const qr = await runMachine(quota.request, quota.runtime)
  assert.equal(qr.ok, false)
  assert.equal(qr.failure.category, 'quota')

  const hang = fixture(t, 'hang')
  const controller = new AbortController()
  setTimeout(() => controller.abort(), 250)
  const hr = await runMachine(hang.request, { ...hang.runtime, signal: controller.signal })
  assert.equal(hr.ok, false)
  assert.equal(hr.execution.cancelled, true)
  assert.equal(hr.cleanup.confirmed, true)
})

test('ACP machine emits per-turn usage scope and streams redacted tool/thought progress without polluting output', async t => {
  const f = fixture(t, 'tool-and-thought')
  const progressChunks = []
  const activityTypes = []
  const receipt = await runMachine(f.request, {
    ...f.runtime,
    onProgress: chunk => progressChunks.push(chunk),
    onActivity: event => activityTypes.push(...(event.eventTypes ?? [])),
  })
  assert.equal(receipt.ok, true, JSON.stringify(receipt.failure))
  assert.equal(receipt.output[0].text, 'clean-final-answer')
  assert.equal(receipt.usage.status, 'complete')
  assert.equal(receipt.usage.scope, 'turn')
  assert.equal(receipt.usage.inputTokens, 140)
  assert.equal(receipt.usage.cacheReadTokens, 900)
  assert.equal(receipt.usage.outputTokens, 50)
  assert.equal(receipt.usage.thinkingTokens, 20)
  assert.equal(receipt.usage.totalTokens, 1090)

  assert.ok(progressChunks.some(c => c.includes('[thought] Inspecting board rules')))
  const inProgressTools = progressChunks.filter(c => c.includes('[tool] read_file src/core/types.ts (in_progress)'))
  assert.equal(inProgressTools.length, 1, 'duplicate consecutive tool updates should be deduplicated')
  assert.ok(progressChunks.some(c => c.includes('[tool] read_file src/core/types.ts (completed)')))
  assert.ok(progressChunks.includes('clean-final-answer'))

  assert.ok(activityTypes.includes('agent_thought_chunk'))
  assert.ok(activityTypes.includes('tool_call'))
  assert.ok(activityTypes.includes('tool_call_update'))
  assert.ok(activityTypes.includes('usage_update'))
})
