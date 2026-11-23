import { realpath } from 'node:fs/promises'
import { isAbsolute } from 'node:path'
import { resolveConfig } from '../config.js'
import { AcpSessions } from './sessions.js'
import { AntigravityAcpService } from './remote.js'

export async function acpOwnerContext(ctx, agent) {
  const session = agent?.session
  if (!session || typeof session.id !== 'string' || !session.id ||
      typeof ctx.workingDirectory?.get !== 'function') throw new Error('An active DSH conversation is required')
  const registry = ctx.get?.('agents')
  const live = () => !registry?.get || registry.get(String(agent.id ?? session.id)) === agent
  if (!live()) throw new Error('This DSH conversation binding is no longer active')
  const selected = await ctx.workingDirectory.get(session)
  if (typeof selected !== 'string' || !isAbsolute(selected)) throw new Error('The conversation has no absolute workspace directory')
  const workspace = await realpath(selected)
  if (agent.session !== session || !live()) throw new Error('This DSH conversation binding is no longer active')
  return { owner: String(session.id), workspace }
}

/** Public host adapter for explicit human ACP controls; it registers no agent tool. */
export function installAcpHost(ctx, getConfig = () => ({}), options = {}) {
  const existing = ctx.get?.('antigravityAcp')
  if (existing) {
    if (!(existing instanceof AntigravityAcpService)) throw new Error('The antigravityAcp Remote is already owned by another service')
    return existing
  }
  const configuration = () => resolveConfig(getConfig())
  configuration()
  let disposed = false
  const manager = options.manager ?? new AcpSessions({ getConfig: configuration, ...(options.stateRoot ? { stateRoot: options.stateRoot } : {}) })
  const control = async (agent, input, signal) => {
    if (disposed) throw new Error('The Antigravity ACP host has been disposed')
    if (signal?.aborted) throw new Error('The ACP request was cancelled before dispatch')
    const context = await acpOwnerContext(ctx, agent)
    if (disposed) throw new Error('The Antigravity ACP host has been disposed')
    const config = configuration()
    if (config.transport !== 'acp' && input.action !== 'defaults') throw new Error('Interactive ACP requires transport: acp; this plugin is configured for explicit headless delegation')
    const archived = ctx.get?.('workspaceRegistry')?.archivedSessionIds?.includes(context.owner)
    if (archived && !['defaults', 'doctor', 'list', 'status', 'cancel', 'disconnect', 'login-cancel'].includes(input.action)) throw new Error('This DSH conversation is archived; unarchive it before starting more Antigravity work')
    // The manager owns the durable journal. A disconnected browser does not cancel
    // a dispatched operation, and a retry must reconcile its operation identity.
    const result = await manager.action(context, input)
    return input.action === 'defaults' ? { ...result, transport: config.transport } : result
  }
  const service = new AntigravityAcpService(ctx, control, manager)
  ctx.on('workspace/session-activity', async ({ sessionId }, next) => {
    const rest = await next()
    return manager.isActive(String(sessionId))
      ? [{ kind: 'antigravity-acp', items: [{ id: String(sessionId), label: 'Antigravity ACP' }] }, ...rest]
      : rest
  })
  ctx.on('workspace/session-stop', ({ sessionId }) => manager.stopOwner(String(sessionId)))
  ctx.on('agent/disposed', ({ agent }) => {
    if (agent?.session?.id) void manager.stopOwner(String(agent.session.id)).catch(error => {
      ctx.get?.('logger')?.warn?.('Antigravity ACP owner cleanup failed: %s', error.message)
    })
  })
  const cleanup = () => { disposed = true; return options.ownsManager === false ? undefined : manager.dispose() }
  if (typeof ctx.effect === 'function') ctx.effect(() => cleanup)
  else ctx.on('dispose', cleanup)
  return service
}
