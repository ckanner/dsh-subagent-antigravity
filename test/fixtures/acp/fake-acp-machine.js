#!/usr/bin/env node
// Fake official agy CLI implementing ACP stdio server + --version + acp --help for machine transport tests.
import { appendFileSync, writeFileSync } from 'node:fs'
import { randomUUID } from 'node:crypto'
import { Readable, Writable } from 'node:stream'
import * as acp from '@agentclientprotocol/sdk'

const args = process.argv.slice(2)
const scenario = process.env.FIXTURE_SCENARIO ?? 'success'
if (process.env.FIXTURE_CALLS) {
  appendFileSync(process.env.FIXTURE_CALLS, JSON.stringify({ args, cwd: process.cwd(), pid: process.pid }) + '\n')
}
if (args[0] === '--version') {
  console.log(process.env.FIXTURE_VERSION ?? '1.5.14')
  process.exit(0)
}
if (args[0] === 'acp' && args[1] === '--help') {
  console.error('Usage: agy acp [flags]\nStart the Agent Client Protocol (ACP) stdio server\n  --login  Native sign-in\n  --dangerously-skip-permissions\n  --sandbox\n  --agent')
  process.exit(0)
}
if (args[0] !== 'acp') process.exit(90)
if (process.env.FIXTURE_PID) writeFileSync(process.env.FIXTURE_PID, String(process.pid))

const state = {
  sessionId: null,
  model: 'gemini-4-hydrogen-high',
  mode: 'default',
  configOptions: [
    {
      id: 'model',
      category: 'model',
      type: 'select',
      name: 'Model',
      currentValue: 'gemini-4-hydrogen-high',
      options: [
        { value: 'gemini-4-hydrogen-high', name: 'Gemini 4 Hydrogen (High)' },
        { value: 'gemini-4-neon-high', name: 'Gemini 4 Neon (High)' },
        { value: 'gemini-4-carbon-high', name: 'Gemini 4 Carbon (High)' },
        { value: 'gemini-pro-orchestrator-neon', name: 'Gemini Pro Orchestrator Neon' },
      ],
    },
  ],
  cancelled: false,
}

const stream = acp.ndJsonStream(Writable.toWeb(process.stdout), Readable.toWeb(process.stdin))
let connection

const app = acp.agent({ name: 'fake-agy-acp' })
  .onRequest(acp.methods.agent.initialize, () => ({
    protocolVersion: 1,
    agentInfo: { name: 'antigravity', version: process.env.FIXTURE_VERSION ?? '1.5.14' },
    agentCapabilities: {
      loadSession: true,
      sessionCapabilities: { resume: {}, close: {} },
      promptCapabilities: { image: scenario !== 'no-images', embeddedContext: true },
    },
  }))
  .onRequest(acp.methods.agent.session.new, () => {
    if (scenario === 'auth-required') {
      throw acp.RequestError.authRequired()
    }
    state.sessionId = randomUUID()
    return {
      sessionId: state.sessionId,
      configOptions: state.configOptions,
      modes: { currentModeId: state.mode, availableModes: [{ id: 'default', name: 'Default' }, { id: 'plan', name: 'Plan' }, { id: 'accept-edits', name: 'Accept Edits' }] },
    }
  })
  .onRequest(acp.methods.agent.session.resume, context => {
    state.sessionId = context.params.sessionId
    return {
      configOptions: state.configOptions,
      modes: { currentModeId: state.mode, availableModes: [{ id: 'default', name: 'Default' }, { id: 'plan', name: 'Plan' }, { id: 'accept-edits', name: 'Accept Edits' }] },
    }
  })
  .onRequest(acp.methods.agent.session.setConfigOption, context => {
    if (context.params.configId === 'model') {
      state.model = context.params.value
      state.configOptions[0].currentValue = context.params.value
    }
    return { configOptions: state.configOptions }
  })
  .onRequest(acp.methods.agent.session.setMode, context => {
    state.mode = context.params.modeId
    return {}
  })
  .onRequest(acp.methods.agent.session.close, () => ({}))
  .onNotification(acp.methods.agent.session.cancel, () => {
    state.cancelled = true
  })
  .onRequest(acp.methods.agent.session.prompt, async context => {
    const params = context.params
    if (process.env.FIXTURE_INPUT) {
      appendFileSync(process.env.FIXTURE_INPUT, JSON.stringify(params) + '\n')
    }
    if (scenario === 'hang') {
      await new Promise(() => {})
    }
    if (scenario === 'permission-request') {
      const perm = await connection.client.request(acp.methods.client.session.requestPermission, {
        sessionId: params.sessionId,
        toolCall: { toolCallId: 'tool-1', title: 'Run shell command' },
        options: [{ optionId: 'allow-1', name: 'Allow once', kind: 'allow_once' }],
      })
      if (perm?.outcome?.outcome !== 'selected') {
        await connection.client.notify(acp.methods.client.session.update, {
          sessionId: params.sessionId,
          update: { sessionUpdate: 'agent_message_chunk', content: { type: 'text', text: 'permission denied' } },
        })
        return { stopReason: 'end_turn' }
      }
    }
    if (scenario === 'illegal-tool') {
      await connection.client.notify(acp.methods.client.session.update, {
        sessionId: params.sessionId,
        update: { sessionUpdate: 'tool_call', toolCallId: 'tool-bad', title: 'Read secret', status: 'in_progress' },
      })
      return { stopReason: 'end_turn' }
    }
    if (scenario === 'schema-ok') {
      await connection.client.notify(acp.methods.client.session.update, {
        sessionId: params.sessionId,
        update: { sessionUpdate: 'agent_message_chunk', content: { type: 'text', text: '```json\n{"answer":"acp-ok"}\n```' } },
      })
      return { stopReason: 'end_turn' }
    }
    if (scenario === 'schema-bad') {
      await connection.client.notify(acp.methods.client.session.update, {
        sessionId: params.sessionId,
        update: { sessionUpdate: 'agent_message_chunk', content: { type: 'text', text: '{"wrong":true}' } },
      })
      return { stopReason: 'end_turn' }
    }
    if (scenario === 'quota') {
      throw new acp.RequestError(-32001, 'quota exhausted for this account')
    }
    const imageCount = (params.prompt ?? []).filter(block => block.type === 'image').length
    const reply = imageCount > 0 ? `acp-done:${state.model}:images=${imageCount}` : `acp-done:${state.model}:${state.mode}`
    await connection.client.notify(acp.methods.client.session.update, {
      sessionId: params.sessionId,
      update: { sessionUpdate: 'agent_message_chunk', content: { type: 'text', text: reply } },
    })
    await connection.client.notify(acp.methods.client.session.update, {
      sessionId: params.sessionId,
      update: { sessionUpdate: 'usage_update', size: 1000000, used: 180 },
    })
    return {
      stopReason: 'end_turn',
      usage: { inputTokens: 120, outputTokens: 30, thoughtTokens: 10, cachedReadTokens: 20, totalTokens: 180 },
    }
  })

connection = app.connect(stream)
await connection.closed
