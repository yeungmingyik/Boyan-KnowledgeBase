# 仓库与许可证

## 仓库结构

产品仓库保留完整上游 Git 历史，官方公开 fork 承载社区贡献。

| 远程 | 地址 |
|---|---|
| `origin` | `https://github.com/yeungmingyik/Boyan-KnowledgeBase.git` |
| `upstream` | `https://github.com/CherryHQ/cherry-studio.git` |

开发基线为 v2.0.14，提交 `d33b9b0266bda30d0e4715ae16650eee7b845d70`。原版说明见 [上游 README](../README.upstream.md)。

研发仓库可按资料可见范围设为公开或私有。公开源码路线可直接使用公司 fork。AGPL 分发义务按发行方式执行。

| 方案 | 适合情况 | 成本或限制 |
|---|---|---|
| 公司公开 fork | 二开源码愿意公开、贡献频繁 | GitHub public fork 保持公开；不要混入非公开资料 |
| 独立仓库，保留完整上游历史 | 需要独立产品发布和研发可见性 | 自己配置 upstream；公开贡献经另外的 fork |
| 下载 ZIP 后新建空历史仓库 | 不建议 | 丢失共同祖先，升级、追溯和贡献成本显著增加 |
| 购买官方商业授权 | 需要符合约定的闭源交付 | 必须取得书面授权，核对修改、品牌、再分发和更新范围 |

GitHub 公共 fork 的可见性规则见 [Forks](https://docs.github.com/en/pull-requests/reference/forks)；保留历史的复制方法见 [Duplicating a repository](https://docs.github.com/en/repositories/creating-and-managing-repositories/duplicating-a-repository)。

## 发行许可

Cherry Studio 社区版采用 AGPL-3.0；其 README 明确允许在遵守条款的前提下商用，并提供商业授权联系渠道。子包按各自许可使用，桌面应用按 AGPL-3.0 或取得的商业授权发行。[社区版说明](https://github.com/CherryHQ/cherry-studio#-license)、[固定版本 LICENSE](https://github.com/CherryHQ/cherry-studio/blob/d33b9b0266bda30d0e4715ae16650eee7b845d70/LICENSE)

AGPL 路线向合作方分发修改后的二进制时，保留许可声明，并按适用条款向接收者提供对应源码、修改内容及构建所需材料。源码可通过公开仓库或符合条款的交付渠道提供。

闭源发行须取得覆盖修改、品牌、再分发和更新范围的商业授权。业务资料的版权与分发范围由博研确认。

发行负责人在发布前确认实际发行方式、许可证材料和源码交付渠道。

## 源码接入

从官方完整 clone 建立产品历史，保留已有项目文档和技能依赖。

1. 确定 GitHub 组织、仓库名称、可见性和 AGPL/商业授权路径。
2. 在新的工作目录完整 clone 官方源码。
3. 保留官方远程为 `upstream`，公司仓库为 `origin`；从选定稳定提交建立产品主线。
4. 将博研文档与项目技能合入 checkout，保留上游 README、CLAUDE.md 和贡献规范。
5. 合并代理规则与上游入口。基线 AGENTS.md 指向 CLAUDE.md，写入前确认其链接类型。
6. 确认文档、技能、历史和远程后启用 checkout。替换既有工作目录前建立完整备份。

仅向公司仓库推送产品分支和必要标签。镜像推送须逐项核对目标引用。

## 分支和升级

- `main`：博研可交付主线。
- `feat/<topic>`、`fix/<topic>`、`docs/<topic>`、`chore/<topic>`：按任务类型命名开发分支。
- `chore/upstream-<version>`：上游稳定版本合入验证。
- `fix/upstream-<topic>`：在官方当前目标分支上创建的独立贡献分支。

分支名禁止使用 `codex/` 前缀。

以 merge 保留长期上游共同历史；不要反复 rebase 已供团队或合作方使用的发布主线。常规每月评估稳定版，关键漏洞或阻断问题及时评估补丁。

升级记录旧基线、新基线、冲突模块、迁移结果及主题回归。已发布数据库迁移保持编号和内容不变；冲突按上游当前迁移规范处理。使用独立测试用户目录验证既有对话、Key 和知识数据能够迁移。

## 发布命名与资产

软件产品名、appId、协议名、用户数据目录和更新地址必须独立，防止覆盖用户现有 Cherry Studio。品牌资产使用博研授权素材；第三方许可证及 NOTICE 随安装包和源码交付。

保留第三方版权、许可证及 NOTICE 原文。
