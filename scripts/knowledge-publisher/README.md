# 知识库发布工具

Windows x64 发布工具。读取本人有权访问的飞书知识空间，生成带签名的知识包。公司配置可以在同事之间复用；飞书登录和私钥留在各自的电脑上。

## 首次使用

1. 安装 PowerShell 7、Node.js 24.11.1 或更高的 24.x 版本，以及官方 `lark-cli`。
2. 解压完整工具目录，双击 `launch.cmd`。
3. **准备环境**：确认三个组件均显示“已就绪”，点击“下一步”。缺少组件时点击对应“安装指南”。
4. **连接飞书**：首次使用点击“配置应用”，选择公司指定应用，再点击“登录飞书”。已有登录时直接“检查连接”。应用须授权 `wiki:node:retrieve`、`docx:document:readonly`，并允许当前同事使用；本人须能读取知识空间及正文直接引用的资料。
5. **选择资料**：选择维护者提供的 `publisher.json`、单独交接的发布密钥，以及公司统一的发布目录。
6. **发布**：核对资料名称和发布方式，点击“生成发布文件”或“发布最新资料”。完成后可“打开目录”。

官方安装入口：[PowerShell](https://learn.microsoft.com/powershell/scripting/install/installing-powershell-on-windows)、[Node.js](https://nodejs.org/en/download)、[飞书 CLI](https://github.com/larksuite/cli)。

工具不需要 Cherry 源码、Git 或 pnpm。再次打开时点击“继续上次发布”，检查飞书连接后直接进入发布页。配置名称变化或连接失效时，需要重新检查。

环境支持范围为 Windows x64。首次安装的系统策略、企业设备限制和飞书权限需满足运行要求；不支持将此工具直接放到未安装依赖的电脑上运行。

## 发布配置

`publisher.example.json` 提供公共配置字段。`wiki`、`spaceId`、`name` 指定知识来源；`includeLinkedDocuments` 控制是否包含正文直接引用的同站点文档；`distributionId` 指定发行身份；`keyId`、`publicKey` 指定受信发布密钥；`minAppVersion` 指定最低客户端版本。

`manifestUrl` 留空时只生成发布文件，显示“尚未上线”。在线发布要求发布目录已由网站通过 HTTPS 提供下载，`manifestUrl` 指向该目录中的 `latest.json`。本工具写入指定目录，不含云存储上传适配器。

首次建立公司发行配置时，在“选择资料”中选择 `publisher.example.json`，展开“维护者：首次建立发布配置”，点击“创建发布密钥”。它在 `%LOCALAPPDATA%\BoyanKnowledgePublisher` 创建私钥与含公钥的 `publisher.json`，不覆盖已有文件。同事使用维护者提供的同一份配置，不各自创建新的发行密钥。

客户端构建配置 `resources/feishu-update.json` 使用同一 `distributionId`、`spaceId`、`manifestUrl`，并将 `keyId` 与 `publicKey` 填入 `keys`。将新的公钥配置到客户端之前，新密钥签名的资料不能被旧客户端接受。

## 多人发布

- 多人必须使用同一个发布目录，可选公司共享目录或网站目录。发布序号从目录中的有效签名清单继续，换电脑不会重置。
- 发布目录需要读取、写入和原子重命名权限；共享文件系统须支持独占创建。已有 `release.lock` 时拒绝并发任务，不覆盖他人正在发布的版本。
- 飞书读取权限与发布权限分别配置。不要共享个人飞书登录缓存；私钥单独安全交接，不能放入工具压缩包或发布目录。
- 没有统一共享目录时，由维护者交接完整发布目录和最新版本后再换电脑操作；不得让多台电脑从不同历史目录分别发布同一发行身份。
- 读取失败、错误私钥、版本文件损坏或大量移除资料时停止发布。清单切换前下载验证失败时保持旧清单。
- HTTPS 目录需要匿名读取且不重定向；`latest.json` 禁止长期缓存。只公开 `<sha256>.json` 和 `latest.json`，不要公开锁文件、临时文件或目录列表。

## 本机文件

本机设置位于 `%LOCALAPPDATA%\BoyanKnowledgePublisher\settings.json`，只记录配置路径、私钥路径、发布目录和飞书 profile 名称。程序在同一用户目录创建临时工作文件，操作结束后清理。

异常退出时先确认 `release.lock` 中记录的电脑和进程已停止，再由维护者删除锁文件。不得清空发布目录或删除 `latest.json` 来重置版本。

## 构建

在源码仓库执行 `pnpm knowledge:publisher:build`。输出目录为 `.context/distribution/knowledge-publisher`。内部交付同时提供对应源码及许可证；打包时不得包含用户设置、私钥或飞书凭证。
