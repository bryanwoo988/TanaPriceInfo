"use strict";
// Search aliases for FAMA / KPDN item names (names are shown in Malay, untranslated).
// Each Malay word or phrase maps to Chinese and English search terms; an item gets
// the terms of every phrase found in its name, so new items with known words work too.
// Chinese uses common Malaysian usage first (e.g. 黄梨, 包菜, 菜心), then other names.
// [Malay phrase, Chinese terms, English terms]
const NAME_ALIASES = [
  // poultry & eggs
  ["AYAM HIDUP", "活鸡", "live chicken"],
  ["AYAM PROSES", "光鸡 宰鸡 鸡肉", "processed chicken dressed chicken"],
  ["AYAM", "鸡", "chicken"],
  ["TELUR", "蛋 鸡蛋", "egg eggs"],
  // onions & garlic
  ["BAWANG BESAR", "大葱头 洋葱", "onion big onion"],
  ["BAWANG MERAH / KECIL", "小葱头 红葱头 葱头", "shallot small onion"],
  ["BAWANG MERAH ROSE", "红葱头 玫瑰葱头", "rose onion shallot"],
  ["BAWANG PUTIH", "蒜头 大蒜 蒜", "garlic"],
  ["BAWANG PERAI", "蒜苗 大蒜叶 韭葱", "leek"],
  ["DAUN BAWANG", "青葱 葱", "spring onion scallion green onion"],
  ["DAUN SUP", "芹菜 唐芹 西芹", "celery chinese celery"],
  // leafy vegetables
  ["BAYAM", "汉菜 苋菜", "amaranth spinach"],
  ["KANGKUNG", "蕹菜 空心菜", "water spinach kangkung"],
  ["SAWI PENDEK", "小白菜 白菜仔", "bok choy pak choy"],
  ["SIOW PAK CHOY", "小白菜", "bok choy pak choy"],
  ["SAWI", "菜心", "choy sum mustard greens"],
  ["KAILAN", "芥兰", "kai lan chinese kale"],
  ["KUBIS BULAT", "包菜 椰菜 高丽菜", "cabbage"],
  ["KUBIS BUNGA", "花椰菜 菜花", "cauliflower"],
  ["KUBIS PANJANG", "大白菜 黄芽白 绍菜", "chinese cabbage napa cabbage"],
  ["BROKOLI", "西兰花 绿花椰菜", "broccoli"],
  // fruit vegetables, beans, roots
  ["CILI API", "指天椒 小辣椒", "bird's eye chilli chili"],
  ["CILI PADI", "指天椒 小辣椒", "bird's eye chilli chili"],
  ["CILI HIJAU", "青辣椒 青椒", "green chilli chili"],
  ["CILI MERAH", "红辣椒", "red chilli chili"],
  ["CILI", "辣椒", "chilli chili"],
  ["LADA BENGGALA", "灯笼椒 甜椒", "capsicum bell pepper"],
  ["KACANG BENDI", "羊角豆 秋葵", "okra lady's finger ladies finger"],
  ["KACANG BUNCIS", "四季豆 法国豆", "french bean green bean"],
  ["KACANG PANJANG", "长豆 豆角", "long bean"],
  ["TERUNG", "茄子", "brinjal eggplant aubergine"],
  ["TIMUN", "黄瓜 青瓜", "cucumber"],
  ["TOMATO", "番茄 西红柿", "tomato"],
  ["UBI KENTANG", "马铃薯 薯仔 土豆", "potato"],
  ["LOBAK MERAH", "红萝卜 胡萝卜", "carrot"],
  ["LOBAK PUTIH", "白萝卜", "radish daikon white radish"],
  ["HALIA", "姜 生姜", "ginger"],
  ["KUNYIT", "黄姜 姜黄", "turmeric"],
  ["LENGKUAS", "南姜 蓝姜", "galangal"],
  // fruit
  ["PISANG", "香蕉 蕉", "banana"],
  ["BETIK", "木瓜", "papaya"],
  ["TEMBIKAI SUSU", "蜜瓜 哈密瓜", "honeydew melon"],
  ["TEMBIKAI", "西瓜", "watermelon"],
  ["ANGGUR", "葡萄", "grape grapes"],
  ["DRAGON FRUIT", "火龙果", "dragon fruit pitaya"],
  ["JAMBU BATU", "番石榴 芭乐", "guava"],
  ["LAI", "梨", "pear"],
  ["LIMAU KASTURI", "酸柑 金桔", "calamansi lime"],
  ["LIMAU NIPIS", "青柠", "lime"],
  ["NENAS", "黄梨 菠萝", "pineapple"],
  // origin / type words
  ["IMPORT", "进口", "imported"],
  ["CHINA", "中国", "china"],
  ["INDIA", "印度", "india"],
  ["THAILAND", "泰国", "thailand thai"],
  ["THAI", "泰国", "thai thailand"],
  ["INDONESIA", "印尼", "indonesia"],
  ["HOLLAND", "荷兰", "holland dutch"],
  ["BEIJING", "北京", "beijing"],
  ["TANAH TINGGI", "高原", "highland"],
  ["TANAH RENDAH", "低地", "lowland"],
  ["TEMPATAN", "本地", "local"],
  ["TANPA BIJI", "无籽", "seedless"],
  ["BERBIJI", "有籽", "seeded with seeds"],
  ["MERAH", "红", "red"],
  ["HIJAU", "绿 青", "green"],
  ["KUNING", "黄", "yellow"],
  ["PUTIH", "白", "white"],
];

// "AYAM HIDUP" -> "活鸡 鸡 | live chicken chicken" (cached per name)
const _aliasCache = new Map();
function nameAliases(name) {
  if (_aliasCache.has(name)) return _aliasCache.get(name);
  const up = ` ${name.toUpperCase().replace(/[()\-,]/g, " ")} `;
  const zh = [], en = [], used = [];
  for (const [ms, z, e] of NAME_ALIASES) {
    const key = ms.replace(/[()\-,]/g, " ");
    // A more specific phrase already matched (e.g. "TEMBIKAI SUSU"): skip the general one ("TEMBIKAI").
    if (used.some((u) => u.includes(key))) continue;
    // whole words only: "LAI" must not match inside "KULAI"
    if (new RegExp(`[ /]${key.replace(/[.*+?^${}|[\]\\]/g, "\\$&").replace(/\s+/g, "\\s+")}[ /]`).test(up)) {
      zh.push(z); en.push(e); used.push(key);
    }
  }
  const out = { zh: zh.join(" "), en: en.join(" ").toLowerCase() };
  _aliasCache.set(name, out);
  return out;
}

/** True when the query matches the Malay name (word start), or its Chinese / English terms. */
function nameMatches(name, query) {
  const q = query.trim();
  if (!q) return true;
  const esc = q.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const wordStart = new RegExp(`(^|[^A-Za-z0-9])${esc}`, "i");
  if (wordStart.test(name)) return true;
  const a = nameAliases(name);
  if (/[一-鿿]/.test(q)) return a.zh.replace(/\s+/g, "").includes(q.replace(/\s+/g, ""));
  return wordStart.test(a.en);
}
