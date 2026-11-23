import { Service } from '@deepseek-ai/cordis'
import { Remote, bindTypertRemote } from '@deepseek-ai/dsh-typert-protocol'

const initializers = []
const common = ['version', 'action']
const actions = {
  defaults: [], doctor: [], list: [], status: ['id'], connect: [], resume: ['id'],
  prompt: ['id', 'operationId', 'prompt'], cancel: ['id'],
  permission: ['id', 'requestId', 'optionId'], configure: ['id', 'configId', 'value'],
  disconnect: ['id'], 'login-start': [], 'login-submit': ['input'], 'login-cancel': [],
}
const record = value => value !== null && typeof value === 'object' && !Array.isArray(value)
const identifier = value => typeof value === 'string' && value.length > 0 && value.length <= 512 && !/[\u0000-\u001f\u007f]/.test(value)

// This is an application boundary in addition to the manager's protocol validation.
// No caller supplies an owner, workspace, environment, command, or system prompt.
export function validateAcpAction(value) {
  if (!record(value) || value.version !== 2 || !Object.hasOwn(actions, value.action) ||
      Object.keys(value).some(key => !common.concat(actions[value.action]).includes(key))) {
    throw new Error('Invalid Antigravity ACP action')
  }
  const needsId = ['resume', 'prompt', 'cancel', 'permission', 'configure', 'disconnect'].includes(value.action)
  if ((needsId || value.id !== undefined) && !identifier(value.id)) throw new Error('A valid ACP session record ID is required')
  if (value.action === 'prompt' &&
      (!/^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(value.operationId ?? '') ||
       !Array.isArray(value.prompt) || value.prompt.length === 0)) throw new Error('A prompt requires content blocks and an operation UUID')
  if (value.action === 'permission' &&
      (!identifier(value.requestId) || value.optionId != null && !identifier(value.optionId))) throw new Error('Invalid ACP permission response')
  if (value.action === 'configure' &&
      (!identifier(value.configId) || !['string', 'boolean'].includes(typeof value.value))) throw new Error('Invalid ACP configuration selection')
  if (value.action === 'login-submit' &&
      (typeof value.input !== 'string' || !value.input.trim() || value.input.length > 16384 || /[\u0000\r\n]/.test(value.input))) throw new Error('Enter the code or callback URL from the official sign-in page')
  return value
}

export class AntigravityAcpService extends Service {
  constructor(ctx, control, manager) {
    super(ctx, 'antigravityAcp')
    this.typertRemote = bindTypertRemote(this, 'antigravityAcp')
    this.manager = manager
    this.control = control
    for (const initialize of initializers) initialize.call(this)
  }
  async action(agent, input, signal) {
    return this.control(agent, validateAcpAction(input), signal)
  }
  isActive(owner) { return this.manager.isActive(String(owner)) }
  stopOwner(owner) { return this.manager.stopOwner(String(owner)) }
}

Remote(AntigravityAcpService.prototype.action, {
  kind: 'method', name: 'action', static: false, private: false,
  addInitializer: initialize => initializers.push(initialize),
})
