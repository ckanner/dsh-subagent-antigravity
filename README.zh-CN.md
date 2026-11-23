# dsh-subagent-antigravity

[English](README.md) · [交互式 ACP](docs/ACP.zh-CN.md) · [旧机器接口](docs/MACHINE.zh-CN.md) · [验收与发布](docs/VALIDATION.md)

在 DSH 和 Flywheel 中，通过**官方原版 `agy acp`** 进行个人交互式开发。**0.3.0 默认使用 `transport: "acp"`**：用户直接向官方 Antigravity agent 发送消息，官方程序管理原生登录、模型推理、工具、权限和执行循环。每个新会话使用独立 Git worktree，不调用 DSH 父模型。

**0.3.0 是尚未发布的候选版本。** 请构建并安装精确的本地 tarball 验收。**0.2.1 仍是已发布的 npm / `v0.2.1` GitHub Release**；2026-11-21 的真实 `agy` 1.5.14 native、evidence-only、Orchestrator、显式子智能体和 Swarm 检查属于旧 headless 路径，不能充当 ACP 登录、推理、图片送达或原生后台清理的验收。

ACP 客户端不覆盖或追加系统提示词，不注入受管 custom agent、Preset、PTC 工具定义或宿主工具桥接。官方运行时仍可加载用户自己的原生 rules。旧 headless runner 和 machine API 仅保留给显式选择该接口的调用方；新增 ACP 不为个人账号的自动化用途建立许可依据。具体见 [ACP 架构与边界](docs/ACP.zh-CN.md)。

## 安装前提

- macOS／Linux、x64 或 arm64、Node.js 22.18+。进程监督使用 POSIX 进程组，Windows 明确拒绝执行。
- 用户从[官方 release](https://github.com/google-antigravity/antigravity-cli/releases/tag/1.5.14) 安装**精确的 CLI 1.5.14**。ACP 只接受[来源记录](lib/acp/cli-1.5.14.json)中的四个平台可执行文件摘要，不接受仅输出相同版本号的其他二进制或包装脚本。未准入的升级会被拒绝；插件持有的 CLI 进程设置 `AGY_CLI_DISABLE_AUTO_UPDATE=true`。插件不下载或替换 CLI。
- 当前目录属于已有至少一次提交的 Git 仓库。新 ACP worktree 从当前已提交 HEAD 创建，不复制未提交改动。
- DSH 具有公开 commands、workingDirectory、鉴权 Remotes、会话视图／设置插槽和 Agent 生命周期服务。已发布 `0.2.2-rc.3` 的 schema/PTC 契约仍有测试，加载时检查所需宿主能力；Agent tools 和 jobs 仅用于显式旧委派入口。
- 使用原生个人账号路由，不启用 ADC／GCP／custom API model，官方 CLI 的 AI credits 回退关闭。需要时通过官方 helper 登录；插件不创建自己的 OAuth client，也不迁移凭据。见[订阅策略](#订阅策略与未知状态)。

在仓库中构建并检查候选包：

```sh
npm ci --ignore-scripts
npm run check
```

`npm run test:package` 输出精确 `.tgz` 及 integrity。先将该产物安装到临时 DSH profile 验收：

```sh
dsh plugin --profile <profile> add /absolute/path/ckanner-dsh-subagent-antigravity-0.3.0.tgz
```

只有精确版本正式发布后，才按 npm 包名安装；不承诺 npm `latest` 已包含本候选。包没有安装脚本，也不会自动运行推理测试。bundle 新增一个默认使用 ACP 的 `antigravity` 插件行；它是外部 agent 客户端，无需注册为传统 DSH LLM provider。

## 在 DSH 中使用（默认 ACP）

在目标 Git 仓库的 DSH 会话中打开 **Antigravity**。先点击**检查 CLI**，核对精确运行时及本地账号路由控制，再**新建独立会话**。页面展示源目录、新 worktree、分支和起始提交。环境检查不发送模型 prompt，也不能证明账户权益。

需要认证时，点击**官方 Google 登录**。插件以同一个已核验程序运行 `acp --login`，展示其官方 Google 登录 URL，并通过密码输入框接收返回的 code 或官方 callback URL。该内容只写入 helper 的 stdin，不进入命令、会话历史或 ACP 持久记录。helper 正常退出后，需主动连接或恢复会话来验证认证；退出成功不等于模型请求已完成。

从原生会话实际返回的选项中选择 Gemini 模型及其他配置，再发送消息。页面显示原生文字、思考、工具、权限请求、计划及已报告成员活动；权限选项由官方 agent 提供。运行时声明图片能力后，可以选择或粘贴 PNG、JPEG、WebP、GIF，客户端发送有界图片字节，不将路径文字冒充图片。真实账号的图片送达仍待验收。

连接跨轮次保持，切换视图只取消显示订阅。**停止工作**发送原生取消；**断开会话**请求原生 close 并停止本插件持有的进程组，保留 worktree 和分支供审查、整合。断开不等于退出登录。根请求返回不证明所有工具或成员已结束，已知未完成工作会阻止下一轮。结果或清理未知时保留原记录和锁，不自动重放。

**恢复会话**核对相同 worktree、owner、原生 session 和精确运行时身份；新会话使用新 worktree。旧模型、effort、协作、权限与执行默认配置不注入 ACP。插件也会防止自己的受管连接与原生登录互相竞争；用户单独启动的 CLI 不受此协调控制。

slash command 提供入口说明及少量 version-2 控制动作；prompt、图片、配置、权限回复和登录响应均留在鉴权页面：

```text
/antigravity
/antigravity {"version":2,"action":"doctor"}
/antigravity {"version":2,"action":"connect"}
/antigravity {"version":2,"action":"list"}
/antigravity {"version":2,"action":"status","id":"<返回的精确记录 UUID>"}
/antigravity {"version":2,"action":"cancel","id":"<返回的精确记录 UUID>"}
```

worktree 归属、精确恢复、原生权限、生命周期证据、图片限制和公开 `./acp` API 见[交互式 ACP](docs/ACP.zh-CN.md)。

## 显式使用旧 headless

以下任务面板、Agent/PTC、协作、evidence-only 和 machine 章节描述保留的 **stream-json headless** 实现。在 DSH 插件中，必须显式设置 `transport: "headless"`，才启用旧面板、version-1 命令和 `subagent_antigravity` 工具：

```yaml
transport: headless
command: agy
```

Agent 委派还要求所选 preset **显式注册 `subagent_antigravity`**；插件 `presets` 是第二层 allowlist。公开 `./machine` import 和 `antigravity-machine` 包装命令本身就是调用方独立选择的 headless 接口，不经过 ACP，也不新增 transport 请求字段。保留这些接口和历史测试，不代表个人原生登录授权无人值守或父 Agent 自动化。

旧 runner 仍以官方 `agy` 1.5.7+ 为基线，Orchestrator 和显式子智能体／Swarm 要求 1.5.12+。这些范围只适用于旧路径，不放宽 ACP 对精确 1.5.14 可执行文件的准入。

### 旧任务面板

打开会话中的 **Antigravity** 视图，填写完整任务、名称和工作目录，选择模型、原生协作模式及权限后点击开始。普通模型可调整思考等级，Orchestrator 显示“固定（由模型决定）”。按钮通过公开 command 接口直接启动 CLI，**不会调用父模型**。切换视图不停止任务；刷新、查看结果、停止均在同一面板完成。关闭插件会取消它仍拥有的任务。

任务绑定 Desktop 会话、规范化工作区和 invocation ID。另一个会话或工作区不能查询/取消它。重启后能读取原有 receipt；缺少确证的调用保留 `unknown`，不会自动换会话或重发。先查看原调用，再判断下一步。

面板显示本地名称、原生 conversation ID、请求模型/effort/协作模式、真实观测、进度、结果、错误和清理状态。运行中点击“查看结果”可看到当前已观察的子成员 ID、角色及未知状态，不会改已有原生标题。“检查环境”只运行 `--version`、`--help`、`models`，不发送推理，不能证明套餐权益和余额。

插件行设置包含 command、默认目录、模型、effort、原生协作模式、执行模式、工具审批、sandbox、timeout 和允许 presets。每次启动冻结配置；保存只影响后续调用，单次明确选择优先。点击续跑会把原任务绑定带回表单；续跑时省略 native 会恢复该 owner 原任务的 native 选项（包括原本字段缺失），不会继承后来保存的协作默认值。改变绑定会被 runner 拒绝。

也可以直接输入：

```text
/antigravity {"version":1,"action":"start","label":"分析超时","prompt":"只分析以下证据……","model":"gemini-4-neon-high","effort":"high","toolPolicy":"evidence-only"}
/antigravity {"version":1,"action":"list"}
/antigravity {"version":1,"action":"result","invocationId":"<返回的精确 UUID>"}
/antigravity {"version":1,"action":"cancel","invocationId":"<返回的精确 UUID>"}
```

另外提供 `status`、`doctor`、`defaults`。手工任务保存在插件自己的 owner 绑定存储中，不伪造一个 Agent job。

## 工具、PTC 和后台任务（仅 headless）

```js
subagent_antigravity({
  label: "修复超时回归",
  prompt: "复现并修复已批准范围内的超时问题，然后运行回归验证……",
  model: "gemini-4-hydrogen-high",
  effort: "high",
  run_in_background: true
})
```

后台返回 `{kind:"background", jobId}`，沿用 `job_output` / `job_kill`；前台返回文本内容中的任务结果、原生观察和证据身份。完整机器 receipt 单独保存，进度有界，不将无限事件流塞进父对话。工具不能扩大已配置的权限或改变 owner 工作目录。可选择模型/effort、`native` 模式、精确历史 sessionId、deadline、JSON schema，以及工具策略。

只在允许的 committed preset 中注册，执行时重新检查，包括 preset 切换。输入/输出 schema 经过真实 DSH 发布包的校验器与 PTC 类型生成检查。

## Orchestrator、原生子智能体与 Swarm（仅 headless）

模型选择与协作模式是独立配置。[官方模型指南](https://antigravity.google/docs/models)将 Orchestrator 定义为同一智能体内部的规划/实施模型交接；[Swarm](https://antigravity.google/docs/swarm/)才显式请求多成员并行协作。只选 Orchestrator 不代表已经启动蜂群。

| 模型 | effort |
| --- | --- |
| `gemini-4-hydrogen-*`、`gemini-4-neon-*` | 与 slug 后缀匹配的 `low`、`medium`、`high` 或 `xhigh` |
| `gemini-4-carbon-*`、`gemini-4-argon-*` | 与 slug 后缀匹配的 `low`、`medium` 或 `high` |
| `gemini-pro-orchestrator-neon` | `""`，固定配置，不传 `--effort` |
| `gemini-pro-orchestrator`（Carbon） | `""`，固定配置，不传 `--effort` |
| `gemini-pro-orchestrator-argon` | `""`，固定配置，不传 `--effort` |

不写 `native` 就保留普通 CLI 行为。DSH 默认配置、直接任务、Agent/PTC 工具和 machine API 使用相同结构：

```js
subagent_antigravity({
  prompt: "按照已批准范围，分别实施 parser 和 UI 修改；汇总成员结果并完成集成检查。",
  model: "gemini-pro-orchestrator",
  effort: "",
  native: { version: 1, mode: "swarm", maxObservedAgents: 4 }
})
```

| `native.mode` | 请求行为与准入 |
| --- | --- |
| `native` | 保留原生自主行为，仍可能使用子智能体；禁用 slash 展开。 |
| `subagents` | 要求协调者委派并汇总子任务；发 prompt 前，真实 `init.tools` 必须包含 `invoke_subagent`；继续禁用 slash 展开。 |
| `swarm` | 仅由适配器合成 `/swarm` 前缀，用户任务作为 JSON 数据。原生 `disableSlashCommands:true` 会阻止调用，插件不会修改设置。 |

显式子智能体必须观察到成员元数据；只有根 SUCCESS、没有成员证据时，以 `collaboration-not-observed` 失败。Swarm 不同：adapter 请求的 `/swarm` 根调用成功时，即使 `agy` 1.5.14 没有返回成员元数据也接受，但 receipt 明确写 `collaborationObserved:false`、`children:"unknown"`，不伪造 board、worker 模型或成员终态。根据[官方 headless/changelog 契约](https://antigravity.google/docs/changelog?tab=cli)，非空 `finished_reason`（含 `print_timeout`）一律失败，即便同时给出 SUCCESS 和 exit 0。

`maxObservedAgents` 可选，整数 1–8，统计**全部已观察的唯一子成员 ID**，包含 verifier、monitor。超出后停止本调用；回执固定 `hard:false`。这不是原生并发硬上限、完整远端树上限或额度保证。整树用量、未报告的子模型/终态保留 unknown。`log_uri` / `workspace_uris` 仅作为元数据保存，不自动打开。

完成范围为**当前 CLI invocation**。取消只监督本调用拥有的进程组；恢复只读原 journal，不进行全账号子任务查询或取消。适合已能划分独立子任务的工作；外层流程要求独立正式 Review 时仍要另起 Reviewer，本轮原生 verifier 仅作为同一根调用内的证据。

## 机器接口和会话（旧 headless）

`@ckanner/dsh-subagent-antigravity/machine` 导出协议/能力常量、`parseMachineRequest`、`runMachine`、`recoverMachine`、`doctor` 与 TypeScript 类型。完整示例和字段见 [机器契约](docs/MACHINE.zh-CN.md)。Flywheel 不需要创建 DSH 父 Agent。

每次调用使用一个 CLI 进程、一条文本 user message。请求必须给出 cwd、精确官方模型 slug、匹配的 effort（Orchestrator 为固定空字符串）、执行/审批模式及订阅策略。传入 `runtime.env` 时，它是完整环境，不与全局环境合并；提供同一官方 CLI 账号作用域的 HOME/PATH。敏感及替代付费路由变量会过滤。

新会话会保存原生 conversation ID，不承诺原生历史不持久化。只有 adapter 拥有、已终态且清理确认的会话才能续跑；cwd、模型、effort、权限、toolPolicy、native 选项或原生配置变化要求新绑定。同一会话跨进程并发续跑会被拒绝；未知调用不能借重新启动绕过。

`antigravity-machine --capabilities / --doctor / --json / --recover` 是本插件包装命令，**不是原生 `agy` 参数**。除 capabilities 外从 stdin 读取 JSON，stdout 只输出一份 JSON envelope。

## 只分析给定证据（仅 headless）

`toolPolicy:"evidence-only"` 在工作区创建唯一、归本调用所有的 custom agent，设置 `tools: []`、`mcpServers: []`、`subagent:false`、`commandExecutionPolicy:off`，通过官方 `--agent` 选择。**发送 prompt 前**，必须从真实 init 看到同一个 agent 和工具目录。该目录是 CLI 注册表，可能非空；真正的限制是受管 agent 的 `tools: []` allowlist，任何工具或子 Agent step 都会使本次调用失败。无 init、agent 不匹配或缺少目录均拒绝，不写入 prompt。

该策略拒绝 Orchestrator 以及 `subagents` / `swarm`，始终禁用 slash 展开和 spawn，包括供外层 JEV 做证据决策时。prompt 要求使用工具不能绕过已核验的空工具列表。

这样不假定所有版本都把 YAML 空列表解释为禁用工具，而以真实启动观测作准入。[官方 headless 文档](https://antigravity.google/docs/cli/headless/)明确 init.tools 是全部可用工具，指定 `--model`/`--agent` 时有相应字段；[custom agent 文档](https://antigravity.google/docs/subagents/)规定工具允许列表和工作区发现路径。

临时文件用独占创建、唯一名称；取消/父死亡也只在 inode 与内容仍匹配时删除本调用文件。不会覆盖用户 agent，也不改 global settings。这是原生工具能力约束，**不是 OS sandbox**；CLI 自身初始化、定制发现和操作系统权限不因此隔离。要求完整宿主隔离时应使用独立受管执行环境。单靠 `plan` 模式不能作为只读取证约束。

## 订阅策略与未知状态

两条路径的准入证据都是**本地计费路由控制**，不证明商业账户权益：拒绝 API provider、ADC、GCP、自定义 API model，过滤 API key/endpoint 环境，要求官方 `useG1Credits:false`（文档默认值）。ACP 在连接、恢复、prompt、登录预检时重查运行时／profile 身份；旧 runner 另外在 receipt 中记录派发前后的配置漂移检查。认证或额度失败均不切换到付费 API／credits。

依据：[官方认证](https://antigravity.google/docs/install/)、[CLI 参数与配置](https://antigravity.google/docs/cli/reference/)、[AI credits](https://antigravity.google/docs/cli/commands/credits)。官方把 useG1Credits 定义为套餐额度耗尽后改用 credits；插件不会启用或修改它。

旧 headless 检查通过后 receipt 写 `verified-local-controls`，不会冒充已核验商业权益。原生账号权益、套餐余额、第三方工具计费和实际额外账单没有可靠原生机器证据时仍为 unknown。模型目录不等于余额；token 统计不等于套餐剩余量。金额缺失写 `null`，不写成零元。

## 旧 headless 的完成与输入边界

成功还必须有无非空 `finished_reason` 的正常原生 SUCCESS 终态、可观测身份/模型/目录一致、schema 有效及本地清理确认；显式协作还要求已观察成员。exit 0、WAITING/RUNNING、soft-denied、半截输出不能成功。effort、executionMode、sandbox 没有原生回显时保持 unknown。`--dangerously-skip-permissions` 不等于沙箱关闭或任意路径可写；`--sandbox` 也可能在不支持机器上无效。

本地进程组退出不证明远端或所有子工作已完成；无终态保留 unknown，恢复只读原 journal，绝不重放。观察上限不构成整树硬预算。官方 headless `stream-json` 只接受 `text` content block；真实 `agy` 1.5.14 已拒绝 image block（`stream input content block type "image" is not supported (only "text")`），桌面端多模态输入不会自动进入本 machine API；不声明 PDF 或 artifact 回传。真实 Mac、账号、模型权益和完整 Desktop 验收见 [验收文档](docs/VALIDATION.md)。
