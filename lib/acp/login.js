import { spawn } from 'node:child_process'
import { StringDecoder } from 'node:string_decoder'
import { inspectAcpRuntime } from './runtime.js'
import { stopGroup } from '../runner.js'

const CALLBACK = 'https://antigravity.google/oauth-callback'
const terminalStates = new Set(['succeeded', 'failed', 'cancelled'])
const ansi = /\x1b\[[0-?]*[ -/]*[@-~]/g
const error = message => Object.assign(new Error(message), { code: 'ACP_LOGIN_INPUT' })

function one(url, key) {
  const values = url.searchParams.getAll(key)
  if (values.length !== 1 || !values[0]) throw error('The official authorization URL is incomplete or ambiguous.')
  return values[0]
}

function authorizationUrl(value) {
  let url
  try { url = new URL(value) } catch { throw error('The official authorization URL is invalid.') }
  if (url.protocol !== 'https:' || url.hostname !== 'accounts.google.com' || url.port || url.username || url.password || url.hash || !['/o/oauth2/auth', '/o/oauth2/v2/auth'].includes(url.pathname)) {
    throw error('Only the official Google account authorization URL is accepted.')
  }
  if (one(url, 'redirect_uri') !== CALLBACK || one(url, 'response_type') !== 'code') {
    throw error('The sign-in flow did not use the official Antigravity callback.')
  }
  const state = one(url, 'state')
  if (state.length > 512 || /[\x00-\x20\x7f]/.test(state)) throw error('The sign-in state is invalid.')
  one(url, 'client_id')
  return { url: url.href, state }
}

function responseCode(input, expectedState) {
  if (typeof input !== 'string' || input.length > 16384) throw error('Paste the authorization code or the official callback URL.')
  const value = input.trim()
  if (!value || /[\x00-\x1f\x7f]/.test(value)) throw error('The sign-in response must be a single line.')
  let code = value
  if (/^[a-z][a-z0-9+.-]*:/i.test(value)) {
    let url
    try { url = new URL(value) } catch { throw error('The callback URL is invalid.') }
    if (`${url.origin}${url.pathname}` !== CALLBACK || url.username || url.password || url.hash || url.searchParams.has('error')) {
      throw error('Use the official Antigravity callback URL after a successful sign-in.')
    }
    if (one(url, 'state') !== expectedState) throw error('This callback belongs to a different sign-in attempt. Use the current link.')
    code = one(url, 'code')
  }
  if (code.length > 8192 || !/^[A-Za-z0-9._~+\/-]+$/.test(code)) throw error('The authorization code is invalid.')
  return code
}

function loginClass({ inspect = inspectAcpRuntime, spawnProcess = spawn, stop = stopGroup, timeoutMs = 10 * 60 * 1000, graceMs = 1500 } = {}) {
  return class AcpLogin {
    #runtime
    #cwd
    #onUpdate
    #child = null
    #state = 'idle'
    #authUrl = null
    #oauthState = null
    #message = 'Sign in with the official Antigravity CLI.'
    #exitCode = null
    #signal = null
    #cleanup = true
    #cancelled = false
    #failure = null
    #startPromise = null
    #stopPromise = null
    #timer = null
    #totalBytes = 0

    constructor({ runtime, cwd, onUpdate } = {}) {
      if (!runtime?.executable || !runtime?.identity) throw new Error('A verified ACP runtime is required for sign-in.')
      this.#runtime = runtime
      this.#cwd = cwd
      this.#onUpdate = onUpdate
    }

    snapshot() {
      return { state: this.#state, authUrl: this.#authUrl, message: this.#message,
        helperCompleted: this.#state === 'succeeded', authenticationVerified: false,
        exitCode: this.#exitCode, signal: this.#signal, cleanupConfirmed: this.#cleanup }
    }

    #update(state, message) {
      this.#state = state
      this.#message = message
      try { this.#onUpdate?.(this.snapshot()) } catch { /* UI failures cannot orphan the login helper. */ }
    }

    start() {
      return this.#startPromise ??= this.#start()
    }

    async #start() {
      if (this.#cancelled) return this.snapshot()
      this.#update('starting', 'Starting the official Google sign-in flow…')
      try {
        this.#runtime = await inspect({ command: this.#runtime.executable, env: this.#runtime.env, cwd: this.#cwd, expectedIdentity: this.#runtime.identity })
        if (this.#cancelled) return this.snapshot()
        const helperEnv = { ...this.#runtime.env }
        // The code-entry helper is presented in our UI, not in a server-side
        // desktop browser. Keep the native profile and authentication routing.
        delete helperEnv.DISPLAY
        delete helperEnv.WAYLAND_DISPLAY
        const child = spawnProcess(this.#runtime.executable, ['acp', '--login'], {
          cwd: this.#cwd, env: helperEnv, shell: false, detached: true, windowsHide: true, stdio: ['pipe', 'pipe', 'pipe'],
        })
        this.#child = child
        this.#cleanup = !child.pid
        child.once('close', (code, signal) => {
          this.#exitCode = code
          this.#signal = signal
          clearTimeout(this.#timer)
          void this.#finished()
        })
        child.once('error', () => this.#fail('The official login helper could not start.'))
        child.stdin.on('error', () => { if (!terminalStates.has(this.#state) && !this.#cancelled) this.#fail('The login helper input closed before sign-in completed.') })
        for (const stream of [child.stdout, child.stderr]) {
          const decoder = new StringDecoder('utf8')
          let pending = ''
          stream.on('data', chunk => {
            if (this.#cancelled || this.#failure || terminalStates.has(this.#state)) return
            this.#totalBytes += chunk.length
            if (this.#totalBytes > 128 * 1024) { this.#fail('The login helper produced too much output.'); return }
            pending += decoder.write(chunk)
            let at
            while ((at = pending.indexOf('\n')) >= 0) {
              if (Buffer.byteLength(pending.slice(0, at)) > 32 * 1024) { this.#fail('The login helper produced an oversized line.'); return }
              this.#line(pending.slice(0, at))
              pending = pending.slice(at + 1)
            }
            if (Buffer.byteLength(pending) > 32 * 1024) { this.#fail('The login helper produced an oversized line.'); return }
            // Some CLI builds flush a URL before printing the input prompt's
            // newline. A URL is parsed only once it has a whitespace boundary.
            if (/https:\/\/accounts\.google\.com\/\S+\s/.test(pending)) this.#line(pending)
          })
          stream.on('end', () => { pending += decoder.end(); if (pending) this.#line(pending); pending = '' })
        }
        this.#timer = setTimeout(() => this.#fail('The sign-in attempt expired. Start a new sign-in attempt.'), timeoutMs)
        return this.snapshot()
      } catch (cause) {
        if (!this.#cancelled) this.#update('failed', cause.code?.startsWith('ACP_') ? cause.message : 'The official login runtime could not be verified.')
        return this.snapshot()
      }
    }

    #line(line) {
      if (this.#cancelled || this.#failure || terminalStates.has(this.#state)) return
      const clean = line.replace(ansi, '')
      const candidates = clean.match(/https:\/\/accounts\.google\.com[^\s<>"'\x00-\x1f)]+/g) ?? []
      for (const candidate of candidates) {
        try {
          const parsed = authorizationUrl(candidate)
          if (parsed.url === this.#authUrl) continue
          this.#authUrl = parsed.url
          this.#oauthState = parsed.state
          this.#update('awaiting-input', 'Open the Google sign-in link, then paste the authorization code or callback URL here.')
        } catch {
          this.#fail('The login helper returned an unexpected authorization URL. No credentials were submitted.')
        }
      }
    }

    async submit(input) {
      if (this.#state !== 'awaiting-input' || !this.#child?.stdin?.writable || !this.#oauthState) throw error('There is no active sign-in attempt waiting for a code.')
      // The code exists only long enough to write to the owned official child's
      // stdin. It is never part of snapshots, callbacks, errors or a journal.
      const code = responseCode(input, this.#oauthState)
      this.#update('authenticating', 'Waiting for the official CLI to complete sign-in…')
      await new Promise((resolve, reject) => {
        this.#child.stdin.write(code + '\n', cause => {
          if (cause) { this.#fail('The code could not be sent to the official login helper.'); reject(error('The login helper input is unavailable.')) }
          else resolve()
        })
      })
      return this.snapshot()
    }

    #fail(message) {
      if (this.#cancelled || this.#failure || terminalStates.has(this.#state)) return
      this.#failure = message
      this.#update('stopping', message)
      void this.#stop().then(() => {
        if (!this.#cancelled) this.#update('failed', this.#failure)
      })
    }

    #stop() {
      return this.#stopPromise ??= (async () => {
        if (!this.#child?.pid) { this.#cleanup = true; return }
        try { this.#cleanup = await stop(this.#child.pid, graceMs) } catch { this.#cleanup = false }
        this.#child.stdin.destroy()
        this.#child.stdout.destroy()
        this.#child.stderr.destroy()
        if (!this.#cleanup) this.#child.unref()
        this.#oauthState = null
        this.#authUrl = null
      })()
    }

    async #finished() {
      await this.#stop()
      if (this.#cancelled) this.#update('cancelled', 'Sign-in cancelled.')
      else if (this.#failure) this.#update('failed', this.#failure)
      else if (this.#exitCode === 0 && !this.#signal && this.#cleanup) this.#update('succeeded', 'The login helper completed. Reconnect to verify authentication.')
      else this.#update('failed', this.#cleanup ? 'The official CLI did not complete sign-in.' : 'Login helper cleanup could not be confirmed.')
    }

    async cancel() {
      if (terminalStates.has(this.#state) && this.#cleanup) return this.snapshot()
      if (terminalStates.has(this.#state)) this.#stopPromise = null
      this.#cancelled = true
      clearTimeout(this.#timer)
      this.#update('cancelling', 'Cancelling sign-in…')
      // A cancellation during the preflight never starts a helper afterwards.
      if (!this.#child && this.#startPromise) await this.#startPromise
      await this.#stop()
      this.#update('cancelled', this.#cleanup ? 'Sign-in cancelled.' : 'Sign-in cancelled; process cleanup could not be confirmed.')
      return this.snapshot()
    }
  }
}

export const AcpLogin = loginClass()

/** Isolated fixture seam. Production construction always rechecks official bytes. */
export function createAcpLoginForTests(dependencies) { return loginClass(dependencies) }
