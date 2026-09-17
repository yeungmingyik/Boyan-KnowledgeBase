# 开发技能

## 项目依赖

安装目录：`.agents/skills/`。固定版本与文件校验值：[skills.lock.json](../.agents/skills.lock.json)。

| 技能 | 入口 | 用途 | 运行依赖 |
|---|---|---|---|
| `frontend-design` | [SKILL.md](../.agents/skills/frontend-design/SKILL.md) | 按需设计页面、调整布局、审查视觉一致性 | 无额外 CLI 或脚本依赖 |
| `cherry-electron-dev` | [SKILL.md](../.agents/skills/cherry-electron-dev/SKILL.md) | Electron 开发、界面调试、性能分析 | Cherry 源码、匹配的 Node/pnpm、Electron 实例与调试接口 |
| `lark-shared` | [SKILL.md](../.agents/skills/lark-shared/SKILL.md) | 飞书应用配置、身份、授权和权限排查 | `lark-cli`、博研飞书应用 |
| `lark-doc` | [SKILL.md](../.agents/skills/lark-doc/SKILL.md) | Docx 读取、结构分析、同步结果核查 | `lark-shared`、`lark-cli` |
| `lark-wiki` | [SKILL.md](../.agents/skills/lark-wiki/SKILL.md) | 知识空间、节点和文档身份定位 | `lark-shared`、`lark-drive`、`lark-cli` |
| `lark-drive` | [SKILL.md](../.agents/skills/lark-drive/SKILL.md) | 文件元数据、附件、导出与下载排查 | `lark-shared`、`lark-cli` |

技能用于开发和资料维护，客户端运行不依赖这些技能。发布器通过官方 SDK 调用飞书接口。

Cherry 源码自带的其他技能随基线保留，名单见 [public-skills.txt](../.agents/skills/public-skills.txt)。项目新增技能仍按本文件的用途和调用规则使用。

## 来源与许可

| 来源 | 提交 | 内容 | 许可证 |
|---|---|---|---|
| [anthropics/skills](https://github.com/anthropics/skills/tree/34040c9c568585f6929bedeaad110ad08f079624/skills/frontend-design) | `34040c9c568585f6929bedeaad110ad08f079624` | frontend-design 技能与许可证 | [Apache-2.0](../.agents/skills/frontend-design/LICENSE.txt) |
| [CherryHQ/cherry-studio](https://github.com/CherryHQ/cherry-studio/tree/d33b9b0266bda30d0e4715ae16650eee7b845d70/.agents/skills/cherry-electron-dev) | `d33b9b0266bda30d0e4715ae16650eee7b845d70` | Cherry Electron 技能及引用资源 | [AGPL-3.0](../.agents/licenses/cherry-studio/LICENSE) |
| [larksuite/cli](https://github.com/larksuite/cli/tree/cb5a3d704379552dc61e37898e5f74798783190d/skills) | `cb5a3d704379552dc61e37898e5f74798783190d` | 四个飞书技能及引用资源 | [MIT](../.agents/licenses/larksuite-cli/LICENSE) |

上游文件保持原文。更新时核对提交、引用资源、许可证和脚本行为，更新锁文件。禁止自动跟踪上游主分支。

## 调用规则

- 按任务加载单个技能及必需引用，不预读全部技能。
- 新页面设计、布局调整和视觉审查按需加载 frontend-design；遵循 Apple HIG、Cherry 主题契约和既定产品文案要求。
- 飞书资料接入默认只读；飞书写入、移动、删除和成员调整需要对应操作授权。
- 调查用户资源时使用相应用户身份；验证发布器时显式使用发布应用身份。
- 其他业务域的技能链接属于按需路由；Sheets、Base、Slides 等能力引入前单独登记。
- Electron 技能在 Cherry 源码和依赖准备完成后执行；安装技能不启动应用或安装源码依赖。
- Windows 脚本使用 PowerShell 7，提交使用 Conventional Commits。

## 备选技能

| 技能 | 来源 | 用途 | 引入条件 |
|---|---|---|---|
| `cherry-pr-test` | [CherryHQ](https://github.com/CherryHQ/cherry-studio/blob/d33b9b0266bda30d0e4715ae16650eee7b845d70/.agents/skills/cherry-pr-test/SKILL.md) | 验证官方 PR | 指定 PR 的测试任务 |
| `gh-create-issue` | [CherryHQ](https://github.com/CherryHQ/cherry-studio/blob/b718f3a5689d19c4d12689218a5f709f66bc2236/.agents/skills/gh-create-issue/SKILL.md) | 官方 Issue 模板 | 已有复现证据的公开反馈 |
| `gh-create-pr` | [CherryHQ](https://github.com/CherryHQ/cherry-studio/blob/b718f3a5689d19c4d12689218a5f709f66bc2236/.agents/skills/gh-create-pr/SKILL.md) | 官方 PR 模板 | 明确授权的提交任务；显式指定目标仓库和分支 |
| `security-threat-model` | [openai/skills](https://github.com/openai/skills/blob/49f948faa9258a0c61caceaf225e179651397431/skills/.curated/security-threat-model/SKILL.md) | 发布与凭证信任边界检查 | 明确的威胁建模任务 |
| `gh-fix-ci` | [openai/skills](https://github.com/openai/skills/blob/49f948faa9258a0c61caceaf225e179651397431/skills/.curated/gh-fix-ci/SKILL.md) | GitHub Actions 故障诊断 | 实际 CI 失败 |

设计工作流见 [主题工具选型](DESIGN-TOOLS.md)。项目采用 frontend-design；Impeccable 与其他设计候选保留为备选。
