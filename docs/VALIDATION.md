# Validation and release evidence

The current 0.3.0 candidate was implemented on Linux with Node 24.22.3/npm 11.19.1. Its ACP evidence is recorded first; the previously published 0.2.1 headless evidence is retained below with its original scope. No user account, credentials, billing setting or npm release was changed for this ACP work.

## 0.3.0 ACP candidate — 2026-11-22 (America/New_York) / 2026-11-23 UTC

Version 0.3.0 is an **unpublished** candidate. The work is dated 2026-11-22 in America/New_York; probe/provenance fixtures retain their actual 2026-11-23 UTC date. The default is the official CLI ACP path. No real account login or model inference was performed for this ACP acceptance work; no credentials, billing settings or npm publication were changed.

中文：0.3.0 尚未发布；本节以 America/New_York 的 2026-11-22 记日，探测与来源记录保留实际 2026-11-23 UTC 日期。默认已改为官方 CLI ACP。本次 ACP 检查没有进行真实账号登录或模型推理，没有修改凭据、计费设置或发布 npm。

### Reproducible ACP checks / ACP 可复现检查

```sh
node --test test/acp-runtime.test.js test/acp-login.test.js
node --test test/acp-transport-cleanup.test.js
npm test
npm run test:package
```

The focused runtime/login invocation passed **16 tests**, and the real root-exits-first process-group regression passed **1 test**. The final source suite passed **89/89 tests**, including the published rc.3 blank-session entry regression. The package and disposable-profile installation gates identify the exact final candidate separately; `scripts/test-package.js` records its actual tarball/integrity in ignored `candidate.json`.

| Evidence | Scope and result |
| --- | --- |
| Runtime preflight | Executable digests are checked before execution; a version-spoofing wrapper is rejected. Exact version/help, physical executable/profile identity, filtered environment, subscription controls and drift checks are covered without injecting headless model/permission options. |
| Native login client | Synthetic helpers cover Google URL/callback validation, callback state and rotation, stdin-only code delivery, output redaction/bounds, nonzero exit, timeout, cancellation during preflight and descendant cleanup. Exit zero marks helper completion only, never verified account authentication. |
| Real process-group cleanup | A real detached leader exits while a real same-PGID child continues. `transport.stop()` must still stop the child. Only confirmed group disappearance permits an exited/clean result and lease release; an unreaped zombie or otherwise unconfirmed group must remain unknown with its lock retained. |
| ACP integration regressions | The suite includes real stdio fixtures for wire framing, reentrant permission requests and post-root events; sessions/operations, exact resume, unknown-state handling, committed worktrees, authenticated host ownership, profile coordination and React image/login behavior. These fixtures exercise the client and do not supply real-account acceptance. |
| Immutable dispatch | The public request is copied before queueing; caller mutations before/during preflight or after dispatch cannot change action, owner-bound session, operation ID, text/image bytes, persisted identity or the completion record. Reusing the original ID does not repeat the prompt. |
| First human entry | The published rc.3 ConversationNodeAssembler, conversation header and view renderer expose the Antigravity tab after the actual human entry command. The session still contains only command/run and command/done: no fabricated turn, parent-model call or automatic ACP connection/prompt. |
| Candidate consumption | The current package gate checks the installed artifact, including the public ACP API/types and client source alongside the legacy machine exports. Its final emitted integrity identifies the artifact under test; package installation does not run a model. |

中文：runtime/login 的独立运行通过 16 项，真实“根进程先退出”回归通过 1 项，最终源码全量通过 89/89 项。首次入口使用发布版 rc.3 的真实会话组装器和视图渲染器验证：人类执行入口命令后出现标签页，日志仍只有 command/run 与 command/done，没有伪造 turn、父模型调用或自动 ACP 请求。其他回归验证精确程序准入、账户路由限制、配置漂移、模拟登录、同 PGID 子进程清理和客户端契约；zombie／未知状态不能伪装 clean。包消费与隔离 profile 安装另行绑定实际 integrity，fixture 不能代替真实账号验收。

### Official release provenance / 官方发行来源

The [provenance manifest](../lib/acp/cli-1.5.14.json) records the [official 1.5.14 release](https://github.com/google-antigravity/antigravity-cli/releases/tag/1.5.14), release-asset URLs, official updater manifest/storage URLs, archive SHA-256/SHA-512, extracted member name, binary SHA-256 and byte sizes. All four official archives were downloaded and checked, including the extracted executable bytes. These digests identify this candidate's allowlist; they are not a claim of native execution on every platform.

| Platform | Extracted binary SHA-256 | Execution evidence |
| --- | --- | --- |
| Linux x64 | `37873b8062391b6202a3d3199ec012abc9e53aab720d26cd65699441497d8c94` | Actual version/help and unauthenticated initialize |
| Linux arm64 | `702b888abddc7d482ee30592fa153cda5785afae3188179d38b511b6ec360286` | Archive and binary verification only |
| macOS x64 | `5f3832bb8e391820bb895a08d1f837bb9e1714d48cd5ba31edf9286af6e9ea21` | Archive and binary verification only |
| macOS arm64 | `e8c2959bf4744580d0e5b8f938ec2dc3918a942b620a6262e53856400f14e5fb` | Archive and binary verification only |

CLI 1.5.13 is the documented minimum-version rationale for ACP cwd/resource fixes, **not an admitted version range**. Production accepts only the recorded 1.5.14 artifacts and rechecks bytes and identity; an unknown upgrade or wrapper is rejected. Owned processes receive `AGY_CLI_DISABLE_AUTO_UPDATE=true`. The plugin itself does not download, replace or update the user's installation.

中文：四个平台的官方归档与解包可执行文件均已实际下载校验，完整 URL、归档 SHA-256／SHA-512、文件名、二进制摘要与大小见来源 JSON。只有 Linux x64 实际运行；其他平台的文件校验不代表已完成运行验收。1.5.13 只是 cwd／resource 修复所支持的最低版本依据，不是准入范围；生产仅接受记录中的 1.5.14 字节，未知升级或包装程序会被拒绝，并对本插件持有的进程设置 `AGY_CLI_DISABLE_AUTO_UPDATE=true`。插件不会自行下载安装或更新 CLI。

### Actual Linux x64 probe / Linux x64 实际未认证探测

The credential-free [source probe fixture](https://github.com/ckanner/dsh-subagent-antigravity/blob/feat/official-acp-default-2026-11-22/test/fixtures/acp/official-cli-1.5.14-linux-x64.json) preserves the exact observations from 2026-11-23 UTC:

- `agy --version`: exit 0, stdout exactly `1.5.14\n`, empty stderr.
- `agy acp --help`: exit 0; help was emitted on stderr and advertised the ACP stdio server and `--login`.
- ACP `initialize`: negotiated protocol 1 and `Antigravity ACP Server` version 1.5.14. It advertised image and embedded-context input, session load/resume/list/close, terminal login, native auth/logout and `_meta.antigravity.systemPrompt.append`.
- No `session/new`, account login, `session/prompt`, image request, model switch or inference was sent. Closing the probe process exited 0; this does not prove native session or detached-task cleanup.
- The implementation deliberately omits system-prompt append despite the advertisement; the user's native rules remain the official runtime's responsibility. Advertised logout is not implemented by this client; disconnect is not logout.

中文：真实探测中 `--version` 精确返回 `1.5.14\n`；ACP help 在 stderr 输出且退出成功；initialize 返回 ACP 1、对应 agent 版本以及图片／embedded context、load／resume／list／close、terminal login、logout、system prompt append 能力声明。没有发送 session/new、登录、prompt、图片或模型切换。探测进程退出成功不证明原生会话或后台树已清理。客户端明确不使用已声明的 append；原生用户规则由官方运行时加载。客户端未实现 logout，断开不等于退出账号。

### Remaining ACP real-machine acceptance / ACP 待完成真实验收

1. Install the exact final candidate and recorded integrity into a disposable Desktop profile on the intended platform; verify authenticated Remote ownership, the view and isolated committed-HEAD worktree without parent-model invocation.
2. Use the official `acp --login` flow with an explicitly selected personal account, test cancellation, and reconnect to verify the native session. Check the intended model/account entitlement and local credits setting without treating helper exit or a catalog as proof.
3. Send a normal Gemini message; exercise an offered model/configuration change, native tool permission choices, a second turn and exact resume. Record the actual advertised and observed behavior.
4. Send an identifiable image through the page and verify actual delivery/understanding, including the preserved attachment bytes/hash. The no-auth image capability and fixture byte checks alone do not establish this.
5. Observe real post-root tool/child activity and verify that Stop, native close and local owned-process cleanup have the claimed effects. Local process-group tests do not prove remote or detached native task termination.
6. Exercise unknown transport outcomes, auth/quota errors and host restart without a replacement prompt, fallback account/runtime or lock release while cleanup remains unconfirmed. macOS and Linux arm64 execution remain pending until run there.

中文：仍待目标 Desktop 的精确候选安装、真实个人登录及取消、连接后认证验证、Gemini 推理／配置／权限／多轮恢复、图片送达、根返回后的原生工具与成员活动和后台清理，以及真实错误／重启边界。macOS 与 Linux arm64 也尚未运行。本次离线测试及未认证探测不证明商业权益、费用、政策批准、模型质量或整树清理。以下保留的 2026-11-21 live 记录仅属于旧 headless 路径。

## Legacy headless reproducible gates and historical evidence

```sh
npm ci --ignore-scripts
npm test
npm run test:package
```

The legacy headless tests use `test/fixtures/fake-agy.js`, an executable implementation of the documented wire envelopes. It verifies observable admission and failure boundaries, not a real Gemini answer.

| Layer | Checked behavior |
| --- | --- |
| Native wire | Successful init/steps/result, exact resume, early native error, truncated/duplicate/missing/nonterminal result, wrong model, schema validation, soft denial despite exit zero, nonzero exit, long progress separate from retained output. |
| Subscription | API/GCP/credits/permission conflicts rejected before prompt; filtered key and Node injection environment; settings drift rejected; no fallback. |
| Evidence-only | Exact native agent plus tool catalog before stdin; absent init/agent blocks prompt; tool or subagent steps fail; managed agent cleanup. Live 1.5.14 native and evidence-only smoke passed on 2026-11-21; a requested shell command was refused under the managed empty allowlist. |
| Orchestrator | Three exact fixed-effort slugs, empty/omitted effort normalization, no native effort override, catalog rejection, 1.5.12 new-feature baseline; evidence-only rejects these models. |
| Collaboration | Subagents init-tool admission; controlled Swarm prefix and slash-escaped task data; native slash-setting conflict/drift; subagent child metadata required; Swarm root success may carry `children:"unknown"`; no invented child model/terminal; every nonempty finished_reason fails. Live Orchestrator, explicit-subagent and Swarm smoke passed on 2026-11-21. |
| Observation bounds | Total unique child guard includes verifier/monitor and case-insensitive duplicates; cumulative 1 MiB metadata budget covers frames and sparse updates; verified IDs survive failed metadata reduction; 1000 accepted versus 1001 failed/truncated boundary. |
| Lifecycle | Caller acknowledgement before stdin, rejection blocks dispatch, abort, total deadline, parent death, original receipt recovery, stubborn descendants, unknown native state. |
| Sessions | Same binding exact resume; changed model/native options rejected; cross-process concurrent/unresolved lease blocked; recovery is read-only. |
| DSH backend | Direct command uses the same runner, owner/workspace isolation, duplicate invocation idempotency, fresh config/native snapshots, per-call fixed effort, live member status, committed preset checks, jobs and cancellation entry. |
| DSH schema/PTC | Actual published `@deepseek-ai/dsh-tools` and `dsh-tool-executor-ptc` 0.2.2-rc.3 validate schema and generate named input/output SDK types. |
| Desktop client | Public ModuleLoader/slots/remote.commands contract, real React render, direct owner-bound start, Orchestrator fixed-effort display, Swarm/limit selection, unknown member display, evidence-only conflict, defaults load without inference and revisioned settings mutation. |
| Packed artifact | Real npm tarball installed outside the source tree without DSH peers; exported API/types/bin/client/patch/supervisor and both machine-contract languages present; new turn, evidence-only, Orchestrator/Swarm and read-only recovery through installed package. |

`scripts/test-package.js` prints exact tarball integrity and writes ignored `candidate.json` for a local acceptance run. 0.2.1 is published to npm and has a `v0.2.1` GitHub release; the tag release was produced through the configured trusted publisher. The live native, evidence-only, Orchestrator, explicit-subagent and Swarm checks are recorded below.

## Historical 0.2.1 headless follow-up, 2026-11-21

The source suite passed **35/35** tests. `npm run check` also installed the real 0.2.0 tarball into a directory outside the checkout and passed public ESM, strict TypeScript, wrapper, supervisor, journal, evidence-only and Orchestrator/Swarm consumption. Fixture checks do not establish live behavior. On 2026-11-21, a live `agy` 1.5.14 native call and a live evidence-only call both returned a successful terminal result; a requested shell command was refused under the managed empty allowlist. Account entitlement, billing, Desktop acceptance and Orchestrator/Swarm account behavior remain separate.

Review closed two concrete retention/resume defects: child metadata now has an aggregate byte budget including sparse updates, with consistent 1000/1001 failure-boundary receipts; and an owned Desktop resume preserves an originally absent native binding even after the saved defaults change to Swarm. Explicit changed bindings remain rejected. Regression tests exercise both cases through the actual runner/CLI process boundary.

The first package-install attempt failed because the environment's home tmpfs was full. The same gate passed after using a workspace npm cache; no account settings or shared cache contents were deleted. Final candidate integrity and the disposable-profile install must be checked together using `candidate.json`, since a later documentation edit also changes tarball bytes.

中文补充：0.2.0 源码 35 项测试全部通过，真实 tarball 的隔离安装、公开接口/类型/包装命令以及 Orchestrator/Swarm fixture 消费均通过。Review 修复累计元数据预算和默认值变化后的旧会话续跑问题。首次安装因环境 home tmpfs 空间耗尽失败，改用工作区缓存后通过；没有删除共享缓存或修改账号。2026-11-21 另外完成了 `agy` 1.5.14 的真实 native/evidence-only 冒烟，证明受管空 allowlist 会拒绝 shell 命令；账号权益、账单、桌面验收和 Orchestrator/Swarm 真实账号行为仍未验证。

## Host installation and historical 0.1.0 evidence

The package follows the same public DSH bundle shape as the maintained Claude/Codex plugins: root plugin export, `dsh.bundle.patch`, `cordis.patch.yml`, and lazy `./client`. The root plugin checks commands/workingDirectory/lifecycle services. Optional jobs are checked when a background delegation is requested.

Candidate installation must use the real DSH CLI in a disposable profile:

```sh
dsh plugin --profile <disposable-profile> add /absolute/candidate.tgz
```

Use isolated `DSH_HOME` and `DSH_AGENTS_HOME` for this gate. `npm run test:host-install` performs it against the candidate recorded by `test:package`. The original 0.1.0 candidate was successfully installed by the real `@deepseek-ai/dsh` 0.2.2-rc.3 CLI into an isolated profile on 2026-11-20, resolving the six production packages through pnpm and validating package/bundle/client presence. The CLI's published help confirms `plugin --profile` initializes a profile and forwards `add` to pnpm. This does not exercise the user's graphical Desktop or native account.

## Legacy headless real-machine gates

The following gates apply only when the legacy headless path is explicitly selected. They do not define ACP acceptance or establish authorization for automated personal-account use. On the target Mac and its existing official login:

1. Run inference-free doctor in the exact Desktop cwd/HOME/command environment; inspect real `agy` version/catalog and local subscription controls.
2. Verify the account has the intended model entitlement and credits fallback remains disabled in official settings. Do not replace this with a token estimate.
3. Install the exact candidate and integrity into a test Desktop profile. Confirm the Antigravity view, settings, direct launch without parent-model traffic, allowed preset/PTC tool registration, jobs output and cancellation.
4. Perform one explicitly selected normal Gemini task, a same-binding repair, and cancellation. Record requested/observed model, native session, usage scope, output, local cleanup and remaining unknown fields.
5. Exercise evidence-only admission with the real CLI. It must return the selected custom agent and its tool catalog **before stdin**; any tool or subagent step after dispatch fails the run. A CLI that cannot identify the agent or catalog must be reported incompatible; never bypass the guard. The 2026-11-21 `agy` 1.5.14 smoke passed both native and evidence-only paths.
6. Select a fixed Orchestrator model and explicitly request subagents/Swarm. Record real child metadata, normal versus cutoff root completion, observed guard and cancellation. Do not infer a Swarm board, worker model, child terminal or hard concurrency cap from an adapter-generated prompt.
7. Check a quota/auth boundary without enabling another billing route. Native child/browser features need separate observed tests; this legacy headless API does not claim image attachment transport or whole-tree budget enforcement.

No claim of latency improvement, model superiority, zero additional bill, exact remaining quota or Mac compatibility follows from offline fixture success. Current unknown native/remote work remains blocked for automatic replay.

## Release procedure

Review the full diff and run the offline suite and installed-package gate. Perform disposable-profile installation and the real-machine checks for the selected transport above. Freeze the candidate version and integrity; publish only that reviewed package after separate authorization. Do not regenerate the tarball after approval without repeating integrity/installation checks. A DSH profile installation or Flywheel default migration must use the explicitly selected candidate; neither is an npm postinstall side effect.

中文说明：上述离线测试能证明协议、准入、守护、只读恢复、DSH 工具/面板契约和安装包内容；不能代替用户 Mac、官方账号、套餐权益或真实模型质量验收。发布、用户 profile 安装和默认配置迁移仍须针对已审查候选进行，不在测试或安装脚本中自动发生。
