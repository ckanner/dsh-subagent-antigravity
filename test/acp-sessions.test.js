import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, mkdirSync, realpathSync, rmSync, readFileSync, readdirSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { randomUUID } from 'node:crypto'
import { setTimeout as delay } from 'node:timers/promises'
import { AcpSessions } from '../lib/acp/sessions.js'

const model = value => [{ id: 'model', category: 'model', type: 'select', name: 'Model', currentValue: value,
  options: [{ value: 'gemini-test', name: 'Gemini test' }, { value: 'gemini-other', name: 'Gemini other' }, { value: 'claude-test', name: 'Claude test' }] }]
function fixture(t, options = {}) {
  const root = realpathSync(mkdtempSync(join(tmpdir(), 'agy-acp-sessions-'))), workspace = join(root, 'source')
  mkdirSync(workspace)
  const calls = [], transports = [], runtime = { executable: '/verified/agy', version: '1.5.14', sha256: 'a'.repeat(64), platform: 'linux', architecture: 'x64', env: {} }
  runtime.identity = { ...runtime }; delete runtime.identity.env
  const manager = new AcpSessions({ stateRoot: join(root, 'state'), getConfig: () => ({ transport: 'acp', disposeGraceMs: 30 }), services: {
    inspectRuntime: async ({ expectedIdentity }) => { if (expectedIdentity) assert.deepEqual(expectedIdentity, runtime.identity); return runtime },
    createWorkspace: async args => { const cwd = join(root, args.id); mkdirSync(cwd); return { id: args.id, owner: args.owner, sourceCwd: workspace, sourceCommit: 'b'.repeat(40), cwd, branch: 'antigravity/' + args.id } },
    verifyWorkspace: async record => record,
    openTransport: (_runtime, _cwd, callbacks) => {
      let pending
      const transport = { callbacks, requests: [], exited: false,
        request(method, params) {
          calls.push({ method, params }); transport.requests.push({ method, params })
          if (method === 'initialize') return Promise.resolve({ protocolVersion: 1, agentInfo: { name: 'antigravity', version: runtime.version }, agentCapabilities: {
            loadSession: true, sessionCapabilities: options.capabilities ?? { resume: {}, close: {} }, promptCapabilities: { image: true, embeddedContext: true } } })
          if (method === 'session/new') {
            if (options.authRequired) return Promise.reject(Object.assign(new Error('Authentication required'), { code: -32000 }))
            if (options.early) callbacks.onUpdate({ sessionId: 'native-session', update: { sessionUpdate: 'config_option_update', configOptions: model('gemini-other') } })
            return Promise.resolve({ sessionId: 'native-session', configOptions: model(options.model ?? 'gemini-test') })
          }
          if (['session/resume', 'session/load'].includes(method)) return Promise.resolve({ configOptions: model('gemini-test') })
          if (method === 'session/prompt') return new Promise((resolve, reject) => { pending = { resolve, reject }; transport.pending = pending })
          if (method === 'session/close') { pending?.resolve({ stopReason: 'cancelled' }); pending = null; return Promise.resolve({}) }
          if (method === 'session/set_config_option') {
            if (options.configRace) callbacks.onUpdate({ sessionId: 'native-session', update: { sessionUpdate: 'config_option_update', configOptions: model('gemini-other') } })
            return Promise.resolve({ configOptions: model(params.value) })
          }
          return Promise.resolve({})
        },
        notify(method, params) { calls.push({ method, params }); if (options.cancelSettles && method === 'session/cancel') { pending?.resolve({ stopReason: 'cancelled' }); pending = null }; return Promise.resolve() },
        async stop() { transport.exited = true; pending?.reject(new Error('Connection closed')); pending = null; return { exited: true, exit: { code: 0, signal: null } } },
        finish(stopReason = 'end_turn') { pending?.resolve({ stopReason }); pending = null },
      }
      transports.push(transport); return transport
    },
  } })
  const context = { owner: 'host-session', workspace }
  const action = (action, fields = {}) => manager.action(context, { version: 2, action, ...fields })
  t.after(async () => { await manager.dispose(); rmSync(root, { recursive: true, force: true }) })
  return { manager, action, context, root, transports, calls, runtime }
}
const turn = async (action, id, text = 'Inspect my code') => action('prompt', { id, operationId: randomUUID(), prompt: [{ type: 'text', text }] })

test('ACP default owns the native agent: only official session inputs and explicit human prompts', async t => {
  const { action, calls, transports } = fixture(t, { early: true })
  assert.equal((await action('defaults')).transport, 'acp')
  const session = await action('connect')
  assert.equal(session.configOptions[0].currentValue, 'gemini-other')
  assert.equal(session.canPrompt, true)
  assert.deepEqual(calls[0].params.clientCapabilities.fs, { readTextFile: false, writeTextFile: false })
  assert.equal(calls[0].params.clientCapabilities.terminal, false)
  assert.notEqual(calls[0].params.clientInfo.name, 'zed')
  assert.deepEqual(calls[1], { method: 'session/new', params: { cwd: session.cwd, mcpServers: [] } })
  const sent = await turn(action, session.id, '请检查代码')
  assert.equal(sent.prompt.state, 'pending')
  assert.deepEqual(calls.at(-1).params, { sessionId: 'native-session', prompt: [{ type: 'text', text: '请检查代码' }] })
  await assert.rejects(turn(action, session.id), /outstanding/)
  transports[0].finish(); await delay(0)
  assert.equal((await action('status', { id: session.id })).canPrompt, true)
  assert.equal(calls.filter(call => call.method === 'session/prompt').length, 1)
})

test('permission is a live reentrant native request, scoped and answered with exact offered ID', async t => {
  const { action, context, manager, transports } = fixture(t)
  const session = await action('connect'), transport = transports[0]
  await turn(action, session.id)
  const permission = transport.callbacks.onPermission({ sessionId: 'native-session', toolCall: { toolCallId: 'tool-1', title: 'Edit file' },
    options: [{ optionId: 'allow-one', kind: 'allow_once', name: 'Allow once' }, { optionId: 'reject', kind: 'reject_once', name: 'Reject' }] })
  const snapshot = await action('status', { id: session.id }), requestId = snapshot.permissions[0].requestId
  await assert.rejects(manager.action({ ...context, owner: 'another-host' }, { version: 2, action: 'permission', id: session.id, requestId, optionId: 'allow-one' }), /does not belong/)
  await assert.rejects(action('permission', { id: session.id, requestId, optionId: 'allow-all' }), /actually offered/)
  await action('permission', { id: session.id, requestId, optionId: 'allow-one' })
  assert.deepEqual(await permission, { outcome: { outcome: 'selected', optionId: 'allow-one' } })
  await assert.rejects(action('permission', { id: session.id, requestId, optionId: 'allow-one' }), /expired/)
  transport.finish(); await delay(0)
})

test('root result keeps post-root updates, permissions and known tool activity alive', async t => {
  const { action, transports, calls } = fixture(t)
  const session = await action('connect'), transport = transports[0]
  await turn(action, session.id)
  const update = update => transport.callbacks.onUpdate({ sessionId: 'native-session', update })
  update({ sessionUpdate: 'tool_call', toolCallId: 'late', title: 'Background test', status: 'in_progress' })
  transport.finish(); await delay(0)
  let current = await action('status', { id: session.id })
  assert.equal(current.status, 'ready'); assert.equal(current.knownWork.tools, 1); assert.equal(current.canPrompt, false)
  update({ sessionUpdate: 'agent_message_chunk', content: { type: 'text', text: '后续输出' } })
  const waiting = transport.callbacks.onPermission({ sessionId: 'native-session', toolCall: { toolCallId: 'late', title: 'Continue' }, options: [] })
  await action('cancel', { id: session.id })
  assert.deepEqual(await waiting, { outcome: { outcome: 'cancelled' } })
  assert.deepEqual(calls.at(-1), { method: 'session/cancel', params: { sessionId: 'native-session' } })
  update({ sessionUpdate: 'tool_call_update', toolCallId: 'late', status: 'completed' })
  current = await action('status', { id: session.id })
  assert.equal(current.messages.at(-1).text, '后续输出'); assert.equal(current.canPrompt, true)
  assert.equal(current.cleanup.session, 'open')
})

test('a repeated operation is never redispatched and a crashed unresolved request remains unknown', async t => {
  const { manager, action, transports, calls, context, root } = fixture(t)
  const session = await action('connect'), operationId = randomUUID(), prompt = [{ type: 'text', text: 'One mutation' }]
  await action('prompt', { id: session.id, operationId, prompt })
  await action('prompt', { id: session.id, operationId, prompt })
  assert.equal(calls.filter(call => call.method === 'session/prompt').length, 1)
  await assert.rejects(action('prompt', { id: session.id, operationId, prompt: [{ type: 'text', text: 'Different' }] }), /different content/)
  const stored = JSON.parse(readFileSync(join(root, 'state', 'sessions', `${session.id}.${operationId}.json`)))
  assert.deepEqual(stored.prompt, prompt); assert.equal(stored.state, 'pending')
  transports[0].callbacks.onClose({ exited: true, exit: { code: 1 } }); await delay(0)
  assert.equal((await action('status', { id: session.id })).prompt.state, 'unknown')
  await assert.rejects(action('resume', { id: session.id }), /unknown work/)
  const restarted = new AcpSessions({ stateRoot: join(root, 'state') })
  t.after(() => restarted.dispose())
  assert.equal((await restarted.action(context, { version: 2, action: 'status', id: session.id })).status, 'unknown')
  assert.ok(readdirSync(join(root, 'state', 'sessions')).includes(session.id + '.lock'))
  assert.equal(manager.isActive(context.owner), true, 'unknown native cleanup must remain visible to workspace archive checks')
})

test('explicit close and exact resume preserve runtime/workspace identity without prompt replay', async t => {
  const { action, transports, calls } = fixture(t)
  const session = await action('connect')
  await turn(action, session.id); transports[0].finish(); await delay(0)
  const closed = await action('disconnect', { id: session.id })
  assert.equal(closed.status, 'disconnected'); assert.deepEqual(closed.cleanup, { process: 'exited', session: 'closed' })
  const resumed = await action('resume', { id: session.id })
  assert.equal(resumed.sessionId, session.sessionId); assert.equal(resumed.cwd, session.cwd); assert.equal(resumed.status, 'ready')
  assert.deepEqual(calls.find(call => call.method === 'session/resume').params, { sessionId: session.sessionId, cwd: session.cwd, mcpServers: [] })
  assert.equal(calls.filter(call => call.method === 'session/prompt').length, 1)
})

test('missing close capability does not turn process exit into native cleanup proof', async t => {
  const { action, calls } = fixture(t, { capabilities: { resume: null } })
  const session = await action('connect')
  const closed = await action('disconnect', { id: session.id })
  assert.equal(closed.status, 'unknown'); assert.equal(closed.cleanup.session, 'unknown')
  assert.equal(calls.some(call => call.method === 'session/close'), false)
})

test('model selection comes from runtime and later notifications win configuration races', async t => {
  const { action, calls } = fixture(t, { model: 'claude-test', configRace: true })
  const session = await action('connect')
  assert.equal(session.canPrompt, false)
  await assert.rejects(turn(action, session.id), /Gemini/)
  await assert.rejects(action('configure', { id: session.id, configId: 'model', value: 'claude-test' }), /Gemini/)
  await assert.rejects(action('configure', { id: session.id, configId: 'systemPrompt', value: 'override' }), /did not advertise/)
  const result = await action('configure', { id: session.id, configId: 'model', value: 'gemini-test' })
  assert.equal(result.configOptions[0].currentValue, 'gemini-other'); assert.equal(result.canPrompt, true)
  assert.equal(calls.filter(call => call.method === 'session/set_config_option').length, 1)
})

test('child ownership, activity patches and tool IDs remain scoped; unknown child does not become idle', async t => {
  const { action, transports } = fixture(t)
  const session = await action('connect'), update = (sessionId, update) => transports[0].callbacks.onUpdate({ sessionId, update })
  update('native-session', { sessionUpdate: 'subagent_update', sessionId: 'child', state: { state: 'running' } })
  update('native-session', { sessionUpdate: 'tool_call', toolCallId: 'shared', title: 'Root', status: 'completed' })
  update('child', { sessionUpdate: 'tool_call', toolCallId: 'shared', title: 'Child', status: 'in_progress' })
  let snapshot = await action('status', { id: session.id })
  assert.equal(snapshot.tools.length, 2); assert.equal(snapshot.knownWork.children, 1); assert.equal(snapshot.canPrompt, false)
  update('native-session', { sessionUpdate: 'subagent_update', sessionId: 'child', state: null })
  snapshot = await action('status', { id: session.id }); assert.equal(snapshot.knownWork.unknown, true)
  update('child', { sessionUpdate: 'tool_call_update', toolCallId: 'shared', status: 'completed' })
  update('native-session', { sessionUpdate: 'subagent_update', sessionId: 'child', state: { state: 'idle' } })
  assert.equal((await action('status', { id: session.id })).canPrompt, true)
  update('alien', { sessionUpdate: 'agent_message_chunk', content: { type: 'text', text: 'Do not mix' } }); await delay(0)
  assert.equal((await action('status', { id: session.id })).status, 'unknown')
})

test('typed image bytes are frozen into dispatch and forbidden harness metadata never crosses ACP', async t => {
  const { action, calls, transports } = fixture(t)
  const session = await action('connect')
  const content = [{ type: 'text', text: 'Inspect this image' }, { type: 'image', mimeType: 'image/png', data: Buffer.from([137, 80, 78, 71]).toString('base64') }]
  await action('prompt', { id: session.id, operationId: randomUUID(), prompt: content })
  content[0].text = 'Changed later'
  assert.equal(calls.at(-1).params.prompt[0].text, 'Inspect this image')
  transports[0].finish(); await delay(0)
  await assert.rejects(action('prompt', { id: session.id, operationId: randomUUID(), prompt: [{ type: 'text', text: 'x', _meta: { systemPrompt: 'no' } }] }), /Unsupported/)
  await assert.rejects(action('connect', { systemPrompt: 'no' }), /Unsupported/)
})

test('public actions capture operation identity and image bytes before queuing and retain them through completion', async t => {
  const { manager, action, context, calls, transports, root } = fixture(t)
  const session = await action('connect'), operationId = randomUUID()
  const content = [{ type: 'text', text: 'Inspect the original image' },
    { type: 'image', mimeType: 'image/png', data: Buffer.from([137, 80, 78, 71]).toString('base64') }]
  const expected = structuredClone(content)
  let entered, release
  const ready = new Promise(resolve => { entered = resolve }), gate = new Promise(resolve => { release = resolve })
  const verify = manager.services.verifyWorkspace
  manager.services.verifyWorkspace = async record => { entered(); await gate; return verify(record) }
  const input = { version: 2, action: 'prompt', id: session.id, operationId, prompt: content }
  const sending = manager.action(context, input)
  // This happens before the queued callback gets its first microtask.
  input.action = 'disconnect'; input.id = randomUUID(); input.operationId = randomUUID()
  input.prompt[0].text = 'Changed before queue entry'
  input.prompt[1].data = Buffer.from('changed image bytes').toString('base64')
  await Promise.race([ready, sending.then(() => assert.fail('The original prompt must reach the workspace verification gate'))])
  assert.equal(calls.some(call => call.method === 'session/prompt'), false)
  // The caller changes the object again while asynchronous preflight is held.
  input.operationId = randomUUID()
  input.prompt = [{ type: 'text', text: 'Changed during preflight', _meta: { systemPrompt: 'must not cross ACP' } }]
  release()
  const pending = await sending
  assert.equal(pending.id, session.id)
  assert.deepEqual(pending.prompt, { operationId, state: 'pending' })
  assert.deepEqual(calls.at(-1), { method: 'session/prompt', params: { sessionId: session.sessionId, prompt: expected } })
  const directory = join(root, 'state', 'sessions'), operationFile = `${session.id}.${operationId}.json`
  const stored = () => JSON.parse(readFileSync(join(directory, operationFile)))
  assert.equal(stored().operationId, operationId)
  assert.deepEqual(stored().prompt, expected)
  // action() acknowledges dispatch before the native prompt finishes; the
  // completion callback must not reread any caller-owned identity either.
  input.operationId = randomUUID(); input.prompt[0].text = 'Changed after dispatch'
  transports[0].finish(); await delay(0)
  const completed = await action('status', { id: session.id })
  assert.deepEqual(completed.prompt, { operationId, state: 'completed', stopReason: 'end_turn' })
  assert.equal(stored().operationId, operationId)
  assert.equal(stored().state, 'completed')
  assert.deepEqual(stored().prompt, expected)
  assert.deepEqual(completed.messages.find(message => message.id === operationId).content, expected)
  assert.deepEqual(readdirSync(directory).filter(name => name.startsWith(`${session.id}.`) && name.endsWith('.json') && name !== `${session.id}.json`), [operationFile])
  await action('prompt', { id: session.id, operationId, prompt: expected })
  assert.equal(calls.filter(call => call.method === 'session/prompt').length, 1, 'the original operation still reconciles without replay')
})

test('authentication required remains a visible native login state without falling back or starting a model', async t => {
  const { action, calls, root } = fixture(t, { authRequired: true })
  const session = await action('connect')
  assert.equal(session.status, 'auth-required'); assert.equal(session.cleanup.process, 'exited')
  assert.equal(calls.some(call => ['authenticate', 'session/prompt'].includes(call.method)), false)
  assert.equal(readdirSync(join(root, 'state', 'sessions')).includes(session.id + '.lock'), false)
})

test('owner stop during runtime preflight prevents late native dispatch and waits for preparation', async t => {
  const { manager, action, context, transports } = fixture(t)
  let release, entered
  const ready = new Promise(resolve => { entered = resolve }), gate = new Promise(resolve => { release = resolve })
  const inspect = manager.services.inspectRuntime
  manager.services.inspectRuntime = async options => { entered(); await gate; return inspect(options) }
  const opening = action('connect'); opening.catch(() => {})
  await ready
  assert.equal(manager.isActive(context.owner), true)
  const stopped = manager.stopOwner(context.owner)
  release()
  await assert.rejects(opening, /owner stopped/)
  await stopped
  assert.equal(transports.length, 0)
  assert.equal(manager.isActive(context.owner), false)
})

test('dispose during worktree preparation retains a not-dispatched record and never launches a process', async t => {
  const { manager, action, context, transports } = fixture(t)
  let release, entered
  const ready = new Promise(resolve => { entered = resolve }), gate = new Promise(resolve => { release = resolve })
  const create = manager.services.createWorkspace
  manager.services.createWorkspace = async options => { const record = await create(options); entered(); await gate; return record }
  const opening = action('connect')
  await ready
  const disposed = manager.dispose(); release()
  const result = await opening
  await disposed
  assert.equal(result.status, 'disconnected'); assert.equal(result.error.code, 'NOT_DISPATCHED')
  assert.equal(transports.length, 0); assert.equal(manager.isActive(context.owner), false)
  await assert.rejects(action('connect'), /disposed/)
})

test('cold host archive checks retain owner activity from durable unresolved session and login locks', async t => {
  const { manager, action, context, root } = fixture(t)
  const session = await action('connect')
  const restarted = new AcpSessions({ stateRoot: join(root, 'state') })
  t.after(() => restarted.dispose())
  assert.equal(restarted.records.size, 0)
  assert.equal(restarted.isActive(context.owner), true)
  assert.equal(restarted.isActive('other-owner'), false)
  await action('disconnect', { id: session.id })
  assert.equal(restarted.isActive(context.owner), false)
  assert.equal(manager.isActive(context.owner), false)
})

test('native login and connection creation are mutually exclusive across manager instances', async t => {
  const { manager, action, context, root } = fixture(t)
  manager.services.login = ({ onUpdate }) => {
    let state = 'idle'
    const snapshot = () => ({ state, authUrl: state === 'awaiting-input' ? 'https://accounts.google.com/example' : null, cleanupConfirmed: state === 'cancelled' })
    return { snapshot, async start() { state = 'awaiting-input'; onUpdate(snapshot()) }, async submit() {}, async cancel() { state = 'cancelled'; onUpdate(snapshot()) } }
  }
  await action('login-start')
  const second = new AcpSessions({ stateRoot: join(root, 'state'), services: manager.services })
  t.after(() => second.dispose())
  assert.equal(second.isActive(context.owner), true)
  const result = await second.action({ ...context, owner: 'another-owner' }, { version: 2, action: 'connect' })
  assert.equal(result.error.code, 'NOT_DISPATCHED'); assert.equal(result.connection, 'disconnected')
  await assert.rejects(action('login-start'), /current login/)
  await action('login-cancel')
  const resumed = await second.action({ ...context, owner: 'another-owner' }, { version: 2, action: 'resume', id: result.id })
  assert.equal(resumed.status, 'ready')
})

test('canPrompt is re-checked after async preflight before dispatching a prompt', async t => {
  const { manager, action, calls, transports, root } = fixture(t)
  const session = await action('connect')
  let entered, release
  const ready = new Promise(resolve => { entered = resolve })
  const gate = new Promise(resolve => { release = resolve })
  const verify = manager.services.verifyWorkspace
  manager.services.verifyWorkspace = async record => { entered(); await gate; return verify(record) }
  const operationId = randomUUID()
  const sending = action('prompt', { id: session.id, operationId, prompt: [{ type: 'text', text: 'race prompt' }] })
  await ready
  // Concurrent tool call arrives while preflight awaits workspace verification.
  transports[0].callbacks.onUpdate({ sessionId: session.sessionId, update: { sessionUpdate: 'tool_call', toolCallId: 'bg-tool', title: 'Background work', status: 'in_progress' } })
  release()
  await assert.rejects(sending, { code: 'INVALID_REQUEST' })
  assert.equal(calls.filter(call => call.method === 'session/prompt').length, 0)
  const opFiles = readdirSync(join(root, 'state', 'sessions')).filter(name => name.includes(operationId))
  assert.equal(opFiles.length, 0)
})
