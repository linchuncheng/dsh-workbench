import { stackArch } from '../../scripts/arch/stack.mjs';

export default stackArch({
  entry: ['index.ts'],
  modules: {
    runtime: 1,
    toolchain: 2,
    install: 3,
    'self-update': 4,
    probe: 5,
    preflight: 6,
    ports: 7,
  },
  exceptions: [
    {
      rule: 'P06',
      glob: 'src/self-update/*.ts',
      reason:
        '命中的是自更新脚本模板里那段 `node -e` 片段：`process.argv` 是那段 node 自己的入参，不是插件在解析命令行。',
    },
  ],
});
