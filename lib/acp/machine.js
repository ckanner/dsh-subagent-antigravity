import { inspectSubscription, redact } from '../environment.js'
import { schemaValidator } from '../input.js'
import { prepareEvidenceAgent } from '../evidence-agent.js'
import { writeRecord } from '../journal.js'
import { observeChildren, promptFor } from '../native.js'
import { baseReceipt } from '../runner.js'
import { claimSession, sessionBinding } from '../sessions.js'
import { modelOption, selectOptions } from './content.js'
import { inspectAcpRuntime } from './runtime.js'
import { CLIENT_CAPABILITIES, CLIENT_INFO, deadline, openAcpTransport } from './transport.js'

function classifyAcpError(error) {
  const message = String(error?.message ?? error ?? '')
  if (/auth|sign.?in|log.?in/i.test(message) || error?.code === -32000) return 'auth'
  if (/quota|exhaust/i.test(message)) return 'quota'
  if (/rate.limit|too many requests/i.test(message)) return 'rate-limit'
  if (/model.*invalid|invalid.*model|absent/i.test(message)) return 'invalid-request'
  return 'product-error'
}

function parseStructuredOutput(text) {
  const trimmed = String(text ?? '').trim()
  if (!trimmed) return { ok: false, value: null }
  try {
    return { ok: true, value: JSON.parse(trimmed) }
  } catch {
    const fenced = /```(?:json)?\s*\n([\s\S]*?)\n```/i.exec(trimmed)
    if (fenced) {
      try { return { ok: true, value: JSON.parse(fenced[1].trim()) } } catch {}
    }
    return { ok: false, value: null }
  }
}

function resolveModelSelection(configOptions, requestedModel, requestedEffort) {
  const mOpt = modelOption(configOptions)
  if (!mOpt) return { modelOpt: null, targetModel: requestedModel, effortOpt: null, targetEffort: null }
  const choices = selectOptions(mOpt).map(item => item.value)
  const effortOpt = (configOptions ?? []).find(opt =>
    opt !== mOpt && opt.type === 'select' && (opt.category === 'effort' || opt.category === 'thinking' || /^(?:effort|thinking|reasoning)$/i.test(opt.id ?? ''))
  ) ?? null
  if (choices.includes(requestedModel)) {
    return { modelOpt: mOpt, targetModel: requestedModel, effortOpt, targetEffort: null }
  }
  const baseSlug = requestedModel.replace(/-(?:low|medium|high|xhigh)$/, '')
  if (baseSlug !== requestedModel && choices.includes(baseSlug)) {
    const effortChoices = effortOpt ? selectOptions(effortOpt).map(item => item.value) : []
    const targetEffort = requestedEffort && effortChoices.includes(requestedEffort) ? requestedEffort : null
    return { modelOpt: mOpt, targetModel: baseSlug, effortOpt, targetEffort }
  }
  if (choices.length > 0) {
    throw new Error(`requested model ${requestedModel} is absent from the ACP runtime model options`)
  }
  return { modelOpt: mOpt, targetModel: requestedModel, effortOpt, targetEffort: null }
}

function parseAcpUsage(update, current) {
  const raw = update?.usage ?? update
  if (!raw || typeof raw !== 'object') return current
  const map = [
    ['inputTokens', ['inputTokens', 'input_tokens', 'promptTokens', 'prompt_tokens']],
    ['outputTokens', ['outputTokens', 'output_tokens', 'completionTokens', 'completion_tokens']],
    ['thinkingTokens', ['thoughtTokens', 'thinkingTokens', 'thinking_tokens', 'reasoningTokens', 'reasoning_tokens']],
    ['cacheReadTokens', ['cachedReadTokens', 'cacheReadTokens', 'cache_read_tokens', 'cachedTokens', 'cached_tokens']],
    ['totalTokens', ['totalTokens', 'total_tokens']],
  ]
  const next = { ...current, scope: 'conversation', cacheCreationTokens: null }
  for (const [target, sources] of map) {
    for (const key of sources) {
      if (Number.isSafeInteger(raw[key]) && raw[key] >= 0) {
        next[target] = raw[key]
        break
      }
    }
  }
  const observed = ['inputTokens', 'outputTokens', 'thinkingTokens', 'cacheReadTokens', 'totalTokens'].filter(k => next[k] !== null).length
  next.status = observed === 5 ? 'complete' : observed > 0 ? 'partial' : 'unknown'
  return next
}

/**
 * Unattended official `agy acp` machine turn with full receipt, lifecycle,
 * image blocks, schema validation, and POSIX process-group cleanup.
 */
export async function runLocalAcp(request, runtime, runId, emit) {
  const receipt = baseReceipt(request, runId)
  const signal = runtime.signal
  const started = Date.now()
  const validate = request.outputSchema ? schemaValidator(request.outputSchema) : null
  const fail = (stage, category, detail) => {
    receipt.failure ??= { stage, category, detail: redact(String(detail ?? 'unknown error')) }
  }
  if (process.platform === 'win32') {
    fail('start', 'unsupported-runtime', 'process-group supervision currently supports macOS/Linux')
    return receipt
  }
  if (signal?.aborted) {
    receipt.execution.cancelled = true
    fail('start', 'cancelled', 'cancelled before dispatch')
    return receipt
  }

  let acpRuntime, subscription, lease, evidenceAgent, binding
  try {
    subscription = inspectSubscription(runtime.env, request)
    acpRuntime = await inspectAcpRuntime({ command: request.command, env: runtime.env, cwd: request.cwd })
    if (inspectSubscription(runtime.env, request).fingerprint !== subscription.fingerprint) {
      throw new Error('native settings changed during preflight')
    }
    receipt.configuration.fingerprint = subscription.fingerprint
    receipt.subscription = { ...receipt.subscription, ...subscription, configFingerprint: subscription.fingerprint }
    binding = sessionBinding(request, subscription.fingerprint)
    if (request.sessionMode === 'resume') {
      lease = claimSession(runtime.env, request.sessionId, binding, runId, { resume: true })
    }
    if (request.toolPolicy === 'evidence-only') {
      evidenceAgent = prepareEvidenceAgent(request.cwd, runId)
      const { name, path, digest, ownerRunId } = evidenceAgent
      receipt.native.managedAgent = { name, path, digest, ownerRunId, cleanup: 'unknown' }
      if (runtime.recoveryDirectory) writeRecord(runtime.recoveryDirectory, 'managed-agent.json', receipt.native.managedAgent)
    }
    await emit('dispatch-intent', receipt)
  } catch (error) {
    fail('configuration', 'invalid-request', error.message)
  }

  if (signal?.aborted || (request.timeoutMs > 0 && Date.now() - started >= request.timeoutMs)) {
    receipt.execution.cancelled = Boolean(signal?.aborted)
    receipt.execution.timedOut = !signal?.aborted
    fail('start', signal?.aborted ? 'cancelled' : 'timeout', 'stopped during preflight')
  }
  if (receipt.failure) {
    try {
      lease?.finish(receipt)
      evidenceAgent?.dispose()
      if (evidenceAgent) receipt.native.managedAgent.cleanup = 'confirmed'
    } catch (error) {
      fail('cleanup', 'cleanup-unconfirmed', error.message)
      receipt.cleanup.confirmed = false
    }
    return receipt
  }

  const targetCwd = evidenceAgent?.cwd ?? request.cwd
  const args = []
  if (request.permissionMode === 'always-proceed') args.push('--dangerously-skip-permissions')
  if (request.sandbox) args.push('--sandbox')
  if (evidenceAgent) args.push('--agent', evidenceAgent.name)

  let outputText = ''
  let outputBytes = 0
  let activitySequence = 0
  let promptSent = false
  let protocolFailed = false
  let permissionDenied = false
  let transportClosedUnexpectedly = false
  let sessionId = null
  let sessionCapabilities = {}
  let configOptions = []
  let modes = null
  const observedChildren = []
  let transport
  let sessionClosedCleanly = false

  const stopTransport = async (graceful = false) => {
    if (!transport) return { exited: true, exit: { code: null, signal: null } }
    return transport.stop(request.disposeGraceMs, { graceful })
  }

  const onPermission = params => {
    if (request.toolPolicy === 'evidence-only') {
      protocolFailed = true
      fail('run', 'protocol', 'native evidence-only agent requested a tool permission')
      void stopTransport()
      return { outcome: { outcome: 'cancelled' } }
    }
    if (request.permissionMode === 'always-proceed') {
      const options = Array.isArray(params?.options) ? params.options : []
      const allow = options.find(opt => opt.kind === 'allow_once' || opt.kind === 'allow_always')
      if (allow?.optionId) return { outcome: { outcome: 'selected', optionId: allow.optionId } }
      return { outcome: { outcome: 'cancelled' } }
    }
    permissionDenied = true
    return { outcome: { outcome: 'cancelled' } }
  }

  const onUpdate = params => {
    if (protocolFailed || !params || typeof params !== 'object') return
    const update = params.update
    if (!update || typeof update !== 'object') return
    const kind = String(update.sessionUpdate ?? 'unknown')
    const isChild = Boolean(params.sessionId && sessionId && params.sessionId !== sessionId) || kind === 'subagent_update'
    if (request.toolPolicy === 'evidence-only' && (kind === 'tool_call' || kind === 'tool_call_update' || kind === 'subagent_update')) {
      protocolFailed = true
      fail('run', 'protocol', 'native evidence-only agent emitted a tool or subagent step')
      void stopTransport()
      return
    }
    if (kind === 'config_option_update' && Array.isArray(update.configOptions)) {
      configOptions = update.configOptions
    } else if (kind === 'current_mode_update' && typeof update.currentModeId === 'string') {
      if (modes) modes = { ...modes, currentModeId: update.currentModeId }
    } else if (kind === 'usage_update') {
      receipt.usage = parseAcpUsage(update, receipt.usage)
    } else if (kind === 'subagent_update' && typeof update.sessionId === 'string') {
      const cid = update.sessionId.toLowerCase()
      if (!observedChildren.some(item => item.id === cid)) {
        observedChildren.push({ id: cid, kind: update.kind ?? null, role: update.role ?? null, state: 'unknown', model: null, logUri: null, workspaceUris: [] })
      }
      observeChildren(receipt.native, observedChildren, false)
      if (receipt.native.limit.exceeded) {
        fail('run', 'observed-agent-limit', 'observed unique child count exceeded native.maxObservedAgents; this is not a native concurrency cap')
        void stopTransport()
        return
      }
    } else if (kind === 'agent_message_chunk' && update.content?.type === 'text' && typeof update.content.text === 'string') {
      if (promptSent) receipt.execution.turnDispatch = 'accepted'
      const chunk = update.content.text
      const chunkBytes = Buffer.byteLength(chunk)
      if (outputBytes + chunkBytes > request.maxOutputBytes) {
        protocolFailed = true
        receipt.execution.truncated = true
        fail('run', 'protocol', 'retained result exceeds maxOutputBytes')
        void stopTransport()
        return
      }
      outputText += chunk
      outputBytes += chunkBytes
      try { runtime.onProgress?.(chunk) } catch {}
    } else if (kind === 'tool_call' || kind === 'tool_call_update') {
      if (promptSent) receipt.execution.turnDispatch = 'accepted'
    }
    try {
      runtime.onActivity?.({
        version: 1,
        sequence: ++activitySequence,
        kind: 'provider-progress',
        source: 'antigravity',
        scope: isChild ? 'child' : 'root',
        eventTypes: [kind],
        observedEvents: 1,
        ...(isChild ? { native: structuredClone(receipt.native) } : {}),
      })
    } catch {}
  }

  const onClose = info => {
    if (!info?.intentional) transportClosedUnexpectedly = true
  }

  let timer = null
  const abortHandler = () => {
    receipt.execution.cancelled = true
    fail('run', 'cancelled', 'invocation cancelled')
    if (sessionId && transport && !transport.exited) {
      void transport.notify('session/cancel', { sessionId }).catch(() => {})
    }
    void stopTransport()
  }

  try {
    transport = openAcpTransport(acpRuntime, targetCwd, { args, onUpdate, onPermission, onClose })
    receipt.execution.pid = transport.pid ?? null
    receipt.execution.processGroupId = transport.pid ?? null
    receipt.execution.ownership = transport.pid ? 'process-group' : 'none'
    receipt.cleanup = { confirmed: false, method: 'process-group' }
    signal?.addEventListener('abort', abortHandler, { once: true })
    if (signal?.aborted) abortHandler()
    const remainingMs = () => request.timeoutMs > 0 ? Math.max(1, request.timeoutMs - (Date.now() - started)) : 0
    if (request.timeoutMs > 0) {
      timer = setTimeout(() => {
        receipt.execution.timedOut = true
        fail('run', 'timeout', 'total invocation deadline exceeded')
        if (sessionId && transport && !transport.exited) {
          void transport.notify('session/cancel', { sessionId }).catch(() => {})
        }
        void stopTransport()
      }, remainingMs())
      timer.unref?.()
    }

    const handshakeTimeout = () => request.timeoutMs > 0 ? Math.min(30000, remainingMs()) : 30000
    const init = await deadline(
      transport.request('initialize', { protocolVersion: 1, clientCapabilities: CLIENT_CAPABILITIES, clientInfo: CLIENT_INFO }),
      handshakeTimeout(),
      'ACP initialize',
    )
    if (init?.protocolVersion !== 1) throw new Error('unsupported ACP protocol version')
    const agentCaps = init.agentCapabilities ?? {}
    sessionCapabilities = agentCaps.sessionCapabilities ?? {}
    if (request.images?.length && agentCaps.promptCapabilities?.image !== true) {
      throw new Error('ACP runtime did not advertise image prompt capability')
    }

    if (request.sessionMode === 'new') {
      const created = await deadline(
        transport.request('session/new', { cwd: targetCwd, mcpServers: [] }),
        handshakeTimeout(),
        'ACP session/new',
      )
      if (!created?.sessionId || typeof created.sessionId !== 'string') throw new Error('ACP session/new did not return sessionId')
      sessionId = created.sessionId
      if (Array.isArray(created.configOptions)) configOptions = created.configOptions
      if (created.modes) modes = created.modes
      receipt.session.id = sessionId
      lease = claimSession(runtime.env, sessionId, binding, runId)
    } else {
      sessionId = request.sessionId
      const resumeMethod = sessionCapabilities.resume ? 'session/resume' : agentCaps.loadSession ? 'session/load' : null
      if (!resumeMethod) throw new Error('ACP runtime does not support session resume or load')
      const resumed = await deadline(
        transport.request(resumeMethod, { sessionId, cwd: targetCwd, mcpServers: [] }),
        handshakeTimeout(),
        `ACP ${resumeMethod}`,
      )
      if (Array.isArray(resumed?.configOptions)) configOptions = resumed.configOptions
      if (resumed?.modes) modes = resumed.modes
      receipt.session.id = sessionId
    }

    const selection = resolveModelSelection(configOptions, request.model, request.effort)
    let observedModel = request.model
    if (selection.modelOpt) {
      if (selection.modelOpt.currentValue !== selection.targetModel) {
        const res = await deadline(
          transport.request('session/set_config_option', { sessionId, configId: selection.modelOpt.id, value: selection.targetModel }),
          handshakeTimeout(),
          'ACP model configuration',
        )
        if (Array.isArray(res?.configOptions)) configOptions = res.configOptions
      }
      observedModel = modelOption(configOptions)?.currentValue ?? selection.targetModel
    }
    let observedEffort = request.effort || null
    if (selection.effortOpt && selection.targetEffort && selection.effortOpt.currentValue !== selection.targetEffort) {
      const res = await deadline(
        transport.request('session/set_config_option', { sessionId, configId: selection.effortOpt.id, value: selection.targetEffort }),
        handshakeTimeout(),
        'ACP effort configuration',
      )
      if (Array.isArray(res?.configOptions)) configOptions = res.configOptions
      observedEffort = selection.targetEffort
    }
    let observedMode = request.executionMode
    if (request.executionMode !== 'default') {
      const modeOpt = configOptions.find(opt => opt.category === 'mode' || opt.id === 'mode')
      if (modeOpt && selectOptions(modeOpt).some(opt => opt.value === request.executionMode)) {
        const res = await deadline(
          transport.request('session/set_config_option', { sessionId, configId: modeOpt.id, value: request.executionMode }),
          handshakeTimeout(),
          'ACP mode configuration',
        )
        if (Array.isArray(res?.configOptions)) configOptions = res.configOptions
      } else if (modes?.availableModes?.some(m => m.id === request.executionMode)) {
        await deadline(
          transport.request('session/set_mode', { sessionId, modeId: request.executionMode }),
          handshakeTimeout(),
          'ACP mode',
        )
      }
    }

    receipt.configuration = {
      ...receipt.configuration,
      source: 'acp-init',
      matched: true,
      observed: {
        cwd: targetCwd,
        model: observedModel,
        permissionMode: request.permissionMode,
        agent: evidenceAgent?.name ?? null,
        tools: null,
        cliVersion: acpRuntime.version,
        effort: observedEffort,
        executionMode: observedMode,
        sandbox: request.sandbox,
      },
    }

    if (inspectSubscription(runtime.env, request).fingerprint !== subscription.fingerprint) {
      throw new Error('native settings changed before accepted init')
    }

    evidenceAgent?.verify()
    await emit('dispatch-possible', receipt)
    if (!signal?.aborted && !receipt.failure && !transport.exited) {
      let promptText = promptFor(request)
      if (request.outputSchema) {
        promptText += '\n\nReturn ONLY one valid JSON value conforming strictly to this JSON Schema (no surrounding prose):\n' + JSON.stringify(request.outputSchema)
      }
      const promptBlocks = [
        { type: 'text', text: promptText },
        ...(request.images ?? []).map(img => ({ type: 'image', mimeType: img.mimeType, data: img.data })),
      ]
      receipt.execution.dispatch = 'dispatched'
      receipt.execution.turnDispatch = 'possible'
      receipt.providerWork = { ...receipt.providerWork, state: 'unknown', replaySafe: false }
      receipt.native.completion.state = 'unknown'
      promptSent = true

      const promptPromise = transport.request('session/prompt', { sessionId, prompt: promptBlocks })
      const response = request.timeoutMs > 0
        ? await deadline(promptPromise, remainingMs(), 'ACP session/prompt')
        : await promptPromise
      await new Promise(resolve => setImmediate(resolve))
      if (response?.usage) receipt.usage = parseAcpUsage(response.usage, receipt.usage)

      const stopReason = response?.stopReason
      if (!['end_turn', 'max_tokens', 'max_turn_requests', 'refusal', 'cancelled'].includes(stopReason)) {
        protocolFailed = true
        fail('run', 'protocol', 'unrecognized ACP prompt stopReason')
      } else {
        receipt.execution.terminalReceived = true
        receipt.execution.turnDispatch = 'accepted'
        receipt.output = [{ type: 'text', text: outputText }]
        if (stopReason === 'end_turn') {
          receipt.providerWork = { ...receipt.providerWork, state: 'completed', replaySafe: true }
          if (validate) {
            const parsed = parseStructuredOutput(outputText)
            if (!parsed.ok || !validate(parsed.value)) {
              protocolFailed = true
              fail('run', 'protocol', 'structured output does not satisfy the requested schema')
            } else {
              receipt.structured = parsed.value
            }
          }
        } else if (stopReason === 'cancelled') {
          receipt.execution.cancelled = true
          receipt.providerWork = { ...receipt.providerWork, state: 'failed', replaySafe: true }
          fail('run', 'cancelled', 'ACP prompt cancelled')
        } else {
          receipt.execution.finishedReason = stopReason
          receipt.providerWork = { ...receipt.providerWork, state: 'failed', replaySafe: true }
          fail('run', 'native-cutoff', 'native invocation ended with finished_reason: ' + stopReason)
        }
      }
    }
  } catch (error) {
    if (!receipt.failure) {
      const stage = promptSent ? 'run' : 'configuration'
      const category = promptSent
        ? (transportClosedUnexpectedly ? 'unknown' : classifyAcpError(error))
        : (error?.code === -32000 || /auth|sign.?in|log.?in/i.test(String(error?.message ?? '')) ? 'auth' : 'invalid-request')
      fail(stage, category, error?.message ?? String(error))
    }
  } finally {
    if (timer) clearTimeout(timer)
    signal?.removeEventListener('abort', abortHandler)
    if (sessionId && sessionCapabilities?.close && transport && !transport.exited) {
      try {
        await deadline(transport.request('session/close', { sessionId }), Math.min(request.disposeGraceMs, 3000), 'ACP session close')
        if (promptSent && !protocolFailed && !receipt.failure && !signal?.aborted) sessionClosedCleanly = true
      } catch {}
    } else if (promptSent && !protocolFailed && !receipt.failure && !signal?.aborted && !sessionCapabilities?.close) {
      sessionClosedCleanly = true
    }
    const stopped = await stopTransport(sessionClosedCleanly)
    receipt.cleanup.confirmed = Boolean(stopped.exited)
    receipt.execution.exitCode = stopped.exit?.code ?? null
    receipt.execution.signal = stopped.exit?.signal ?? null
  }

  observeChildren(receipt.native, observedChildren, false)
  if (permissionDenied) fail('run', 'permission-denied', 'a required tool action was denied by native policy')
  if (receipt.execution.exitCode !== 0 || receipt.execution.signal !== null) fail('process', 'process', 'CLI did not exit successfully')
  if (promptSent && !receipt.configuration.matched) fail('configuration', 'configuration-mismatch', 'native configuration was not confirmed')
  try {
    if (inspectSubscription(runtime.env, request).fingerprint !== subscription.fingerprint) {
      fail('configuration', 'configuration-mismatch', 'native settings changed during the invocation')
    }
  } catch (error) {
    fail('configuration', 'configuration-mismatch', error.message)
  }
  if (!receipt.cleanup.confirmed) fail('cleanup', 'cleanup-unconfirmed', 'local process group cleanup is not confirmed')

  const nativeCompleted = promptSent && !protocolFailed && !receipt.failure && receipt.execution.terminalReceived && !receipt.execution.finishedReason
  receipt.native.completion = {
    scope: 'cli-invocation',
    state: nativeCompleted ? 'completed' : !promptSent ? 'not-started' : receipt.execution.terminalReceived ? 'failed' : 'unknown',
    source: nativeCompleted ? 'normal-result-and-cli-exit' : null,
    children: 'unknown',
  }
  if (nativeCompleted && request.native?.mode === 'subagents' && !receipt.native.collaborationObserved) {
    fail('run', 'collaboration-not-observed', 'requested subagents completed without child metadata; native collaboration was not verified')
  }
  try {
    lease?.finish(receipt)
    evidenceAgent?.dispose()
    if (evidenceAgent) receipt.native.managedAgent.cleanup = 'confirmed'
  } catch (error) {
    fail('cleanup', 'cleanup-unconfirmed', error.message)
    receipt.cleanup.confirmed = false
  }
  receipt.ok = !receipt.failure && promptSent && receipt.execution.terminalReceived && receipt.cleanup.confirmed
  receipt.execution.outcome = receipt.ok ? 'completed' : receipt.execution.dispatch === 'not-dispatched' ? 'not-started' : receipt.execution.terminalReceived ? 'failed' : 'unknown'
  receipt.session.resumable = Boolean(receipt.session.id && receipt.execution.terminalReceived && receipt.cleanup.confirmed)
  return receipt
}
