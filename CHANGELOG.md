# Changelog

## 0.3.3 — 2026-11-27

- Classify inline `agy` executor-construction error banners emitted on `end_turn` with `usage.status === "unknown"` (e.g. `⚠ failed to construct executor: unknown model key ...: model not found`) as non-resumable failures (`ok: false`, `outcome: "failed"`, `session.resumable: false`) instead of silent successes, so orchestrators retire poisoned threads cleanly instead of looping resume retries.

## 0.3.2 — 2026-11-27

- Mark ACP `session/prompt` per-turn usage receipts with `scope: "turn"` (preserving `scope: "conversation"` strictly for legacy headless CLI mode) so downstream orchestrators can account exact per-invocation token usage and prompt cache hits without double-counting.
- Forward redacted, bounded single-line `[tool]` and throttled `[thought]` progress summaries to `runtime.onProgress` during ACP turns without contaminating the retained assistant output text.

## 0.3.1 — 2026-11-27

- Fix premature 500ms SIGKILL during graceful ACP shutdown on slow SQLite flushes by closing the ACP connection and draining child stdout before sending stdin EOF, and honoring the full `disposeGraceMs` budget before escalating to process-group termination.

## 0.3.0 — release candidate, unpublished

- Make official, unmodified `agy acp` the default desktop transport for direct human interaction. Keep version-1 task delegation and Agent/PTC tools behind explicit `transport: "headless"`; retain the independently selected legacy machine API.

- Admit only exact official CLI 1.5.14 executable bytes for macOS/Linux on x64/arm64. Record official archive and extracted binary hashes, check version/ACP help and runtime/profile drift, and set `AGY_CLI_DISABLE_AUTO_UPDATE=true`. No automatic installation, fallback or credential migration.

- Add the official `acp --login` helper with checked Google URL/callback state, stdin-only authorization-code handling, bounded output and owned-process cancellation. Successful helper exit requires a separate connection to verify authentication; login and connection leases coordinate managed use of the native profile.

- Create a committed-HEAD Git worktree and branch for each new session, preserve user work after disconnect, and verify exact owner/worktree/runtime identity on resume. Keep ACP records separate from Flywheel's Go-owned state.

- Use the authenticated DSH Remote for prompts, permissions, configuration and login. Expose safe control-only slash actions; never send host system-prompt overrides/appends, Preset/PTC definitions, a managed custom agent or a host filesystem/terminal tool bridge.

- Retain a live ACP connection across turns, exact typed prompt content and operation IDs, native configuration/permission choices, and tool/child events after a root response. Unknown results never trigger prompt replay; unconfirmed session/process cleanup keeps the ownership lock.

- Add capability-gated image-byte input, original attachment hashes and bounded display history. Export the public `./acp` API and the shared desktop client source.

- Add runtime/login, real stdio/process-group, worktree, host/Remote and React regression coverage. Record four-platform artifact verification and the unauthenticated Linux x64 initialization probe. Real personal login, model inference, image delivery and native detached-work cleanup remain separate acceptance gates; previous headless live evidence does not establish them.

中文：0.3.0 为尚未发布的候选版本，默认以官方原版 `agy acp` 提供人直接操作的交互会话；旧面板、version-1 命令和 Agent/PTC 委派需要显式 `transport: "headless"`，machine API 仍由调用方独立选择。ACP 仅准入四平台精确 1.5.14 程序摘要，并为本插件持有的进程设置官方禁用自动更新环境变量，原生登录由同程序 `acp --login` 处理，登录完成后需另行连接验证。每个新会话建立独立 worktree；恢复核对 owner、目录、运行时身份。鉴权 Remote 承载 prompt、原生权限、配置和登录，不注入宿主 system prompt／append、Preset/PTC、受管 agent 或工具桥。连接跨轮次保留，接收根请求返回后的原生活动；未知结果不重放，清理未知不释放锁。加入按能力发送图片字节、附件摘要和公开 ACP 接口。离线回归、四平台文件摘要和 Linux x64 未认证 initialize 已分别记录；真实个人登录、推理、图片送达及原生后台清理仍待验收，旧 headless 冒烟不替代这些证据。

## 0.2.1 — repair release

- Handle ACTIVE subagent metadata events that omit a conversation ID; retain only verifiable child identities and complete real explicit-subagent runs.
- Accept successful Swarm slash-command invocations without inventing child metadata; report collaborationObserved:false and children:unknown instead of claiming child completion.
- Clarify live evidence-only admission and record the 2026-11-21 agy 1.5.14 native, evidence-only and explicit-subagent smoke results.

## 0.2.0 — release candidate

- Add the three exact Orchestrator model slugs with fixed empty effort and no native `--effort` override.
- Add versioned `native` / `subagents` / `swarm` selection to defaults, Desktop actions and UI, Agent/PTC and public machine API; bind exact options to session leases.
- Admit explicit subagents through observed `invoke_subagent`; dispatch Swarm through one adapter-owned slash command with JSON task data, version/configuration checks and required child evidence.
- Retain observed child identities, roles and URI metadata without inventing worker models or terminal states; expose live task status and scope root completion to the CLI invocation.
- Stop on an optional total observed-child guard (including verifier/monitor), explicitly `hard:false`; fail closed on aggregate member metadata retention overflow while retaining verified IDs.
- Reject every nonempty native `finished_reason`, even with SUCCESS/exit zero. Explicit collaboration without child evidence fails as `collaboration-not-observed`.
- Keep evidence-only empty-tools admission, slash/spawn exclusion and Orchestrator rejection; preserve owned cancellation and read-only recovery.
- Extend real subprocess, public DSH schema/PTC, React and installed-tarball tests; add a Chinese machine contract.

## 0.1.0 — release candidate

- Official `agy` stream-json runner shared by DSH direct tasks, Agent/PTC tool delegation and public ESM machine API.
- Exact native model/effort admission, subscription-route controls and configuration drift checks; no ACP or alternate paid API/credits path.
- Durable lifecycle journal, caller acknowledgements, owned process-group cancellation, parent-death supervision and read-only recovery.
- Exact conversation resume with binding/lease protection, local task labels and explicit unknown provider/child/cost evidence.
- Evidence-only native custom-agent guard: real pinned-agent/empty-tools init before prompt dispatch.
- Owner-bound Desktop actions, direct task view, native settings form, allowed-preset tool registration and host background jobs.
- Offline protocol/lifecycle/DSH/React tests and installation of the real npm tarball outside the checkout.

This entry describes implemented code, not npm publication, real-account acceptance or a deployment to the user's machine.
