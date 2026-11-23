import test from 'node:test'
import assert from 'node:assert/strict'
import { spawn, spawnSync } from 'node:child_process'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { setTimeout as delay } from 'node:timers/promises'
import { AcpSessions } from '../lib/acp/sessions.js'
import { openAcpTransport } from '../lib/acp/transport.js'

async function until(check) {
  const end = Date.now() + 5000
  while (Date.now() < end) { if (check()) return; await delay(10) }
  assert.fail('The owned process-group fixture did not reach its expected state')
}

function groupExists(pgid) {
  try { process.kill(-pgid, 0); return true } catch (error) { return error.code !== 'ESRCH' }
}

function processIsRunning(pid) {
  if (process.platform === 'linux') {
    try {
      const stat = readFileSync(`/proc/${pid}/stat`, 'utf8')
      const state = stat.slice(stat.lastIndexOf(') ') + 2).split(' ')[0]
      return state !== 'Z' && state !== 'X'
    } catch (error) { if (error.code === 'ENOENT') return false; throw error }
  }
  const result = spawnSync('/bin/ps', ['-o', 'stat=', '-p', String(pid)], { encoding: 'utf8' })
  if (result.status === 1) return false
  assert.equal(result.status, 0, 'The test must be able to distinguish a zombie from a running child')
  return result.stdout.trim() !== '' && !result.stdout.trim().startsWith('Z')
}

test('root exit does not skip owned-group cleanup, and uncertain cleanup retains the session lock', {
  skip: process.platform === 'win32',
}, async t => {
  const root = realpathSync(mkdtempSync(join(tmpdir(), 'acp-root-first-')))
  const workspace = join(root, 'workspace'), stateRoot = join(root, 'state')
  mkdirSync(workspace)
  const childFile = join(root, 'child.cjs'), leaderFile = join(root, 'leader.cjs'), pidFile = join(root, 'child.pid')
  writeFileSync(childFile, `
    require('node:fs').writeFileSync(${JSON.stringify(pidFile)}, String(process.pid));
    process.on('disconnect', () => {});
    process.on('SIGTERM', () => process.exit(0));
    setInterval(() => {}, 1000);
    process.send({ ready: true });
  `)
  writeFileSync(leaderFile, `
    const child = require('node:child_process').spawn(process.execPath, [${JSON.stringify(childFile)}], {
      detached: false, stdio: ['ignore', 'inherit', 'inherit', 'ipc']
    });
    child.once('message', () => process.exit(0));
    child.once('error', () => process.exit(2));
  `)
  const runtime = { executable: '/fixture/verified-agy', version: '1.5.14', sha256: 'a'.repeat(64), platform: process.platform, architecture: process.arch, env: { ...process.env } }
  let transport, cleanup
  // Only the RPC replies are fixtures. The root, descendant, POSIX group and
  // transport.stop implementation below are real subprocesses and real signals.
  const manager = new AcpSessions({ stateRoot, getConfig: () => ({ transport: 'acp', disposeGraceMs: 50 }), services: {
    inspectRuntime: async () => runtime,
    createWorkspace: async input => ({ ...input, cwd: workspace, sourceCommit: 'a'.repeat(40), branch: `antigravity/${input.id}` }),
    verifyWorkspace: async value => value,
    openTransport: (value, cwd, callbacks) => {
      transport = openAcpTransport(value, cwd, { ...callbacks, spawnProcess(file, args, options) {
        assert.equal(file, runtime.executable)
        assert.deepEqual(args, ['acp'])
        assert.equal(options.detached, true)
        assert.equal(options.shell, false)
        return spawn(process.execPath, [leaderFile], options)
      } })
      return {
        pid: transport.pid,
        request: async method => {
          if (method === 'initialize') return { protocolVersion: 1, agentInfo: { version: '1.5.14' }, agentCapabilities: { sessionCapabilities: { close: {} } } }
          if (method === 'session/new') return { sessionId: 'native-root-first', configOptions: [{
            id: 'model', type: 'select', category: 'model', name: 'Model', currentValue: 'gemini-4-hydrogen-high',
            options: [{ value: 'gemini-4-hydrogen-high', name: 'Gemini' }],
          }] }
          if (method === 'session/close') return {}
          throw new Error('Unexpected fixture method: ' + method)
        },
        notify: async method => assert.equal(method, 'session/cancel'),
        stop: async grace => { cleanup = await transport.stop(grace); return cleanup },
      }
    },
  } })
  t.after(async () => {
    await manager.dispose()
    await transport?.stop(50)
    if (transport?.pid) try { process.kill(-transport.pid, 'SIGKILL') } catch {}
    rmSync(root, { recursive: true, force: true })
  })
  const context = { owner: 'root-first-owner', workspace }
  const session = await manager.action(context, { version: 2, action: 'connect' })
  assert.equal(session.status, 'ready')
  await until(() => transport.exited && existsSync(pidFile))
  const childPid = Number(readFileSync(pidFile, 'utf8'))
  assert.equal(processIsRunning(childPid), true, 'The descendant must outlive its exited group leader before Stop')
  assert.equal(groupExists(transport.pid), true)

  const closed = await manager.action(context, { version: 2, action: 'disconnect', id: session.id })
  await until(() => !processIsRunning(childPid))
  assert.equal(cleanup.rootExited, true)
  assert.equal(cleanup.exited, cleanup.rootExited && cleanup.groupConfirmed)
  const lockPath = join(stateRoot, 'sessions', `${session.id}.lock`)
  if (cleanup.groupConfirmed) {
    assert.equal(groupExists(transport.pid), false)
    assert.equal(closed.cleanup.process, 'exited')
    assert.equal(closed.status, 'disconnected')
    assert.equal(existsSync(lockPath), false)
  } else {
    // Some container PID 1 implementations do not reap orphaned zombies. A
    // zombie is not running work, but is also not proof that the PGID is gone.
    // Never turn that uncertainty into a successful cleanup or a lease release.
    assert.equal(cleanup.exited, false)
    assert.equal(closed.cleanup.process, 'unknown')
    assert.equal(closed.status, 'unknown')
    assert.equal(existsSync(lockPath), true)
    t.diagnostic('The descendant stopped; unreaped/uncertain group cleanup correctly retained the lock.')
  }
})
