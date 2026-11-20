# __NAME__ · agent 工作说明

工作台模块（模块标识 `__UNIT__`）。面向用户的说明在 `README.md`（文案源 `readme.json`）；实现、数据源与设计底稿在 `DEVELOPING.md`；本文只说明工具链的用法。

## 工作循环

修改 `src/**` 后，依次执行：

1. `pnpm build`：生成 `dist/host.js` 与带加载器包装的 `client.js`。
2. `pnpm check`：运行十四条检查项（判据），读取上一步生成的产物。单独运行某个判据时使用 `pnpm check --only <判据名>`；全部通过才算完成。如何解读失败、常见失败原因见 `@dsh-workbench/core/skills/workbench-module-diy/REVIEW.md`。
3. `pnpm test`：运行 `src/**/__tests__/` 下与被测代码同目录的 `*.test.ts`；新增逻辑需要补充测试用例，全部通过才算完成。
4. `pnpm run check:duplication`：使用 jscpd 扫描 `src` 与 `scripts`；存在重复代码就消除。完整报告使用 `pnpm run duplication:report`，输出到 `coverage/duplication/`。该命令不在 `pnpm check` 流程中，不要遗漏。

`pnpm selfcheck` 依次执行 build、`design check` 与 smoke；`design.json` 与 `readme.json` 中的占位内容填写完成后才会通过。

## 工具链约定

- 清单是工具名的唯一来源：`dsh-wb-module sync` 生成 `src/declared-tools.ts`，代码引用 `DECLARED_TOOLS`。
- 判据读取构建产物：修改 `src/**` 后先运行 build，再运行 check。
- 发布使用 `dsh-wb-module release`；出口可用 `--target team|public|tarball|git` 指定，省略时按 `publishConfig.registry` 与模块来源决定。`--dry-run` 只预览，`--verify` 只核对已发布的包。发布前需要完成 `design.json` 的验收清单（`dsh-wb-module design accept`）。

## 先读

- `readme.json`：面向用户的文案源（标题、简介、会看到什么、能做什么、agent 能做什么、数据从哪来、排障、常见问题）。
- `README.md`：由 `readme.json` 生成，不要手动修改。
- `DEVELOPING.md`：实现、路由、判据、数据源与三张表。
- `@dsh-workbench/core/skills/workbench-module-diy/`：路由、工具、模块与文案的写法与约定（随工作台发布）。
