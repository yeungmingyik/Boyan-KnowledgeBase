# 参考资料

资料基准日期：2026-09-17。

## Cherry Studio

| 来源 | 固定版本或地址 | 用途 |
|---|---|---|
| 稳定版 | [v2.0.14](https://github.com/CherryHQ/cherry-studio/releases/tag/v2.0.14)，`d33b9b0266bda30d0e4715ae16650eee7b845d70` | 2026-09-09 发布；开发基线 |
| 主分支参考 | [b718f3a](https://github.com/CherryHQ/cherry-studio/tree/b718f3a5689d19c4d12689218a5f709f66bc2236) | 源码结构、技能、渠道与主题 |
| License | [固定版 LICENSE](https://github.com/CherryHQ/cherry-studio/blob/d33b9b0266bda30d0e4715ae16650eee7b845d70/LICENSE) | AGPL-3.0 分发路径 |
| 项目说明 | [README](https://github.com/CherryHQ/cherry-studio#-license) | 社区版商用条款说明与商业授权渠道 |
| 工具链 | [稳定版 package.json](https://github.com/CherryHQ/cherry-studio/blob/d33b9b0266bda30d0e4715ae16650eee7b845d70/package.json) | Node 范围、pnpm 和构建命令 |
| 知识服务 | [稳定版文档](https://github.com/CherryHQ/cherry-studio/blob/d33b9b0266bda30d0e4715ae16650eee7b845d70/docs/references/knowledge/knowledge-service.md) | 本地状态、服务入口与 BM25 检索 |
| 知识服务实现 | [KnowledgeService.ts](https://github.com/CherryHQ/cherry-studio/blob/b718f3a5689d19c4d12689218a5f709f66bc2236/src/main/features/knowledge/KnowledgeService.ts) | 接入边界交叉检查 |
| 主题规范 | [变量系统](https://github.com/CherryHQ/cherry-studio/blob/d33b9b0266bda30d0e4715ae16650eee7b845d70/packages/ui/docs/design-token-system.md) | 公开变量与内部变量边界 |
| 选择器 | [UI Semantic Contract](https://github.com/CherryHQ/cherry-studio/blob/d33b9b0266bda30d0e4715ae16650eee7b845d70/docs/references/components/ui-semantic-contract.md) | `data-ui` 稳定样式接口 |
| 飞书渠道 | [FeishuAdapter.ts](https://github.com/CherryHQ/cherry-studio/blob/b718f3a5689d19c4d12689218a5f709f66bc2236/src/main/ai/channels/adapters/feishu/FeishuAdapter.ts) | 消息渠道与资料同步的区别 |
| 贡献 | [CONTRIBUTING.md](https://github.com/CherryHQ/cherry-studio/blob/b718f3a5689d19c4d12689218a5f709f66bc2236/CONTRIBUTING.md) | 贡献类型、测试和社区流程 |

源码接入固定 commit，工具链与锁文件使用同一提交。

## 四个主题

| 仓库 | 核查提交 | 核查材料 |
|---|---|---|
| [hakadao/CherryStudio-Aero](https://github.com/hakadao/CherryStudio-Aero) | `ca8c312eb392844a41431ce0d6565e87a3933e7b` | README、style.css、仓库许可信息 |
| [rainoffallingstar/CherryStudio-PaperMaterial](https://github.com/rainoffallingstar/CherryStudio-PaperMaterial) | `5a14c95a111e52638a1e999bb81cb8d7bd538959` | README 中的 CSS、LICENSE 识别 |
| [bjl101501/CherryStudio-Claudestyle-dynamic](https://github.com/bjl101501/CherryStudio-Claudestyle-dynamic) | `b131a44f41a5fbfd8a5e1efee3d0a2f826089798` | README、完整文件树；未发现 LICENSE |
| [Cle2ment/CherryStudio_themes](https://github.com/Cle2ment/CherryStudio_themes) | `d6c264dc8c734eb394bbfbd39ed8fd4154b3cce5` | README、LICENSE、目录；原 BoningtonChen 链接重定向至此 |

CherryStudio_themes 的 LICENSE 与 README 许可表述不一致，代码复制前须澄清授权。

## 技能与飞书

| 来源 | 固定提交 | 核查结果 |
|---|---|---|
| [larksuite/cli](https://github.com/larksuite/cli) | `cb5a3d704379552dc61e37898e5f74798783190d` | 有 lark-shared、doc、wiki、drive 现成 SKILL；仓库 MIT |
| [larksuite/oapi-sdk-go](https://github.com/larksuite/oapi-sdk-go) | `99927aa13e271ea9fe03591204aad7bc6a2d869c` | 官方 Drive 订阅 API、事件与身份类型可交叉核查；生产实现仍推荐与项目一致的 Node SDK |
| [pbakaus/impeccable](https://github.com/pbakaus/impeccable) | `f2c7051853848826aac2f4646581d62a732155ad` | 现成设计 SKILL；仓库 Apache-2.0 |
| [openai/skills](https://github.com/openai/skills) | `49f948faa9258a0c61caceaf225e179651397431` | 存在 gh-fix-ci、security-threat-model 等；许可证按单技能目录核查 |

项目技能来源与校验值见 [技能依赖](SKILLS.md)。

## 规范与平台资料

- [OpenAI：Rethinking skills and prompts for GPT-6 Astra](https://developers.openai.com/blog/rethinking-skills-and-prompts-for-gpt-6-astra)，页面日期 2026-09-11。用于本项目精简常驻规则、按需读文档和控制技能数量。
- [Apple Materials](https://developer.apple.com/design/human-interface-guidelines/materials)，用于导航材质和内容层的设计区分。
- [Apple Accessibility](https://developer.apple.com/design/human-interface-guidelines/accessibility)，用于无障碍设计方向。
- [GitHub Forks](https://docs.github.com/en/pull-requests/reference/forks)，用于 fork 可见性说明。
- [GitHub Duplicating a repository](https://docs.github.com/en/repositories/creating-and-managing-repositories/duplicating-a-repository)，用于保留 Git 历史的仓库方案。

## 设计技能

- [Anthropic frontend-design](https://github.com/anthropics/skills/tree/34040c9c568585f6929bedeaad110ad08f079624/skills/frontend-design)：视觉方向、排版、布局和前端实现；固定提交 `34040c9c568585f6929bedeaad110ad08f079624`，单技能许可证 Apache-2.0。
- [UI UX Pro Max](https://github.com/nextlevelbuilder/ui-ux-pro-max-skill)：设计样式、UX 规则、技术栈检索和设计系统生成。
- [Taste Skill](https://github.com/Leonxlnx/taste-skill)：多种视觉设计技能；默认 v2 标注 experimental。
- [Impeccable](https://github.com/pbakaus/impeccable)：设计、审查、打磨和检测工作流。

选型比较见 [主题工具选型](DESIGN-TOOLS.md)。

## 接入验证

| 项目 | 验证要求 |
|---|---|
| 公司飞书真实目录、文档种类、大小 | 用户提供根链接和样本后清点 |
| 应用身份读取、附件权限和事件覆盖 | 在实际租户以最小范围接入 |
| 飞书接口文档 | 官方 SDK 与租户 API Explorer 交叉核对 |
| Cherry BM25 的中文检索效果 | 真实问题与原文评测，不能以功能存在替代质量结论 |
| 智能体模板在各模型运行时的兼容性 | 两种模型和基础检索降级流程 |
| 新旧知识切换与来源引用 | 首启、升级、崩溃、回滚 PoC |
| Windows 界面和安装制品 | 真机渲染、打包、签名和安装验证 |
| 托管费用和访问稳定性 | 确定规模与候选供应商后核算 |
| 商业授权条款 | 如选择闭源，由公司向官方获取正式条款 |
