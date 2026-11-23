# Official Antigravity ACP sessions

English · [简体中文](ACP.zh-CN.md) · [Plugin overview](../README.md) · [Legacy machine API](MACHINE.md)

## Default and ownership

Version 0.3.0 makes `transport: "acp"` the default for the desktop plugin. It opens
Google's unmodified official **`agy acp`** as a directly operated external agent.
The client identifies itself as `dsh-antigravity`; it does not impersonate Zed.
The official agent owns model inference, native tools, tool permissions and its
internal loop. The DSH parent model is not invoked when a person sends a message
in the Antigravity view.

The client sends no `systemPrompt`, `_meta.antigravity.systemPrompt.append`,
managed custom agent, Preset, PTC schema or hidden control prompt. `mcpServers`
is an empty array. Client filesystem and terminal capabilities are false, so
editing and commands remain native agent tools. Native user rules are still
loaded by the official runtime; “no client prompt injection” does not mean that
the effective native system prompt contains no user rules.

This is the external-agent client architecture described by Google's
[CLI ACP guide](https://antigravity.google/docs/cli/acp) and
[editor guide](https://antigravity.google/docs/ide/extensions/acp). It is not a
statement that every third-party integration or automated use is permitted.
The public `./machine` API is an explicitly separate, legacy stream-json path;
it does not acquire a new authorization basis merely because ACP is available.

## First connection

1. Install the official Antigravity CLI **1.5.14** through an official source.
   The plugin does not download it, replace it, migrate credentials or edit its
   settings. macOS/Linux on x64/arm64 are supported platforms.
2. Open a DSH conversation whose current directory belongs to an existing Git
   repository with a commit. Open its **Antigravity** view. On a blank conversation,
   the `/antigravity` command provides the entry guidance; the safe command actions
   are `doctor`, `connect`, `list`, `status` and `cancel` with `version: 2`.
3. Run the environment check and connect. The plugin checks the exact official
   executable digest, version and ACP command before starting a session. A wrapper,
   unknown upgrade or changed profile fails visibly. It does not fall back to the
   standalone Registry agent, headless mode, an API key or another account.
4. If authentication is required, use the view's native sign-in action. It runs
   the same verified `agy acp --login`. Open the Google URL and paste the returned
   authorization code or official callback URL into the password field. Only the
   official process receives the code. It is not a slash command, session event
   or persistent ACP record. A successful helper exit asks you to reconnect; it
   does not automatically send a task or claim verified account entitlement.
5. Select a Gemini model from the options reported by the native session. No
   model IDs or thinking levels are invented by the client, and cached non-Gemini
   selection is not silently changed. Send a message, inspect native tool updates,
   and respond to the exact permission choices offered by the agent.

The view keeps the connection alive across turns. Leaving the view detaches the
display; it does not cancel the native session. Use **Stop** to send native
`session/cancel`, and **Disconnect** to request session close and stop the owned
process group. Disconnect is not Google logout. Native authentication can be
managed in `agy` with `/logout`; the client never deletes credential files.

## Working directory and changes

Each new session gets a separate Git worktree and branch `antigravity/<record-id>`,
based on the source repository's current commit. The view shows the source,
worktree path, branch and base commit. Uncommitted changes in the source directory
are not copied. Commit the intended starting state before connecting if those
changes need to be present.

The worktree and branch remain after disconnect. Review or commit the changes
there, then deliberately integrate them with your normal Git workflow. The plugin
does not auto-merge, reset or remove user work. Resuming verifies the same physical
worktree, owner, native session and runtime identity; it does not create a new
session behind an existing ID.

Ownership reservations are stored in Git's private metadata, outside tracked
files. Flywheel's desktop control refuses automated mutations directed at these
owned ACP worktrees. This is isolation between managed entry points, not a global
filesystem sandbox or a lock on other editors, independently launched CLI tools
or paths native tools may access. The official CLI retains its existing native
permission and sandbox settings.

## Lifecycle, permissions and recovery

ACP records are private files under
`~/.local/state/dsh-subagent-antigravity/acp`. They are independent of Flywheel's
Go-owned `state.json`. Each outgoing prompt has an operation UUID and exact typed
content durably recorded before dispatch. Repeating the same operation ID reads
its existing state; changing its content is rejected. There is no retry loop.

A root `session/prompt` response ends that request only. Native tool, child and
permission events continue to be received. Known unfinished work blocks another
prompt or configuration change. Child IDs and tool IDs are scoped correctly;
unknown or absent child activity is never reported as verified full-tree cleanup.

After a host crash, broken transport, unknown prompt result or unconfirmed native
close, the original operation remains **unknown**. The owned worktree and lock
remain available for inspection. The client never replays local transcript text,
reconstructs a task as a new prompt, or substitutes a new account/runtime to make
that operation appear successful. A separate new connection uses a new worktree.

Normal explicit close requires the runtime's actual `sessionCapabilities.close`
capability plus confirmed owned-process-group cleanup. Exact resume uses negotiated
`session/resume` or `session/load`; loading history is not prompt replay. A native
close acknowledgement and local process supervision are separate observations;
live native detached-task cleanup still needs account/runtime acceptance.

The host participates in DSH workspace activity/stop checks and ties operations to
the actual server-side Agent and current physical directory. An unmounted browser
or aborted RPC wait is not a cleanup acknowledgement. Login and connection leases
also prevent this plugin's controllers from switching native authentication while
another managed session is active or unresolved. They do not control separate
user-launched `agy` processes.

## Public API and legacy migration

`@ckanner/dsh-subagent-antigravity/acp` exports `AcpSessions`, runtime preflight and
TypeScript declarations. Its version-2 human control actions include connection,
status, prompt, permission, configuration, cancellation and native login. The host
uses the authenticated `antigravityAcp.action` Remote; callers do not supply a
workspace, owner, command, environment or system prompt through that Remote.

The stable ACP v1 client uses `@agentclientprotocol/sdk@2.9.1`. Typed text, resource
links, advertised embedded text and advertised image bytes are supported at the
API boundary; unsupported content fails before dispatch. Image data is bounded
base64 content, never a prompt containing a local file path. Display history is
bounded and explicitly marked when truncated; operation records retain the exact
outbound content.

Set `transport: "headless"` explicitly to retain the old task panel and
`subagent_antigravity` tool. The existing preset allowlist still applies. Legacy
`model`, `effort`, `native`, execution and permission configuration belongs to that
path and is not injected into ACP sessions. Version-1 `./machine` consumers retain
their existing receipt/lifecycle contract and must opt into that API explicitly.

## Evidence limits

The release provenance manifest records verified official archive and extracted
binary hashes for all four supported platforms. Actual unauthenticated executable
probes and initialization were run on Linux x64. Other-platform execution,
personal login, Gemini inference, native model changes, image delivery and native
background cleanup were not established by those probes. Offline subprocess,
host/UI and installed-package tests establish client behavior, not account-level
entitlement, billing, policy approval or model quality. See
[validation](VALIDATION.md) for the dated evidence.
