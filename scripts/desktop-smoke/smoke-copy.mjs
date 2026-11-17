const DICT_DIR = new URL('../../packages/shared/dist/i18n/', import.meta.url);

async function dictionaryOf(locale) {
  try {
    const loaded = await import(new URL(`${locale}.js`, DICT_DIR).href);
    return loaded[locale] ?? {};
  } catch (error) {
    throw new Error(`桌面烟测要读 ${locale} 词典（${DICT_DIR.pathname}${locale}.js）—— 先构建 shared`, {
      cause: error,
    });
  }
}

const zh = await dictionaryOf('zh');
const en = await dictionaryOf('en');

const CLAUSE = /[，,。.;；—]/u;

const MIN_CLAUSE = 4;

function clauseOf(text) {
  const cut = text.split(CLAUSE)[0]?.trim() ?? '';
  return cut.length >= MIN_CLAUSE ? cut : text.trim();
}

function escapeRe(text) {
  return text.replace(/[.*+?^${}()|[\]\\]/gu, '\\$&');
}

export function copyOf(key) {
  const values = [zh[key], en[key]].filter((one) => typeof one === 'string' && one.trim() !== '');
  if (values.length === 0) throw new Error(`桌面烟测要的文案「${key}」在词典里没有 —— 键改名了就同步改探针`);
  return [...new Set(values)];
}

export function copyFirst(key) {
  return copyOf(key)[0];
}

export function copyClauseOf(key) {
  return [...new Set(copyOf(key).map(clauseOf))];
}

export function copyPattern(keys, flags = 'iu') {
  const parts = keys.flatMap((key) => copyClauseOf(key)).map(escapeRe);
  return new RegExp(parts.join('|'), flags);
}
