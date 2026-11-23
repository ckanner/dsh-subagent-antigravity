import { createInterface } from 'node:readline'
const scenario = process.env.ACP_TEST_SCENARIO ?? 'permission'
let promptId, permissionId
const out = message => process.stdout.write(JSON.stringify({ jsonrpc: '2.0', ...message }) + '\n')
const update = update => out({ method: 'session/update', params: { sessionId: 'wire-session', update } })
const result = (id, result) => out({ id, result })
const configOptions = [{ id: 'model', category: 'model', type: 'select', name: 'Model', currentValue: 'gemini-wire', options: [{ value: 'gemini-wire', name: 'Gemini wire' }] }]
process.stderr.write('A native diagnostic token=secret-that-must-not-enter-host-logs\n')
for await (const line of createInterface({ input: process.stdin })) {
  const message = JSON.parse(line)
  if (message.method === 'initialize') result(message.id, { protocolVersion: 1, agentInfo: { name: 'antigravity', version: '1.5.14' },
    agentCapabilities: { loadSession: true, sessionCapabilities: { resume: {}, close: {} }, promptCapabilities: { image: true } } })
  else if (message.method === 'session/new') {
    if ('systemPrompt' in message.params || '_meta' in message.params || message.params.mcpServers.length) throw new Error('Harness injection')
    result(message.id, { sessionId: 'wire-session', configOptions })
  } else if (message.method === 'session/prompt') {
    promptId = message.id
    if (scenario === 'crash') process.exit(2)
    update({ sessionUpdate: 'tool_call', toolCallId: 'tool-wire', title: 'Native edit', status: 'in_progress' })
    if (scenario === 'wait') continue
    permissionId = 'permission-wire'
    out({ id: permissionId, method: 'session/request_permission', params: { sessionId: 'wire-session', toolCall: { toolCallId: 'tool-wire', title: 'Native edit' }, options: [{ optionId: 'once', kind: 'allow_once', name: 'Allow once' }] } })
  } else if (message.id === permissionId && message.result) {
    if (message.result.outcome.optionId !== 'once') throw new Error('Wrong permission response')
    // Several frames and a UTF-8 code point deliberately span OS pipe chunks.
    const bytes = Buffer.from(JSON.stringify({ jsonrpc: '2.0', method: 'session/update', params: { sessionId: 'wire-session', update: { sessionUpdate: 'agent_message_chunk', content: { type: 'text', text: '你好，ACP' } } } }) + '\n')
    const split = bytes.indexOf(Buffer.from('你')) + 1
    process.stdout.write(bytes.subarray(0, split)); await new Promise(resolve => setTimeout(resolve, 5)); process.stdout.write(bytes.subarray(split))
    result(promptId, { stopReason: 'end_turn' }); promptId = undefined
    setTimeout(() => {
      update({ sessionUpdate: 'tool_call_update', toolCallId: 'tool-wire', status: 'completed' })
      update({ sessionUpdate: 'agent_message_chunk', content: { type: 'text', text: '后台结果' } })
    }, 40)
  } else if (message.method === 'session/cancel') {
    if ('id' in message) throw new Error('Cancel is a notification')
    if (promptId != null) { result(promptId, { stopReason: 'cancelled' }); promptId = undefined }
    update({ sessionUpdate: 'tool_call_update', toolCallId: 'tool-wire', status: 'failed' })
  } else if (message.method === 'session/close') result(message.id, {})
  else if (message.method === 'session/resume') result(message.id, { configOptions })
}
