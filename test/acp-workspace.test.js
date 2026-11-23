import test from 'node:test'
import assert from 'node:assert/strict'
import { execFile } from 'node:child_process'
import { mkdtemp, mkdir, readFile, realpath, rm, stat, symlink, unlink, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { promisify } from 'node:util'
import { createWorkspace, verifyWorkspace, isOwnedAcpWorkspace, assertNotOwnedAcpWorkspace } from '../lib/acp/workspace.js'

const execute = promisify(execFile)
async function git(cwd, ...args) {
  return (await execute('git', ['-C', cwd, ...args], { encoding: 'utf8' })).stdout.trim()
}
async function fixture(t) {
  const root = await realpath(await mkdtemp(join(tmpdir(), 'acp-workspace-')))
  t.after(() => rm(root, { recursive: true, force: true }))
  const sourceCwd = join(root, 'source'), stateRoot = join(root, 'state')
  await mkdir(sourceCwd)
  await git(sourceCwd, 'init', '-b', 'main')
  await git(sourceCwd, 'config', 'user.name', 'ACP Test')
  await git(sourceCwd, 'config', 'user.email', 'acp@example.invalid')
  await writeFile(join(sourceCwd, 'tracked.txt'), 'committed\n')
  await git(sourceCwd, 'add', 'tracked.txt')
  await git(sourceCwd, 'commit', '-m', 'initial')
  return { root, sourceCwd, stateRoot }
}

test('a new ACP workspace uses committed HEAD and preserves all source and worktree changes', async t => {
  const { sourceCwd, stateRoot } = await fixture(t)
  const head = await git(sourceCwd, 'rev-parse', 'HEAD')
  await writeFile(join(sourceCwd, 'tracked.txt'), 'source dirty\n')
  await writeFile(join(sourceCwd, 'untracked.txt'), 'source only\n')
  const record = await createWorkspace({ sourceCwd, stateRoot, id: 'session-one', owner: 'dsh-session' })
  assert.equal(record.cwd, join(stateRoot, 'workspaces', 'session-one'))
  assert.equal(record.sourceCommit, head)
  assert.equal(record.branch, 'antigravity/session-one')
  assert.equal(await readFile(join(record.cwd, 'tracked.txt'), 'utf8'), 'committed\n')
  await assert.rejects(readFile(join(record.cwd, 'untracked.txt')), { code: 'ENOENT' })
  assert.equal(await readFile(join(sourceCwd, 'tracked.txt'), 'utf8'), 'source dirty\n')
  assert.equal(await readFile(join(sourceCwd, 'untracked.txt'), 'utf8'), 'source only\n')
  assert.equal(await git(record.cwd, 'status', '--porcelain'), '', 'ownership records never appear in git add/status')
  assert.equal((await stat(join(record.gitDir, 'antigravity-acp-workspace.json'))).mode & 0o077, 0)
  await writeFile(join(record.cwd, 'tracked.txt'), 'interactive changes\n')
  assert.deepEqual(await verifyWorkspace(record), record)
  await git(record.cwd, 'add', 'tracked.txt')
  await git(record.cwd, 'commit', '-m', 'interactive commit')
  assert.notEqual(await git(record.cwd, 'rev-parse', 'HEAD'), head)
  assert.deepEqual(await verifyWorkspace(record), record, 'new commits on the owned branch are preserved')
  assert.equal(await git(sourceCwd, 'rev-parse', 'HEAD'), head)
})

test('ownership guards cover aliases, descendants, and nested repositories without blocking the source', async t => {
  const { root, sourceCwd, stateRoot } = await fixture(t)
  const record = await createWorkspace({ sourceCwd, stateRoot, id: 'session-two', owner: 'owner' })
  const nested = join(record.cwd, 'nested')
  await mkdir(nested)
  await git(nested, 'init')
  const alias = join(root, 'alias')
  await symlink(nested, alias, 'dir')
  assert.equal(await isOwnedAcpWorkspace(record.cwd), true)
  assert.equal(await isOwnedAcpWorkspace(nested), true)
  assert.equal(await isOwnedAcpWorkspace(alias), true)
  assert.equal(await isOwnedAcpWorkspace(sourceCwd), false)
  assert.equal(await isOwnedAcpWorkspace(root), false)
  await assert.rejects(assertNotOwnedAcpWorkspace(alias), { code: 'ACP_WORKSPACE_OWNED' })
  await assertNotOwnedAcpWorkspace(sourceCwd)
  await assert.rejects(createWorkspace({ sourceCwd: record.cwd, stateRoot, id: 'recursive', owner: 'owner' }), { code: 'ACP_WORKSPACE_OWNED' })
})

test('a retained reservation blocks machine adoption even if preparation lost its final marker', async t => {
  const { sourceCwd, stateRoot } = await fixture(t)
  const record = await createWorkspace({ sourceCwd, stateRoot, id: 'session-three', owner: 'owner' })
  await unlink(join(record.gitDir, 'antigravity-acp-workspace.json'))
  assert.equal(await isOwnedAcpWorkspace(record.cwd), true)
  await assert.rejects(verifyWorkspace(record), { code: 'ACP_WORKSPACE_IDENTITY' })
  await writeFile(join(record.cwd, 'kept.txt'), 'do not delete\n')
  await assert.rejects(createWorkspace({ sourceCwd, stateRoot, id: record.id, owner: 'owner' }), { code: 'ACP_WORKSPACE_EXISTS' })
  assert.equal(await readFile(join(record.cwd, 'kept.txt'), 'utf8'), 'do not delete\n')
})

test('identity changes fail resume but a moved worktree remains guarded', async t => {
  const { root, sourceCwd, stateRoot } = await fixture(t)
  const record = await createWorkspace({ sourceCwd, stateRoot, id: 'session-four', owner: 'owner' })
  await assert.rejects(verifyWorkspace({ ...record, owner: 'other-session' }), { code: 'ACP_WORKSPACE_IDENTITY' })
  const moved = join(root, 'moved')
  await git(sourceCwd, 'worktree', 'move', record.cwd, moved)
  assert.equal(await isOwnedAcpWorkspace(moved), true)
  await assert.rejects(verifyWorkspace(record))
  assert.equal(await readFile(join(moved, 'tracked.txt'), 'utf8'), 'committed\n')
})

test('non-Git, unborn, unsafe storage, and colliding branches fail without inventing a workspace', async t => {
  const { root, sourceCwd, stateRoot } = await fixture(t)
  await assert.rejects(createWorkspace({ sourceCwd: root, stateRoot, id: 'non-git', owner: 'owner' }), error => error.code === 'ACP_WORKSPACE_GIT_REQUIRED' && /Git/.test(error.message))
  const unborn = join(root, 'unborn')
  await mkdir(unborn)
  await git(unborn, 'init')
  await assert.rejects(createWorkspace({ sourceCwd: unborn, stateRoot, id: 'unborn', owner: 'owner' }), { code: 'ACP_WORKSPACE_GIT_REQUIRED' })
  await assert.rejects(createWorkspace({ sourceCwd, stateRoot: join(sourceCwd, 'state'), id: 'inside', owner: 'owner' }), { code: 'ACP_WORKSPACE_STORAGE' })
  await assert.rejects(createWorkspace({ sourceCwd, stateRoot, id: '../escape', owner: 'owner' }), { code: 'ACP_WORKSPACE_INVALID' })
  await git(sourceCwd, 'branch', 'antigravity/collision')
  await assert.rejects(createWorkspace({ sourceCwd, stateRoot, id: 'collision', owner: 'owner' }), { code: 'ACP_WORKSPACE_PREPARATION_FAILED' })
  assert.equal(await git(sourceCwd, 'rev-parse', 'antigravity/collision'), await git(sourceCwd, 'rev-parse', 'HEAD'))
  assert.equal(await readFile(join(sourceCwd, 'tracked.txt'), 'utf8'), 'committed\n')
})
