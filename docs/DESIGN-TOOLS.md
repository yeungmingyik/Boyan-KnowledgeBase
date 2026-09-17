# 主题工具选型

## 设计依据

视觉语言采用 [Apple Human Interface Guidelines](https://developer.apple.com/design/human-interface-guidelines/)，实现遵循 [Cherry 主题变量](https://github.com/CherryHQ/cherry-studio/blob/d33b9b0266bda30d0e4715ae16650eee7b845d70/packages/ui/docs/design-token-system.md)和 [UI 语义接口](https://github.com/CherryHQ/cherry-studio/blob/d33b9b0266bda30d0e4715ae16650eee7b845d70/docs/references/components/ui-semantic-contract.md)，产品视觉参数见 [主题规范](THEME.md)。

设计技能负责构思、审查或规范检索。Electron 实际渲染、中文排版、窗口行为和主题兼容性以真机验收为准。

## 候选比较

| 工具 | 主要能力 | BoyanKB 适用任务 | 限制 |
|---|---|---|---|
| [Impeccable](https://github.com/pbakaus/impeccable) | 产品上下文、设计、审查、可访问性、打磨与检测 | 多页面持续迭代、交互状态覆盖、视觉回归修正 | 指令和辅助流程较多；需要限定产品风格及启用范围 |
| [Anthropic frontend-design](https://github.com/anthropics/skills/tree/34040c9c568585f6929bedeaad110ad08f079624/skills/frontend-design) | 视觉方向、字体、布局和界面实现 | 主题初稿、页面改造、少量针对性迭代 | 缺少完整的 Electron 验收及长期主题维护流程 |
| [UI UX Pro Max](https://github.com/nextlevelbuilder/ui-ux-pro-max-skill) | 设计样式、配色、排版、UX 规则和技术栈检索 | 对比设计方向、检索局部规范与样式组合 | 自带设计系统生成流程，需要约束为复用 Cherry 的变量和组件 |
| [Taste Skill](https://github.com/Leonxlnx/taste-skill) | 视觉方向和表现力、多种专门技能 | 品牌网站和视觉探索 | 本机 `design-taste-frontend` 主要面向落地页与作品集；远端 v2 标注 experimental，需单独评估 |
| Product Design 插件 | 视觉方案探索、流程审查、参考图转实现 | 比较多版首页或对话界面，再确定实施稿 | 插件工作流依赖，适合独立设计任务；不作为主题代码的默认规则集 |

评估依据：公开能力、指令范围、项目适配与运行依赖。

## 采用方案

**Apple HIG + Cherry 主题契约 + 按需使用 frontend-design + cherry-electron-dev 验收**。

| 层次 | 职责 | 交付物 |
|---|---|---|
| Apple HIG | 信息层级、导航、排版、材质、反馈与无障碍 | 页面布局、交互状态与视觉参数 |
| Cherry 主题契约 | 公开语义变量、组件复用、稳定选择器与生成流程 | 主题预设、变量映射和必要的局部样式 |
| frontend-design | 按需构思新页面、调整布局、审查视觉一致性 | 与主题规范一致的设计稿及界面实现 |
| cherry-electron-dev | 在对应工作区的实际 Electron 实例中验证 | 窗口截图、交互结果和必要的性能证据 |

`frontend-design` 沿用既定 Apple 风格、系统字体、中文内容和 Cherry 组件；颜色、字体与布局方案映射到现有主题变量。产品介绍和操作文案面向合作方，业务事实取自已发布资料。常规逻辑修改和已有变量的小幅调整无需加载设计技能。

Impeccable、UI UX Pro Max、Taste Skill 和 Product Design 保留为备选；新增或替换技能须先列出来源、版本、用途和依赖，获得同意后引入。同一任务采用一套主要设计工作流。

## 采用条件

| 候选 | 引入前核对 |
|---|---|
| Impeccable | 固定提交、脚本、产品文档生成、检测器与 hook 范围 |
| UI UX Pro Max | CLI 版本、生成目录、Python 依赖、数据与脚本来源 |
| Taste Skill | 具体技能与 v1/v2 版本、适用页面和动效范围 |
| Product Design | 任务范围、插件能力、参考图和设计稿交付方式 |

## 对比验收

使用同一组中文资料制作首页、对话和知识中心，比较 Apple 风格一致性、阅读效率、浅深色、键盘访问、渲染性能和上游升级影响。以实现结果选型。
