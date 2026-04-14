// Translate English text to Marathi for `*Mr` fields.
//
// Note: automatic EN->MR conversion requires an external translation service.
// If translation fails, we fall back to the provided Marathi value (or EN).
//
// Env (optional):
// - LIBRETRANSLATE_URL: LibreTranslate endpoint (default: https://libretranslate.de/translate)
// - LIBRETRANSLATE_TIMEOUT_MS: request timeout (default: 10000)

const cache = new Map();

const containsDevanagari = (s) => /[\u0900-\u097F]/u.test(String(s || ""));

const normalize = (s) => {
  if (s === undefined || s === null) return "";
  return String(s).trim();
};

/** MyMemory often returns quota / legal blurbs instead of a real translation for short text. */
const looksLikeMyMemoryJunkMrToEn = (sourceMr, translated) => {
  const t = String(translated || "");
  if (!t) return true;
  if (/MYMEMORY|QUERY\s*LENGTH|QUOTA|LIMIT\s*FOR\s*MYMEMORY|AVAILABLE\s+FREE/i.test(t)) {
    return true;
  }
  if (/alphabet.*upper.*lower|upper\/\s*lower\s*case\s*pairs/i.test(t)) {
    return true;
  }
  const s = String(sourceMr || "");
  if (s.length > 0 && s.length <= 8 && t.length > s.length * 6) {
    return true;
  }
  return false;
};

/** MyMemory often returns quota / legal blurbs instead of a real translation for short text. */
const looksLikeMyMemoryJunk = (en, translated) => {
  const t = String(translated || "");
  const e = String(en || "");
  if (!t) return true;
  if (/MYMEMORY|QUERY\s*LENGTH|QUOTA|LIMIT\s*FOR\s*MYMEMORY|AVAILABLE\s+FREE/i.test(t)) {
    return true;
  }
  if (/alphabet.*upper.*lower|upper\/\s*lower\s*case\s*pairs/i.test(t)) {
    return true;
  }
  // Expected MR should usually contain Devanagari; if not, keep English instead of storing garbage.
  if (!containsDevanagari(t) && !containsDevanagari(e)) {
    return true;
  }
  // Disclaimer-style responses are much longer than normal for tiny names (e.g. "AA").
  if (e.length > 0 && e.length <= 8 && t.length > e.length * 6) {
    return true;
  }
  return false;
};

const translateEnToMr = async (enText) => {
  const text = normalize(enText);
  if (!text) return "";
  if (containsDevanagari(text)) return text; // already looks Marathi

  const cacheKey = `en->mr:${text}`;
  if (cache.has(cacheKey)) return cache.get(cacheKey);

  // Primary: MyMemory (returns JSON, no API key required).
  // Endpoint docs: https://mymemory.translated.net/doc/spec.php
  const timeoutMs = Number(process.env.LIBRETRANSLATE_TIMEOUT_MS || 10000);

  if (typeof fetch !== "function") throw new Error("Global fetch is not available");

  const controller = new AbortController();
  const t = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const myMemoryUrl = `https://api.mymemory.translated.net/get?q=${encodeURIComponent(
      text
    )}&langpair=en|mr`;

    const resp = await fetch(myMemoryUrl, { signal: controller.signal });
    if (!resp.ok) throw new Error(`MyMemory HTTP ${resp.status}`);

    const data = await resp.json();
    if (data?.quotaFinished) throw new Error("MyMemory quota finished");

    const status = Number(data?.responseStatus);
    if (Number.isFinite(status) && status !== 200) {
      throw new Error(`MyMemory responseStatus ${status}`);
    }

    const translated = normalize(data?.responseData?.translatedText || "");
    if (looksLikeMyMemoryJunk(text, translated)) {
      cache.set(cacheKey, text);
      return text;
    }

    cache.set(cacheKey, translated);
    return translated;
  } finally {
    clearTimeout(t);
  }
};

const translateMrToEn = async (mrText) => {
  const text = normalize(mrText);
  if (!text) return "";
  if (!containsDevanagari(text)) return text;

  const cacheKey = `mr->en:${text}`;
  if (cache.has(cacheKey)) return cache.get(cacheKey);

  const timeoutMs = Number(process.env.LIBRETRANSLATE_TIMEOUT_MS || 10000);

  if (typeof fetch !== "function") throw new Error("Global fetch is not available");

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const myMemoryUrl = `https://api.mymemory.translated.net/get?q=${encodeURIComponent(
      text
    )}&langpair=mr|en`;

    const resp = await fetch(myMemoryUrl, { signal: controller.signal });
    if (!resp.ok) throw new Error(`MyMemory HTTP ${resp.status}`);

    const data = await resp.json();
    if (data?.quotaFinished) throw new Error("MyMemory quota finished");

    const status = Number(data?.responseStatus);
    if (Number.isFinite(status) && status !== 200) {
      throw new Error(`MyMemory responseStatus ${status}`);
    }

    const translated = normalize(data?.responseData?.translatedText || "");
    if (looksLikeMyMemoryJunkMrToEn(text, translated)) {
      cache.set(cacheKey, text);
      return text;
    }

    cache.set(cacheKey, translated);
    return translated || text;
  } catch (e) {
    cache.set(cacheKey, text);
    return text;
  } finally {
    clearTimeout(timer);
  }
};

/**
 * Decide whether to translate and return Marathi.
 * - If `mrText` is missing/empty => translate `enText`.
 * - If `mrText` equals `enText` => translate `enText` (admin sent EN copied to MR).
 * - If `mrText` is different from `enText` => keep `mrText`.
 * - If `enText` already contains Devanagari => keep as-is.
 */
const translateToMarathiIfNeeded = async ({ enText, mrText }) => {
  const en = normalize(enText);
  const mr = normalize(mrText);

  if (!en) return "";
  if (containsDevanagari(en)) return mr || en; // already Marathi-like input

  const mrLooksSameAsEn =
    mr &&
    mr.toLowerCase() === en.toLowerCase();

  const shouldTranslate = !mr || mrLooksSameAsEn;
  if (!shouldTranslate) return mr;

  try {
    return await translateEnToMr(en);
  } catch (e) {
    // Fallback: keep the original mr (if any), else keep en.
    return mr || en;
  }
};

/**
 * Pair one admin-facing string into stored English + Marathi (menus, polls, etc.).
 * - Latin primary → en = primary, mr = translation / mrOverride.
 * - Devanagari primary → mr = primary; en = Latin override if provided, else MR→EN.
 */
const resolveEnglishMarathiPair = async (primaryText, mrOverride) => {
  const t = normalize(primaryText);
  const mrBody = normalize(mrOverride);
  if (!t) return { en: "", mr: "" };
  if (containsDevanagari(t)) {
    const mr = t;
    let en = "";
    if (mrBody && !containsDevanagari(mrBody)) {
      en = mrBody;
    } else {
      en = await translateMrToEn(t);
    }
    en = normalize(en);
    if (!en) en = t;
    return { en, mr };
  }
  const mr = await translateToMarathiIfNeeded({ enText: t, mrText: mrBody });
  return { en: t, mr: mr || t };
};

/**
 * Member name / room owner: primary field may be EN or MR; optional second field is the other script.
 * Stale-MR detection when EN primary changes but optional Marathi still matches previous DB value.
 */
const resolveMemberPrimaryFields = async (primary, secondaryMr, prevEn, prevMr) => {
  const p = normalize(primary);
  const s = normalize(secondaryMr);
  const prevE = normalize(prevEn);
  const prevM = normalize(prevMr);

  if (!p) return { en: prevE, mr: prevM };

  if (containsDevanagari(p)) {
    const mr = p;
    let en = "";
    if (s && !containsDevanagari(s)) {
      en = s;
    } else {
      en = await translateMrToEn(p);
    }
    en = normalize(en);
    if (!en) en = p;
    return { en, mr };
  }

  const en = p;
  const enChanged = en !== prevE;
  const mrStale = enChanged && s === prevM && prevM.length > 0;
  const effectiveMr = mrStale ? "" : s;
  let mr = await translateToMarathiIfNeeded({ enText: en, mrText: effectiveMr });
  mr = normalize(mr);
  if (!mr) mr = normalize(effectiveMr) || en;
  return { en, mr };
};

module.exports = {
  translateEnToMr,
  translateMrToEn,
  translateToMarathiIfNeeded,
  resolveEnglishMarathiPair,
  resolveMemberPrimaryFields,
};

