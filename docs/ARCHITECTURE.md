# 技术架构

## 决策

架构由 Cherry Studio 客户端、博研资料发布器和静态知识包托管组成。模型请求从客户端发送到用户选择的服务商。

```mermaid
flowchart LR
  F[飞书指定发布空间] --> P[博研发布器]
  P --> V[解析与内容校验]
  V --> S[签名及版本化知识包]
  S --> H[对象存储或静态下载站]
  H --> U[客户端知识更新器]
  B[安装包内置知识包] --> U
  U --> K[Cherry 本地知识服务]
  K --> A[博研业务智能体]
  A --> M[用户配置的模型服务]
  K --> R[本地原文与引用]
```

## 开发基线

稳定版：v2.0.14，提交 `d33b9b0266bda30d0e4715ae16650eee7b845d70`。主分支参考提交：`b718f3a5689d19c4d12689218a5f709f66bc2236`。PoC 验证知识服务、主题变量和 `data-ui` 接口的版本兼容性。

知识服务使用本地 SQLite 状态、每库派生索引和持久化 JobManager，支持 BM25-only 检索。条目添加、删除和重建通过知识服务执行；Data API 负责读取和更新无索引副作用的状态。[上游知识服务](https://github.com/CherryHQ/cherry-studio/blob/d33b9b0266bda30d0e4715ae16650eee7b845d70/docs/references/knowledge/knowledge-service.md)

FeishuAdapter 承担 AI 消息渠道适配；文档发布由博研发布器实现。[渠道实现](https://github.com/CherryHQ/cherry-studio/blob/b718f3a5689d19c4d12689218a5f709f66bc2236/src/main/ai/channels/adapters/feishu/FeishuAdapter.ts)

## 改造边界

| 模块 | 现有入口 | 计划 |
|---|---|---|
| 本地知识导入 | `src/main/features/knowledge/` | 新增博研包适配器，经现有服务创建和导入知识库 |
| 任务状态 | 上游 JobManager 与知识状态 | 消费持久化状态；只有所有必需条目成功才能激活 |
| IPC | `src/shared/ipc/schemas/knowledge.ts` | 复用现有方法；仅补包更新状态等博研专属契约 |
| 智能体模板 | `resources/builtin-agents/` | 验证模板注册机制后增加业务模板，不覆盖官方支持 Agent |
| 检索调用 | `src/main/ai/tools/knowledgeLookup.ts` | 验证各运行时是否可绑定知识库；基础问答由受控 RAG 路径保证检索 |
| 主题 | `packages/ui/`、`src/main/services/ThemeService.ts` | 品牌预设及公开语义变量覆盖 |
| 渲染主题 | `src/renderer/components/ThemeProvider.tsx`、`src/renderer/hooks/useUserTheme.ts` | 保留模式切换和用户主题设置契约 |
| 首次使用和更新页 | `src/renderer/` 对应页面 | 博研入口、知识状态、Key 引导和引用预览 |
| 应用打包 | `electron-builder.yml` | 独立产品标识、资源、更新源和签名 |
| 飞书发布器 | `tools/boyan-publisher/` | TypeScript、官方 Node SDK、持久化发布状态 |

渲染器源码位于 `src/renderer/`。接入前核对目标提交的模块位置。

## 知识包与索引

知识包不包含研发用户数据库、对话库、凭证或预计算向量。

安装资源携带标准化 Markdown、已纳入的附件、文件清单和智能体文本配置。首次启动通过上游服务建立无 embedding 的本地知识库。预建跨平台索引仅在后续有明确性能需要、且索引格式兼容验证通过后加入。

BM25 中文检索执行真实问题评测。未达到门槛时依次验证中文分词、业务别名和多查询召回，再评估向量检索。

## 官方知识与用户数据

- 官方知识库记录 `distribution_id`、`release_sequence`、`pack_id` 和上游 `base_id` 的映射。
- 新版本创建 staging 知识库，导入完成后原子更新活动映射。索引失败不切换。
- 会话在检索开始时固定知识版本；更新期间的新会话使用新版本，正在生成的回答仍可打开旧版引用。
- 最近两版知识及被会话引用的必要来源保留；清理策略与磁盘配额冲突时提供明确信息，清理前确认引用可用性。
- 官方内容可复制到个人知识库后编辑；官方更新不修改复制品。
- 用户 API Key、自建智能体、个人知识和对话与官方发布状态分开存储。

## 模型适配

首期沿用上游服务商适配，不运营博研模型转发服务。业务智能体使用用户选定模型，不在模板里写死某个服务商或真实模型 ID。

工具调用不兼容时，由应用先执行本地检索，再将证据交给模型生成回答。基础智能体默认没有 shell、文件任意写入、邮件发送或知识库管理工具。需要复杂 Agent 运行时时，在首期验证矩阵之外单独开放。

## PoC 验收

1. 在全新用户目录中，从资源包无 Key 导入 BM25 知识库并显示可追溯引用。
2. 一次应用内切换可同时绑定正确知识库版本与智能体模板，保留用户配置。
3. 两个真实模型配置均能完成有来源的中文业务回答；不支持工具调用的模型可降级。
4. macOS 和 Windows 均能从临时下载目录校验、导入、恢复和更新；不使用 macOS 私有字体或系统接口作为跨平台必需条件。
