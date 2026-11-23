import test from 'node:test'
import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync, chmodSync, existsSync, realpathSync, symlinkSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { delimiter, join, resolve } from 'node:path'
import { inspectAcpRuntime, createAcpRuntimeInspectorForTests } from '../lib/acp/runtime.js'

const provenance = JSON.parse(readFileSync(new URL('../lib/acp/cli-1.5.14.json', import.meta.url), 'utf8'))
const fixture = readFileSync(new URL('./fixtures/acp/fake-acp-cli.js', import.meta.url))
function setup(t, extra = {}) {
  const root = realpathSync(mkdtempSync(join(tmpdir(), 'agy-acp-runtime-')))
  t.after(() => rmSync(root, { recursive: true, force: true }))
  const bin = join(root, 'bin'), cwd = join(root, 'work')
  mkdirSync(bin); mkdirSync(cwd)
  const executable = join(bin, 'agy'), marker = join(root, 'probes')
  writeFileSync(executable, fixture); chmodSync(executable, 0o755)
  const artifact = { ...provenance.artifacts[0], platform: process.platform, architecture: process.arch, binarySha256: createHash('sha256').update(fixture).digest('hex') }
  const inspect = createAcpRuntimeInspectorForTests({ artifacts: [artifact], ...extra })
  const env = { HOME: root, PATH: bin + delimiter + process.env.PATH, FIXTURE_PROBE_MARKER: marker }
  return { root, bin, cwd, executable, marker, env, inspect, artifact }
}

test('the production inspector rejects a version-spoofing wrapper before executing it', async t => {
  const f = setup(t)
  await assert.rejects(inspectAcpRuntime({ command: 'agy', env: f.env, cwd: f.cwd }), { code: 'ACP_UNVERIFIED_BINARY' })
  assert.equal(existsSync(f.marker), false)
})

test('preflight resolves one physical executable, filters routing and freezes native identity without headless flags', async t => {
  const f = setup(t), alias = join(f.bin, 'official-agy')
  symlinkSync(f.executable, alias)
  Object.assign(f.env, { GEMINI_API_KEY: 'synthetic', OPENAI_API_KEY: 'synthetic', NODE_OPTIONS: '--inspect', LD_PRELOAD: '/untrusted.so', PYTHONPATH: '/untrusted', AGY_CLI_DISABLE_AUTO_UPDATE: 'false' })
  const r = await f.inspect({ command: alias, env: f.env, cwd: f.cwd })
  assert.equal(r.executable, f.executable)
  assert.equal(r.version, '1.5.14')
  assert.equal(r.env.AGY_CLI_DISABLE_AUTO_UPDATE, 'true')
  for (const name of ['GEMINI_API_KEY', 'OPENAI_API_KEY', 'NODE_OPTIONS', 'LD_PRELOAD', 'PYTHONPATH']) assert.equal(r.env[name], undefined)
  assert.equal(r.subscription.authentication, 'native-account-unverified')
  assert.deepEqual(readFileSync(f.marker, 'utf8').trim().split('\n').map(JSON.parse), [['--version'], ['acp', '--help']])
  assert.equal(Object.isFrozen(r.identity.source), true)
  assert.equal(Object.isFrozen(r.env), true)
  const again = await f.inspect({ command: r.executable, env: r.env, cwd: f.cwd, expectedIdentity: r.identity })
  assert.deepEqual(again.identity, r.identity)
})

test('account-only controls apply while native permission/model choices are not rewritten', async t => {
  const f = setup(t)
  mkdirSync(join(f.root, '.gemini', 'antigravity-cli'), { recursive: true })
  const path = join(f.root, '.gemini', 'antigravity-cli', 'settings.json')
  const native = { toolPermission: 'always-proceed', enableTerminalSandbox: true, model: 'native-choice', useG1Credits: false }
  writeFileSync(path, JSON.stringify(native))
  await f.inspect({ env: f.env, cwd: f.cwd })
  assert.deepEqual(JSON.parse(readFileSync(path, 'utf8')), native)
  writeFileSync(path, JSON.stringify({ ...native, useG1Credits: true }))
  await assert.rejects(f.inspect({ env: f.env, cwd: f.cwd }), /useG1Credits/)
  await assert.rejects(f.inspect({ env: { ...f.env, AGY_ADC_AUTH: 'true' }, cwd: f.cwd }), /ADC/)
})

test('an exact executable digest and truthful --version/help are all required', async t => {
  const f = setup(t)
  await assert.rejects(f.inspect({ env: { ...f.env, FIXTURE_VERSION: '1.5.13' }, cwd: f.cwd }), { code: 'ACP_VERSION_NOT_CONFIRMED' })
  await assert.rejects(f.inspect({ env: { ...f.env, FIXTURE_VERSION: 'wrapper 1.5.14' }, cwd: f.cwd }), { code: 'ACP_VERSION_NOT_CONFIRMED' })
  await assert.rejects(f.inspect({ env: { ...f.env, FIXTURE_HELP_MODE: 'invalid' }, cwd: f.cwd }), { code: 'ACP_CAPABILITIES_NOT_CONFIRMED' })
  writeFileSync(f.executable, Buffer.concat([fixture, Buffer.from('\n// changed\n')]))
  await assert.rejects(f.inspect({ env: f.env, cwd: f.cwd }), { code: 'ACP_UNVERIFIED_BINARY' })
})

test('byte or native-setting drift during preflight is rejected', async t => {
  const f = setup(t)
  let calls = 0
  const inspect = createAcpRuntimeInspectorForTests({ artifacts: [f.artifact], probe: async () => {
    if (++calls === 1) return { ok: true, output: '1.5.14\n' }
    writeFileSync(f.executable, Buffer.concat([fixture, Buffer.from('\n// upgraded\n')]))
    return { ok: true, output: '', error: 'Usage: agy acp [flags]\nAgent Client Protocol\n  --login native' }
  } })
  await assert.rejects(inspect({ env: f.env, cwd: f.cwd }), { code: 'ACP_RUNTIME_DRIFT' })
})

test('frozen identity rejects changed native profile/configuration and unsupported platforms', async t => {
  const f = setup(t), first = await f.inspect({ env: f.env, cwd: f.cwd })
  const other = join(f.root, 'other-home'); mkdirSync(other)
  await assert.rejects(f.inspect({ env: { ...f.env, HOME: other }, cwd: f.cwd, expectedIdentity: first.identity }), { code: 'ACP_RUNTIME_DRIFT' })
  const inspect = createAcpRuntimeInspectorForTests({ artifacts: [f.artifact], platform: 'win32', architecture: 'x64' })
  await assert.rejects(inspect({ env: f.env, cwd: f.cwd }), { code: 'ACP_UNSUPPORTED_PLATFORM' })
  await assert.rejects(f.inspect({ command: 'agy --version', env: f.env, cwd: f.cwd }), { code: 'ACP_INVALID_COMMAND' })
})

test('four official artifacts and the credential-free recorded Linux initialize remain explicit', () => {
  assert.deepEqual(provenance.artifacts.map(a => a.platform + '-' + a.architecture).sort(), ['darwin-arm64', 'darwin-x64', 'linux-arm64', 'linux-x64'])
  for (const a of provenance.artifacts) {
    assert.match(a.binarySha256, /^[0-9a-f]{64}$/)
    assert.match(a.archiveSha256, /^[0-9a-f]{64}$/)
    assert.match(a.archiveSha512, /^[0-9a-f]{128}$/)
    assert.match(a.releaseAssetUrl, /^https:\/\/github\.com\/google-antigravity\/antigravity-cli\/releases\/download\/1\.5\.14\//)
  }
  const observed = JSON.parse(readFileSync(new URL('./fixtures/acp/official-cli-1.5.14-linux-x64.json', import.meta.url), 'utf8'))
  assert.equal(observed.authenticationPerformed, false)
  assert.equal(observed.inferencePerformed, false)
  assert.equal(observed.versionProbe.output, '1.5.14\n')
  assert.deepEqual(observed.initialize.response.result.agentCapabilities.auth.logout, {})
})
