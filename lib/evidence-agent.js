import { closeSync, constants, lstatSync, mkdirSync, mkdtempSync, openSync, readFileSync, realpathSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { hash } from './input.js'

/**
 * Isolated custom-agent allowlist in a private temporary workspace so the
 * caller's Git repository is never written to (even on SIGKILL).
 */
export function prepareEvidenceAgent(_cwd, runId) {
  const root = realpathSync(mkdtempSync(join(tmpdir(), 'agy-evidence-')))
  for (const dir of [join(root, '.agents'), join(root, '.agents', 'agents')]) {
    mkdirSync(dir, { mode: 0o700 })
    const stat = lstatSync(dir)
    if (!stat.isDirectory() || stat.isSymbolicLink() || realpathSync(dir) !== dir) {
      throw new Error('evidence-only agent directory must be a physical private directory')
    }
  }
  const name = 'dsh-evidence-' + runId
  const path = join(root, '.agents', 'agents', name + '.md')
  const content = '---\nname: ' + name + '\ndescription: Analyze only the evidence included in the user message.\nmainAgent: true\nsubagent: false\nmodel: inherit\ntools: []\nmcpServers: []\nskills: []\nplugins: []\ncommandExecutionPolicy: "off"\n---\nAnalyze the supplied evidence. Identify gaps without collecting additional evidence.\n'
  const fd = openSync(path, constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL | constants.O_NOFOLLOW, 0o600)
  try { writeFileSync(fd, content) } finally { closeSync(fd) }
  const inode = lstatSync(path).ino
  const verify = () => {
    const stat = lstatSync(path)
    if (stat.isSymbolicLink() || stat.ino !== inode || readFileSync(path, 'utf8') !== content) {
      throw new Error('managed evidence-only agent changed during invocation')
    }
  }
  return {
    name,
    cwd: root,
    path,
    digest: hash(content),
    ownerRunId: runId,
    verify,
    dispose() {
      verify()
      rmSync(root, { recursive: true, force: true })
    },
  }
}
