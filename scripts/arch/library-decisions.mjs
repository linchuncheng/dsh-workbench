function decision(capability, candidates, kind, reason) {
  return { capability, candidates, decision: kind, reason };
}

export const LIBRARY_DECISIONS = [
  decision('yaml-config', ['yaml@2.9.1'], 'adopt', '块列表、行内数组、注释、CRLF 与自定义标签都要读；手写只覆盖子集，写回还会生成非法 YAML'),
  decision('pnpm-workspace-glob', ['tinyglobby@0.2.17'], 'adopt', '要支持 *、**、{} 与 ! 排除；手写递归不认花括号，两套实现各支持一部分'),
  decision('pnpm-lock-parse', ['yaml@2.9.1'], 'adopt', 'lock 是 YAML，按字符窗口猜块在格式变化时静默返回空；只读 packages 节点更稳'),
  decision('css-rules', ['postcss@8.5.31'], 'adopt', '按行与正则切 CSS 会在嵌套、注释与块标量上误判；AST 能给出规则、声明与行号'),
  decision('markdown-anchor', ['markdown-it@14.3.3', 'github-slugger@2.0.0'], 'adopt', '标题锚点要按 GitHub 规则处理重复标题与行内标记；手写 slug 与 Markdown 规则会漂'),
  decision('browser-download', ['@puppeteer/browsers@3.2.7'], 'adopt', 'Chrome for Testing 的版本解析、下载、解压与重试都由库负责；手写还要维护平台映射'),
  decision('validation', ['zod@4.6.6'], 'defer', '两个校验器的价值在领域规则与逐条中文问题；zod 默认英文消息，迁移等于把规则抄两遍，还给 host bundle 加约 758 KB'),
  decision('e2e-driver', ['playwright'], 'defer', 'smoke 的核心是 Chrome 专用 Runtime.evaluate、选择器与焦点逻辑；Playwright 只替连接层，替不掉这些'),
];
