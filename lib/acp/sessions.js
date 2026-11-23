import { mkdirSync, readdirSync, realpathSync, lstatSync, openSync, writeFileSync, fsyncSync, closeSync, unlinkSync, existsSync, constants } from 'node:fs'
import { isAbsolute, join, resolve } from 'node:path'
import { homedir } from 'node:os'
import { randomUUID } from 'node:crypto'
import { writeRecord, readRecord } from '../journal.js'
import { inspectAcpRuntime } from './runtime.js'
import { AcpLogin } from './login.js'
import { createWorkspace, verifyWorkspace } from './workspace.js'
import { openAcpTransport, CLIENT_INFO, CLIENT_CAPABILITIES, deadline } from './transport.js'
import { AcpInputError, object, fields, string, uuid, digest, promptContent, modelOption, modelProblem, selectOptions, geminiModel, safeError } from './content.js'

const ACTION_FIELDS = {
  defaults: [], doctor: [], list: [], status: ['id'], connect: [], resume: ['id'],
  prompt: ['id', 'operationId', 'prompt'], cancel: ['id'], permission: ['id', 'requestId', 'optionId'],
  configure: ['id', 'configId', 'value'], disconnect: ['id'],
  'login-start': [], 'login-submit': ['input'], 'login-cancel': [],
}
const marker = value => object(value)
const liveStatuses = new Set(['connecting', 'ready', 'prompting', 'closing'])
const now = () => new Date().toISOString()
const clone = value => structuredClone(value)
function runtimeIdentity(runtime) {
  return { executable: runtime.executable, version: runtime.version, sha256: runtime.sha256,
    platform: runtime.platform, architecture: runtime.architecture, ...(runtime.identity ? { identity: clone(runtime.identity) } : {}) }
}
function privateRoot(path) {
  mkdirSync(path, { recursive: true, mode: 0o700 })
  const stat = lstatSync(path)
  if (!isAbsolute(path) || !stat.isDirectory() || stat.isSymbolicLink() || realpathSync(path) !== path || stat.mode & 0o077 || process.getuid && stat.uid !== process.getuid()) throw new Error('ACP storage must be a private owned physical directory')
  return path
}
function textOf(content) { return content.filter(item => item?.type === 'text').map(item => item.text).join('') }
function displayValue(value, limit = 32 * 1024) {
  const text = JSON.stringify(value)
  return Buffer.byteLength(text) <= limit ? clone(value) : { truncated: true, preview: text.slice(0, limit) }
}
function knownWork(record) {
  return {
    tools: record.tools.filter(tool => ['pending', 'in_progress'].includes(tool.status)).length,
    permissions: record.permissions.length,
    children: record.children.filter(child => ['running', 'requires_action'].includes(child.state?.state)).length,
    unknown: record.children.some(child => !child.state || !['running', 'requires_action', 'idle'].includes(child.state.state)) || record.tools.some(tool => !['pending', 'in_progress', 'completed', 'failed'].includes(tool.status)),
  }
}
function trimHistory(record) {
  // The durable operation files retain exact outbound content. This is a bounded
  // display projection, not a provider transcript or machine completion receipt.
  while (record.messages.length > 200 || Buffer.byteLength(JSON.stringify(record.messages)) > 2 * 1024 * 1024) {
    record.messages.shift(); record.historyTruncated = true
  }
  if (record.tools.length > 60) {
    const retained = record.tools.filter(tool => !['completed', 'failed'].includes(tool.status))
    const count = Math.max(0, 60 - retained.length)
    record.tools = [...(count ? record.tools.filter(tool => ['completed', 'failed'].includes(tool.status)).slice(-count) : []), ...retained]
    record.historyTruncated = true
  }
}

/** Human-controlled ACP sessions. Never used by the public machine adapter. */
export class AcpSessions {
  constructor({ getConfig = () => ({}), stateRoot, services = {} } = {}) {
    this.getConfig = getConfig
    this.root = resolve(stateRoot ?? join(homedir(), '.local', 'state', 'dsh-subagent-antigravity', 'acp'))
    this.services = { inspectRuntime: inspectAcpRuntime, createWorkspace, verifyWorkspace, openTransport: openAcpTransport,
      login: options => new AcpLogin(options), ...services }
    this.records = new Map(); this.live = new Map(); this.logins = new Map(); this.queues = new Map(); this.disposed = false
    this.ownerGeneration = new Map(); this.activeActions = new Map()
  }
  storage() {
    privateRoot(this.root)
    return privateRoot(join(this.root, 'sessions'))
  }
  context(value) {
    fields(value, ['owner', 'workspace'], 'owner context')
    string(value.owner, 'host session owner', 256)
    if (!isAbsolute(string(value.workspace, 'workspace'))) throw new AcpInputError('Workspace must be absolute')
    const workspace = realpathSync(value.workspace)
    if (!lstatSync(workspace).isDirectory()) throw new AcpInputError('Workspace must be a directory')
    return { owner: value.owner, workspace }
  }
  async action(rawContext, input) {
    const context = this.context(rawContext)
    const allowed = ACTION_FIELDS[input?.action]
    if (!allowed || input?.version !== 2) throw new AcpInputError('ACP requires a version 2 human control action')
    fields(input, ['version', 'action', ...allowed])
    // Public in-process callers retain their request object. Capture its exact
    // action, identity and typed content before queuing or yielding control.
    input = clone(input)
    if (this.disposed) throw new Error('The ACP host has been disposed')
    if (input.action === 'defaults') return { protocol: 2, transport: this.getConfig().transport ?? 'acp', command: this.getConfig().command ?? 'agy', workspaceMode: 'isolated-git-worktree' }
    if ((this.getConfig().transport ?? 'acp') !== 'acp') throw new AcpInputError('ACP is disabled by the explicit headless transport setting')
    if (input.action === 'doctor') return { protocol: 2, runtime: runtimeIdentity(await this.inspect(context.workspace)) }
    if (input.action === 'list' || input.action === 'status' && !input.id) return this.list(context)
    if (input.action === 'status') return this.snapshot(this.record(context, input.id))
    // Only control mutations serialize. A prompt returns after durable dispatch,
    // so permission replies and Stop remain available while it is outstanding.
    const key = `${context.owner}\0${input.id ?? (input.action.startsWith('login-') ? 'login' : 'new')}`
    const generation = this.ownerGeneration.get(context.owner) ?? 0
    const ensureActive = () => {
      if (this.disposed || (this.ownerGeneration.get(context.owner) ?? 0) !== generation) throw new AcpInputError('The ACP owner stopped before dispatch; no new operation will start')
    }
    const previous = this.queues.get(key) ?? Promise.resolve()
    const result = previous.catch(() => {}).then(() => { ensureActive(); return this.mutate(context, input, ensureActive) })
    this.queues.set(key, result)
    this.activeActions.set(result, context.owner)
    try { return await result } finally { this.activeActions.delete(result); if (this.queues.get(key) === result) this.queues.delete(key) }
  }
  inspect(cwd, expectedIdentity) {
    return this.services.inspectRuntime({ command: this.getConfig().command ?? 'agy', cwd, ...(expectedIdentity ? { expectedIdentity } : {}) })
  }
  record(context, id) {
    uuid(id)
    const record = this.records.get(id) ?? readRecord(this.storage(), `${id}.json`)
    if (record.protocol !== 2 || record.id !== id || record.owner !== context.owner || record.contextCwd !== context.workspace) throw new AcpInputError('This ACP session does not belong to the current host conversation and workspace')
    if (!this.records.has(id)) {
      // An abandoned connection is never reconstructed from local prose. Its
      // native operation could still be running, even when the host died.
      if (liveStatuses.has(record.status)) {
        record.status = 'unknown'; record.connection = 'disconnected'; record.cleanup = { process: 'unknown', session: 'unknown' }
        record.error = { code: 'UNKNOWN_OUTCOME', message: 'The previous connection ended without a confirmed close. Inspect the original worktree; no prompt will be replayed.' }
        if (record.prompt?.state === 'pending') record.prompt.state = 'unknown'
      }
      record.permissions = []
      this.records.set(id, record)
    }
    return record
  }
  list(context) {
    const sessions = []
    for (const name of readdirSync(this.storage())) {
      if (!/^[0-9a-f-]{36}\.json$/i.test(name)) continue
      const raw = readRecord(this.storage(), name)
      if (raw.owner !== context.owner || raw.contextCwd !== context.workspace) continue
      const record = this.record(context, raw.id)
      sessions.push(this.snapshot(record, true))
    }
    sessions.sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    const login = this.loginSnapshot(context)
    return { protocol: 2, sessions: sessions.slice(0, 100), ...(login ? { login } : {}) }
  }
  snapshot(record, summary = false) {
    const result = clone(record)
    delete result.contextCwd; delete result.workspace; delete result.operations; delete result.locked
    result.knownWork = knownWork(record)
    result.modelProblem = modelProblem(record.configOptions)
    result.canPrompt = record.status === 'ready' && record.connection === 'connected' && record.prompt?.state !== 'unknown' && !result.modelProblem && !result.knownWork.tools && !result.knownWork.permissions && !result.knownWork.children && !result.knownWork.unknown
    if (summary) for (const key of ['messages', 'tools', 'children', 'permissions', 'plan', 'capabilities', 'authMethods', 'availableCommands']) delete result[key]
    return result
  }
  persist(record) {
    record.revision++; record.updatedAt = now(); trimHistory(record)
    writeRecord(this.storage(), `${record.id}.json`, record)
  }
  change(record) {
    // State is reduced synchronously, before any await, preserving wire order.
    // Persist each update so a poll cursor never points beyond durable history.
    try { this.persist(record) } catch (error) { this.fail(record, error) }
  }
  claim(record) {
    this.profileGate(() => {
      if (existsSync(join(this.storage(), '.login.lock'))) throw new AcpInputError('A native login is active or unresolved. Finish it before opening another ACP connection.')
      const fd = openSync(join(this.storage(), `${record.id}.lock`), constants.O_CREAT | constants.O_EXCL | constants.O_WRONLY | constants.O_NOFOLLOW, 0o600)
      try { writeFileSync(fd, JSON.stringify({ id: record.id, owner: record.owner, pid: process.pid, createdAt: now() })); fsyncSync(fd) } finally { closeSync(fd) }
      record.locked = true
    })
  }
  profileGate(operation) {
    const path = join(this.storage(), '.profile-gate')
    let fd
    try { fd = openSync(path, constants.O_CREAT | constants.O_EXCL | constants.O_WRONLY | constants.O_NOFOLLOW, 0o600) }
    catch (error) { if (error.code === 'EEXIST') throw new AcpInputError('Another ACP controller is preparing a connection or native login; retry only after it has finished.'); throw error }
    try { return operation() } finally { closeSync(fd); unlinkSync(path) }
  }
  release(record) {
    if (!record.locked) return
    unlinkSync(join(this.storage(), `${record.id}.lock`)); record.locked = false
  }
  async mutate(context, input, ensureActive) {
    if (input.action.startsWith('login-')) return this.loginAction(context, input, ensureActive)
    if (input.action === 'connect') {
      const runtime = await this.inspect(context.workspace)
      ensureActive()
      const id = randomUUID()
      const workspace = await this.services.createWorkspace({ sourceCwd: context.workspace, stateRoot: this.root, id, owner: context.owner })
      const record = { protocol: 2, transport: 'official-cli-acp', id, owner: context.owner, contextCwd: context.workspace,
        workspace, sourceCwd: workspace.sourceCwd, cwd: workspace.cwd, branch: workspace.branch, baseCommit: workspace.sourceCommit,
        createdAt: now(), updatedAt: now(), revision: 0, status: 'connecting', connection: 'disconnected', runtime: runtimeIdentity(runtime),
        configOptions: [], capabilities: {}, authMethods: [], messages: [], tools: [], children: [], permissions: [], plan: [], operations: {},
        cleanup: { process: 'exited', session: 'closed' } }
      this.records.set(id, record)
      try { ensureActive() } catch (error) {
        record.status = 'disconnected'; record.error = { code: 'NOT_DISPATCHED', message: error.message }; this.persist(record)
        return this.snapshot(record)
      }
      try { this.claim(record) } catch (error) {
        record.status = 'disconnected'; record.error = { code: 'NOT_DISPATCHED', message: safeError(error).message }; this.persist(record)
        return this.snapshot(record)
      }
      this.persist(record)
      return this.connect(record, runtime, false, ensureActive)
    }
    const record = this.record(context, input.id)
    if (input.action === 'resume') {
      if (!['disconnected', 'auth-required'].includes(record.status) || record.prompt?.state === 'unknown' || this.live.has(record.id)) throw new AcpInputError('Only a confirmed disconnected session can resume; unknown work is never replayed')
      await this.services.verifyWorkspace(record.workspace)
      ensureActive()
      const runtime = await this.inspect(record.cwd, record.runtime.identity ?? record.runtime)
      ensureActive()
      if (digest(runtimeIdentity(runtime)) !== digest(record.runtime)) throw new AcpInputError('Runtime identity changed; this session cannot silently switch executables or versions')
      this.claim(record); record.status = 'connecting'; delete record.error; this.persist(record)
      return this.connect(record, runtime, Boolean(record.sessionId), ensureActive)
    }
    const live = this.live.get(record.id)
    if (!live) throw new AcpInputError('This ACP session has no live connection')
    if (input.action === 'prompt') return this.prompt(record, live, input, ensureActive)
    if (input.action === 'cancel') {
      this.cancelPermissions(record, live)
      record.cancelRequested = true; this.persist(record)
      if (record.sessionId) await live.transport.notify('session/cancel', { sessionId: record.sessionId })
      return this.snapshot(record)
    }
    if (input.action === 'permission') {
      string(input.requestId, 'permission request ID', 256)
      const pending = live.permissions.get(input.requestId)
      if (!pending) throw new AcpInputError('Permission request is expired or belongs to another session')
      if (input.optionId != null && !pending.options.some(option => option.optionId === input.optionId)) throw new AcpInputError('Select an option actually offered by the official agent')
      record.permissions = record.permissions.filter(item => item.requestId !== input.requestId)
      record.permissionDecisions = [...(record.permissionDecisions ?? []), { requestId: input.requestId, optionId: input.optionId ?? null, at: now() }].slice(-100)
      this.persist(record)
      live.permissions.delete(input.requestId)
      pending.resolve({ outcome: input.optionId == null ? { outcome: 'cancelled' } : { outcome: 'selected', optionId: input.optionId } })
      return this.snapshot(record)
    }
    if (input.action === 'configure') return this.configure(record, live, input)
    if (input.action === 'disconnect') return this.disconnect(record, live)
    throw new AcpInputError('Unsupported ACP action')
  }
  async connect(record, runtime, resume, ensureActive) {
    const live = { transport: null, permissions: new Map(), configRevision: 0, replaying: false, closing: false, failed: false }
    this.live.set(record.id, live)
    try {
      ensureActive()
      live.transport = this.services.openTransport(runtime, record.cwd, {
        onUpdate: notification => { try { this.update(record, live, notification) } catch (error) { this.fail(record, error) } },
        onPermission: params => {
          try { return this.permissionRequest(record, live, params) }
          catch (error) { this.fail(record, error); return { outcome: { outcome: 'cancelled' } } }
        },
        onClose: result => { if (!live.closing && this.live.get(record.id) === live) this.fail(record, new Error('ACP connection closed without a confirmed session close'), result) },
      })
      record.cleanup = { process: 'running', session: 'unknown' }; record.connection = 'connected'
      record.runtimeProcess = { pid: live.transport.pid ?? null, processGroupId: live.transport.pid ?? null, startedAt: now() }
      this.persist(record)
      const initialized = await deadline(live.transport.request('initialize', { protocolVersion: 1, clientInfo: CLIENT_INFO, clientCapabilities: CLIENT_CAPABILITIES }), 15000, 'ACP initialize')
      ensureActive()
      if (live.closing || live.failed) return this.snapshot(record)
      if (initialized.protocolVersion !== 1) throw new Error('The runtime did not negotiate ACP v1')
      if (initialized.agentInfo?.version !== runtime.version) throw new Error('ACP agent version does not match the verified official executable')
      record.agentInfo = initialized.agentInfo; record.capabilities = initialized.agentCapabilities ?? {}; record.authMethods = initialized.authMethods ?? []
      let response
      live.creating = true
      if (resume) {
        if (marker(record.capabilities.sessionCapabilities?.resume)) {
          response = await deadline(live.transport.request('session/resume', { sessionId: record.sessionId, cwd: record.cwd, mcpServers: [] }), 30000, 'ACP resume')
        } else if (record.capabilities.loadSession === true) {
          live.replaying = true; record.messages = []; record.tools = []; record.children = []; record.plan = []
          response = await deadline(live.transport.request('session/load', { sessionId: record.sessionId, cwd: record.cwd, mcpServers: [] }), 30000, 'ACP load')
          live.replaying = false
        } else throw new AcpInputError('The runtime does not support exact session resume or load')
      } else {
        response = await deadline(live.transport.request('session/new', { cwd: record.cwd, mcpServers: [] }), 30000, 'ACP session creation')
        record.sessionId = string(response.sessionId, 'native session ID', 2048)
      }
      live.creating = false
      ensureActive()
      if (live.closing || live.failed) return this.snapshot(record)
      record.configOptions = response.configOptions ?? []; record.modes = response.modes ?? null
      for (const update of live.earlyUpdates ?? []) this.update(record, live, update)
      live.earlyUpdates = []
      if (live.failed) throw new Error('ACP session could not be established')
      record.status = 'ready'; record.cleanup.session = 'open'; delete record.error
      this.persist(record)
    } catch (error) {
      if (live.closing) return this.snapshot(record)
      if (error.code === -32000) {
        live.closing = true
        const cleanup = await live.transport?.stop(this.getConfig().disposeGraceMs ?? 2000)
        record.status = 'auth-required'; record.connection = 'disconnected'; record.cleanup = { process: cleanup?.exited ? 'exited' : 'unknown', session: 'closed' }; record.error = safeError(error)
        this.live.delete(record.id)
        if (cleanup?.exited) this.release(record)
        this.persist(record)
      } else {
        this.fail(record, error)
        await live.transport?.stop(this.getConfig().disposeGraceMs ?? 2000)
      }
    }
    return this.snapshot(record)
  }
  accepts(record, sessionId) { return sessionId === record.sessionId || record.children.some(child => child.sessionId === sessionId) }
  update(record, live, { sessionId, update }) {
    if (this.live.get(record.id) !== live || live.failed || !object(update)) return
    // session/new may emit root config/history before its response contains the
    // ID. Queue that traffic and replay it only after the ID is established.
    if (!record.sessionId) {
      if ((live.earlyUpdates ??= []).length >= 100 || Buffer.byteLength(JSON.stringify(update)) > 256 * 1024) { this.fail(record, new Error('Excessive traffic before ACP session identity')); return }
      live.earlyUpdates.push({ sessionId, update }); return
    }
    if (!this.accepts(record, sessionId)) { this.fail(record, new Error('ACP traffic named an unannounced session')); return }
    const root = sessionId === record.sessionId
    switch (update.sessionUpdate) {
      case 'agent_message_chunk': case 'agent_thought_chunk': case 'user_message_chunk': {
        if (update.sessionUpdate === 'user_message_chunk' && !live.replaying) break
        const role = update.sessionUpdate === 'user_message_chunk' ? 'user' : update.sessionUpdate === 'agent_thought_chunk' ? 'thought' : 'assistant'
        const messageId = update.messageId ?? live.chunkMessage?.[`${sessionId}:${role}`] ?? randomUUID()
        live.chunkMessage ??= {}; live.chunkMessage[`${sessionId}:${role}`] = messageId
        let message = record.messages.find(item => item.id === messageId && item.sessionId === sessionId && item.role === role)
        if (!message) { message = { id: messageId, sessionId, role, content: [], text: '' }; record.messages.push(message) }
        this.appendContent(message, update.content)
        break
      }
      case 'tool_call': case 'tool_call_update': {
        let tool = record.tools.find(item => item.toolCallId === update.toolCallId && item.sessionId === sessionId)
        if (!tool && record.tools.filter(item => !['completed', 'failed'].includes(item.status)).length >= 64) { this.fail(record, new Error('Too many unresolved native tools')); return }
        if (!tool) { tool = { sessionId, toolCallId: update.toolCallId }; record.tools.push(tool) }
        for (const key of ['title', 'kind', 'status']) if (Object.hasOwn(update, key)) tool[key] = update[key] == null ? null : String(update[key]).slice(0, 8192)
        for (const key of ['locations', 'rawInput', 'rawOutput']) if (Object.hasOwn(update, key)) tool[key] = displayValue(update[key])
        if (Object.hasOwn(update, 'content')) {
          const value = displayValue(update.content, 64 * 1024)
          tool.content = Array.isArray(value) || value === null ? value : [{ type: 'content', content: { type: 'text', text: '[Display truncated]\n' + value.preview } }]
          if (value?.truncated) tool.displayTruncated = true
        }
        live.chunkMessage = {}
        break
      }
      case 'subagent_update': {
        const id = string(update.sessionId, 'child session ID', 2048)
        if (id === record.sessionId || id === sessionId) { this.fail(record, new Error('Invalid ACP child ownership')); return }
        let child = record.children.find(item => item.sessionId === id)
        if (child && child.parentSessionId !== sessionId || record.children.length >= 128 && !child) { this.fail(record, new Error('Conflicting or excessive ACP child sessions')); return }
        if (!child) { child = { sessionId: id, parentSessionId: sessionId }; record.children.push(child) }
        for (const key of ['title', 'description', 'state', 'capabilities', 'cwd', 'additionalDirectories']) if (Object.hasOwn(update, key)) child[key] = clone(update[key])
        break
      }
      case 'session_message': case 'session_message_chunk': {
        let message = record.messages.find(item => item.id === update.messageId && item.sessionId === sessionId && item.role === 'agent-message')
        if (!message) { message = { id: update.messageId, sessionId, role: 'agent-message', content: [], text: '' }; record.messages.push(message) }
        for (const key of ['senderSessionId', 'recipientSessionId']) if (update[key] && !this.accepts(record, update[key])) { this.fail(record, new Error('Message referenced an unannounced child')); return }
        if (update.sessionUpdate === 'session_message_chunk') this.appendContent(message, update.content)
        else {
          for (const key of ['senderSessionId', 'recipientSessionId', 'senderMessageId', 'recipientMessageId']) if (Object.hasOwn(update, key)) message[key] = update[key]
          if (Object.hasOwn(update, 'content')) { message.content = clone(update.content ?? []); message.text = textOf(message.content) }
        }
        break
      }
      case 'config_option_update': if (root) { record.configOptions = clone(update.configOptions); live.configRevision++ } break
      case 'current_mode_update': if (root) { record.modes = { ...record.modes, currentModeId: update.currentModeId }; live.modeRevision = (live.modeRevision ?? 0) + 1 } break
      case 'available_commands_update': if (root) record.availableCommands = clone(update.availableCommands); break
      case 'plan': if (root) record.plan = clone(update.entries); break
      case 'usage_update': if (root) record.usage = clone(update); break
      case 'session_info_update': if (root && update.title != null) record.title = String(update.title).slice(0, 512); break
      default: break // Unknown extensions never establish completion or authority.
    }
    this.change(record)
  }
  appendContent(message, content) {
    if (!object(content)) return
    const last = message.content.at(-1)
    if (content.type === 'text' && last?.type === 'text') last.text += content.text
    else message.content.push(clone(content))
    message.text = textOf(message.content)
    if (message.text.length > 512 * 1024) {
      message.content = [{ type: 'text', text: message.text.slice(-512 * 1024) }]; message.text = message.content[0].text; message.truncated = true
    }
  }
  permissionRequest(record, live, params) {
    if (live.failed || live.closing || !this.accepts(record, params.sessionId)) return { outcome: { outcome: 'cancelled' } }
    if (Buffer.byteLength(JSON.stringify(params)) > 256 * 1024) { this.fail(record, new Error('ACP permission is too large to display and approve faithfully')); return { outcome: { outcome: 'cancelled' } } }
    if (live.permissions.size >= 32) { this.fail(record, new Error('Too many pending ACP permissions')); return { outcome: { outcome: 'cancelled' } } }
    const requestId = randomUUID()
    return new Promise(resolvePermission => {
      live.permissions.set(requestId, { resolve: resolvePermission, options: params.options })
      record.permissions.push({ requestId, sessionId: params.sessionId, toolCall: clone(params.toolCall), options: clone(params.options) })
      this.change(record)
    })
  }
  cancelPermissions(record, live) {
    for (const pending of live.permissions.values()) pending.resolve({ outcome: { outcome: 'cancelled' } })
    live.permissions.clear(); record.permissions = []
  }
  async prompt(record, live, input, ensureActive) {
    const operationId = uuid(input.operationId, 'operation ID')
    const content = promptContent(input.prompt, record.capabilities.promptCapabilities)
    const fingerprint = digest(content)
    const operationFile = `${record.id}.${operationId}.json`
    let previous
    try { previous = readRecord(this.storage(), operationFile) } catch (error) { if (error.code !== 'ENOENT') throw error }
    if (previous) {
      if (previous.digest !== fingerprint || previous.id !== record.id || previous.owner !== record.owner) throw new AcpInputError('An operation ID cannot be reused with different content')
      return this.snapshot(record)
    }
    if (!this.snapshot(record).canPrompt) throw new AcpInputError(modelProblem(record.configOptions) ?? 'Wait for the outstanding native work or close the session before another prompt')
    await this.services.verifyWorkspace(record.workspace)
    ensureActive()
    await this.inspect(record.cwd, record.runtime.identity ?? record.runtime)
    ensureActive()
    if (this.live.get(record.id) !== live || live.closing || live.failed) throw new AcpInputError('The native connection stopped before prompt dispatch')
    const operation = { protocol: 2, id: record.id, owner: record.owner, operationId, digest: fingerprint, prompt: content, state: 'pending', createdAt: now() }
    // Commit exact typed bytes before invoking the transport. A crash between
    // this write and send remains unknown; neither retries nor restarts replay.
    writeRecord(this.storage(), operationFile, operation)
    record.operations[operationId] = fingerprint
    record.prompt = { operationId, state: 'pending' }; record.status = 'prompting'; record.cancelRequested = false
    live.chunkMessage = {}
    record.messages.push({ id: operationId, sessionId: record.sessionId, role: 'user', content: clone(content), text: textOf(content) })
    this.persist(record)
    live.pending = live.transport.request('session/prompt', { sessionId: record.sessionId, prompt: content }).then(response => {
      if (live.failed || this.live.get(record.id) !== live) return
      if (!['end_turn', 'max_tokens', 'max_turn_requests', 'refusal', 'cancelled'].includes(response.stopReason)) throw new Error('Unrecognized prompt stop reason')
      operation.state = response.stopReason === 'cancelled' ? 'cancelled' : 'completed'; operation.stopReason = response.stopReason; operation.completedAt = now()
      writeRecord(this.storage(), operationFile, operation)
      record.prompt = { operationId, state: operation.state, stopReason: response.stopReason }
      if (!live.closing) record.status = 'ready'
      live.chunkMessage = {}; this.persist(record)
    }).catch(error => {
      operation.state = 'unknown'; operation.error = safeError(error)
      try { writeRecord(this.storage(), operationFile, operation) } catch {}
      this.fail(record, error)
    })
    return this.snapshot(record)
  }
  async configure(record, live, input) {
    const work = knownWork(record)
    if (record.status !== 'ready' || record.prompt?.state === 'pending' || work.tools || work.permissions || work.children || work.unknown) throw new AcpInputError('Configuration can change only between settled native turns')
    string(input.configId, 'configuration ID', 256)
    const option = record.configOptions.find(item => item.id === input.configId)
    if (!option && input.configId === 'mode' && record.modes?.availableModes?.some(mode => mode.id === input.value)) {
      const revision = live.modeRevision ?? 0
      try { await deadline(live.transport.request('session/set_mode', { sessionId: record.sessionId, modeId: input.value }), 15000, 'ACP mode') }
      catch (error) { this.fail(record, error); return this.snapshot(record) }
      if ((live.modeRevision ?? 0) === revision) record.modes.currentModeId = input.value
      this.persist(record)
      return this.snapshot(record)
    }
    if (!option) throw new AcpInputError('The official runtime did not advertise this configuration option')
    if (option.type === 'boolean') { if (typeof input.value !== 'boolean') throw new AcpInputError('This configuration requires a boolean') }
    else if (!selectOptions(option).some(item => item.value === input.value)) throw new AcpInputError('The official runtime did not advertise this configuration value')
    if (option === modelOption(record.configOptions) && !geminiModel(input.value)) throw new AcpInputError('Personal ACP supports Gemini models only')
    const revision = live.configRevision
    let response
    try { response = await deadline(live.transport.request('session/set_config_option', { sessionId: record.sessionId, configId: input.configId, value: input.value, ...(option.type === 'boolean' ? { type: 'boolean' } : {}) }), 15000, 'ACP configuration') }
    catch (error) { this.fail(record, error); return this.snapshot(record) }
    if (live.configRevision === revision) record.configOptions = clone(response.configOptions)
    this.persist(record)
    return this.snapshot(record)
  }
  async disconnect(record, live) {
    live.closing = true; record.status = 'closing'; this.cancelPermissions(record, live); this.persist(record)
    let closed = false, error
    try {
      if (record.sessionId) {
        await live.transport.notify('session/cancel', { sessionId: record.sessionId })
        if (marker(record.capabilities.sessionCapabilities?.close)) {
          await deadline(live.transport.request('session/close', { sessionId: record.sessionId }), 10000, 'ACP close')
          closed = true
        }
      } else closed = !live.creating
    } catch (cause) { error = cause }
    const cleanup = await live.transport.stop(this.getConfig().disposeGraceMs ?? 2000)
    if (live.pending) await live.pending.catch(() => {})
    this.live.delete(record.id)
    const unresolved = record.prompt?.state === 'pending' || record.prompt?.state === 'unknown'
    record.connection = 'disconnected'; record.cleanup = { process: cleanup.exited ? 'exited' : 'unknown', session: closed ? 'closed' : 'unknown' }
    record.status = closed && cleanup.exited && !unresolved ? 'disconnected' : 'unknown'
    if (unresolved && record.prompt) record.prompt.state = 'unknown'
    if (record.status === 'disconnected') { this.release(record); delete record.error }
    else record.error = safeError(error ?? new Error('The session or an outstanding prompt did not close conclusively; inspect the original worktree and do not replay it'))
    this.persist(record)
    return this.snapshot(record)
  }
  fail(record, error, processState) {
    const live = this.live.get(record.id)
    if (live?.failed) return
    if (live) { live.failed = true; this.cancelPermissions(record, live) }
    record.status = 'unknown'; record.connection = 'disconnected'; record.error = safeError(error)
    record.cleanup = { process: processState?.exited ? 'exited' : 'unknown', session: 'unknown' }
    if (record.prompt?.state === 'pending') record.prompt.state = 'unknown'
    try { this.persist(record) } catch { /* preserve the existing dispatch record and lock */ }
    if (live?.transport) void live.transport.stop(this.getConfig().disposeGraceMs ?? 2000).then(result => {
      record.cleanup.process = result.exited ? 'exited' : 'unknown'
      this.live.delete(record.id)
      try { this.persist(record) } catch {}
    }).catch(() => {})
  }
  loginSnapshot(context) {
    const entry = this.logins.get(context.owner)
    if (!entry || entry.workspace !== context.workspace) return null
    const snapshot = entry.login.snapshot()
    return { ...snapshot, status: snapshot.status ?? snapshot.state, url: snapshot.url ?? snapshot.authUrl }
  }
  async loginAction(context, input, ensureActive) {
    let entry = this.logins.get(context.owner)
    if (input.action === 'login-start') {
      if (this.live.size || [...this.logins.values()].some(item => !['idle', 'succeeded', 'failed', 'cancelled'].includes(item.login.snapshot().state))) throw new AcpInputError('Close active ACP sessions and the current login helper before changing native authentication')
      const runtime = await this.inspect(context.workspace)
      ensureActive()
      const path = join(this.storage(), '.login.lock')
      this.profileGate(() => {
        if (readdirSync(this.storage()).some(name => /^[0-9a-f-]{36}\.lock$/i.test(name))) throw new AcpInputError('An ACP session is active or has unresolved cleanup. Close it before changing native authentication; inspect unknown sessions in their original worktrees.')
        const fd = openSync(path, constants.O_CREAT | constants.O_EXCL | constants.O_WRONLY | constants.O_NOFOLLOW, 0o600)
        try { writeFileSync(fd, JSON.stringify({ owner: context.owner, pid: process.pid, createdAt: now() })); fsyncSync(fd) } finally { closeSync(fd) }
      })
      let released = false
      const onUpdate = snapshot => {
        if (!released && ['succeeded', 'failed', 'cancelled'].includes(snapshot.state) && snapshot.cleanupConfirmed === true) { unlinkSync(path); released = true }
      }
      try { entry = { workspace: context.workspace, login: this.services.login({ runtime, cwd: context.workspace, onUpdate }) } }
      catch (error) { unlinkSync(path); throw error }
      this.logins.set(context.owner, entry)
      try { await entry.login.start(); onUpdate(entry.login.snapshot()) }
      catch (error) { await entry.login.cancel(); onUpdate(entry.login.snapshot()); throw error }
    } else {
      if (!entry || entry.workspace !== context.workspace) throw new AcpInputError('No native login helper belongs to this conversation')
      if (input.action === 'login-submit') { string(input.input, 'native login response', 16384); await entry.login.submit(input.input) }
      else await entry.login.cancel()
    }
    return { protocol: 2, login: this.loginSnapshot(context) }
  }
  isActive(owner) {
    // Archive checks also run before any view has loaded. Existing durable locks
    // remain activity evidence after restart; a read never steals or clears them.
    const directory = join(this.root, 'sessions')
    if (existsSync(directory)) {
      for (const name of readdirSync(directory)) {
        if (name === '.login.lock') {
          if (readRecord(directory, name).owner === owner) return true
        } else if (/^[0-9a-f-]{36}\.lock$/i.test(name)) {
          if (readRecord(directory, name).owner === owner) return true
        }
      }
    }
    return [...this.activeActions.values()].includes(owner) || [...this.live.keys()].some(id => this.records.get(id)?.owner === owner) ||
      [...this.records.values()].some(record => record.owner === owner && record.status === 'unknown' && (record.cleanup.session !== 'closed' || record.cleanup.process !== 'exited')) ||
      this.logins.has(owner) && (!['succeeded', 'failed', 'cancelled'].includes(this.logins.get(owner).login.snapshot().state) || this.logins.get(owner).login.snapshot().cleanupConfirmed !== true)
  }
  async stopOwner(owner) {
    this.ownerGeneration.set(owner, (this.ownerGeneration.get(owner) ?? 0) + 1)
    await Promise.all([...this.live.entries()].filter(([id]) => this.records.get(id)?.owner === owner).map(([id, live]) => this.disconnect(this.records.get(id), live)))
    await this.logins.get(owner)?.login.cancel()
    await Promise.allSettled([...this.activeActions.entries()].filter(([, value]) => value === owner).map(([promise]) => promise))
  }
  async dispose() {
    if (this.disposed) return
    this.disposed = true
    await Promise.allSettled([...this.live.entries()].map(([id, live]) => this.disconnect(this.records.get(id), live)))
    await Promise.allSettled([...this.logins.values()].map(entry => entry.login.cancel()))
    await Promise.allSettled([...this.activeActions.keys()])
  }
}
