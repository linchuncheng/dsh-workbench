import { readFileSync } from 'node:fs';

const FIXTURE = JSON.parse(readFileSync(new URL('../desktop-smoke/fixture.json', import.meta.url), 'utf8'));
const json = process.argv.includes('--json');
const heartbeat = process.argv.includes('--heartbeat');

async function headDesktop(url) {
  const response = await fetch(url, { method: 'HEAD', redirect: 'follow' });
  if (!response.ok) throw new Error(`${url} -> ${response.status}`);
  const disposition = response.headers.get('content-disposition') ?? '';
  const version = /filename="deepseek-harness-([^"]+?)-(?:mac|win)-/u.exec(disposition)?.[1];
  return {
    url,
    etag: (response.headers.get('etag') ?? '').replace(/^"|"$/gu, ''),
    version: version ?? '',
  };
}

const cftMeta = await fetch(
  'https://googlechromelabs.github.io/chrome-for-testing/last-known-good-versions-with-downloads.json',
).then((response) => response.json());
const opencliLatest = await fetch('https://github.com/jackwener/opencli/releases/latest', { redirect: 'follow' });
const opencliTag = opencliLatest.url.split('/').pop() ?? '';
const opencliAssets = await fetch(`https://github.com/jackwener/opencli/releases/expanded_assets/${opencliTag}`).then(
  (response) => response.text(),
);
const opencliAsset = /opencli-extension-v[0-9.]+\.zip/u.exec(opencliAssets)?.[0] ?? '';

const desktopMac = await headDesktop(FIXTURE.desktop.macosArm64.url);
const desktopWin = await headDesktop(FIXTURE.desktop.windowsX64.url);
const desktopChanged =
  desktopMac.etag !== FIXTURE.desktop.macosArm64.etag || desktopWin.etag !== FIXTURE.desktop.windowsX64.etag;
const browserChanged =
  cftMeta.channels.Stable.version !== FIXTURE.chromeForTesting.version ||
  opencliTag !== FIXTURE.opencliExtension.tag ||
  opencliAsset !== FIXTURE.opencliExtension.asset;
const changes = [];

if (desktopMac.etag !== FIXTURE.desktop.macosArm64.etag) changes.push(`desktop macos: ${desktopMac.etag}`);
if (desktopWin.etag !== FIXTURE.desktop.windowsX64.etag) changes.push(`desktop windows: ${desktopWin.etag}`);
if (cftMeta.channels.Stable.version !== FIXTURE.chromeForTesting.version) {
  changes.push(`chrome: ${cftMeta.channels.Stable.version}`);
}
if (opencliTag !== FIXTURE.opencliExtension.tag) changes.push(`opencli tag: ${opencliTag}`);
if (opencliAsset !== FIXTURE.opencliExtension.asset) changes.push(`opencli asset: ${opencliAsset}`);

const result = {
  changed: desktopChanged || browserChanged,
  desktopChanged,
  browserChanged,
  heartbeat,
  changes,
  desktop: {
    pinnedVersion: FIXTURE.desktop.version,
    latestVersion: desktopMac.version || desktopWin.version,
    macos: { pinnedEtag: FIXTURE.desktop.macosArm64.etag, latestEtag: desktopMac.etag, url: desktopMac.url },
    windows: { pinnedEtag: FIXTURE.desktop.windowsX64.etag, latestEtag: desktopWin.etag, url: desktopWin.url },
  },
  chrome: { pinnedVersion: FIXTURE.chromeForTesting.version, latestVersion: cftMeta.channels.Stable.version },
  opencli: {
    pinnedTag: FIXTURE.opencliExtension.tag,
    latestTag: opencliTag,
    pinnedAsset: FIXTURE.opencliExtension.asset,
    latestAsset: opencliAsset,
  },
};

if (json) {
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
} else {
  process.stdout.write(
    [
      `changed: ${String(result.changed)}`,
      `desktop: ${result.desktop.pinnedVersion} -> ${result.desktop.latestVersion} (${desktopMac.etag} / ${desktopWin.etag})`,
      `chrome: ${result.chrome.pinnedVersion} -> ${result.chrome.latestVersion}`,
      `opencli: ${result.opencli.pinnedTag} -> ${result.opencli.latestTag} (${result.opencli.latestAsset})`,
      ...changes.map((one) => `  - ${one}`),
    ].join('\n'),
  );
  process.stdout.write('\n');
}
