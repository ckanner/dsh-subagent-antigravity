import { execFile } from 'node:child_process'
import { constants } from 'node:fs'
import { lstat, mkdir, open, realpath } from 'node:fs/promises'
import { createHash } from 'node:crypto'
import { dirname, isAbsolute, join, relative, resolve, sep } from 'node:path'
import { promisify } from 'node:util'

const execute = promisify(execFile)
const markerName = 'antigravity-acp-workspace.json'
const kind = 'antigravity-acp-worktree'
const identityKeys = ['version', 'kind', 'id', 'owner', 'sourceCwd', 'sourceCommit', 'commonGitDir', 'stateRoot', 'cwd', 'branch', 'createdAt']

export class AcpWorkspaceError extends Error {
  constructor(code, message, cause) {
    super(message, cause === undefined ? undefined : { cause })
    this.name = 'AcpWorkspaceError'
    this.code = code
  }
}

function text(value, name, limit = 4096) {
  if (typeof value !== 'string' || value.length === 0 || value.length > limit || /[\x00-\x1f\x7f]/.test(value)) {
    throw new AcpWorkspaceError('ACP_WORKSPACE_INVALID', `${name} must be nonempty text without control characters`)
  }
  return value
}

function absolute(value, name) {
  text(value, name)
  if (!isAbsolute(value)) throw new AcpWorkspaceError('ACP_WORKSPACE_INVALID', `${name} must be an absolute directory`)
  return value
}

async function physicalDirectory(value, name) {
  absolute(value, name)
  const physical = await realpath(value)
  if (!(await lstat(physical)).isDirectory()) throw new AcpWorkspaceError('ACP_WORKSPACE_INVALID', `${name} must be a directory`)
  return physical
}

async function privateDirectory(path) {
  await mkdir(path, { recursive: true, mode: 0o700 })
  const stat = await lstat(path)
  if (!stat.isDirectory() || stat.isSymbolicLink() || (stat.mode & 0o077) !== 0 || process.getuid && stat.uid !== process.getuid()) {
    throw new AcpWorkspaceError('ACP_WORKSPACE_STORAGE', 'ACP workspace storage must be a private directory owned by the current user')
  }
  return realpath(path)
}

function gitEnvironment() {
  // Ambient Git routing must not redirect identity checks or worktree creation.
  const env = Object.fromEntries(Object.entries(process.env).filter(([key]) => !key.startsWith('GIT_')))
  return { ...env, GIT_TERMINAL_PROMPT: '0' }
}

async function git(cwd, args) {
  const result = await execute('git', ['-C', cwd, ...args], {
    env: gitEnvironment(), encoding: 'utf8', maxBuffer: 1024 * 1024, timeout: 30000,
  })
  return result.stdout.replace(/\r?\n$/, '')
}

async function repository(cwd) {
  let root
  try {
    if (await git(cwd, ['rev-parse', '--is-inside-work-tree']) !== 'true') throw new Error('not a working tree')
    root = await physicalDirectory(await git(cwd, ['rev-parse', '--show-toplevel']), 'repository root')
  } catch (error) {
    throw new AcpWorkspaceError('ACP_WORKSPACE_GIT_REQUIRED', 'Interactive ACP requires an existing Git working tree with a commit. Initialize and commit the project before connecting.', error)
  }
  const gitDir = await realpath(await git(root, ['rev-parse', '--absolute-git-dir']))
  const commonGitDir = await realpath(resolve(root, await git(root, ['rev-parse', '--git-common-dir'])))
  return { root, gitDir, commonGitDir }
}

function reservationPath(commonGitDir, cwd) {
  return join(commonGitDir, 'antigravity-acp-workspaces', createHash('sha256').update(cwd).digest('hex') + '.json')
}

async function createMarker(path, value) {
  const file = await open(path, constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL | constants.O_NOFOLLOW, 0o600)
  try {
    await file.writeFile(JSON.stringify(value) + '\n')
    await file.sync()
  } finally { await file.close() }
  const directory = await open(dirname(path), constants.O_RDONLY | constants.O_DIRECTORY)
  try { await directory.sync() } finally { await directory.close() }
}

async function readMarker(path) {
  let file
  try { file = await open(path, constants.O_RDONLY | constants.O_NOFOLLOW) }
  catch (error) { if (error.code === 'ENOENT') return null; throw error }
  try {
    const stat = await file.stat()
    if (!stat.isFile() || stat.size > 16384 || (stat.mode & 0o077) !== 0 || process.getuid && stat.uid !== process.getuid()) {
      throw new AcpWorkspaceError('ACP_WORKSPACE_IDENTITY', 'ACP workspace ownership marker is not a private owned file')
    }
    const record = JSON.parse(await file.readFile('utf8'))
    validateRecord(record, false)
    return record
  } finally { await file.close() }
}

function validateRecord(record, complete = true) {
  if (!record || typeof record !== 'object' || Array.isArray(record) || record.version !== 1 || record.kind !== kind ||
      typeof record.id !== 'string' || !/^[a-zA-Z0-9][a-zA-Z0-9_-]{0,95}$/.test(record.id) || record.branch !== `antigravity/${record.id}` ||
      typeof record.sourceCommit !== 'string' || !/^(?:[0-9a-f]{40}|[0-9a-f]{64})$/.test(record.sourceCommit) ||
      typeof record.createdAt !== 'string' || !Number.isFinite(Date.parse(record.createdAt))) {
    throw new AcpWorkspaceError('ACP_WORKSPACE_IDENTITY', 'ACP workspace ownership record is invalid')
  }
  text(record.owner, 'workspace owner', 512)
  for (const key of ['sourceCwd', 'commonGitDir', 'stateRoot', 'cwd', ...(complete ? ['gitDir'] : [])]) absolute(record[key], key)
  if (record.cwd !== join(record.stateRoot, 'workspaces', record.id)) {
    throw new AcpWorkspaceError('ACP_WORKSPACE_IDENTITY', 'ACP workspace path does not match its recorded session')
  }
}

function matching(actual, expected, complete) {
  if (!actual || [...identityKeys, ...(complete ? ['gitDir'] : [])].some(key => actual[key] !== expected[key])) {
    throw new AcpWorkspaceError('ACP_WORKSPACE_IDENTITY', 'ACP workspace ownership does not match this session; no process was started')
  }
}

/** Create an isolated worktree from the current committed HEAD. Never copy or remove user changes. */
export async function createWorkspace({ sourceCwd, stateRoot, id, owner }) {
  if (typeof id !== 'string' || !/^[a-zA-Z0-9][a-zA-Z0-9_-]{0,95}$/.test(id)) throw new AcpWorkspaceError('ACP_WORKSPACE_INVALID', 'Invalid ACP workspace session id')
  text(owner, 'workspace owner', 512)
  const source = await repository(await physicalDirectory(sourceCwd, 'sourceCwd'))
  await assertNotOwnedAcpWorkspace(source.root)
  const canonicalState = await privateDirectory(absolute(stateRoot, 'stateRoot'))
  const insideSource = relative(source.root, canonicalState)
  if (insideSource === '' || !insideSource.startsWith('..' + sep) && insideSource !== '..' && !isAbsolute(insideSource)) {
    throw new AcpWorkspaceError('ACP_WORKSPACE_STORAGE', 'ACP stateRoot must be outside the source working tree so generated workspaces cannot enter its commits')
  }
  const parent = await privateDirectory(join(canonicalState, 'workspaces'))
  const cwd = join(parent, id)
  try { await lstat(cwd); throw new AcpWorkspaceError('ACP_WORKSPACE_EXISTS', 'This ACP workspace already exists; inspect its recorded session instead of creating or replaying it') }
  catch (error) { if (error.code !== 'ENOENT') throw error }
  let sourceCommit
  try { sourceCommit = await git(source.root, ['rev-parse', '--verify', 'HEAD^{commit}']) }
  catch (error) { throw new AcpWorkspaceError('ACP_WORKSPACE_GIT_REQUIRED', 'Interactive ACP requires a committed Git HEAD. Commit the project before connecting.', error) }
  const record = {
    version: 1, kind, id, owner, sourceCwd: source.root, sourceCommit,
    commonGitDir: source.commonGitDir, stateRoot: canonicalState, cwd,
    branch: `antigravity/${id}`, createdAt: new Date().toISOString(),
  }
  await privateDirectory(dirname(reservationPath(source.commonGitDir, cwd)))
  // Publish ownership in Git-private storage before checkout. A crash between
  // checkout and the worktree-local marker cannot make the new tree a Go task.
  await createMarker(reservationPath(source.commonGitDir, cwd), record)
  const hooks = await privateDirectory(join(canonicalState, 'disabled-hooks'))
  try {
    await git(source.root, ['-c', `core.hooksPath=${hooks}`, 'worktree', 'add', '-b', record.branch, '--', cwd, sourceCommit])
    const created = await repository(cwd)
    record.cwd = created.root
    record.gitDir = created.gitDir
    await createMarker(join(created.gitDir, markerName), record)
    return await verifyWorkspace(record)
  } catch (error) {
    // Even a partial checkout or a failed marker write is retained. Never use
    // --force, remove a branch, or infer that an interrupted preparation is safe.
    throw new AcpWorkspaceError('ACP_WORKSPACE_PREPARATION_FAILED', `ACP workspace preparation did not finish. Retained ${cwd}; inspect it before any retry. ${error.message}`, error)
  }
}

/** Verify recorded ownership without resetting HEAD, the index, or the working tree. */
export async function verifyWorkspace(record) {
  validateRecord(record)
  const actual = await repository(await physicalDirectory(record.cwd, 'workspace cwd'))
  if (actual.root !== record.cwd || actual.gitDir !== record.gitDir || actual.commonGitDir !== record.commonGitDir ||
      actual.gitDir === actual.commonGitDir || await git(actual.root, ['symbolic-ref', '--quiet', '--short', 'HEAD']) !== record.branch) {
    throw new AcpWorkspaceError('ACP_WORKSPACE_IDENTITY', 'ACP worktree location, Git identity, or branch changed; inspect it before reconnecting')
  }
  matching(await readMarker(reservationPath(actual.commonGitDir, actual.root)), record, false)
  matching(await readMarker(join(actual.gitDir, markerName)), record, true)
  return Object.freeze({ ...record })
}

/** Detect an owned tree, including symlink aliases, descendants, and nested repositories. */
export async function isOwnedAcpWorkspace(cwd) {
  let current = await physicalDirectory(cwd, 'cwd')
  while (true) {
    let entry
    try { entry = await lstat(join(current, '.git')) }
    catch (error) { if (error.code !== 'ENOENT') throw error }
    if (entry) {
      const repo = await repository(current)
      const local = await readMarker(join(repo.gitDir, markerName))
      const reserved = await readMarker(reservationPath(repo.commonGitDir, repo.root))
      // A moved worktree still belongs to ACP. Full resume verification is
      // stricter; this guard never turns altered ownership into permission.
      if (local || reserved) return true
    }
    const parent = dirname(current)
    if (parent === current) return false
    current = parent
  }
}

/** Refuse to treat external interactive output as a Flywheel machine workspace. */
export async function assertNotOwnedAcpWorkspace(cwd) {
  if (await isOwnedAcpWorkspace(cwd)) {
    throw new AcpWorkspaceError('ACP_WORKSPACE_OWNED', 'This directory belongs to an interactive Antigravity ACP session. Use its ACP view; Flywheel machine controls cannot adopt it as a task workspace.')
  }
}
