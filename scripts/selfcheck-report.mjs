export function reportAndExit(results) {
  const failed = results.filter((one) => !one.passed);
  console.log(
    `\n${results.length - failed.length}/${results.length} 通过` +
      (failed.length ? ` —— 失败：${failed.map((one) => one.name).join('、')}` : ''),
  );
  process.exit(failed.length === 0 ? 0 : 1);
}
