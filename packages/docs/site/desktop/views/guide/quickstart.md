# 快速开始

三步：在 Desktop 中安装、重新打开窗口、安装第一个模块。需要 Desktop 与一个能安装扩展的浏览器。

## 前置

| 要有 | 为什么 |
| --- | --- |
| Desktop（DeepSeek Harness.app） | 工作台作为插件安装在里面 |
| Chrome / Edge / Brave / Chromium / Vivaldi | 面板要借助你浏览器里的登录状态读取数据；第一次打开时需要安装一次 OpenCLI 扩展 |

:::tip 还差一步：第一次打开前安装浏览器扩展
工作台会自动安装 opencli 的运行时，但**浏览器里的 OpenCLI 扩展需要你安装一次**，面板才能读到数据。
不安装也能进入工作台，只是依赖登录状态的面板会空白。步骤见下面「第一次打开」。
:::

## 安装

1. 打开 Desktop 侧栏 **Plugins → Add plugin**
2. 填 `@dsh-workbench/core`，**Install → Enable now**
3. 重新打开窗口 / 刷新

安装后，模块市场、看板与设置都会出现；会话、项目与附件沿用 Desktop 现有的那一份，不需要迁移。
细节见 <PagodaDocLinkToView view="guide/install">安装</PagodaDocLinkToView>。

## 第一次打开：过一遍启动检查

第一次打开时会先出现「准备工作台」这一屏：工作台会自动准备运行环境（不会改动你本机已有的工具配置），
然后依次执行启动检查（共 6 步）：检查运行环境、检查运行时、安装后台工具、连接浏览器、检查 DIY 模式、连上站点。
运行时放在 `~/.dsh/workbench/opencli`，**不碰**你本机的 `~/.opencli`。

面板不存储数据，它读取的是你浏览器里的登录状态。所以还需要在浏览器里**安装一次 OpenCLI 扩展**：

1. 打开 [OpenCLI（Chrome 应用商店）](https://chromewebstore.google.com/detail/opencli/ildkmabpimmkaediidaifkhjpohdnifk)，选择安装
2. 到扩展页确认它已启用；用平时登录这些平台的浏览器账号，保持浏览器开着
3. 回到「准备工作台」这一屏选择「重试」

启动检查里「连接浏览器」未连接也不影响进入工作台，选择「先进入工作台」即可；但在连接成功之前，依赖登录状态的面板取不到数据。
Desktop 里还提供一个「打开浏览器」按钮，点击后会打开上次承载扩展的那个浏览器，打开后自动复检。

真正用起来只有一条主路径：**左栏挑项目 → 中间对话 → 右边看面板**。

## 安装一个模块

工作台本身不附带业务模块，安装什么就有什么。右侧初始是一块空看板，可以到「工作台模块市场」安装，
或者直接对 agent 说「安装一个缺陷面板」。

需要创建模块时，开启 DIY 模式，让 agent 现场创建并安装，不需要先学一套框架。
细节见 <PagodaDocLinkToView view="guide/modules">面板与模块</PagodaDocLinkToView>。

## 升级

在模块市场找到「工作台」那一行，选择「更新」；安装完成后提示「重启后生效」时，退出后重新打开 Desktop 即可。

## 下一步

- 面板与模块怎么工作：<PagodaDocLinkToView view="guide/modules">面板与模块</PagodaDocLinkToView>
- 数据放在哪、怎么备份：<PagodaDocLinkToView view="guide/data">数据与设置</PagodaDocLinkToView>
- 想改动它：<PagodaDocLinkToView view="guide/architecture">架构</PagodaDocLinkToView>，再读仓库里的 `CONTRIBUTING.md`
