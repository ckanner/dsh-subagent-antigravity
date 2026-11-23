import { access, realpath, stat } from 'node:fs/promises'
import { constants, createReadStream, readFileSync } from 'node:fs'
import { createHash } from 'node:crypto'
import { delimiter, isAbsolute, join } from 'node:path'
import { isDeepStrictEqual } from 'node:util'
import { runtimeEnvironment, inspectSubscription } from '../environment.js'
import { probeCommand } from '../probe.js'

const RELEASE = '1.5.14'
const INSTALL_URL = 'https://github.com/google-antigravity/antigravity-cli/releases/tag/1.5.14'
const provenance = JSON.parse(readFileSync(new URL('./cli-1.5.14.json', import.meta.url), 'utf8'))
const injectedRuntime = /^(?:LD_|DYLD_|PYTHONPATH$|PYTHONHOME$|PYTHONSTARTUP$|BASH_ENV$|ENV$|RUBYOPT$|PERL5OPT$)/

export class AcpRuntimeError extends Error {
  constructor(code, message) {
    super(message)
    this.name = 'AcpRuntimeError'
    this.code = code
    this.installUrl = INSTALL_URL
  }
}

function freeze(value) {
  if (value && typeof value === 'object') {
    for (const child of Object.values(value)) freeze(child)
    Object.freeze(value)
  }
  return value
}

function environment(source) {
  // Keep the account-only controls, without constructing a headless request or
  // overriding the official agent's permission, model, sandbox or rule settings.
  const env = runtimeEnvironment({ env: source })
  for (const key of Object.keys(env)) if (injectedRuntime.test(key)) delete env[key]
  env.AGY_CLI_DISABLE_AUTO_UPDATE = 'true'
  return env
}

async function executablePath(command, env) {
  if (typeof command !== 'string' || !command || command.length > 4096 || /[\x00-\x1f\x7f]/.test(command)) {
    throw new AcpRuntimeError('ACP_INVALID_COMMAND', 'Select an official agy executable path or the program name agy.')
  }
  const absolute = isAbsolute(command)
  if (!absolute && !/^[A-Za-z0-9_.-]+$/.test(command)) {
    throw new AcpRuntimeError('ACP_INVALID_COMMAND', 'The ACP command must be one executable, not a shell command or relative path.')
  }
  const candidates = absolute ? [command] : (env.PATH ?? '').split(delimiter).filter(isAbsolute).map(dir => join(dir, command))
  for (const candidate of candidates) {
    try {
      await access(candidate, constants.X_OK)
      const path = await realpath(candidate)
      if ((await stat(path)).isFile()) return path
    } catch (error) {
      if (!['ENOENT', 'ENOTDIR', 'EACCES'].includes(error.code)) throw error
    }
  }
  throw new AcpRuntimeError('ACP_RUNTIME_NOT_FOUND', 'Official Antigravity CLI was not found. Install it, then select its executable.')
}

async function binaryDigest(executable) {
  const hash = createHash('sha256')
  for await (const chunk of createReadStream(executable)) hash.update(chunk)
  return hash.digest('hex')
}

function inspector({ artifacts, platform, architecture, probe = probeCommand }) {
  // Clone the fixture seam too: changing a caller's manifest after construction
  // must never change the identity that an inspector admits.
  const admitted = freeze(structuredClone(artifacts))
  return async function inspect({ command = 'agy', env: source = process.env, cwd = process.cwd(), expectedIdentity } = {}) {
    const artifact = admitted.find(item => item.platform === platform && item.architecture === architecture && item.version === RELEASE)
    if (!artifact) throw new AcpRuntimeError('ACP_UNSUPPORTED_PLATFORM', 'This pinned ACP client supports macOS and Linux on x64 or arm64 only.')
    const env = environment(source)
    let workdir
    try {
      if (!isAbsolute(cwd)) throw new Error('not absolute')
      workdir = await realpath(cwd)
      if (!(await stat(workdir)).isDirectory()) throw new Error('not a directory')
    } catch {
      throw new AcpRuntimeError('ACP_INVALID_WORKSPACE', 'The ACP workspace must be an existing absolute directory.')
    }
    const executable = await executablePath(command, env)
    const sha256 = await binaryDigest(executable)
    if (sha256 !== artifact.binarySha256) {
      throw new AcpRuntimeError('ACP_UNVERIFIED_BINARY', 'The executable bytes are not the verified official Antigravity CLI 1.5.14 release. Select that official release; wrappers and unverified upgrades are not accepted.')
    }
    const subscription = inspectSubscription(env)
    const identity = freeze({
      schema: 1,
      distribution: 'official-antigravity-cli',
      transport: 'acp',
      executable,
      version: RELEASE,
      sha256,
      platform,
      architecture,
      profile: { home: env.HOME, xdgConfigHome: env.XDG_CONFIG_HOME ?? null },
      subscriptionFingerprint: subscription.fingerprint,
      source: {
        releaseUrl: `https://github.com/google-antigravity/antigravity-cli/releases/tag/${RELEASE}`,
        releaseAssetUrl: artifact.releaseAssetUrl,
        archiveUrl: artifact.archiveUrl,
        archiveSha256: artifact.archiveSha256,
        archiveSha512: artifact.archiveSha512,
        archiveMember: artifact.archiveMember,
      },
    })
    if (expectedIdentity !== undefined && !isDeepStrictEqual(identity, expectedIdentity)) {
      throw new AcpRuntimeError('ACP_RUNTIME_DRIFT', 'The ACP executable, native profile or account controls changed. Reconnect and review the new runtime before continuing.')
    }
    const options = { cwd: workdir, env, timeoutMs: 10000 }
    const version = await probe(executable, ['--version'], options)
    // This exact stdout was observed for the verified Linux x64 release. Do not
    // accept a wrapper's banner, multiple versions or a version from stderr.
    if (!version.ok || version.output.trim() !== RELEASE) {
      throw new AcpRuntimeError('ACP_VERSION_NOT_CONFIRMED', 'The verified CLI did not report version 1.5.14 successfully.')
    }
    const help = await probe(executable, ['acp', '--help'], options)
    const helpText = `${help.output}\n${help.error ?? ''}`
    if (!help.ok || !/Usage:\s+agy acp\b/.test(helpText) || !/Agent Client Protocol/.test(helpText) || !/(?:^|\n)\s+--login\b/.test(helpText)) {
      throw new AcpRuntimeError('ACP_CAPABILITIES_NOT_CONFIRMED', 'The official CLI ACP command and native login helper were not confirmed by acp --help.')
    }
    if (await binaryDigest(executable) !== sha256 || inspectSubscription(env).fingerprint !== subscription.fingerprint) {
      throw new AcpRuntimeError('ACP_RUNTIME_DRIFT', 'The ACP executable or native account controls changed during preflight. No session was started.')
    }
    return freeze({ executable, version: RELEASE, sha256, platform, architecture, env, identity, subscription,
      preflight: { version: true, acpHelp: true, authentication: 'unverified', inferencePerformed: false } })
  }
}

/** The production path has no configurable hashes, manifest, probe or bypass. */
export const inspectAcpRuntime = inspector({ artifacts: provenance.artifacts, platform: process.platform, architecture: process.arch })

/** Internal test construction seam; never wired to plugin configuration or RPC. */
export function createAcpRuntimeInspectorForTests({ artifacts, platform = process.platform, architecture = process.arch, probe } = {}) {
  return inspector({ artifacts, platform, architecture, probe })
}
