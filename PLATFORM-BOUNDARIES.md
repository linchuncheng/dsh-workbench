# 平台边界

> 本文只定平台差异允许落在哪里、三方模块能拿到什么，以及门禁怎么钉住它。
> 层的划分见 [`DESIGN-BOUNDARIES.md`](DESIGN-BOUNDARIES.md) §2 / §6；术语见 [`CONTEXT.md`](CONTEXT.md)。
> 本文是目标边界；迁移期用登记表的 `allow` 放行现有站点，`allow` 只减不增，只剩命名落点与适配器端口才算收口。

## 1. 结论

平台差异固定到三类落点，外加启动器例外：

```text
L2 纯平台层（目标）
packages/shared/src/host/platform/
├── facts.ts                 # 唯一派生 HostOs
├── ops/
│   ├── shell.ts             # 纯引号 / argv / 可执行名
│   ├── env.ts               # 纯 HOME / USERPROFILE / PATH 前插
│   └── fs.ts                # 纯 link plan（I/O 仍归 fs-write）
├── integration/
│   ├── darwin.ts            # 纯命令/数据表：front-app、browser、tool lookup
│   ├── linux.ts
│   └── win32.ts
└── index.ts                 # 只 re-export，不放逻辑

L2 现有实现模块（迁移期在 allow，阶段 2 搬进 platform/ops）
shared/src/host/shell/shell-text.ts
shared/src/host/shell/shell-render.ts
shared/src/host/runtime/env-policy.ts
shared/src/host/adapters/platform.ts
shared/src/host/seam/process.ts
shared/src/host/runtime/front-app.ts

L3 适配器端口（只允许专用小模块，逐个登记）
adapter-runtime/src/cli/opencli-shim.ts
adapter-probe/src/runtime/browser-install.ts
...                         # 混合文件不许当端口；先拆再登记

L1 客户端平台落点
packages/core/src/shared/api/platform/client.ts

启动器例外
packages/core/bin/dsh-workbench
packages/core/bin/dsh-workbench.cmd
packages/core/bin/seed-workshop-windows.mjs
```

**L2 只放纯事实、纯函数、纯命令表。执行仍然走 `ctx.shell` / `Seam` / `ProcessHost`，不在 `ops` 里起进程。**

L3 适配器端口不是“漏网之鱼”，而是 `DESIGN-BOUNDARIES` L3 自己的平台实现；它必须是专用模块，不能拿一个混合业务文件登记后让以后所有平台判断都合法。

## 2. 三个对象

### 2.1 HostFacts

`facts.ts` 是唯一派生宿主平台事实的模块。只放有明确消费者的值：

```ts
interface HostFacts {
  os: HostOs;
}
```

- 复用 `shared/src/contract/protocol/platform.ts` 的 `HostOs`，不另造 OS 枚举。
- `HostSurface`（deployment / profile / capabilities / toolchain / restartHint）仍是产品能力面，留在 `host/adapters/platform.ts`；不把产品策略塞进 `facts.ts`。
- `shellKind` 是**每次请求**的输入（`SeamRequest.shellKind`），不是全局事实：同一台机器也可能用不同 shell 跑命令。
- `path.delimiter` / `path.sep` 直接用 `node:path`；`linkKind` 是运行时探测（`dirLinkTypeOf`），不是一次性事实；`argvLimit`、`signals` 没有明确消费者前不进 facts。
- `arch` / WSL 暂不纳入；需要时单独开阶段。

### 2.2 HostOps

`ops/**` 只放纯函数；输入 facts / shellKind / path，返回字符串、数组或 plan，不产生 I/O：

```ts
interface ShellOps {
  quoteArg(value: string, shellKind: ShellKind): string;
  renderArgv(argv: readonly string[], shellKind: ShellKind): string;
  executableName(name: string, os: HostOs): string;
}

interface EnvOps {
  homeEnv(home: string, os: HostOs): Record<string, string>;
  prependPath(parent: string | undefined, bins: readonly string[], delimiter: string): string;
}

interface FsOps {
  linkPlan(target: string, path: string, linkKind: 'symlink' | 'junction'): { kind: 'symlink' | 'junction'; target: string; path: string };
}
```

- `ops.shell` 是 `shell-text` / `shell-render` 的窄门面，不复制引号、`& `、plan 逻辑。
- `ops.env` 是 `env-policy` 的窄门面，不复制 `USERPROFILE` / `HOMEDRIVE` / `PATH` 逻辑。
- `ops.fs` 只产出 plan；真正 `linkDir` / 原子写仍在 `fs-write`（执行层）；`linkKind` 由运行时探测传入。
- `executableName` 必须接收 `os`：`.cmd` / `.exe` 取决于工具，不取决于 `shellKind`。
- `killTree`、`spawn`、`linkDir` 这类执行不进 `ops`；它们归 `Seam` / `ProcessHost` / `fs-write`。

### 2.3 HostIntegration

`integration/{darwin,linux,win32}.ts` 是纯命令/数据表，按消费者分组，不执行：

```ts
type CommandSpec =
  | { kind: 'argv'; file: string; args: readonly string[]; shellKind: ShellKind }
  | { kind: 'line'; line: string; shellKind: ShellKind };

interface BrowserSpec {
  id: string;
  label: string;
  processNames: readonly string[];
}

interface HostIntegration {
  frontApp(): CommandSpec | undefined;
  activateApp(app: string): CommandSpec | undefined;
  browsers(): readonly BrowserSpec[];
  installCandidates(spec: BrowserSpec): readonly string[];
  launchBrowser(spec: BrowserSpec): CommandSpec | undefined;
  toolLookup(name: string): CommandSpec;
}
```

- `CommandSpec` 同时支持 argv 和 `line`：darwin `lsappinfo ... $(lsappinfo front)` 与 POSIX `command -v` 是 shell 内建/替换，不能强行压成 argv。
- `installCandidates` 返回路径候选（`/Applications/*.app`、`/usr/bin/*`、`Program Files` / `LOCALAPPDATA`），不是命令。
- `BrowserSpec` 只放数据；安装/启动由 `installCandidates` / `launchBrowser` 按 spec 查表，避免目录与命令两处分叉。
- 返回 `CommandSpec`，不返回裸字符串；执行由 `Seam` 做；`line` 与 `argv` 的差异由 `Seam` 现有的 direct/sandbox 路径处理。

## 3. 落点规则

| 落点 | 拥有 | 不拥有 |
|---|---|---|
| `host/platform/facts.ts` | `HostOs` 派生 | 产品策略、命令、I/O |
| `host/platform/ops/**` | 纯引号/PATH/env/link plan | 起进程、写文件、UI |
| `host/platform/integration/**` | 纯命令/数据表 | 业务、I/O、UI |
| L2 现有实现模块 | 迁移期已有实现 | 新平台分支；新代码必须进 `platform/**` |
| L3 适配器端口 | 专用适配器的平台细节 | 业务模块、混合文件、`shared` 公共契约 |
| `core/.../platform/client.ts` | 浏览器侧 UA / ClientSurface | 宿主 Node API |
| `core/bin/*` | 启动器入口 | 运行时业务 |

**允许**：落点内按 `facts.os` / `shellKind` 分支；落点内导入 `node:os`、`node:path.win32`、`node:child_process`。

**禁止**：落点外读 `process.platform`、`os.platform()`、`process.env.OS`、`navigator.userAgent`；落点外出现 OS 字面量、`.cmd` / `.exe` 后缀判断、`taskkill`、`USERPROFILE`、`where.exe`、手写命令链。

## 4. 三方模块的公开面

平台落点是**内部实现**，不是模块 API。三方模块只拿语义能力。

### 4.1 kit（浏览器侧）

| 能力 | 公开形式 | 说明 |
|---|---|---|
| 部署形态 / 运行时 | `usePlatform().client.deployment` / `.shell` | Desktop vs web、electron vs browser |
| 宿主能力 | `usePlatform().host?.capabilities` | `pageDebug` / `recording` / `browserWake` / `selfUpdateCli` / `safeMode` |
| 宿主文件管理器 | `host.capabilities.fileManager` | `finder` / `explorer` / `none`；**归 host**，因为 reveal 动作在宿主执行 |
| 浏览器能力 | `usePlatform().client.capabilities` | `debugFooter` / `primaryModifier`（`meta` / `ctrl`），**归 client**，因为键盘在浏览器 |
| 重启提示 / 工具链 | `host.restartHint` / `host.toolchain` | 平台相关文案与安装计划，模块只展示 |
| 路径展示 | `kit.lib.pathBase` / `shortenPath` | 纯展示，不做平台分支 |
| 组件 / 样式 | `kit.components` | 不暴露 OS 组件 |

`usePlatform()` 是模块读平台事实的唯一入口。`macFileManager` 被 `host.capabilities.fileManager` 取代；`hostOs` 只保留给展示/诊断，模块行为按 capabilities 分叉，不比较 OS 字面量。

### 4.2 deps（宿主侧）

| 能力 | 公开形式 | 说明 |
|---|---|---|
| 宿主平台事实 | `deps.surface` | 与 `usePlatform().host` 同一份 `HostSurface` |
| 只读命令 | `deps.commands.run({ argv, … })` | 平台中立的适配器命令口；模块不拼 shell |
| 受控写入 | `deps.seam.run({ argv, scope, … })` | 写意图走 `Seam`；目标把 `UnitSeamRequest` 从 `command` 收成 argv |
| 数据 / 浏览器 / Git | `deps.data` / `deps.libs` / `deps.git` | 已经是语义接口 |
| 文件 / 路径 | `deps.paths` / `deps.fs`（目标新增） | workspace-scoped；不让模块用 shell 做 mkdir/rm/link |
| 共用依赖安装 | `deps.libInstallHint` | 只返回不透明展示文本 `{ text, runsIn: 'host' }`；执行走宿主供给 |
| 环境 | 不直接暴露 `process.env` / PATH / HOME | 需要环境由 `commands` / `seam` / 宿主动作给 |

`deps.commands` 与 `deps.seam` 的分工写死：前者是读/适配器命令口，后者是带写意图的宿主执行；两者都用 argv。`UnitSeamRequest.command` 改成 `argv` 是**模块契约的 breaking change**，要升模块 API 版本；shell 内建/管道因此不再对模块开放，这是有意的。

### 4.3 共享依赖

第三方模块的 `dependencies` 里已有 `@dsh-workbench/shared`，但只能用：

- `@dsh-workbench/shared` 的契约类型与纯 lib；
- `@dsh-workbench/shared/host` 里平台中立的宿主工具（`defineUnitHostPlugin`、flow、long task）；
- `@dsh-workbench/core/client` 的 kit、`@dsh-workbench/core/contract` 的类型；
- `@deepseek-ai/dsh-client-ui-primitives` 的 dsh 原语。

**不共享**：`HostFacts` / `HostOps` / `HostIntegration`、`shell-text` / `shell-render` / `env-policy` / `fs-write` / `front-app` / `process`，以及 `process.platform`、`cmdNameOf`、`quoteShellArgFor`、`pathWithBinsOf`、`taskkill`、`USERPROFILE`。

这不是靠口头约定：阶段 4 要把 `packages/shared/src/host.ts` 的 barrel 拆成公开面和内部面（或把内部模块移出 package `exports`），并在 module-tools 加 `no-restricted-imports`；`hostOs` 比较、`process.env` 读取同样进 `no-restricted-syntax`。现有模块会受影响，按 breaking change 处理。

## 5. 门禁

平台判据是现有 `checks/platform-ci.mjs` 的扩展：一个 scanner、一份登记表、挂在现有 `selfcheck` 下；不是第三条链，也不是 `package.json` 里的新命令。

### 5.1 单一登记表

`packages/core/scripts/selfcheck/platform-landings.json` 是唯一登记表；它替换 `platform-ci.json` 的 `sites`，同一提交删除旧文件。三段：

```json
{
  "landings": {
    "host.facts": {
      "path": "packages/shared/src/host/platform/facts.ts",
      "platforms": ["darwin", "linux", "win32"],
      "tests": {
        "darwin": ["packages/shared/src/host/platform/__tests__/facts.darwin.test.ts"],
        "linux": ["..."],
        "win32": ["..."]
      }
    }
  },
  "ports": {
    "adapter-runtime.opencli-shim": {
      "path": "packages/adapter-runtime/src/cli/opencli-shim.ts",
      "platforms": ["win32"],
      "reason": "opencli 的 .cmd 解析属于适配器",
      "tests": { "win32": ["..."] }
    }
  },
  "allow": {
    "packages/shared/src/host/shell/shell-text.ts": {
      "reason": "阶段 2 搬进 platform/ops",
      "owner": "platform"
    }
  },
  "exempt": {
    "packages/shared/src/contract/protocol/platform.ts": "HostOs 类型声明，不是运行时判断"
  }
}
```

- `landings` 是 L2 纯落点；`ports` 是专用 L3 模块；`allow` 是迁移期基线，只减不增。
- 不再登记 24 个调用点。`allow` 由现有树的扫描结果生成，不是手写清单；它只允许文件级临时放行，新代码不能进。
- `ports` 只允许**专用模块**；`browser-wake.ts` 这种混合文件不能登记为端口，必须先拆。
- `tests` 按 OS 分文件；gate 证明“这个测试在该 OS 的 leg 上跑过”，不假装证明每行分支覆盖。
- `exempt` 是永久例外，只允许类型声明、协议校验、mock、lint 规则字符串；每条写理由，不参与 OS × 测试覆盖。

### 5.2 扫描

- 复用现有 TypeScript AST scanner；不用纯正则。
- 排除位置：类型位置、`contract/`、`__tests__/`、`fixtures/`、`-mock`、检查实现本身、dev/CI tooling。
- 永久例外：协议类型/校验、mock 数据、lint 规则字符串、启动器文件；每个都写理由。
- 命中后只允许在 `landings`、`ports`、`allow`、`exempt`、客户端落点、启动器例外。
- 负例用内存字符串或临时树，不往 `src/` 写文件（避免和 `check:standalone` 的 `src/` 改名相撞）。
- 现有 `checks/platform.mjs` 的硬编码 `ADAPTERS` 列表由本登记表的 `landings` + `ports` + `allow` + `exempt` 取代，不再维护第二份 allowlist。

### 5.3 CI 覆盖

- `platform-tests.mjs` 从登记表生成 OS × 测试；没有登记测试的落点 × OS 直接红。
- workflow job 真实性由现有 YAML 解析检查；job 被删、matrix 少了 OS、测试文件不存在都红。
- 平台判据证明“每个声明支持的 OS 有测试且实际跑过”，不是“每行平台分支都被覆盖”；分支覆盖由落点自己的单测负责。
- Windows full 是**独立测试腿**（只跑 coverage + 静态，不是整条 gate 链），去掉 advisory 不改变这一点；它仍受“不在 Windows 跑整条 gate”的约束。

## 6. 迁移

| 阶段 | 目标 | 验收 |
|---|---|---|
| 0 | 扩展现有 `platform-ci` 成登记表 + scanner | 用现有树生成 `allow`；业务新增平台分支会红；不移动文件 |
| 1 | `facts.ts` 收口 `HostOs` 派生 | `shellKindOf` / `hostOsOf` / `currentHostOs` 的默认读法集中；行为不变 |
| 2 | `ops.shell` / `ops.env` / `ops.fs` 收口 | `cmdNameOf`、`pathWithBinsOf`、`quoteShellArgFor` 只在门面里；删重复实现，缩 `allow` |
| 3 | integration 三个消费者 | front-app → browser-wake → probe-units，各一个提交；L3 端口缩小 |
| 4 | 模块公开面 | kit/deps 增加 `fileManager` / `primaryModifier`；`UnitSeam` 收 argv；拆 shared barrel |
| 5 | Windows 测试腿 | 修平台假设测试；连续两次绿后移除 advisory（不是整条 Windows gate） |
| 6 | 收口 | `allow` 只剩命名异常；登记表只有命名落点与命名端口；整条 `pnpm run check` 绿 |

每个阶段一个可验收的小目标，一个提交。`allow` 只减不增；新平台分支必须先登记落点或端口，否则红。

## 7. 非目标

- 不重写 `ctx.shell`，不替换 dsh 的 shell/sandbox provider。
- 不把 adapter 的平台实现全部搬进 L2；L3 专用端口是合法的固定落点。
- 不让业务代码按 OS 字面量分支；模块按 capabilities 分叉。
- 不引入新的全局可变 platform 对象；facts 在组合根生成，按次注入。
- 本轮不处理 WSL / `process.arch`；需要时单独开阶段。
