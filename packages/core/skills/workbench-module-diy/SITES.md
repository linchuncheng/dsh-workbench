# 站点表：先探站点，再探接口

同一个站点的事实只写一遍，放在清单 `dsh.workbench.host.sites`（短名 → 站点）。配方与计划只写
`site: '<短名>'`，不再复制 origin / 登录页 / 过期信号。`design.json` 不写站点表。

## 探什么

按这张清单探，探完一项填一格：

| 项 | 填进 | 探完的判据 |
|---|---|---|
| origin | `sites.<短名>.origin` | 能解析出 http(s) 站点根（不带 path / query / hash） |
| 登录页 | `sites.<短名>.loginUrl` | 未登录时用户被带到哪个绝对地址 |
| 过期信号 | `sites.<短名>.authLoss` | 哪个字段取什么值算没登录（`equals` / `in` 二选一，可带 `messagePath`） |
| 独立会话 | `sites.<短名>.session` | 读写要不要跟「看屏」分开的浏览器会话；不要就不写 |
| 超时 | `sites.<短名>.timeoutMs` | 这个站正常一次读多久；1000–120000 |
| 信封 | `sites.<短名>.envelope.dataPath` | 业务数据在返回的哪一格（如 `data`）；没有信封就不写。`codePath` / `messagePath` 只登记业务码与文案位置，给作者与巡检看，不参与路径展开 |
| 分页 | `sites.<短名>.pagination` | 页码 / 页大小参数名与总数位置；只读一页就不写 |

凭据来源不进站点表：它仍在每条配方的 `auth` 里（同源 cookie、meta、endpoint 等）。

## 放行条件

站点表填不出 `origin` + 过期信号之前，不进入接口探测。只有一条读、且不要登录的简单模块可以跳过
整个站点表（照旧写内联 `origin`）。

站点表写完后、写功能前运行一次 `dsh-wb-module check --only contracts`；判定失败就回到站点探测，不要带着
「未声明站点」继续写配方。

探测中需要用户登录时，用干预卡（`intervention`）说清「登录哪个站」；用户配合后继续，不自己猜登录页。

## 生成物

`dsh-wb-module sync` 把清单站点表生成到 `src/sites.ts`（带类型常量，供手写计划引用），并把
`src/datasource.ts` 里相对信封的 `response.path` 展开成绝对路径。要绕过信封取根，配方写
`"envelope": false`。

手写读取计划用 `expandPlanPathsOf(plan, SITES.<短名>)` 做同样的展开——运行时仍然不认识信封。

## 没有站点表时

旧模块与「只有一条读、不要登录」的简单模块可以继续写内联 `origin`：

```json
{ "key": "balance", "recipe": { "origin": "https://x.example.com", "request": { "method": "GET", "path": "/api/balance" }, "response": { "kind": "json", "path": "data" } } }
```

清单里没有 `host.sites` 时：`sync` 不生成 `src/sites.ts`，生成物与旧写法一致；判据不检查站点引用。
一旦模块声明了站点表，新配方应写 `site`，不要再复制 origin。
