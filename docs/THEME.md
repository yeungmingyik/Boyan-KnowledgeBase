# Apple 风格主题规范

## 设计方向

采用 **Apple HIG + Cherry 主题契约 + 按需使用 frontend-design + cherry-electron-dev 验收**。职责与调用范围见 [主题工具选型](DESIGN-TOOLS.md)。

采用接近 macOS 生产力应用的简洁布局：清晰侧栏、安静的内容区、适量留白、精确排版、轻微材质和短促反馈。使用博研品牌标识，保留各平台原生窗口行为。

Apple 的材料指南将玻璃材质主要用于导航与控件层；知识正文保持稳定、清晰的底色。[Apple Materials](https://developer.apple.com/design/human-interface-guidelines/materials)

## 四个参考仓库

| 参考 | 可借鉴 | 不直接沿用的内容 | 许可核查 |
|---|---|---|---|
| [Aero](https://github.com/hakadao/CherryStudio-Aero) | 侧栏层次、轻材质、浅深色表面关系 | 大量旧 Ant 选择器和强制覆盖；其说明限定部分磨砂效果仅适用 macOS | AGPL-3.0 |
| [PaperMaterial](https://github.com/rainoffallingstar/CherryStudio-PaperMaterial) | 纸面感、中文阅读节奏和长文舒适度 | 旧 CSS 结构、跨平台不可保证的字体假设 | MIT；README 引用其他主题，复制代码前仍需核对来源 |
| [Claudestyle-dynamic](https://github.com/bjl101501/CherryStudio-Claudestyle-dynamic) | 内容宽度、对话阅读感、交互反馈思路 | 持续动画、旧变量及 `!important` 覆盖 | 仓库树未找到明确 LICENSE，暂只作视觉参考 |
| [CherryStudio_themes](https://github.com/Cle2ment/CherryStudio_themes) | 主题组织方式、示例与文档、字体配置思路 | 霓虹边框和装饰性动效 | 原链接重定向至 Cle2ment；LICENSE 为 AGPL-3.0，README 却称 MIT，复制前需澄清 |

主题独立实现，参考仓库仅提供视觉与组织方式参考。固定提交见 [参考资料](SOURCES.md)。

## 与当前 Cherry Studio 的衔接

上游已提供 Shadcn 语义变量及 `data-ui` 选择器契约。优先在主题预设中设置公开语义变量；只有变量不能表达的结构样式才使用明确的 `data-ui` token。显式语义角色比自动推导的角色更适合长期依赖。[变量规范](https://github.com/CherryHQ/cherry-studio/blob/d33b9b0266bda30d0e4715ae16650eee7b845d70/packages/ui/docs/design-token-system.md)、[选择器契约](https://github.com/CherryHQ/cherry-studio/blob/d33b9b0266bda30d0e4715ae16650eee7b845d70/docs/references/components/ui-semantic-contract.md)

禁止直接编辑生成的 `theme.css`、重新引入已移除的旧变量，或依赖随机 className、`nth-child` 和全局 `transition: all`。使用上游生成与检查流程维护样式契约。博研的品牌视觉改动集中在预设及少量品牌页面；不把主题改造扩散到每个业务组件。

## 视觉初稿参数

初稿参数在浅色、深色、高 DPI 和中文内容场景中验收。

| 维度 | 建议 |
|---|---|
| 浅色 | 页面 `#F5F5F7`，阅读面 `#FFFFFF`，正文 `#1D1D1F`，强调色 `#0066CC` |
| 深色 | 页面 `#171719`，阅读面 `#222225`，正文 `#F5F5F7`，强调色 `#6AAEFF` |
| 状态 | 成功、警告、错误保留独立语义；不能只靠颜色区分 |
| 字体 | `system-ui` 为主；macOS 使用已安装系统字体，Windows 使用 Segoe UI 与微软雅黑等回退 |
| 正文 | 中文正文 14–16 px、行高约 1.6；长文最大宽度约 800–920 px |
| 圆角 | 以现有语义圆角尺度为基础，控件约 8–10 px、面板约 12–16 px |
| 动效 | 状态反馈 120–180 ms；尊重减少动态效果设置 |
| 材质 | 仅导航、工具栏和浮层适度使用；提供不透明模式 |
| 布局 | 侧栏约 220–260 px，可折叠；阅读正文优先于装饰 |

图标沿用许可明确的上游图标系统。Apple 字体和 SF Symbols 不作为随 Windows 分发的资源。

## 页面和状态覆盖

| 页面 | 主要内容 | 必须覆盖的状态 |
|---|---|---|
| 首页 | 业务入口、继续对话、知识版本 | 首次准备、未配置 Key、正常、知识更新失败 |
| 对话 | 阅读区、输入区、来源侧栏 | 生成中、无依据、取消、模型错误、来源失效 |
| 知识中心 | 分类、搜索、本地原文、版本 | 空结果、首次导入、离线、更新可用、失败重试 |
| 智能体 | 四个预设、个人副本 | 模板更新、模型未选、复制后编辑 |
| 设置 | 模型、主题、更新、诊断 | 无效 Key、网络不可达、深浅色与不透明模式 |

## 平台差异

- Windows 保留系统窗口控制与拖动区域，保证缩放、最大化、窗口吸附和键盘快捷键可用。
- macOS 保留交通灯按钮和原生菜单行为。DMG 中运行时提示复制到 Applications 后再完成正常更新流程。
- 两端均覆盖 100% 和高 DPI 缩放、中文输入法、长表格、代码块、链接和键盘焦点。
- Windows 首期使用不透明或轻量 CSS 表面；macOS 原生材质作为增强。

## 实施与验收

先完成首页、对话、知识中心三张设计稿与主要状态；再建立主题映射，最后覆盖设置和弹窗。使用同一组真实资料验证浅色、深色、低动画及不透明模式。

页面构思与视觉审查按需使用 frontend-design，复用既定变量与组件。实现后使用 cherry-electron-dev 在对应工作区的实际 Electron 实例中验收，记录平台、窗口尺寸、缩放、主题、截图和交互结果。临时证据保存在 `.context/cherry-electron-dev/`；发布验收记录归档至对应版本的验收材料。

普通正文对比度目标 ≥ 4.5:1，大字与关键控件边界目标 ≥ 3:1。键盘能够完成模型配置、提问、打开来源和检查更新。固定基准下空闲 CPU、输入延迟和滚动响应相对原版不得明显退化；性能门槛见验收计划。
