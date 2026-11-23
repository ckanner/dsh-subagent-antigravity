# 官方 Antigravity ACP 交互会话

[English](ACP.md) · 简体中文 · [插件概览](../README.zh-CN.md) · [旧 machine API](MACHINE.zh-CN.md)

## 默认方式与 Agent 主体

0.3.0 将桌面插件的默认连接方式改为 `transport: "acp"`，直接启动 Google 官方原版
**`agy acp`**。客户端以 `dsh-antigravity` 如实标识身份，不冒充 Zed。模型推理、原生
工具、工具权限及内部执行循环由官方 Agent 管理。在 Antigravity 页面发送消息不会
调用 DSH 的父模型。

客户端不发送 `systemPrompt`、`_meta.antigravity.systemPrompt.append`、受管自定义
agent、Preset、PTC 工具定义或隐藏控制前缀；`mcpServers` 固定为空数组。客户端
filesystem 和 terminal 能力均为 false，文件修改和命令执行使用官方原生工具。
官方运行时仍会加载用户自己的规则文件；“客户端不注入系统提示词”并不表示原生
有效系统提示词完全不包含用户规则。

这采用 Google [CLI ACP 文档](https://antigravity.google/docs/cli/acp)及
[编辑器文档](https://antigravity.google/docs/ide/extensions/acp)中的外部 Agent
客户端架构，不代表所有第三方接法或自动化用途都获得许可。公开 `./machine` 继续
是单独的旧 stream-json 接口；新增 ACP 不为它的自动化用途建立新的授权依据。

## 首次连接

1. 从官方来源安装 Antigravity CLI **1.5.14**。插件不下载、替换原生程序，不迁移
   凭据或修改其设置。支持 macOS／Linux 的 x64 和 arm64。
2. 打开一个当前目录属于 Git 仓库、且仓库已有提交的 DSH 会话，进入
   **Antigravity** 页面。空白会话可以通过 `/antigravity` 获取入口说明；安全的
   version-2 命令动作包括 `doctor`、`connect`、`list`、`status` 和 `cancel`。
3. 检查环境并连接。插件在创建会话前核对官方可执行文件摘要、版本和 ACP 命令。
   包装脚本、未经验收的升级或 profile 漂移会明确报错，不回退到独立 Registry
   agent、headless、API Key 或另一个账户。
4. 如果需要认证，在页面中启动原生登录。它运行同一个已核验程序的
   `agy acp --login`。打开 Google 链接，将返回的授权码或官方 callback URL
   粘贴到密码输入框；只有官方子进程收到这段内容，不写入 slash command、DSH
   会话事件或 ACP 持久记录。helper 正常退出后需要手动重新连接验证，不会自动
   发任务，也不据此宣称账户权益已验证。
5. 从原生会话返回的选项中选择 Gemini 模型。客户端不编造模型 ID 或思考档位，
   不静默改掉缓存的非 Gemini 选择。发送消息，查看原生工具更新，并按官方 agent
   实际给出的选项批准或拒绝权限请求。

连接会跨轮次保持。离开页面只取消显示订阅，不会取消原生会话。**停止**发送原生
`session/cancel`；**断开**请求关闭会话并清理本插件持有的进程组。断开不等于退出
Google 登录；需要管理登录时，可在原生 `agy` 中使用 `/logout`，客户端不会删除
凭据文件。

## 工作目录与改动

每个新会话创建独立 Git worktree 和 `antigravity/<记录 ID>` 分支，起点为源仓库
当前提交。页面展示源目录、worktree 路径、分支和起始提交。源目录未提交改动不
自动复制；若需要它们作为起点，请先提交预期状态再连接。

断开后保留 worktree 和分支。可以在那里审查、提交改动，再按正常 Git 流程主动
整合。插件不自动合并、reset 或删除用户工作。恢复时核对相同物理 worktree、
owner、原生 session ID 和运行时身份，不在原记录背后偷偷新建会话。

归属 reservation 保存在 Git 私有元数据中，不进入受跟踪文件。Flywheel 桌面控制
入口拒绝对这些 ACP 工作区启动自动化写入。这隔离的是受管入口，不是全局文件
系统沙箱，也不是对其他编辑器、单独启动的 CLI 或原生工具可访问路径的锁。
官方 CLI 仍使用用户已有的原生权限与 sandbox 设置。

## 生命周期、权限与恢复

ACP 私有记录位于 `~/.local/state/dsh-subagent-antigravity/acp`，与 Go 独占写入的
Flywheel `state.json` 分离。每条 prompt 在派发前先持久化 operation UUID 和精确
typed content。同一个 operation ID 重复请求只读取既有状态；更换内容会被拒绝，
没有自动重试循环。

根 `session/prompt` 返回只表示该请求结束，连接仍接收原生工具、子会话与权限
事件。已观察到的未完成工作阻止新 prompt 和配置修改。子会话及 tool ID 分别关联，
不把未知或未暴露的 child 活动说成整棵执行树已清理。

宿主崩溃、连接中断、prompt 结果未知或原生关闭未确认时，原操作保留为
**unknown**，worktree 和锁保留供检查。客户端不会重放本地会话文字、将任务重建为
新 prompt，或换账户／运行时把原操作包装成成功。另建连接使用新的 worktree。

正常断开要求运行时实际声明 `sessionCapabilities.close`，并确认本地持有的进程组
已清理。精确恢复通过协商后的 `session/resume` 或 `session/load`；加载历史不等于
重发 prompt。原生 close 回应与本地进程监督是两项不同证据；原生 detached task
是否完全停止仍需真实账户和运行时验收。

宿主参与 DSH workspace activity／stop 检查，以服务端实际 Agent 和当前物理目录
确定归属。页面卸载或 RPC 等待取消不充当清理证明。登录锁和连接锁也防止本插件
的控制器在另一个受管会话活动或清理未知时切换原生认证；它们不控制用户另外
启动的 `agy` 进程。

## 公开 API 与旧配置迁移

`@ckanner/dsh-subagent-antigravity/acp` 导出 `AcpSessions`、运行时预检和 TypeScript
声明。version-2 人类控制动作包括连接、状态、prompt、权限、配置、取消和原生
登录。宿主使用鉴权的 `antigravityAcp.action` Remote；前端不能通过它指定 owner、
workspace、命令、环境或系统提示词。

客户端固定使用 `@agentclientprotocol/sdk@2.9.1` 的稳定 ACP v1。API 接收 typed text、
resource link，以及运行时声明支持的内嵌文本和图片字节；不支持的内容在派发前
报错。图片是有界 base64 数据，不把本地图片路径冒充图片传输。显示历史有大小
限制，截断会明确标记；operation 记录保留精确出站内容。

显式设置 `transport: "headless"` 才保留旧任务面板与 `subagent_antigravity` 工具，
既有 preset allowlist 仍生效。旧 `model`、`effort`、`native`、执行及权限默认值只
作用于该路径，不注入 ACP。version-1 `./machine` 保留原来的回执与生命周期契约，
由调用方明确选择该接口。

## 证据边界

发行来源记录已核对四平台官方归档和解包后可执行文件摘要。实际未认证程序
探测及 initialize 只在 Linux x64 上运行；这些检查不证明其他平台可执行行为、
个人登录、Gemini 推理、原生模型切换、图片送达或后台清理。离线子进程、宿主／
界面和真实安装包测试验证客户端行为，不证明账户权益、费用、政策批准或回答
质量。具体日期和证据见[验证记录](VALIDATION.md)。
