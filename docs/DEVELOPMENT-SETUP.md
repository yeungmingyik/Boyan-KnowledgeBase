# 开发准备

## 产品边界

Windows、macOS 合作方交付版；支持继续分发；模型 API Key 由使用者配置。飞书指定发布范围内的资料均可交付。首期包含 Apple 风格主题、业务知识和四个智能体入口。

## 项目资源

| 资源 | 内容 | 负责人 |
|---|---|---|
| 发行许可 | AGPL 对应源码交付方案或商业授权 | 公司负责人 |
| GitHub 仓库 | 公司组织、产品仓库名、可见性、upstream | 技术负责人 |
| 飞书资料 | 发布根链接、20 篇代表文档、资料负责人 | 博研业务团队 |
| 品牌资产 | 产品名、Logo、品牌颜色、支持渠道 | 品牌负责人 |
| 业务样本 | 10 个常见问题、2–3 份理想结果 | 博研业务团队 |
| 验收设备 | Windows x64、macOS Apple Silicon；其他架构按客户设备增加 | 测试负责人 |
| 模型配置 | 至少两种目标模型的测试 Key 和额度 | 技术负责人 |

## 开发环境

- 产品仓库：`https://github.com/yeungmingyik/Boyan-KnowledgeBase.git`，远程名 `origin`。
- 上游仓库：`https://github.com/CherryHQ/cherry-studio.git`，远程名 `upstream`。
- 开发基线：Cherry Studio v2.0.14，提交 `d33b9b0266bda30d0e4715ae16650eee7b845d70`。
- 保留 Cherry Studio 完整 Git 历史，以选定稳定版建立产品主线。
- Node 与 pnpm 版本使用基线 package.json 的约束，依赖使用对应锁文件。
- Windows 使用 PowerShell 7；macOS 制品使用 macOS 构建环境。
- 项目开发技能位于 `.agents/skills/`，版本见 [技能依赖](SKILLS.md)。
- 飞书维护操作使用 `lark-cli`；应用配置与授权由博研租户管理员完成。
- API Key 和应用密钥存入本地凭证配置或发布环境密钥存储。

在仓库根目录执行：

```powershell
pnpm install --frozen-lockfile
pnpm docs:check
pnpm debug
```

Node 版本范围为 `>=24.11.1 <24.16.0`，pnpm 使用 `package.json` 指定的 11.8.0。原版开发入口见 [上游 README](../README.upstream.md)，运行实例管理见 [cherry-electron-dev](../.agents/skills/cherry-electron-dev/SKILL.md)。

## 飞书接入条件

企业自建应用、指定发布根目录的读取权限、Docx/Wiki/Drive 代表样本。资料负责人确认表格、图片、附件和基础业务文档的完整性要求。

## 发行资源

| 资源 | 要求 |
|---|---|
| 下载站 | 博研控制的 HTTPS 地址，覆盖合作方所在区域 |
| 发布环境 | 持久化任务状态、失败诊断、备份及维护责任人 |
| Windows 签名 | 适用的代码签名方案 |
| macOS 签名 | Apple Developer 团队、Developer ID、公证条件 |
| 知识包签名 | 发布端私钥、客户端公钥、备份与轮换方案 |
| 法律与品牌材料 | 对应源码、第三方声明、品牌和内容授权 |
| 用户支持 | 使用指南、脱敏诊断、联系渠道和试用名单 |

## 启动顺序

确定许可与仓库 → 准备飞书样本和模型 → 验证本地检索与同步 PoC → 开发知识发布、智能体和主题 → 跨平台验收与发行。
