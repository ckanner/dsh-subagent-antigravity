#!/usr/bin/env node
// Synthetic executable admitted only through isolated test factories.
import { appendFileSync } from 'node:fs'
import { createInterface } from 'node:readline'
import { spawn } from 'node:child_process'

if (process.env.FIXTURE_PROBE_MARKER) appendFileSync(process.env.FIXTURE_PROBE_MARKER, JSON.stringify(process.argv.slice(2)) + '\n')
if (process.argv[2] === '--version') {
  console.log(process.env.FIXTURE_VERSION ?? '1.5.14')
  process.exit(0)
}
if (process.argv[2] === 'acp' && process.argv[3] === '--help') {
  console.error(process.env.FIXTURE_HELP_MODE === 'invalid' ? 'not an ACP server' : 'Usage: agy acp [flags]\nStart the Agent Client Protocol (ACP) stdio server\n  --login  Native sign-in')
  process.exit(0)
}
if (process.argv[2] !== 'acp' || process.argv[3] !== '--login' || process.argv.length !== 4) process.exit(90)
if (process.env.DISPLAY || process.env.WAYLAND_DISPLAY) process.exit(91)

const mode = process.env.FIXTURE_LOGIN_MODE ?? 'success'
const authorization = state => {
  const url = new URL(mode === 'spoof-url' ? 'https://accounts.google.com.attacker.example/o/oauth2/auth' : 'https://accounts.google.com/o/oauth2/auth')
  url.searchParams.set('client_id', 'fixture-client.apps.googleusercontent.com')
  url.searchParams.set('redirect_uri', mode === 'bad-url' ? 'https://attacker.example/callback' : 'https://antigravity.google/oauth-callback')
  url.searchParams.set('response_type', 'code')
  url.searchParams.set('state', state)
  return url.href
}
const url = authorization('fixture-state')
console.log('Open this link:\n' + url)
if (mode === 'large-output') console.log('x'.repeat(40 * 1024))
let descendant
if (mode === 'descendant') {
  descendant = spawn(process.execPath, ['-e', 'setInterval(()=>{},1000)'], { stdio: 'inherit' })
  if (process.env.FIXTURE_CHILD_PID_FILE) appendFileSync(process.env.FIXTURE_CHILD_PID_FILE, String(descendant.pid))
}
process.on('SIGTERM', () => {
  if (descendant) {
    descendant.once('exit', () => process.exit(0))
    descendant.kill('SIGTERM')
  } else process.exit(0)
})
setInterval(() => {}, 1000)
let submissions = 0
createInterface({ input: process.stdin }).on('line', line => {
  submissions++
  if (mode === 'hang' || mode === 'descendant') return
  if (mode === 'rotate' && submissions === 1) { console.log(authorization('replacement-state')); return }
  // Deliberately echo synthetic credentials. The host must never expose this.
  console.log('received: ' + line)
  console.error('token=synthetic-secret; code=' + line)
  if (line !== '4/test-code') process.exit(17)
  process.exit(mode === 'failure' ? 3 : 0)
})
