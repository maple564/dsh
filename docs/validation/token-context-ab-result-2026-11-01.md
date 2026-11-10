> **历史实测记录 · 公开脱敏版**
> 原始测试由项目测试者提供；本文不是本次发布重新执行的测试。会话 ID、消息 ID 和本机目录已替换，版本哈希、结果、数值及限制保留。文中“当前版”指报告当日的构建，不能用于认证最新发布版本。原始日志与私人截图未公开，读者可参考下述步骤独立复验。

# 精简上下文 A/B 对比结果（2026-11-01）

测试对象：`dsh-plugin/client.js`，SHA256 `1ABE8D5E4D8B5478EFB637EA1590D3B7F2D25792B27DF6A6FD22EC0133147508`（`npm run build:client` 生成，与清单一致）。

结论：**A/B 配对流程完成，未发现运行异常。** B（精简上下文）的 `cacheRead` 和 `totalTokens` 均低于 A（默认 fork），回答仍直接、准确，未发现明显误用父支线信息或需要追问；但本轮只有一对样本，且 B 的 `inputTokens` 更高、回答更短，不足以直接推广为默认模式。

## 环境

- DSH `0.2.1-rc.3`；隔离 `DSH_HOME=<ISOLATED_DSH_HOME>`；profile `ab`；端口 `33921`。
- 模型/provider：`deepseek-flash` / `deepseek-official`（UI 显示 DeepSeek-V4.1-Flash）。
- 插件以 link 方式装入，`精简上下文实验` 复选框在已有支线的 Dock 中出现。
- 主线 `session-example-1`。
- 父支线 `session-example-2`。
- A（默认 fork）`session-example-3`。
- B（精简上下文）`session-example-4`。
- 未修改 Desktop profile 或 ACL；测试结束已停止隔离服务并删除临时凭据。

## 配对操作

1. 主线上“幂等键”建父支线，进入父支线后追加一轮纯文本回答（480 字）。
2. 在父支线第二轮回答中选中“可靠的判断依据”：`原文 51–58`，节点 `14:assistant-step2:1`，`finalSeq=28`，`messageId=REDACTED`。
3. **A：默认 fork**：不勾选“精简上下文实验”，问题为“这个判断依据在重试时如何避免误合并？”，创建 A。
4. 返回父支线，重新选择同一文本，勾选“精简上下文实验”，提交完全相同的问题，创建 B。

两次的 `parentSessionId`、`parentNodeKey`、`anchorStart/anchorEnd` 和 `question` 完全一致。

## 记录对比

| 项目 | A 默认 fork | B 精简上下文 |
|---|---|---|
| child Session | `session-redacted` | `session-redacted` |
| `parentSessionId` | `session-redacted` | `session-redacted` |
| `contextMode` | `forked-prefix` | `compact-path` |
| `forkedAtSeq` | 21 | 0 |
| `pathContextChars` | null | 938 |
| 锚点 / 原文偏移 | `可靠的判断依据` 51–58 | 同左 |
| 首条消息前缀字符数 | 58 | 58 |
| 首条消息是否含 `<父支线路径>` | 否 | 是 |
| fork 继承事件 | 父支线 turn 1：用户消息（前缀 3 字符）+ Assistant 回答（2,842 字） | 无（空白 Session） |
| 回答字符数 | 2,359 | 1,470 |

### Token

读取位置：隔离 Session 事件日志的 `assistant/message.data.usage`；模型来自 `request/header.header.config`。`totalTokens` 含 cacheRead。

| 请求 | Session / 事件 | inputTokens | cacheRead | cacheWrite | outputTokens | totalTokens |
|---|---|---:|---:|---:|---:|---:|
| A 首问 | A `seq 30` | 154 | 13,184 | 0 | 3,280 | 16,618 |
| B 首问 | B `seq 19` | 2,051 | 8,448 | 0 | 2,552 | 13,051 |

对照请求（不参与 A/B 判定）：

| 请求 | Session / 事件 | inputTokens | cacheRead | cacheWrite | outputTokens | totalTokens |
|---|---|---:|---:|---:|---:|---:|
| 主线首问 | main `seq 19` | 1,489 | 8,448 | 0 | 433 | 10,370 |
| 父支线首问 | parent `seq 19` | 1,539 | 8,448 | 0 | 3,242 | 13,229 |
| 父支线追加回答 | parent `seq 28` | 202 | 13,056 | 0 | 373 | 13,631 |

- B 的 `cacheRead` 比 A 低 4,736，`totalTokens` 低 3,567；但 B 的 `inputTokens` 比 A 高 1,897，说明精简上下文减少了缓存读取，同时把更多 compact path 文本作为未缓存输入。
- A 的 `inputTokens` 只有 154，是因为继承的父支线上下文命中了 cacheRead；不能把 A 的低 input 当作低总消耗。

### 上下文边界

- A：fork 在 `seq 21`（父支线 turn 1 末尾），继承父支线 turn 1 的用户消息和 Assistant 回答；本轮选中的父支线第二轮回答（`finalSeq=28`）不被继承。A 的新用户消息前缀 58 字符，结束于“可靠的判断依据”。
- B：空白 Session，无继承事件；首条消息包含 938 字符的 `<父支线路径>`（路径摘要和此前回答摘录）以及 58 字符的原回答前缀。
- A/B 的 `<原回答前缀>` 都结束于锚点，**没有包含选中回答锚点后的文字**；B 的 compact path 只引用父支线此前回答的摘要，不包含来源回答锚点后内容。

### 质量

- 两条回答都直接回答了同一个问题：如何避免重试时的误合并。
- A 展开为 2,359 字，包含误合并形态、判定条件和多项防线；B 为 1,470 字，保留“身份不来自内容”、三个误合并入口、判定顺序和 fail-closed 原则，结论完整。
- 未观察到 B 把父支线历史当成当前问题上下文，或引用与问题无关的父支线内容；两端都不需要额外追问。
- B 明显更短；本轮只能判断“无明显正确性下降”，不能仅凭一对样本判断长期质量。

## 判断

按清单条件：**B 的 `cacheRead` 降低，且本轮回答质量无明显下降**，因此精简上下文实验具备继续优化和扩大样本的价值。

但本轮只有一对请求，B 的未缓存输入更高、回答更短；不建议立即把 B 设为默认。建议保留默认 fork，继续用相同锚点和问题在更多主题/回答上重复 A/B，至少覆盖：

- 父支线上下文较长、cacheRead 差异更明显的情况；
- B 的 compact path 摘要是否遗漏关键约束；
- 多次 A/B 的平均质量、总 Token 和用户是否需要追问；
- 回答更新后 A/B 的版本校验和 anchor 边界。

## 异常

- 未发现运行异常、错误提示或错误支线。
- A/B 均成功映射同一锚点（51–58），记录中的 `parentSessionId` 和 question 一致。
- 未保存私人提示词或凭据；测试会话为公开技术问答。

## 清理

- 隔离环境 `<ISOLATED_DSH_HOME>`；profile `ab`；端口 `33921`。
- 测试结束已停止隔离 Web 服务、删除临时 `.credentials.yaml`、关闭测试标签页；Desktop profile 未修改，未改 ACL，C 盘工作区未新增。
