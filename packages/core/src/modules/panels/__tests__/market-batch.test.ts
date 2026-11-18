import { describe, expect, it } from 'vitest';
import { mergeInstallCommands } from '../model/market-batch';

const LIB_A = "pnpm add --dir '/w/libs' 'a@1.0.0' --registry 'https://r.example/' --store-dir '/w/store' --allow-build='a'";
const LIB_B = "pnpm add --dir '/w/libs' 'b@2.0.0' --registry 'https://r.example/' --store-dir '/w/store' --allow-build='b'";

const LINK = " && mkdir -p '/w/plugins/@scope' && rm -rf '/w/plugins/@scope/peer' && ln -s '/w/toolchain/peer' '/w/plugins/@scope/peer'";

const EXT_A = `pnpm add --dir '/w/plugins' 'a@1.0.0' --registry 'https://r.example/' --store-dir '/w/store' --allow-build='a'${LINK}`;
const EXT_B = `pnpm add --dir '/w/plugins' 'b@2.0.0' --registry 'https://r.example/' --store-dir '/w/store' --allow-build='b'${LINK}`;

describe('mergeInstallCommands：同壳的几条 pnpm add 合成一条', () => {
  it('★ 共用依赖：同一个前缀、源、store，只差包和 allow-build', () => {
    expect(mergeInstallCommands([LIB_A, LIB_B])).toBe(
      "pnpm add --dir '/w/libs' 'a@1.0.0' 'b@2.0.0' --registry 'https://r.example/' --store-dir '/w/store' --allow-build='a' --allow-build='b'",
    );
  });

  it('★ 插件：合并包，链接那一段只留一次', () => {
    expect(mergeInstallCommands([EXT_A, EXT_B])).toBe(
      `pnpm add --dir '/w/plugins' 'a@1.0.0' 'b@2.0.0' --registry 'https://r.example/' --store-dir '/w/store' --allow-build='a' --allow-build='b'${LINK}`,
    );
  });

  it('★ 源 / 前缀 / pnpm 命令有任何一处不一样 → 不合并，交回串行', () => {
    expect(
      mergeInstallCommands([LIB_A, LIB_B.replace("--registry 'https://r.example/'", "--registry 'https://other.example/'")]),
    ).toBeUndefined();
    expect(mergeInstallCommands([LIB_A, LIB_B.replace("--dir '/w/libs'", "--dir '/w/other'")])).toBeUndefined();
    expect(mergeInstallCommands([LIB_A, LIB_B.replace('pnpm add', 'corepack pnpm add')])).toBeUndefined();
  });

  it('★ 不是 pnpm add（没有 --allow-build / 没有 --dir）→ 不合并', () => {
    expect(mergeInstallCommands([LIB_A, "'opencli' plugin update 'b'"])).toBeUndefined();
    expect(mergeInstallCommands([LIB_A, "pnpm add --dir '/w/libs' 'b@2.0.0' --registry 'https://r.example/'"])).toBeUndefined();
  });

  it('只有一条 / 空列表 → 不合并', () => {
    expect(mergeInstallCommands([LIB_A])).toBeUndefined();
    expect(mergeInstallCommands([])).toBeUndefined();
  });
});
