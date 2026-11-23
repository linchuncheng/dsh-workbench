# 依赖
node_modules/

# 构建产物：`dsh-wb-module build` 生成 dist/ 与 client.js；发布时 release 用 `git add -f` 单独添加要发布的文件
dist/
client.js

# 重复代码报告与本地生成的安装包
coverage/
*.tgz

# 缓存与日志
.npm-cache*/
*.log

# macOS
.DS_Store
