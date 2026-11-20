import { existsSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { NeedsUser, ReleaseError, publishTagOf, tailOf } from './release-util.mjs';
import { npmrcArgs } from './release-target.mjs';

const REQUIRED_FILES = ['dist/host.js', 'client.js', 'package.json', 'CHANGELOG.md'];

function parseJson(text) {
  const raw = String(text ?? '');
  const start = raw.search(/[[{]/);
  if (start === -1) return undefined;
  try {
    return JSON.parse(raw.slice(start));
  } catch {
    return undefined;
  }
}

function quote(value) {
  const text = String(value);
  return /[\s"'$`\\]/.test(text) ? `'${text.replace(/'/g, `'\\''`)}'` : text;
}

export function localFiles(exec, root) {
  const result = exec(
    'npm',
    ['pack', '--dry-run', '--json', '--ignore-scripts', '--cache', join(tmpdir(), 'dsh-wb-npm-cache')],
    { cwd: root, capture: true, allowFailure: true },
  );
  if (result.status !== 0) throw new ReleaseError(`无法核对本地包内容：${tailOf(`${result.stdout}\n${result.stderr}`)}`);
  const parsed = parseJson(result.stdout);
  const first = Array.isArray(parsed) ? parsed[0] : parsed;
  const files = Array.isArray(first?.files) ? first.files.map((one) => String(one.path ?? one)) : [];
  if (files.length === 0) throw new ReleaseError('npm pack 未列出包内容');
  return files;
}

export function checkPublished(files) {
  const missing = REQUIRED_FILES.filter((one) => !files.includes(one));
  if (missing.length > 0) throw new ReleaseError(`包中缺少 ${missing.join(' / ')} ；安装后无法启动`);
  const leaked = files.filter(
    (one) => one.startsWith('src/') || one.endsWith('.npmrc') || one.startsWith('template') || one.includes('.env'),
  );
  if (leaked.length > 0) throw new ReleaseError(`包中包含了不应发布的文件：${leaked.slice(0, 3).join('、')}`);
}

export function checkGitFiles(files) {
  const missing = REQUIRED_FILES.filter((one) => !files.includes(one));
  if (missing.length > 0) throw new ReleaseError(`tag 中缺少 ${missing.join(' / ')} ；安装后无法启动`);
  const leaked = files.filter((one) => one.endsWith('.npmrc') || one.includes('.env'));
  if (leaked.length > 0) throw new ReleaseError(`tag 中包含了凭据文件：${leaked.slice(0, 3).join('、')}`);
}

export function registryExists(exec, info, name, version) {
  const argv = ['view', `${name}@${version}`, 'version', '--json', '--registry', info.registry, ...npmrcArgs(info.npmrc)];
  const result = exec('npm', argv, { capture: true, allowFailure: true });
  if (result.status === 0) return true;
  const text = `${result.stdout}\n${result.stderr}`;
  if (/E404|404|No matching version|not found|不存在/i.test(text)) return false;
  throw new ReleaseError(`查询团队源失败（${info.registry}）：${tailOf(text)}`);
}

function publishArgsOf(info, version) {
  const tag = publishTagOf(version);
  return [
    'publish',
    '--registry',
    info.registry,
    '--access',
    info.access,
    '--ignore-scripts',
    ...(tag === undefined ? [] : ['--tag', tag]),
    ...npmrcArgs(info.npmrc),
  ];
}

function otpCommandOf(root, info, version) {
  const tag = publishTagOf(version);
  return [
    `cd ${quote(root)}`,
    '&&',
    'npm',
    'publish',
    '--registry',
    info.registry,
    '--access',
    info.access,
    '--ignore-scripts',
    ...(tag === undefined ? [] : ['--tag', tag]),
    ...npmrcArgs(info.npmrc),
  ].join(' ');
}

export function publishRegistry(exec, root, info, manifest, version) {
  const result = exec('npm', publishArgsOf(info, version), { cwd: root, capture: true, allowFailure: true });
  if (result.status === 0) return;
  const text = `${result.stdout}\n${result.stderr}`;
  if (/EOTP|one-time password|OTP/i.test(text)) {
    throw new NeedsUser(
      'otp',
      '源要求一次性验证码。构建和门禁均已通过，请在终端运行下面这条命令并按提示输入验证码；完成后告知，随后将进行核对。',
      otpCommandOf(root, info, version),
      { target: info.target, name: manifest.name, version, registry: info.registry },
    );
  }
  if (info.target === 'public' && /E403|403|taken|already exists|Forbidden|cannot publish over/i.test(text)) {
    throw new NeedsUser('name', '该名称在 npm 上已被占用。请更换为：`@<user>/<name>`，或添加一个后缀。', undefined, {
      target: info.target,
      name: manifest.name,
      version,
    });
  }
  if (/E403|403|already exists|Forbidden/i.test(text)) {
    throw new NeedsUser('scope', '团队源不允许发布该包名（可能已被占用，或没有权限）。请让管理员确认 scope / 权限后告知。', undefined, {
      target: info.target,
      name: manifest.name,
      version,
    });
  }
  if (/E402|402|E404|404|scope|payment|not found/i.test(text)) {
    throw new NeedsUser('scope', '团队源要求包名带 scope。是否改用 `@<scope>/<name>`？', undefined, {
      target: info.target,
      name: manifest.name,
      version,
    });
  }
  throw new ReleaseError(`npm publish 失败：${tailOf(text)}`);
}

export function verifyRegistry(exec, info, name, version) {
  const view = exec(
    'npm',
    ['view', `${name}@${version}`, 'version', 'dist.tarball', '--json', '--registry', info.registry, ...npmrcArgs(info.npmrc)],
    { capture: true, allowFailure: true },
  );
  if (view.status !== 0) {
    throw new ReleaseError(`已发布，但在源上查不到 ${name}@${version} —— 请到 registry 确认`);
  }
  const packed = exec(
    'npm',
    ['pack', `${name}@${version}`, '--dry-run', '--json', '--ignore-scripts', '--registry', info.registry, ...npmrcArgs(info.npmrc)],
    { capture: true, allowFailure: true },
  );
  if (packed.status !== 0) throw new ReleaseError(`已发布，但无法核对包：${tailOf(`${packed.stdout}\n${packed.stderr}`)}`);
  const parsed = parseJson(packed.stdout);
  const first = Array.isArray(parsed) ? parsed[0] : parsed;
  const files = Array.isArray(first?.files) ? first.files.map((one) => String(one.path ?? one)) : [];
  if (files.length === 0) throw new ReleaseError('已发布，但 npm pack 未列出包内容');
  checkPublished(files);
  return files;
}

export function packTarball(exec, info, version) {
  mkdirSync(info.out, { recursive: true });
  const result = exec(
    'npm',
    ['pack', '--json', '--ignore-scripts', '--pack-destination', info.out],
    { capture: true, allowFailure: true },
  );
  if (result.status !== 0) throw new ReleaseError(`npm pack 失败：${tailOf(`${result.stdout}\n${result.stderr}`)}`);
  const parsed = parseJson(result.stdout);
  const first = Array.isArray(parsed) ? parsed[0] : parsed;
  const filename = typeof first?.filename === 'string' ? first.filename : info.fileNameOf(version);
  const file = join(info.out, filename);
  if (!existsSync(file)) throw new ReleaseError(`npm pack 表示已生成 ${filename}，但文件不在 ${info.out}`);
  return file;
}
