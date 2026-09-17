# 向 Cherry Studio 贡献

## 原则

博研专属品牌和业务资料留在产品仓库。可复用的缺陷修复、兼容性、主题接口和导入能力，整理为可以独立验证的小变更，向官方反馈。

提交缺陷前，在官方未修改版本中完成最小复现并检查已有 Issue 和 PR。

## 值得关注的方向

| 类别 | 方向 | 何时值得提交 |
|---|---|---|
| Contribute Code | 通用的版本化知识导入或来源元数据能力 | 确认现有服务缺少必要扩展点，且能脱离博研业务复用 |
| Fix Bugs | 中文检索、表格提取、导入恢复、路径兼容 | 原版稳定版或官方当前分支有最小可复现失败 |
| Fix Bugs | 深浅色、缩放、键盘焦点、跨平台窗口问题 | 原版也能复现，修复不依赖博研主题 |
| Contribute Code | 缺失的稳定主题语义角色 | 现有公开变量和 `data-ui` 无法满足常见主题需求 |
| Maintain Issues | 补环境、重现步骤、回归版本和重复问题链接 | 已阅读相关讨论，能提供新证据而非重复催办 |
| 文档 | 新版主题迁移或知识服务接入说明 | 通过实际工作验证，内容适用于一般贡献者 |

## 发现后的处理

1. 在独立用户目录对照官方未修改版本与博研版本。仅博研版本失败时先修复本地改动。
2. 搜索官方 Issue 和 PR，检查是否已有修复、讨论或已关闭的设计决策。
3. 记录系统、commit、复现步骤、预期/实际、最小样本、日志或截图；移除客户资料与 Key。
4. 有代码修复时在官方当前目标分支上重做最小补丁，提供能失败再通过的测试。
5. 向项目负责人提交证据、补丁、草稿和官方入口，获得公开提交授权后发布。

不直接从混有博研品牌和知识资料的产品分支向官方开 PR。需要标签、关闭 Issue 或项目维护权限的动作交由官方维护者；普通贡献者可以补充证据和建议。

## 官方入口

- [贡献指南](https://github.com/CherryHQ/cherry-studio/blob/main/CONTRIBUTING.md)
- [Issue 列表与搜索](https://github.com/CherryHQ/cherry-studio/issues)
- [创建 Issue 并选择官方模板](https://github.com/CherryHQ/cherry-studio/issues/new/choose)
- [PR 列表](https://github.com/CherryHQ/cherry-studio/pulls)
- [Discussions](https://github.com/CherryHQ/cherry-studio/discussions)
- [Good first issue](https://github.com/CherryHQ/cherry-studio/labels/good%20first%20issue)
- [安全报告渠道](https://github.com/CherryHQ/cherry-studio/security/policy)

## 提交材料

### Markdown 示例链接误报

- 类别：Fix Bugs。
- 版本：v2.0.14，`d33b9b0266bda30d0e4715ae16650eee7b845d70`。
- 位置：[check-doc-links.ts](../scripts/check-doc-links.ts)。
- 复现：在测试 Markdown 的行内代码中写入指向不存在文件的图片语法示例，运行原版检查脚本。
- 实际：示例被识别为真实链接，命令以退出码 1 失败。
- 预期：跳过代码示例，继续验证正文中的真实链接。
- 最小验证：一个 Markdown 文件、一处行内代码示例；原版脚本报告一个错误。
- 提交准备：在官方当前分支复验，并搜索已有 Issue 和 PR；补充行内代码、代码围栏与正文链接的回归测试。
- 官方入口：[创建 Issue](https://github.com/CherryHQ/cherry-studio/issues/new/choose)。

第三方飞书技能中指向未引入业务域的可选路由属于独立的依赖范围问题，不能统一当作示例链接跳过。

### 内容要求

Issue 草稿包含具体问题、受影响版本、最小复现、实际与预期、验证过的环境及证据。PR 草稿遵循提交时官方模板，列出行为变化、必要测试和用户影响。

Git 提交严格使用 Conventional Commits，例如 `fix(knowledge): preserve table text during import`。若官方某个自动化流程要求特殊 PR 标题，区分 PR 标题与 Git 提交；不得把非标准前缀混入本项目提交，也不在未满足规范时用 squash 产生违规提交。

官方贡献指南说明新贡献者的测试可能需要维护者批准触发。未运行的 CI 不写成“通过”；本地证据与 CI 证据分别记录。

## 贡献记录字段

贡献记录包含：发现日期、类别、上游版本、最小复现、关联 Issue/PR、补丁分支、验证结果、是否获准公开提交及维护者反馈。没有新证据的候选不批量开 Issue。
