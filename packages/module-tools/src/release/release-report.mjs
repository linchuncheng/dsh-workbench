function httpsUrlOf(url) {
  const text = String(url).trim();
  if (!text.startsWith('git@')) return text;
  const rest = text.slice(4);
  const at = rest.indexOf(':');
  if (at === -1) return text;
  return `https://${rest.slice(0, at)}/${rest.slice(at + 1)}`;
}

function shortSha(value) {
  return typeof value === 'string' && value.length >= 7 ? value.slice(0, 7) : String(value ?? '');
}

export function gitInstallSpecOf(info, version) {
  const base = `git+${httpsUrlOf(info.url)}#${info.tagOf(version)}`;
  return info.packagePath === '.' ? base : `${base}&path:/${info.packagePath}`;
}

export function marketInstallOf(url, commit, path) {
  const base = `git+${httpsUrlOf(url)}#${commit}`;
  const suffix = String(path ?? '').replace(/^\/+/, '');
  return suffix === '' || suffix === '.' ? base : `${base}&path:/${suffix}`;
}

export function installOf(info, name, version) {
  if (info.kind === 'tarball') return `dsh plugin --profile workbench add ${info.fileOf(version)}`;
  if (info.kind === 'git') return `dsh plugin --profile workbench add ${gitInstallSpecOf(info, version)}`;
  return `dsh plugin --profile workbench add ${name}@${version}`;
}

export function stateOf(info, manifest, version, status) {
  const base = {
    target: info.target,
    name: manifest.name,
    version,
    status,
    at: new Date().toISOString(),
  };
  if (info.kind === 'registry') base.registry = info.registry;
  if (info.kind === 'tarball') base.file = info.fileOf(version);
  if (info.kind === 'git') {
    base.remote = info.url;
    base.tag = info.tagOf(version);
  }
  return base;
}

export function emit(out, json, value) {
  if (json) out(JSON.stringify(value));
  else human(out, value);
}

export function human(out, summary) {
  if (summary.preflight === true) {
    out(`✔ 发布前检查通过：${summary.name}@${summary.version} → ${summary.target}（未写入任何内容）`);
    return;
  }
  if (summary.target === 'local') {
    out('未发布，保留在本机。');
    return;
  }
  if (summary.dryRun === true) {
    out(`○ 仅预览（dry-run）：${summary.name}@${summary.version} → ${summary.target}`);
    if (summary.changes.length > 0) out(`  将修改：${summary.changes.join('；')}`);
    if (summary.files !== undefined) out(`  包内容：${summary.files.join(' · ')}`);
    if (summary.market?.planned === true) out(`  将更新市场索引：${summary.market.url} → ${summary.market.entry}`);
    if (summary.install !== '') out(`  安装：${summary.install}`);
    out('  未写入任何内容');
    return;
  }
  if (summary.target === 'market') {
    const market = summary.market ?? {};
    out(
      `✔ 已发布 ${summary.name}@${summary.version} → ${market.url}` +
        `（${market.branch === undefined ? '默认分支' : market.branch}）`,
    );
    out(`  产物：${String(market.path ?? '').replace(/^\/*/, '')} · commit ${shortSha(market.commit)}`);
    out('  提交：产物与索引条目两个 commit 均已推送');
    if (summary.changes.length > 0) out(`  已修改：${summary.changes.join('；')}`);
    if (summary.files !== undefined) out(`  包内容：${summary.files.join(' · ')}`);
    out(`  安装：${summary.install}`);
    out('  已从仓库侧核对产物');
    return;
  }
  const where =
    summary.target === 'tarball'
      ? summary.file
      : summary.target === 'git'
        ? `${summary.git.url}（tag ${summary.git.tag}）`
        : summary.registry;
  out(`✔ 已发布 ${summary.name}@${summary.version} → ${where}`);
  if (summary.changes.length > 0) out(`  已修改：${summary.changes.join('；')}`);
  if (summary.files !== undefined) out(`  包内容：${summary.files.join(' · ')}`);
  if (summary.market !== undefined) {
    out(
      summary.market.updated === true
        ? `  市场索引：${summary.market.url}${summary.market.branch === undefined ? '' : `（${summary.market.branch}）`} · ${summary.market.entry}`
        : `  市场索引未更新：${summary.market.reason ?? '（未说明）'}`,
    );
  }
  out(`  安装：${summary.install}`);
  out('  已从发布出口核对包内容');
}
