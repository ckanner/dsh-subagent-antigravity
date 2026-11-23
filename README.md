# dsh-subagent-antigravity

[简体中文](README.zh-CN.md) · [Interactive ACP](docs/ACP.md) · [Legacy machine contract](docs/MACHINE.md) · [Compatibility and release checks](docs/VALIDATION.md)

Use the **official, unmodified `agy acp`** for personal interactive development in DSH and Flywheel. Version **0.3.0 defaults to `transport: "acp"`**: a person sends messages directly to the official Antigravity agent, which owns its native login, model inference, tools, permissions and execution loop. Each new session gets its own Git worktree. The DSH parent model is not invoked.

**0.3.0 is an unpublished release candidate.** Build and install its exact local tarball for acceptance. **0.2.1 remains the published npm / `v0.2.1` GitHub release**; its 2026-11-21 live `agy` 1.5.14 native, evidence-only, Orchestrator, explicit-subagent and Swarm checks exercised the legacy headless path. Those historical results do not establish ACP login, inference, image delivery or native background cleanup.

The ACP client sends no replacement or appended system prompt, managed custom agent, Preset, PTC tool definitions or host tool bridge. The official runtime can still load the user's native rules. The separate headless task runner and machine API remain available only through explicit legacy use; the new ACP entry does not establish permission for automated personal-account use. See the [ACP architecture and boundaries](docs/ACP.md).

## Requirements and installation

- Node.js 22.18+ on macOS or Linux, x64 or arm64. Windows execution is rejected because process supervision uses POSIX groups.
- The official CLI **exactly 1.5.14**, installed by the user from the [official release](https://github.com/google-antigravity/antigravity-cli/releases/tag/1.5.14). ACP admits only the four executable digests recorded in the [provenance manifest](lib/acp/cli-1.5.14.json), not arbitrary binaries or wrappers printing the same version. An unknown upgrade is rejected; `AGY_CLI_DISABLE_AUTO_UPDATE=true` is set for owned CLI processes. The plugin does not download or replace the CLI.
- An existing Git repository with at least one commit. New ACP worktrees start from its current committed HEAD; uncommitted changes are not copied.
- DSH with public commands, workingDirectory, authenticated Remotes, conversation-view/settings slots and Agent lifecycle services. The published schema/PTC contract remains checked against `0.2.2-rc.3`; required host capabilities are checked when the plugin loads. Agent tools and jobs are needed only for their explicit legacy delegation paths.
- Native personal-account routing, no ADC/GCP/custom API models, and AI credits fallback disabled in the official CLI. Sign in through the official helper when needed; the plugin does not create its own OAuth client or migrate credentials. See [subscription controls](#subscription-controls).

Build and check a candidate from this repository:

```sh
npm ci --ignore-scripts
npm run check
```

`npm run test:package` prints the exact candidate `.tgz` and integrity. Install that artifact into a disposable DSH profile first:

```sh
dsh plugin --profile <profile> add /absolute/path/ckanner-dsh-subagent-antigravity-0.3.0.tgz
```

Registry installation by package name becomes appropriate only after that exact version is published; this candidate is not promised by npm `latest`. There are no install scripts and no automatic inference tests. The bundle creates one `antigravity` plugin row with ACP as its default. It is an external-agent client, not a conventional DSH LLM provider.

## Desktop use (default ACP)

Open a DSH conversation in the intended committed Git repository, then open **Antigravity**. Use **Check CLI** to verify the exact runtime and local account-routing controls, then **New isolated session**. The page shows the source directory, new worktree, branch and starting commit. Environment checks do not send a model prompt or prove account entitlement.

If authentication is required, use **Sign in with Google**. The plugin starts the same verified executable with `acp --login`, shows its official Google sign-in URL and accepts the returned code or official callback URL in a password field. The code is sent only to that helper's stdin; it is not written into commands, session history or ACP records. After the helper exits successfully, connect or resume explicitly to verify authentication. A successful helper exit is not a completed model request.

Choose a Gemini model and any configuration options actually offered by the native session, then send your message. The page displays native text, thoughts, tools, permissions, plans and reported child activity; permission choices come from the official agent. When image support is advertised, choose or paste PNG, JPEG, WebP or GIF files: the client sends bounded image bytes, not file-path text. Image delivery through a real account remains an acceptance gate.

The connection persists across turns. Switching views detaches the display. **Stop work** sends native cancellation; **Disconnect session** requests native close and stops the owned process group, while retaining the worktree and branch for review and integration. Disconnect is not logout. A root response does not establish that all tools or child work ended; known unfinished work blocks the next prompt. An unknown result or unconfirmed cleanup keeps its record and lock, with no automatic replay.

**Resume session** verifies the same worktree, owner, native session and exact runtime identity. New sessions get new worktrees. Legacy saved model, effort, collaboration, permission and execution defaults are not injected into ACP. The client also prevents its managed connections from racing a native login; separate user-launched CLI processes are outside that coordination.

The slash command provides entry guidance and a small set of version-2 control actions. Prompts, images, configuration, permission replies and sign-in responses stay in the authenticated view:

```text
/antigravity
/antigravity {"version":2,"action":"doctor"}
/antigravity {"version":2,"action":"connect"}
/antigravity {"version":2,"action":"list"}
/antigravity {"version":2,"action":"status","id":"<exact returned record UUID>"}
/antigravity {"version":2,"action":"cancel","id":"<exact returned record UUID>"}
```

See [Interactive ACP](docs/ACP.md) for worktree ownership, exact resume, native permissions, lifecycle evidence, image limits and the public `./acp` API.

## Explicit legacy headless use

The following task-panel, Agent/PTC, collaboration, evidence-only and machine sections describe the retained **stream-json headless** implementation. In the DSH plugin, explicitly set `transport: "headless"` to enable its panel, version-1 commands and `subagent_antigravity` tool:

```yaml
transport: headless
command: agy
```

Agent delegation additionally requires the selected preset to **explicitly register `subagent_antigravity`**; the plugin's `presets` setting is a second allowlist. The public `./machine` import and `antigravity-machine` wrapper are independently selected headless interfaces, not ACP routes; they do not take a new transport field. Retaining these APIs and historical tests does not assert that personal native login authorizes unattended or parent-agent automation.

The legacy baseline remains official `agy` 1.5.7+, or 1.5.12+ for Orchestrator and explicit subagents/Swarm. These version ranges apply only to the old runner; they do not relax ACP's exact 1.5.14 executable admission.

### Legacy task panel

Open the **Antigravity** conversation view. Enter the complete task, optional project directory, task name and exact model. Adjustable models expose effort; Orchestrator shows **Fixed by model**. Choose the native collaboration, execution and approval settings, then **Start task**. The view uses DSH's public command transport directly; it does not generate an assistant message or invoke the parent model.

Use **Refresh tasks**, **View result** and **Cancel** to manage the session's work. Task ownership includes the Desktop session, canonical workspace and invocation ID. Switching views keeps tasks running; disposing the plugin cancels owned live invocations. After a host restart, the same owner can read persisted receipts. A task without conclusive evidence remains `unknown`; a status read never starts a replacement run. An unknown task has no “retry automatically” behavior.

The panel shows the local label, conversation ID, requested model/effort/collaboration, observed binding, progress/result, errors and cleanup/provider-work evidence. **View result** on a running task shows its current observed child IDs and roles, with unknown child states retained. Native titles are not modified. **Check environment** runs only `--version`, `--help` and `models`; it cannot establish entitlement, remaining quota or answer quality.

Settings are available on the plugin row. Each invocation freezes its configuration. Saving command/default directory/model/effort/native collaboration/permissions/deadline/preset settings affects later calls. An explicit selection in a task takes precedence over saved defaults. Resume restores the original task's binding in the form; omitted native options on resume come from that owner's prior task, including an originally absent field, rather than a later saved collaboration default. Changing the binding is rejected by the runner.

The same direct interface is available as a DSH command:

```text
/antigravity {"version":1,"action":"start","label":"Investigate timeout","prompt":"Analyze the evidence below…","model":"gemini-4-neon-high","effort":"high","toolPolicy":"evidence-only"}
/antigravity {"version":1,"action":"list"}
/antigravity {"version":1,"action":"result","invocationId":"<exact returned UUID>"}
/antigravity {"version":1,"action":"cancel","invocationId":"<exact returned UUID>"}
```

`status`, `doctor` and `defaults` are also version-1 actions. Manual tasks use the plugin's owner-bound store; they do not fabricate an Agent-owned DSH job.

## Agent and PTC delegation (headless only)

```js
subagent_antigravity({
  label: "Fix timeout regression",
  prompt: "Reproduce and fix the approved timeout defect, then run the regression test. …",
  model: "gemini-4-hydrogen-high",
  effort: "high",
  run_in_background: true
})
```

Background calls return `{kind:"background", jobId}` and use the host's `job_output` and `job_kill`. Foreground calls return text content containing a bounded task result, native observations and evidence identifiers. Tool calls cannot widen native permissions or choose a different owner workspace. They can choose a model/effort, `native` mode, exact prior session ID, deadline, JSON output schema, and `toolPolicy`.

Tool registration is scoped to allowed committed presets and rechecked at execution, including after preset changes. Both its input and output schemas are tested with DSH's published validator and PTC SDK generator.

## Orchestrator, subagents and Swarm (headless only)

Model selection and collaboration are independent. The official [model guide](https://antigravity.google/docs/models) describes Orchestrator as a planner/implementer handoff within one agent; [Swarm](https://antigravity.google/docs/swarm/) requests parallel native members. Selecting Orchestrator alone does not assert a spawned team.

| Model | Effort value |
| --- | --- |
| `gemini-4-hydrogen-*`, `gemini-4-neon-*` | Matching `low`, `medium`, `high` or `xhigh` suffix |
| `gemini-4-carbon-*`, `gemini-4-argon-*` | Matching `low`, `medium` or `high` suffix |
| `gemini-pro-orchestrator-neon` | `""` — fixed; no `--effort` flag |
| `gemini-pro-orchestrator` (Carbon) | `""` — fixed; no `--effort` flag |
| `gemini-pro-orchestrator-argon` | `""` — fixed; no `--effort` flag |

An omitted `native` keeps the CLI's ordinary behavior. Explicit options have the same shape in DSH defaults, direct actions, Agent/PTC calls and the machine API:

```js
subagent_antigravity({
  prompt: "Implement the approved parser and UI changes in their separate file scopes; gather results and run the integration checks.",
  model: "gemini-pro-orchestrator",
  effort: "",
  native: { version: 1, mode: "swarm", maxObservedAgents: 4 }
})
```

| `native.mode` | Requested behavior and admission |
| --- | --- |
| `native` | Preserve autonomous CLI behavior; it can still use native children. Slash expansion remains disabled. |
| `subagents` | Ask the coordinator to delegate and collect results. `init.tools` must advertise `invoke_subagent` before any prompt is sent. Slash expansion remains disabled. |
| `swarm` | Send the adapter-owned `/swarm` command with user task text encoded as JSON data. Existing `disableSlashCommands:true` settings block the request; the adapter does not change them. |

Explicit subagents require observed child metadata; a normal subagent root result without it fails with `collaboration-not-observed`. Swarm is different: a successful adapter-owned `/swarm` root invocation is accepted even when `agy` 1.5.14 exposes no child metadata, but the receipt records `collaborationObserved:false`, `children:"unknown"` and never claims a board, worker models or child terminal states. Any nonempty native `finished_reason`, including `print_timeout`, fails even when status is SUCCESS and exit is zero, following the official [headless/changelog contract](https://antigravity.google/docs/changelog?tab=cli).

`maxObservedAgents` is an optional integer from 1 to 8. It counts **all unique observed child IDs**, including verifier and monitor. Exceeding it stops this owned CLI invocation. Its receipt always says `hard:false`: this is an observation guard, not a native concurrency cap, a complete remote-tree limit or a quota guarantee. Whole-tree usage and child models/states remain unknown when the protocol does not report them. URI metadata is retained but never opened automatically.

Completion is scoped to **this CLI invocation**. Local cancellation supervises its owned process group; recovery reads its original journal. Neither performs a provider-wide child query or cancellation. Use clear independent tasks for collaboration, and retain a separate formal review where the outer workflow requires one; a native verifier is evidence from the same root invocation.

## Public machine API (legacy headless)

```js
import { runMachine } from "@ckanner/dsh-subagent-antigravity/machine";

const receipt = await runMachine({
  protocol: 1,
  requestId: "task/design/attempt-1",
  cwd: "/absolute/project",
  prompt: "Design the approved system from this specification…",
  command: "agy",
  model: "gemini-4-carbon-high",
  effort: "high",
  executionMode: "plan",
  permissionMode: "request-review",
  sandbox: false,
  toolPolicy: "evidence-only",
  sessionMode: "new",
  sessionName: "Task design",
  timeoutMs: 600000,
  subscriptionPolicy: { version: 1, mode: "subscription-only" }
}, {
  signal: controller.signal,
  // An unused path below an existing private, owned, canonical directory:
  recoveryDirectory: "/absolute/private-runs/attempt-1",
  onLifecycle: async event => { /* persist caller acknowledgement */ }
});
```

`runtime.env`, when supplied, is the complete environment, not a merge with the current process. Supply `HOME` and `PATH` appropriate for the same native CLI account environment. Credentials and alternate API/cloud routing variables are filtered; explicit ADC selection is rejected. No global credentials file is read to construct this environment.

Use the [`./machine` contract](docs/MACHINE.md) for lifecycle acknowledgement, recovery, strict model binding, output schema and failure semantics. The package also exports `./client` and a wrapper:

```sh
antigravity-machine --capabilities
antigravity-machine --doctor < doctor-request.json
antigravity-machine --json < request.json
antigravity-machine --recover < recovery-request.json
```

These are **adapter flags**, not native `agy` flags. The wrapper emits one JSON envelope on stdout; progress does not pollute that channel.

## Evidence-only analysis (headless only)

`toolPolicy:"evidence-only"` creates one uniquely named, owned workspace custom agent with `tools: []`, `mcpServers: []`, `subagent: false`, and `commandExecutionPolicy: off`, selected with official `--agent`. Before sending any user prompt, the adapter requires the real `init` to identify that agent and report a native tool catalog. The catalog is the CLI's registry and may be nonempty; the managed agent's `tools: []` allowlist is the restriction, and any observed tool or subagent step fails the run. Missing init, agent mismatch, or an absent catalog fails closed with no prompt written.

Evidence-only rejects Orchestrator and `subagents`/`swarm` modes. It always disables slash expansion and spawning, including when used for an outer JEV decision. A prompt requesting tools cannot override the managed empty allowlist; a live 1.5.14 check showed a requested shell command was refused.

This uses native capabilities plus observed admission; it does not assume that a YAML list will be interpreted consistently by every CLI version. The official [headless documentation](https://antigravity.google/docs/cli/headless/) defines `init.tools` as the tool catalog, and the [custom-agent documentation](https://antigravity.google/docs/subagents/) defines the managed allowlist and workspace agent discovery. The adapter verifies the selected agent, records the catalog, and rejects every tool or subagent step; a version that cannot identify the agent or catalog is not admitted for evidence-only execution.

Only the exact invocation-created file is cleaned up, after checking inode and content, including on cancellation/parent death. Existing agent files are never overwritten and global settings are never changed. Native automatic initialization, customization discovery and OS-level access are outside this tool allowlist; this is **not an OS sandbox**. For strict host isolation use an independently managed execution environment. Plain `plan` mode by itself is not evidence-only enforcement.

## Subscription controls

Both paths verify **local billing-route controls**, not the commercial entitlement of the account. They reject an API provider, ADC, GCP and custom API-model settings, filter alternate endpoint/key environments and check `useG1Credits:false` (the documented default). ACP rechecks runtime/profile identity during preflight for connection, resume, prompt and login; the legacy runner additionally records its before/after-dispatch drift checks in receipts. Neither falls back to an API or credits when auth/quota fails.

Official sources: [authentication and API/ADC routing](https://antigravity.google/docs/install/), [CLI settings and credit fallback](https://antigravity.google/docs/cli/reference/), and [AI credits](https://antigravity.google/docs/cli/commands/credits). `useG1Credits` means using credits after plan quota runs out; disabling it is the local fallback control. The adapter does not enable or edit it.

The legacy headless receipt says `verified-local-controls` when those checks pass. Account identity/entitlement, remaining quota, external tools' billing and actual extra charges remain **unknown** where the official protocol does not expose them. A model catalog is not quota evidence. A native login failure or quota exhaustion becomes a failed invocation, with no alternative paid route. Token counters and estimated commercial cost are separate: missing cost is `null`, never a claim of zero dollars.

## Legacy headless boundaries

- One invocation, one CLI process, one text turn; exact conversation UUID for resume. No global “latest” session, no persistent pool or prewarm claim.
- Resume is permitted only for adapter-owned, terminal, clean conversations with identical directory/model/effort/mode/permission/tool policy/native options/native settings. Concurrent or unresolved resumes are blocked across processes.
- Success requires a normal native successful terminal result without `finished_reason`, valid schema, matching observable configuration and confirmed local cleanup. Explicit subagents also need observed children; Swarm may complete its root invocation with unknown children. Exit zero alone is insufficient; native soft permission denials are failures.
- `--sandbox` can be unavailable on a machine. Requested sandbox, execution mode and effort are not falsely reported as observed when init omits them. Skipping tool approvals does not prove sandbox is off or every external path is writable.
- Native child tasks/models/usage can be incomplete; whole-tree usage and remote completion remain unknown. Observed total-child guards do not establish a hard tree budget.
- Input is text. The official headless `stream-json` contract accepts only `text` content blocks; a live `agy` 1.5.14 image block was rejected with `stream input content block type "image" is not supported (only "text")`. Desktop multimodal input does not transfer through this machine API. No PDF or artifact-return transport is claimed.

See [validation](docs/VALIDATION.md) for what was actually tested and the remaining Mac/account release gates.
