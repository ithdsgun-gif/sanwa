import React, { useState, useMemo, useRef } from "react";

/*
  サンワ工業株式会社 足場 数量・人工数 算出ツール（外部足場）
  長さ・高さ・仕様から 面積/スパン数/段数/人工/各部材数量/重量 を概算。
  ・仕様：400ブラケット / 600ブラケット / 600本足 / 900本足 / 1200本足
  ・PDF注文書の全部材を選択肢マスターとして搭載（自動算出＋手動追加）
  ・係数すべて編集可能 / 計算式を画面表示 / CSVコピー / スマホ対応
  ※正式な構造計算ではなく、見積・段取り用の概算数量です。
*/

const NAVY = "#10362a";
const ORANGE = "#ff7a1a";
const PAPER = "#f3f0e8";

// ───────── 足場仕様 ─────────
// anchWidth: 使用アンチ幅 / dual: 600本足はA/B両表示
const SPECS = [
  { key: "B400", label: "400ブラケット", railSide: "外手すりのみ", railN: 2, anchWidth: "400" },
  { key: "B600", label: "600ブラケット", railSide: "外手すりのみ", railN: 2, anchWidth: "600" },
  { key: "M600", label: "600本足", railSide: "内外手すり", railN: 4, dual: true },
  { key: "M900", label: "900本足", railSide: "内外手すり", railN: 4, anchWidth: "400", anchPerSpan: 2 },
  { key: "M1200", label: "1200本足", railSide: "内外手すり", railN: 4, anchWidth: "400+250" },
];

// 編集可能な係数の初期値
const DEFAULT_COEF = {
  spanLen: 1.8, liftHeight: 1.8,
  buildDiv: 35, dismantleDiv: 60,
  sheetHeight: 5.1,
  braceLiftGroup: 3, braceSpanGroup: 6, bracePerGroup: 6,
  stairBraceGroup: 2, stairBracePer: 6,
  wallLiftGroup: 2, wallSpanGroup: 2,
};

// 自動算出部材の重量（kg/単位）編集可能
const DEFAULT_WEIGHTS = {
  // 手すり 規格別（PDF：C-18 4.60 / C-12 3.30 / C-09 2.30 / C-06 1.70）
  C_18: 4.60, C_12: 3.30, C_09: 2.30, C_06: 1.70,
  // 400巾アミ付踏板（PDF：DW-18 13.90 / DW-12 9.80 / DW-09 7.50 / DW-06 5.40）
  DW400_18: 13.90, DW400_12: 9.80, DW400_09: 7.50, DW400_06: 5.40,
  // 500巾アミ付踏板（PDFはDW-18 18.00のみ。他はDW18基準の概算初期値）
  DW500_18: 18.00, DW500_12: 12.50, DW500_09: 9.50, DW500_06: 7.00,
  // 250巾アミ付踏板（PDF：D-18 9.50 / D-12 6.90 / D-09 5.50 / D-06 4.00）
  D250_18: 9.50, D250_12: 6.90, D250_09: 5.50, D250_06: 4.00,
  // 600アンチ（規格別の代表初期値。実材に合わせて編集）
  DW600_18: 13.90, DW600_12: 9.80, DW600_09: 7.50, DW600_06: 5.40,
  筋交K_18: 4.20,
  壁つなぎ: 1.3,
  巾木4m: 1.0,
  巾木2m: 0.5,
  シート: 3.0,
  ジャッキベース: 2.5,
  // 支柱サイズ別
  A_36: 13.40, A_27: 10.10, A_18: 7.00, A_09: 3.70, A_072: 3.30, A_045: 2.10,
};

// 重量マスター編集UIのグループ表示用
const WEIGHT_GROUPS = [
  { title: "手すり", keys: ["C_18", "C_12", "C_09", "C_06"] },
  { title: "400巾アンチ", keys: ["DW400_18", "DW400_12", "DW400_09", "DW400_06"] },
  { title: "500巾アンチ", keys: ["DW500_18", "DW500_12", "DW500_09", "DW500_06"] },
  { title: "250巾アンチ", keys: ["D250_18", "D250_12", "D250_09", "D250_06"] },
  { title: "600巾アンチ", keys: ["DW600_18", "DW600_12", "DW600_09", "DW600_06"] },
  { title: "支柱", keys: ["A_36", "A_27", "A_18", "A_09", "A_072", "A_045"] },
  { title: "その他", keys: ["筋交K_18", "壁つなぎ", "巾木4m", "巾木2m", "シート", "ジャッキベース"] },
];

const TRUCKS = [
  { key: "2t", label: "2t車", cap: 2000 },
  { key: "4t", label: "4t車", cap: 4000 },
  { key: "10t", label: "10t車", cap: 10000 },
];

// ───────── PDF注文書の全部材マスター（品名・規格・単重kg）─────────
// PDFから読取。重量空欄は w:0。手動数量追加に使用。
const PARTS_MASTER = [
  { cat: "支柱", name: "支柱", spec: "A-36", w: 13.40 },
  { cat: "支柱", name: "支柱", spec: "A-27", w: 10.10 },
  { cat: "支柱", name: "支柱", spec: "A-18", w: 7.00 },
  { cat: "支柱", name: "支柱", spec: "A-09", w: 3.70 },
  { cat: "支柱", name: "支柱(下切)", spec: "A-072", w: 3.30 },
  { cat: "支柱", name: "支柱", spec: "A-045", w: 2.10 },
  { cat: "支柱", name: "頭切り支柱", spec: "A-045", w: 2.10 },
  { cat: "支柱", name: "頭切り支柱", spec: "A-09", w: 3.30 },
  { cat: "踏板", name: "400巾アミ付踏板", spec: "DW-18", w: 13.90 },
  { cat: "踏板", name: "400巾アミ付踏板", spec: "DW-12", w: 9.80 },
  { cat: "踏板", name: "400巾アミ付踏板", spec: "DW-09", w: 7.50 },
  { cat: "踏板", name: "400巾アミ付踏板", spec: "DW-06", w: 5.40 },
  { cat: "踏板", name: "500巾アミ付踏板", spec: "DW-18", w: 18.00 },
  { cat: "踏板", name: "250巾アミ付踏板", spec: "D-18", w: 9.50 },
  { cat: "踏板", name: "250巾アミ付踏板", spec: "D-12", w: 6.90 },
  { cat: "踏板", name: "250巾アミ付踏板", spec: "D-09", w: 5.50 },
  { cat: "踏板", name: "250巾アミ付踏板", spec: "D-06", w: 4.00 },
  { cat: "踏板", name: "スチール足場板", spec: "4.0M", w: 12.50 },
  { cat: "踏板", name: "スチール足場板", spec: "3.0M", w: 9.50 },
  { cat: "踏板", name: "スチール足場板", spec: "2.0M", w: 6.50 },
  { cat: "手摺", name: "手摺", spec: "C-18", w: 4.60 },
  { cat: "手摺", name: "手摺", spec: "C-12", w: 3.30 },
  { cat: "手摺", name: "手摺", spec: "C-09", w: 2.30 },
  { cat: "手摺", name: "手摺", spec: "C-06", w: 1.70 },
  { cat: "手摺", name: "手摺", spec: "C-04", w: 1.30 },
  { cat: "手摺", name: "手摺", spec: "C-03", w: 1.10 },
  { cat: "手摺", name: "手摺", spec: "C-02", w: 0.80 },
  { cat: "手摺", name: "階段開口手摺", spec: "HC-19", w: 12.50 },
  { cat: "ジャッキ、ベース", name: "アンダーベース", spec: "EP-1", w: 0.26 },
  { cat: "ジャッキ、ベース", name: "パイプジャッキ", spec: "E-1", w: 3.10 },
  { cat: "ジャッキ、ベース", name: "パイプジャッキ自在", spec: "E-2", w: 3.20 },
  { cat: "ジャッキ、ベース", name: "単管ベース", spec: "", w: 0.80 },
  { cat: "ブラケット", name: "ブラケット", spec: "B-40", w: 2.60 },
  { cat: "ブラケット", name: "ブラケット", spec: "B-25", w: 1.80 },
  { cat: "ブラケット", name: "張り出しブラケット", spec: "BH-40", w: 3.50 },
  { cat: "ブラケット", name: "張り出しブラケット", spec: "BH-25", w: 2.80 },
  { cat: "ブラケット", name: "張り出しブラケット", spec: "BH-20", w: 1.80 },
  { cat: "ブラケット", name: "クイックブラケット", spec: "250～350", w: 5.00 },
  { cat: "壁つなぎ", name: "壁つなぎ(680～880)", spec: "KS2段C型", w: 2.20 },
  { cat: "壁つなぎ", name: "壁つなぎ(380～760)", spec: "KS2段B型", w: 1.50 },
  { cat: "壁つなぎ", name: "壁つなぎ(250～420)", spec: "KS2段A型", w: 1.30 },
  { cat: "壁つなぎ", name: "壁つなぎ(180～240)", spec: "KS1806", w: 0.80 },
  { cat: "階段", name: "斜め階段(0.9)", spec: "", w: 5.00 },
  { cat: "階段", name: "斜め階段(アルミ)", spec: "HA-19", w: 14.20 },
  { cat: "階段", name: "斜め階段(鉄)", spec: "HA-19", w: 25.80 },
  { cat: "筋交い", name: "筋違い", spec: "K-18", w: 4.20 },
  { cat: "筋交い", name: "筋違い", spec: "K-12", w: 3.30 },
  { cat: "筋交い", name: "筋違い", spec: "K-09", w: 2.10 },
  { cat: "筋交い", name: "はり枠", spec: "SG-36", w: 25.20 },
  { cat: "筋交い", name: "はり枠", spec: "SG-54", w: 38.90 },
  { cat: "単管", name: "単管48.6(バタ)", spec: "1.0M", w: 2.70 },
  { cat: "単管", name: "単管48.6(バタ)", spec: "1.5M", w: 4.10 },
  { cat: "単管", name: "単管48.6(ピン付)", spec: "2.0M", w: 5.40 },
  { cat: "単管", name: "単管48.6(ピン付)", spec: "2.5M", w: 6.80 },
  { cat: "単管", name: "単管48.6(ピン付)", spec: "3M", w: 8.10 },
  { cat: "単管", name: "単管48.6(ピン付)", spec: "3.5M", w: 9.50 },
  { cat: "単管", name: "単管48.6(ピン付)", spec: "4.0M", w: 10.80 },
  { cat: "単管", name: "単管48.6(ピン付)", spec: "4.5M", w: 12.20 },
  { cat: "単管", name: "単管48.6(ピン付)", spec: "5.0M", w: 13.50 },
  { cat: "単管", name: "単管48.6(ピン付)", spec: "5.5M", w: 14.90 },
  { cat: "単管", name: "単管48.6(ピン付)", spec: "6.0M", w: 16.20 },
  { cat: "単管", name: "単管", spec: "0.8M", w: 2.00 },
  { cat: "単管", name: "杭丸", spec: "1.2M", w: 3.00 },
  { cat: "単管", name: "単管ジョイント", spec: "", w: 0.70 },
  { cat: "単管", name: "先端クランプ", spec: "", w: 0.38 },
  { cat: "単管", name: "チェーン吊クランプ", spec: "", w: 0.50 },
  { cat: "単管", name: "シートクランプ", spec: "", w: 0.38 },
  { cat: "単管", name: "鉄骨クランプ", spec: "兼用", w: 1.10 },
  { cat: "単管", name: "兼用クランプ自在", spec: "自在", w: 0.76 },
  { cat: "単管", name: "兼用クランプ直交", spec: "直交", w: 0.76 },
  { cat: "単管", name: "チェーン", spec: "3.0M", w: 6.00 },
  { cat: "単管", name: "チェーン", spec: "4.0M", w: 8.50 },
  { cat: "単管", name: "センターアダプター", spec: "", w: 0.70 },
  { cat: "シート、ネット", name: "小幅ネット", spec: "0.5×6", w: 6.00 },
  { cat: "シート、ネット", name: "メッシュシート", spec: "1.8×5.4", w: 3.00 },
  { cat: "シート、ネット", name: "メッシュシート", spec: "1.2×5.4", w: 2.50 },
  { cat: "シート、ネット", name: "メッシュシート", spec: "0.9×5.4", w: 2.00 },
  { cat: "シート、ネット", name: "メッシュシート", spec: "0.6×5.4", w: 1.60 },
  { cat: "シート、ネット", name: "水平ネット", spec: "2×6", w: 0 },
  { cat: "シート、ネット", name: "水平ネット", spec: "3×6", w: 0 },
  { cat: "シート、ネット", name: "水平ネット", spec: "5×5", w: 0 },
  { cat: "シート、ネット", name: "水平ネット", spec: "6×6", w: 0 },
  { cat: "シート、ネット", name: "垂直ネット", spec: "1×10", w: 0 },
  { cat: "シート、ネット", name: "垂直ネット", spec: "6×12", w: 0 },
  { cat: "シート、ネット", name: "防炎シート", spec: "0.6×5.1", w: 0 },
  { cat: "シート、ネット", name: "防炎シート", spec: "0.9×5.1", w: 0 },
  { cat: "シート、ネット", name: "防炎シート", spec: "1.2×5.1", w: 0 },
  { cat: "シート、ネット", name: "防炎シート", spec: "1.5×5.1", w: 0 },
  { cat: "シート、ネット", name: "防炎シート", spec: "1.8×5.1", w: 0 },
  { cat: "シート、ネット", name: "防炎シート", spec: "3.6×5.4", w: 0 },
  { cat: "シート、ネット", name: "防炎シート(ロール)", spec: "50M", w: 0 },
  { cat: "シート、ネット", name: "ブルーシート", spec: "3.6×5.4", w: 0 },
  { cat: "その他", name: "コッパ板", spec: "", w: 0.38 },
  { cat: "その他", name: "杉板", spec: "4M", w: 12.00 },
  { cat: "その他", name: "杉板", spec: "3M", w: 9.00 },
  { cat: "その他", name: "杉板", spec: "2M", w: 6.00 },
  { cat: "その他", name: "巾木", spec: "4M", w: 1.00 },
  { cat: "その他", name: "巾木", spec: "2M", w: 0.50 },
  { cat: "その他", name: "キャスター", spec: "180φ", w: 12.00 },
  { cat: "その他", name: "キャスター", spec: "100φ", w: 10.00 },
  { cat: "その他", name: "アルミハシゴ", spec: "4.0M", w: 8.00 },
  { cat: "その他", name: "アルミハシゴ", spec: "3.0M", w: 6.00 },
  { cat: "その他", name: "タラップ", spec: "", w: 9.00 },
  { cat: "その他", name: "安全ブロック", spec: "", w: 0 },
  { cat: "その他", name: "親綱", spec: "8M", w: 0 },
  { cat: "その他", name: "親綱", spec: "10M", w: 0 },
  { cat: "その他", name: "親綱", spec: "20M", w: 0 },
  { cat: "その他", name: "パイオランテープ", spec: "", w: 0 },
  { cat: "その他", name: "ガムテープ", spec: "", w: 0 },
  { cat: "その他", name: "番線", spec: "", w: 0 },
  { cat: "その他", name: "巾木番線", spec: "", w: 0 },
  { cat: "その他", name: "シート紐", spec: "", w: 0 },
].map((m, i) => ({ ...m, id: `p${i}`, key: `${m.name}|${m.spec}` }));

const PARTS_CATS = ["支柱", "踏板", "手摺", "ジャッキ、ベース", "ブラケット", "壁つなぎ", "階段", "筋交い", "単管", "シート、ネット", "その他"];

const ceil = (n) => (n > 0 ? Math.ceil(n) : 0);
const num = (v, d = 0) => (v === "" || v == null || isNaN(v) ? d : parseFloat(v));
const fmt = (n, d = 0) =>
  (Math.round(n * 10 ** d) / 10 ** d).toLocaleString("ja-JP", { minimumFractionDigits: d, maximumFractionDigits: d });

// ───────── 支柱サイズ（A_●● の数字をm換算）─────────
// 高さ方向に積み上げて使う支柱。大きい順。
const POST_SIZES = [
  { key: "A_36", label: "A_36", m: 3.6 },
  { key: "A_27", label: "A_27", m: 2.7 },
  { key: "A_18", label: "A_18", m: 1.8 },
  { key: "A_09", label: "A_09", m: 0.9 },
  { key: "A_072", label: "A_072", m: 0.72 },
  { key: "A_045", label: "A_045", m: 0.45 },
];
// 端数調整に使う支柱（A_27より小さいもの＋A_36）。最も近い高さに丸める用。
const POST_FILL = [
  { key: "A_36", m: 3.6 },
  { key: "A_18", m: 1.8 },
  { key: "A_09", m: 0.9 },
  { key: "A_072", m: 0.72 },
  { key: "A_045", m: 0.45 },
];

/*
  支柱の高さ方向構成（1建地あたりの本数）を自動算出。
  ルール：
   1. 最下段は A_27(2.7m) を1本
   2. 残り高さを A_36(3.6m) 優先で積む
   3. 端数は「最も近い高さに丸める」→ POST_FILL から最適な1本を選ぶ
      （足りない／超えるどちらもあり得る。誤差最小を採用）
  戻り値：{ A_27:1, A_36:n, ... } 1建地あたり本数
*/
function buildPostPlan(height) {
  const plan = { A_36: 0, A_27: 0, A_18: 0, A_09: 0, A_072: 0, A_045: 0 };
  const h = num(height);
  if (h <= 0) return plan;

  // 1. 最下段 A_27
  plan.A_27 = 1;
  let remain = h - 2.7;

  if (remain <= 0) {
    // 高さがA_27以下：最も近い1本に丸める（A_27のままが近いか、小さい支柱か）
    // remainがマイナス＝A_27で既に超えている。A_27単独が最も近ければそのまま。
    // より小さい支柱で近づくなら置換。
    let best = { key: "A_27", err: Math.abs(2.7 - h), single: true };
    POST_FILL.forEach((p) => {
      const err = Math.abs(p.m - h);
      if (err < best.err) best = { key: p.key, err, single: true };
    });
    if (best.key !== "A_27") {
      plan.A_27 = 0;
      plan[best.key] = (plan[best.key] || 0) + 1;
    }
    return plan;
  }

  // 2. A_36 を優先して積む（端数を残す）
  const n36 = Math.floor(remain / 3.6);
  plan.A_36 += n36;
  remain -= n36 * 3.6;

  // 3. 端数 remain を「最も近い高さに丸める」
  if (remain > 0.01) {
    // 候補：端数を埋める1本を POST_FILL から選び、誤差最小（過不足両方許容）
    // また「端数を捨てる（何も足さない）」も候補に含める
    let best = { add: null, err: remain }; // 何も足さない場合の誤差 = remain(不足)
    POST_FILL.forEach((p) => {
      const err = Math.abs(p.m - remain); // この1本を足したときの過不足
      if (err < best.err) best = { add: p.key, err };
    });
    if (best.add) plan[best.add] = (plan[best.add] || 0) + 1;
  }
  return plan;
}

function postPlanTotalM(plan) {
  return POST_SIZES.reduce((s, p) => s + (plan[p.key] || 0) * p.m, 0);
}

// ───────── スパン割り（1.8m優先で割付）─────────
// 使用スパン：1.8 / 1.2 / 0.9 / 0.6
const SPAN_SIZES = [
  { key: "s18", m: 1.8, anch: "18", rail: "C_18" },
  { key: "s12", m: 1.2, anch: "12", rail: "C_12" },
  { key: "s09", m: 0.9, anch: "09", rail: "C_09" },
  { key: "s06", m: 0.6, anch: "06", rail: "C_06" },
];

/*
  足場長さを 1.8m 優先で割り付ける。
   1. 1.8mを最大数
   2. 残りを 1.2 / 0.9 / 0.6 で調整（貪欲＋端数最小化）
   3. 割り切れない残りは「未調整残り長さ」
  戻り値：{ s18, s12, s09, s06, used(割付合計m), remain(未調整m) }
*/
function buildSpanPlan(length) {
  const plan = { s18: 0, s12: 0, s09: 0, s06: 0 };
  let len = Math.round(num(length) * 100) / 100;
  if (len <= 0) return { ...plan, used: 0, remain: 0 };

  // 1.8m を最大数
  plan.s18 = Math.floor(len / 1.8 + 1e-9);
  let remain = Math.round((len - plan.s18 * 1.8) * 100) / 100;

  // 残りを 1.2 / 0.9 / 0.6 の組合せで最小誤差に埋める（0.3m刻みなので全探索）
  // remain をできるだけ 0 に近づける（超えない範囲で最大化）
  if (remain > 0.01) {
    let best = { s12: 0, s09: 0, s06: 0, leftover: remain };
    for (let a = 0; a <= Math.ceil(remain / 1.2) + 1; a++) {
      for (let b = 0; b <= Math.ceil(remain / 0.9) + 1; b++) {
        for (let cc = 0; cc <= Math.ceil(remain / 0.6) + 1; cc++) {
          const sum = a * 1.2 + b * 0.9 + cc * 0.6;
          const left = Math.round((remain - sum) * 100) / 100;
          if (left < -0.001) continue; // 超過は不可（未調整残りはプラスのみ）
          const pieces = a + b + cc;
          // leftover最小 → 同点ならピース数最小
          if (left < best.leftover - 0.001 ||
              (Math.abs(left - best.leftover) < 0.001 && pieces < (best.s12 + best.s09 + best.s06))) {
            best = { s12: a, s09: b, s06: cc, leftover: left };
          }
        }
      }
    }
    plan.s12 = best.s12; plan.s09 = best.s09; plan.s06 = best.s06;
    remain = best.leftover;
  }

  const used = Math.round((plan.s18 * 1.8 + plan.s12 * 1.2 + plan.s09 * 0.9 + plan.s06 * 0.6) * 100) / 100;
  return { ...plan, used, remain };
}

function spanPlanTotal(plan) {
  return (plan.s18 || 0) + (plan.s12 || 0) + (plan.s09 || 0) + (plan.s06 || 0);
}

// アンチの規格コード表示： 400巾→DW_18等 / 250巾→D_18等
function anchCode(width, m) {
  const suf = { 1.8: "18", 1.2: "12", 0.9: "09", 0.6: "06" }[m] || "";
  if (width === "250") return `D_${suf}`;
  return `DW_${suf}`; // 400/500/600巾はDW系
}
// 重量マスターのキー： DW400_18 / DW500_18 / DW600_18 / D250_18
function anchWeightKey(width, m) {
  const suf = { 1.8: "18", 1.2: "12", 0.9: "09", 0.6: "06" }[m] || "18";
  if (width === "250") return `D250_${suf}`;
  if (width === "500") return `DW500_${suf}`;
  if (width === "600") return `DW600_${suf}`;
  return `DW400_${suf}`;
}

const initInput = () => ({
  siteName: "", faceName: "",
  length: "", height: "",
  spec: "B400",
  stairs: "",
  boardTiers: "",         // 踏板段数（空＝段数）
  railTiers: "",          // 手すり段数（空＝段数）
  sheet: true, toeboard: true, wallTie: true, stairDeduct: false,
  jacksManual: "",
  toe2mCount: "",
  toe2mNote: "",
});

export default function App() {
  const [input, setInput] = useState(initInput());
  const [coef, setCoef] = useState(DEFAULT_COEF);
  const [weights, setWeights] = useState(DEFAULT_WEIGHTS);
  const [truck, setTruck] = useState("4t");
  const [manualQty, setManualQty] = useState({}); // {partId: number} 手動追加部材
  const [postManual, setPostManual] = useState(null); // 支柱構成 手動上書き {A_36:n,...} or null=自動
  const [spanManual, setSpanManual] = useState(null); // スパン構成 手動上書き {s18,s12,s09,s06} or null=自動
  const [partSearch, setPartSearch] = useState("");
  const [partCat, setPartCat] = useState("ALL");
  const [showCoef, setShowCoef] = useState(false);
  const [showWeights, setShowWeights] = useState(false);
  const [showFormula, setShowFormula] = useState(true);
  const [showParts, setShowParts] = useState(false);
  const [toast, setToast] = useState("");
  const toastT = useRef(null);

  const setI = (k, v) => setInput((s) => ({ ...s, [k]: v }));
  const setC = (k, v) => setCoef((s) => ({ ...s, [k]: v === "" ? "" : parseFloat(v) }));
  const flash = (m) => { setToast(m); clearTimeout(toastT.current); toastT.current = setTimeout(() => setToast(""), 2000); };

  const spec = SPECS.find((s) => s.key === input.spec);

  // ───────── 計算 ─────────
  const c = useMemo(() => {
    const len = num(input.length);
    const h = num(input.height);
    const liftH = num(coef.liftHeight, 1.8) || 1.8;
    const stairs = num(input.stairs);

    const area = len * h;

    // ───────── スパン割り（規格別）─────────
    const autoSpan = buildSpanPlan(len);
    const spanPlan = spanManual || autoSpan;
    const spanUsed = Math.round(((spanPlan.s18 || 0) * 1.8 + (spanPlan.s12 || 0) * 1.2 + (spanPlan.s09 || 0) * 0.9 + (spanPlan.s06 || 0) * 0.6) * 100) / 100;
    const spanRemain = spanManual ? Math.round((len - spanUsed) * 100) / 100 : autoSpan.remain;
    const spans = spanPlanTotal(spanPlan); // 総スパン数

    const lifts = ceil(h / liftH);
    const boardTiers = input.boardTiers !== "" && input.boardTiers != null ? num(input.boardTiers) : lifts;
    const railTiers = input.railTiers !== "" && input.railTiers != null ? num(input.railTiers) : lifts;

    const build = num(coef.buildDiv, 35) > 0 ? area / num(coef.buildDiv, 35) : 0;
    const dismantle = num(coef.dismantleDiv, 60) > 0 ? area / num(coef.dismantleDiv, 60) : 0;
    const labor = build + dismantle;

    // ───────── 手すり（規格別 × 段数 × 本数）─────────
    const railsBySize = SPAN_SIZES.map((s) => ({
      size: s.m, rail: s.rail,
      qty: (spanPlan[s.key] || 0) * railTiers * spec.railN,
    }));
    const rails = railsBySize.reduce((a, b) => a + b.qty, 0);

    // ───────── アンチ（規格別）─────────
    // anchSet(width, perMul) → 各スパン規格 × 踏板段数 × perMul の配列
    const anchSet = (width, perMul) => SPAN_SIZES.map((s) => ({
      width, size: s.m, code: anchCode(width, s.m), per: perMul,
      qty: (spanPlan[s.key] || 0) * boardTiers * perMul,
      wkey: anchWeightKey(width, s.m),
    }));

    let anchA = [], anchB = [], anchLabelA = "", anchLabelB = "";
    if (spec.dual) {
      // 600本足：A=500×1 / B=250×2
      anchA = anchSet("500", 1); anchLabelA = "A：500アンチ 1枚敷き";
      anchB = anchSet("250", 2); anchLabelB = "B：250アンチ 2枚敷き";
    } else if (spec.anchWidth === "400+250") {
      // 1200本足：400×2 + 250×1
      anchA = [...anchSet("400", 2), ...anchSet("250", 1)];
      anchLabelA = "400アンチ×2 ＋ 250アンチ×1";
    } else {
      const mul = spec.anchPerSpan || 1; // 900本足は400×2
      anchA = anchSet(spec.anchWidth, mul);
      anchLabelA = `${spec.anchWidth}アンチ${mul > 1 ? `×${mul}` : ""}`;
    }

    // ブレス
    const braceLiftG = num(coef.braceLiftGroup, 3) || 3;
    const braceSpanG = num(coef.braceSpanGroup, 6) || 6;
    const bracePer = num(coef.bracePerGroup, 6);
    let braces = ceil(lifts / braceLiftG) * ceil(spans / braceSpanG) * bracePer;
    const stairBraceG = num(coef.stairBraceGroup, 2) || 2;
    const stairBracePer = num(coef.stairBracePer, 6);
    const stairBraces = stairs > 0 ? ceil(stairs / stairBraceG) * stairBracePer : 0;
    let braceDeducted = 0;
    if (input.stairDeduct && stairs > 0) {
      braceDeducted = stairBraces;
      braces = Math.max(0, braces - braceDeducted);
    }

    const wallTies = input.wallTie
      ? ceil(lifts / (num(coef.wallLiftGroup, 2) || 2)) * ceil(spans / (num(coef.wallSpanGroup, 2) || 2)) : 0;

    // ───────── ジャッキ数（建地本数）─────────
    const autoJacks = (spans > 0 ? spans + 1 : 0) * (input.spec.startsWith("M") ? 2 : 1);
    const jacks = input.jacksManual !== "" && input.jacksManual != null
      ? num(input.jacksManual) : autoJacks;
    const jacksIsManual = input.jacksManual !== "" && input.jacksManual != null;

    // ───────── 支柱構成（1建地あたり本数 → ×ジャッキ数）─────────
    const autoPlan = buildPostPlan(h);
    const postPlan = postManual || autoPlan;   // 1建地あたり
    const postPlanM = postPlanTotalM(postPlan); // 1建地の総高さ
    // 各支柱数量 = ジャッキ数 × 1建地あたり本数
    const postQty = {};
    POST_SIZES.forEach((p) => { postQty[p.key] = (postPlan[p.key] || 0) * jacks; });
    const postsTotal = Object.values(postQty).reduce((a, b) => a + b, 0);

    // ───────── 巾木（内側のみ・4m優先）─────────
    const toeboardOn = input.toeboard;
    const toeTiers = boardTiers; // 巾木段数＝踏板段数
    const toe2m = toeboardOn ? num(input.toe2mCount) : 0;
    const target4mPerTier = Math.max(0, len - toe2m * 2);
    const toe4mPerTier = toeboardOn ? ceil(target4mPerTier / 4) : 0;
    const toe4m = toe4mPerTier * toeTiers;
    const toe2mTotal = toe2m * toeTiers;

    const sheetH = num(coef.sheetHeight, 5.1) || 5.1;
    const sheets = input.sheet ? spans * ceil(h / sheetH) : 0;

    const jackBases = jacks;

    const W = weights;
    // 支柱重量（サイズ別）
    let postWeight = 0;
    POST_SIZES.forEach((p) => { postWeight += (postQty[p.key] || 0) * (W[p.key] || 0); });

    // 手すり重量（規格別）
    let railWeight = 0;
    railsBySize.forEach((r) => { railWeight += r.qty * (W[r.rail] || 0); });

    // アンチ重量（規格別・Aパターン基本／dualはA採用、B表示のみ）
    const anchWeightOf = (arr) => arr.reduce((s, a) => s + a.qty * (W[a.wkey] || 0), 0);
    const anchWeightA = anchWeightOf(anchA);
    const anchWeightB = spec.dual ? anchWeightOf(anchB) : 0;

    const wp = {
      手すり: railWeight,
      筋交K_18: (braces + stairBraces) * W.筋交K_18,
      壁つなぎ: wallTies * W.壁つなぎ,
      巾木: toe4m * W.巾木4m + toe2mTotal * W.巾木2m,
      シート: sheets * W.シート,
      支柱: postWeight,
      ジャッキベース: jackBases * W.ジャッキベース,
      アンチ: anchWeightA, // dualはA採用
    };

    const autoWeight = Object.values(wp).reduce((a, b) => a + b, 0);

    // 手動追加部材
    let manualWeight = 0;
    const manualRows = [];
    PARTS_MASTER.forEach((p) => {
      const q = parseInt(manualQty[p.id], 10) || 0;
      if (q > 0) { manualWeight += p.w * q; manualRows.push({ ...p, q, wsum: p.w * q }); }
    });

    const totalWeight = autoWeight + manualWeight;

    return {
      len, h, area, spans, lifts, boardTiers, railTiers, build, dismantle, labor,
      autoSpan, spanPlan, spanUsed, spanRemain,
      railsBySize, rails, anchA, anchB, anchLabelA, anchLabelB, anchWeightA, anchWeightB,
      braces, stairBraces, braceDeducted, bracesTotal: braces + stairBraces,
      wallTies, sheets, jackBases,
      jacks, autoJacks, jacksIsManual,
      autoPlan, postPlan, postPlanM, postQty, postsTotal,
      toe4m, toe2mTotal, toe4mPerTier, toe2m, toeTiers, target4mPerTier,
      wp, autoWeight, manualWeight, manualRows, totalWeight,
    };
  }, [input, coef, weights, manualQty, postManual, spanManual, spec]);

  const truckCap = TRUCKS.find((t) => t.key === truck).cap;
  const truckNeed = c.totalWeight > 0 ? Math.ceil(c.totalWeight / truckCap) : 0;
  const loadRate = truckNeed > 0 ? (c.totalWeight / (truckNeed * truckCap)) * 100 : 0;

  // 自動算出 部材別行
  const autoRows = useMemo(() => {
    const rows = [];
    // 支柱（サイズ別）
    POST_SIZES.forEach((p) => {
      const q = c.postQty[p.key] || 0;
      if (q > 0) rows.push([`支柱 ${p.label}（${p.m}m）`, q, "本", (c.postQty[p.key] || 0) * (weights[p.key] || 0)]);
    });
    rows.push(["（支柱 重量合計）", "", "", c.wp.支柱]);
    rows.push(["ジャッキ・ベース", c.jackBases, "組", c.wp.ジャッキベース]);
    // 手すり（規格別）
    c.railsBySize.forEach((r) => {
      if (r.qty > 0) rows.push([`手摺 ${r.rail}（${r.size}m）`, r.qty, "本", r.qty * (weights[r.rail] || 0)]);
    });
    rows.push(["（手すり 重量合計）", "", "", c.wp.手すり]);
    // アンチ（規格別）
    c.anchA.forEach((a) => {
      if (a.qty > 0) rows.push([`${a.width}アンチ ${a.code}（${a.size}m）${spec.dual ? "（A）" : ""}`, a.qty, "枚", a.qty * (weights[a.wkey] || 0)]);
    });
    if (spec.dual) {
      rows.push(["（アンチ重量 A）", "", "", c.anchWeightA]);
      c.anchB.forEach((a) => {
        if (a.qty > 0) rows.push([`${a.width}アンチ ${a.code}（${a.size}m）（B）`, a.qty, "枚", a.qty * (weights[a.wkey] || 0)]);
      });
      rows.push(["（アンチ重量 B・参考）", "", "", c.anchWeightB]);
    } else {
      rows.push(["（アンチ重量合計）", "", "", c.wp.アンチ]);
    }
    rows.push(["通常ブレス（筋交 K_18）", c.braces, "本", c.braces * weights.筋交K_18]);
    rows.push(["階段ブレス（筋交 K_18）", c.stairBraces, "本", c.stairBraces * weights.筋交K_18]);
    rows.push(["筋交 K_18 合計", c.bracesTotal, "本", c.wp.筋交K_18]);
    if (input.wallTie) rows.push(["壁つなぎ", c.wallTies, "個", c.wp.壁つなぎ]);
    if (input.toeboard) {
      rows.push(["巾木 4m", c.toe4m, "枚", c.toe4m * weights.巾木4m]);
      if (c.toe2mTotal > 0) rows.push(["巾木 2m", c.toe2mTotal, "枚", c.toe2mTotal * weights.巾木2m]);
    }
    if (input.sheet) rows.push(["シート", c.sheets, "枚", c.wp.シート]);
    return rows;
  }, [c, spec, input, weights]);

  // 部材マスター絞り込み
  const filteredParts = useMemo(() => {
    const kw = partSearch.trim().toLowerCase();
    return PARTS_MASTER.filter((p) => {
      if (partCat !== "ALL" && p.cat !== partCat) return false;
      if (!kw) return true;
      return p.name.toLowerCase().includes(kw) || p.spec.toLowerCase().includes(kw);
    });
  }, [partSearch, partCat]);
  const groupedParts = useMemo(() => {
    const g = {};
    filteredParts.forEach((p) => (g[p.cat] = g[p.cat] || []).push(p));
    return PARTS_CATS.filter((cc) => g[cc]).map((cc) => ({ cat: cc, items: g[cc] }));
  }, [filteredParts]);

  // ───────── CSV ─────────
  const copyCSV = async () => {
    const rows = [
      ["サンワ工業株式会社 足場 数量・人工数 概算（外部足場）"],
      ["※正式な構造計算ではなく、見積・段取り用の概算です"],
      [],
      ["現場名", input.siteName], ["面名", input.faceName], ["足場仕様", spec.label],
      [],
      ["入力", "値", "単位"],
      ["足場長さ", input.length, "m"], ["足場高さ", input.height, "m"],
      ["段高", coef.liftHeight, "m"],
      ["踏板段数", c.boardTiers, "段"], ["手すり段数", c.railTiers, "段"],
      ["階段基数", input.stairs || 0, "基"],
      ["ジャッキ数", c.jacks, "本"],
      ["2m巾木 使用箇所メモ", input.toe2mNote, ""],
      ["シート", input.sheet ? "有" : "無", ""], ["巾木", input.toeboard ? "有" : "無", ""],
      ["壁つなぎ", input.wallTie ? "有" : "無", ""], ["階段控除", input.stairDeduct ? "ON" : "OFF", ""],
      [],
      ["スパン割り", "スパン数", "長さm"],
      ["1.8m", c.spanPlan.s18, fmt(c.spanPlan.s18 * 1.8, 1)],
      ["1.2m", c.spanPlan.s12, fmt(c.spanPlan.s12 * 1.2, 1)],
      ["0.9m", c.spanPlan.s09, fmt(c.spanPlan.s09 * 0.9, 1)],
      ["0.6m", c.spanPlan.s06, fmt(c.spanPlan.s06 * 0.6, 1)],
      ["割付合計", c.spans, fmt(c.spanUsed, 2)],
      ["未調整残り長さ", "", fmt(c.spanRemain, 2)],
      [],
      ["計算結果", "値", "単位"],
      ["足場面積", fmt(c.area, 2), "㎡"], ["総スパン数", c.spans, ""], ["段数", c.lifts, ""],
      ["組立人工", fmt(c.build, 2), "人工"], ["解体人工", fmt(c.dismantle, 2), "人工"], ["合計人工", fmt(c.labor, 2), "人工"],
      [],
      ["自動算出 部材", "数量", "単位", "重量kg"],
      ...autoRows.map((r) => [r[0], r[1], r[2], r[3] == null ? "" : fmt(r[3], 1)]),
    ];
    if (c.manualRows.length) {
      rows.push([], ["手動追加 部材", "規格", "数量", "重量kg"]);
      c.manualRows.forEach((m) => rows.push([m.name, m.spec, m.q, fmt(m.wsum, 1)]));
    }
    rows.push([], ["概算総重量", fmt(c.totalWeight, 1), "kg"],
      [`トラック目安(${TRUCKS.find((t) => t.key === truck).label})`, truckNeed, "台", `積載率約${Math.round(loadRate)}%`]);
    const csv = rows.map((r) => r.map((x) => `"${String(x ?? "").replace(/"/g, '""')}"`).join(",")).join("\n");
    try { await navigator.clipboard.writeText(csv); flash("CSVをコピーしました"); }
    catch {
      const ta = document.createElement("textarea"); ta.value = csv; document.body.appendChild(ta); ta.select();
      try { document.execCommand("copy"); flash("CSVをコピーしました"); } catch { flash("コピー失敗"); }
      document.body.removeChild(ta);
    }
  };

  const manualCount = Object.values(manualQty).filter((v) => (parseInt(v, 10) || 0) > 0).length;

  // ───────── 描画 ─────────
  return (
    <div style={S.page}>
      <style>{css}</style>

      <header style={S.header}>
        <div style={S.stripe} />
        <div style={S.headWrap}>
          <div style={S.mark}>SANWA</div>
          <div>
            <div style={S.company}>サンワ工業株式会社</div>
            <h1 style={S.h1}>足場 数量・人工数 算出ツール</h1>
            <div style={S.sub}>外部足場（くさび式）</div>
          </div>
        </div>
      </header>

      <div style={S.disclaimer}>⚠ 本ツールは<b>正式な構造計算ではありません</b>。見積・段取り用の<b>概算</b>です。</div>

      <main style={S.main}>
        {/* 基本入力 */}
        <section style={S.card}>
          <CardLabel t="基本入力" />
          <div style={S.fieldCol}>
            <div style={S.row2}>
              <Text label="現場名" v={input.siteName} on={(v) => setI("siteName", v)} ph="例）○○倉庫" />
              <Text label="面名" v={input.faceName} on={(v) => setI("faceName", v)} ph="例）北面" />
            </div>
            <div style={S.row2}>
              <NumF label="足場長さ" unit="m" v={input.length} on={(v) => setI("length", v)} />
              <NumF label="足場高さ" unit="m" v={input.height} on={(v) => setI("height", v)} />
            </div>
            <div style={S.field}>
              <label style={S.label}>足場仕様</label>
              <div style={S.specGrid}>
                {SPECS.map((s) => (
                  <button key={s.key} style={{ ...S.specBtn, ...(input.spec === s.key ? S.specBtnOn : {}) }} onClick={() => setI("spec", s.key)}>
                    <div style={S.specMain}>{s.label}</div>
                    <div style={S.specSub}>{s.railSide}</div>
                  </button>
                ))}
              </div>
              <div style={S.anchHint}>アンチ構成：{anchHintText(spec)}</div>
            </div>
            <div style={S.row2}>
              <NumF label="踏板段数" unit="段" v={input.boardTiers} on={(v) => setI("boardTiers", v)} ph="自動" />
              <NumF label="手すり段数" unit="段" v={input.railTiers} on={(v) => setI("railTiers", v)} ph="自動" />
            </div>
            <NumF label="段高" unit="m" v={coef.liftHeight} on={(v) => setC("liftHeight", v)} />
            <NumF label="階段基数" unit="基" v={input.stairs} on={(v) => setI("stairs", v)} />
            <p style={S.miniNote}>※スパンは足場長さから1.8m優先で自動割付します（下のスパン割りカードで手動修正可）。</p>
            <div style={S.switchGrid}>
              <Toggle label="シート" on={input.sheet} set={(v) => setI("sheet", v)} />
              <Toggle label="巾木" on={input.toeboard} set={(v) => setI("toeboard", v)} />
              <Toggle label="壁つなぎ" on={input.wallTie} set={(v) => setI("wallTie", v)} />
              <Toggle label="階段控除" on={input.stairDeduct} set={(v) => setI("stairDeduct", v)} />
            </div>
            {input.stairDeduct && <p style={S.miniNote}>※階段控除ON：通常ブレスから階段相当（{c.braceDeducted}本）を控除（簡易）。</p>}
          </div>
        </section>

        {/* スパン割り */}
        <section style={S.card}>
          <CardLabel t="スパン割り（1.8m優先・規格別）" />
          <p style={S.note}>足場長さから1.8m→1.2m→0.9m→0.6mの順で割り付けます。各規格の数を手動修正できます。</p>
          <div style={S.postSummary}>
            <span>足場長さ {fmt(c.len, 2)}m</span>
            <span style={{ color: c.spanRemain > 0.01 ? "#c0392b" : NAVY }}>
              割付合計 {fmt(c.spanUsed, 2)}m{c.spanRemain > 0.01 ? `／未調整残り ${fmt(c.spanRemain, 2)}m` : "（ぴったり）"}
            </span>
          </div>
          <div style={S.postTable}>
            <div style={S.postHead}>
              <span style={{ flex: 1 }}>スパン規格</span>
              <span style={{ width: 110, textAlign: "center" }}>スパン数</span>
              <span style={{ width: 64, textAlign: "right" }}>長さ</span>
            </div>
            {SPAN_SIZES.map((s) => {
              const n = c.spanPlan[s.key] || 0;
              return (
                <div key={s.key} style={{ ...S.postRow, ...(n > 0 ? { background: "#fff8ee" } : {}) }}>
                  <span style={S.postName}>{s.m}m スパン</span>
                  <div style={S.postPerWrap}>
                    <button style={S.stepBtn} onClick={() => { const b = { ...c.spanPlan }; b[s.key] = Math.max(0, (b[s.key] || 0) - 1); setSpanManual(b); }}>−</button>
                    <input style={S.postPerInput} type="number" inputMode="numeric" min="0" value={n}
                      onChange={(e) => { const b = { ...c.spanPlan }; b[s.key] = Math.max(0, parseInt(e.target.value, 10) || 0); setSpanManual(b); }}
                      onFocus={(e) => e.target.select()} />
                    <button style={S.stepBtn} onClick={() => { const b = { ...c.spanPlan }; b[s.key] = (b[s.key] || 0) + 1; setSpanManual(b); }}>＋</button>
                  </div>
                  <span style={S.postQty}>{fmt(n * s.m, 1)}<span style={S.postQtyU}>m</span></span>
                </div>
              );
            })}
          </div>
          <div style={S.spanTotalRow}>
            <span>総スパン数</span><span style={S.spanTotalVal}>{c.spans}</span>
          </div>
          {spanManual && (
            <button style={{ ...S.btnGhost, marginTop: 10, width: "100%" }} onClick={() => { setSpanManual(null); flash("スパン割りを自動に戻しました"); }}>自動割付に戻す</button>
          )}
        </section>

        {/* 足場段数 */}
        <section style={S.card}>
          <CardLabel t="足場段数（自動算出）" />
          <div style={S.tierGrid}>
            <div style={S.tierBox}>
              <div style={S.tierLabel}>足場高さ</div>
              <div style={S.tierVal}>{fmt(c.h, 1)}<span style={S.tierU}>m</span></div>
            </div>
            <div style={S.tierBox}>
              <div style={S.tierLabel}>1段高さ</div>
              <div style={S.tierVal}>{fmt(num(coef.liftHeight, 1.8) || 1.8, 1)}<span style={S.tierU}>m</span></div>
            </div>
            <div style={{ ...S.tierBox, ...S.tierBoxAccent }}>
              <div style={S.tierLabel}>算出段数</div>
              <div style={{ ...S.tierVal, color: ORANGE }}>{c.lifts}<span style={S.tierU}>段</span></div>
            </div>
          </div>
          <div style={S.tierFormula}>
            <span style={S.tierFormulaTitle}>計算式</span>
            足場段数 = 切上(足場高さ ÷ 1段高さ) = 切上({fmt(c.h, 1)} ÷ {fmt(num(coef.liftHeight, 1.8) || 1.8, 1)}) = <b>{c.lifts} 段</b>
          </div>
        </section>

        {/* 主要結果 */}
        <section style={S.card}>
          <CardLabel t="計算結果" />
          {(input.siteName || input.faceName) && (
            <div style={S.resultSite}>{input.siteName}{input.faceName && `／${input.faceName}`}<span style={S.specTag}>{spec.label}</span></div>
          )}
          <div style={S.heroGrid}>
            <Hero label="足場面積" value={fmt(c.area, 1)} unit="㎡" />
            <Hero label="スパン数" value={c.spans} unit="" />
            <Hero label="段数" value={c.lifts} unit="" />
          </div>
          <div style={S.heroGrid}>
            <Hero label="組立人工" value={fmt(c.build, 2)} unit="人工" />
            <Hero label="解体人工" value={fmt(c.dismantle, 2)} unit="人工" />
            <Hero label="合計人工" value={fmt(c.labor, 2)} unit="人工" accent />
          </div>
        </section>

        {/* ジャッキ数 */}
        <section style={S.card}>
          <CardLabel t="ジャッキ数（建地本数）" />
          <div style={S.jackRow}>
            <div style={S.jackAuto}>
              <div style={S.jackAutoLabel}>自動算出</div>
              <div style={S.jackAutoVal}>{c.autoJacks} 本</div>
              <div style={S.jackAutoNote}>
                {spec.key.startsWith("M") ? "(スパン数+1)×2" : "スパン数+1"} = {c.autoJacks}
              </div>
            </div>
            <div style={S.field}>
              <label style={S.label}>手動変更（空欄＝自動）</label>
              <div style={S.inputWrap}>
                <input style={S.input} type="number" inputMode="numeric" min="0"
                  placeholder={String(c.autoJacks)} value={input.jacksManual}
                  onChange={(e) => setI("jacksManual", e.target.value)} onFocus={(e) => e.target.select()} />
                <span style={S.unit}>本</span>
              </div>
            </div>
          </div>
          <div style={S.usingLine}>使用ジャッキ数：<b>{c.jacks} 本</b>{c.jacksIsManual && <span style={S.manualTag}>手動</span>}</div>
        </section>

        {/* 支柱構成 */}
        <section style={S.card}>
          <CardLabel t="支柱構成（高さ方向）" />
          <p style={S.note}>
            最下段 A_27 を基本に、残り高さを A_36 優先で積み、端数は最も近い支柱で調整します（足りない場合あり）。
            1建地あたりの本数を手動修正できます。各支柱数量 ＝ ジャッキ数 × 使用本数。
          </p>
          <div style={S.postSummary}>
            <span>足場高さ {fmt(c.h, 1)}m</span>
            <span style={{ color: c.postPlanM < c.h ? "#c0392b" : NAVY }}>
              支柱合計 {fmt(c.postPlanM, 2)}m
              {c.postPlanM < c.h ? `（不足 ${fmt(c.h - c.postPlanM, 2)}m）` : c.postPlanM > c.h ? `（余裕 ${fmt(c.postPlanM - c.h, 2)}m）` : "（一致）"}
            </span>
          </div>

          <div style={S.postTable}>
            <div style={S.postHead}>
              <span style={{ flex: 1 }}>支柱</span>
              <span style={{ width: 90, textAlign: "center" }}>1建地本数</span>
              <span style={{ width: 70, textAlign: "right" }}>数量</span>
            </div>
            {POST_SIZES.map((p) => {
              const per = c.postPlan[p.key] || 0;
              return (
                <div key={p.key} style={{ ...S.postRow, ...(per > 0 ? { background: "#fff8ee" } : {}) }}>
                  <span style={S.postName}>{p.label}<span style={S.postM}>{p.m}m</span></span>
                  <div style={S.postPerWrap}>
                    <button style={S.stepBtn} onClick={() => {
                      const base = { ...c.postPlan }; base[p.key] = Math.max(0, (base[p.key] || 0) - 1); setPostManual(base);
                    }}>−</button>
                    <input style={S.postPerInput} type="number" inputMode="numeric" min="0" value={per}
                      onChange={(e) => { const base = { ...c.postPlan }; base[p.key] = Math.max(0, parseInt(e.target.value, 10) || 0); setPostManual(base); }}
                      onFocus={(e) => e.target.select()} />
                    <button style={S.stepBtn} onClick={() => {
                      const base = { ...c.postPlan }; base[p.key] = (base[p.key] || 0) + 1; setPostManual(base);
                    }}>＋</button>
                  </div>
                  <span style={S.postQty}>{(c.postQty[p.key] || 0).toLocaleString("ja-JP")}<span style={S.postQtyU}>本</span></span>
                </div>
              );
            })}
          </div>
          {postManual && (
            <button style={{ ...S.btnGhost, marginTop: 10, width: "100%" }} onClick={() => { setPostManual(null); flash("支柱構成を自動算出に戻しました"); }}>
              自動算出に戻す
            </button>
          )}
        </section>

        {/* 巾木 */}
        {input.toeboard && (
          <section style={S.card}>
            <CardLabel t="巾木（内側のみ・4m優先）" />
            <p style={S.note}>
              4m巾木を基本とし、入隅など短い箇所だけ2m巾木を手動指定できます。2m巾木の枚数分を4m対象長さから差し引きます。
            </p>
            <div style={S.row2}>
              <NumF label="2m巾木 枚数（1段あたり・手動）" unit="枚" v={input.toe2mCount} on={(v) => setI("toe2mCount", v)} ph="0" />
              <div style={S.field}>
                <label style={S.label}>巾木段数</label>
                <div style={S.staticBox}>{c.toeTiers} 段（段数と同じ）</div>
              </div>
            </div>
            <Text label="2m巾木 使用箇所メモ" v={input.toe2mNote} on={(v) => setI("toe2mNote", v)} ph="例）北面入隅 1.8m" />
            <div style={S.toeResult}>
              <div style={S.toeBox}>
                <div style={S.toeLabel}>4m巾木</div>
                <div style={S.toeVal}>{c.toe4m}<span style={S.toeU}>枚</span></div>
                <div style={S.toeNote}>1段 {c.toe4mPerTier}枚 × {c.toeTiers}段</div>
              </div>
              <div style={S.toeBox}>
                <div style={S.toeLabel}>2m巾木</div>
                <div style={S.toeVal}>{c.toe2mTotal}<span style={S.toeU}>枚</span></div>
                <div style={S.toeNote}>1段 {c.toe2m}枚 × {c.toeTiers}段</div>
              </div>
            </div>
          </section>
        )}

        {/* 主要結果（部材別数量表）*/}
        <section style={S.card}>
          <CardLabel t="部材別数量表（自動算出）" />
          <div style={S.qtyTable}>
            <div style={S.qHead}>
              <span style={{ flex: 1 }}>部材</span>
              <span style={{ width: 80, textAlign: "right" }}>数量</span>
              <span style={{ width: 84, textAlign: "right" }}>重量kg</span>
            </div>
            {autoRows.map((r, i) => {
              const isSub = r[1] === "" && r[3] != null; // 重量合計行
              return (
                <div key={i} style={{ ...S.rowQ, ...(isSub ? S.rowSub : {}) }}>
                  <span style={{ ...S.rowQName, ...(isSub ? { color: "#999", fontWeight: 600 } : {}) }}>{r[0]}</span>
                  <span style={S.rowQVal}>{r[1] === "" ? "" : (typeof r[1] === "number" ? r[1].toLocaleString("ja-JP") : r[1])}<span style={S.rowQUnit}>{r[1] === "" ? "" : r[2]}</span></span>
                  <span style={S.rowQW}>{r[3] == null ? "—" : fmt(r[3], 1)}</span>
                </div>
              );
            })}
          </div>
        </section>

        {/* 手動追加部材（PDF全部材マスター） */}
        <section style={S.card}>
          <button style={S.collapseHead} onClick={() => setShowParts((x) => !x)}>
            <span style={S.cardTitle}>➕ 部材を手動追加{manualCount > 0 && <span style={S.badge}>{manualCount}</span>}</span>
            <span style={S.arrow}>{showParts ? "▾" : "▸"}</span>
          </button>
          {showParts && (
            <div style={{ marginTop: 12 }}>
              <p style={S.note}>PDF注文書の全部材から、自動算出に含まれない部材（クランプ・単管・ネット類など）を任意に追加できます。</p>
              <div style={S.searchWrap}>
                <span style={S.searchIcon}>🔍</span>
                <input style={S.search} placeholder="品名・規格で検索" value={partSearch} onChange={(e) => setPartSearch(e.target.value)} />
                {partSearch && <button style={S.clearS} onClick={() => setPartSearch("")}>✕</button>}
              </div>
              <div style={S.chips} className="chips">
                <button style={{ ...S.chip, ...(partCat === "ALL" ? S.chipOn : {}) }} onClick={() => setPartCat("ALL")}>すべて</button>
                {PARTS_CATS.map((cc) => (
                  <button key={cc} style={{ ...S.chip, ...(partCat === cc ? S.chipOn : {}) }} onClick={() => setPartCat(cc)}>{cc}</button>
                ))}
              </div>
              {groupedParts.map(({ cat, items }) => (
                <div key={cat} style={{ marginTop: 10 }}>
                  <div style={S.partCat}>{cat}</div>
                  {items.map((p) => {
                    const q = manualQty[p.id];
                    const qn = parseInt(q, 10) || 0;
                    return (
                      <div key={p.id} style={{ ...S.partRow, ...(qn > 0 ? { background: "#fff8ee" } : {}) }}>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={S.partName}>{p.name}</div>
                          <div style={S.partSpec}>{p.spec || "—"}{p.w === 0 && <span style={S.noW}>重量設定なし</span>}</div>
                        </div>
                        <span style={S.partW}>{p.w === 0 ? "—" : p.w.toFixed(2)}</span>
                        <input style={S.partQty} type="number" inputMode="numeric" min="0" placeholder="0"
                          value={q ?? ""} onChange={(e) => setManualQty((s) => ({ ...s, [p.id]: e.target.value === "" ? "" : Math.max(0, parseInt(e.target.value, 10) || 0) }))} onFocus={(e) => e.target.select()} />
                        <span style={S.partSum}>{qn > 0 ? fmt(p.w * qn, 1) : "—"}</span>
                      </div>
                    );
                  })}
                </div>
              ))}
              {manualCount > 0 && (
                <button style={{ ...S.btnGhost, marginTop: 12, width: "100%" }} onClick={() => { setManualQty({}); flash("手動追加をクリアしました"); }}>手動追加をクリア</button>
              )}
            </div>
          )}
        </section>

        {/* 総重量・トラック */}
        <section style={S.card}>
          <div style={S.totalBar}>
            <span>概算総重量</span>
            <span style={S.totalVal}>{fmt(c.totalWeight, 0)}<span style={S.kg}>kg</span></span>
          </div>
          {c.manualWeight > 0 && (
            <div style={S.breakRow}>自動算出 {fmt(c.autoWeight, 0)}kg ＋ 手動追加 {fmt(c.manualWeight, 0)}kg</div>
          )}
          <div style={{ ...S.cardLabel, marginTop: 16 }}><span style={S.cardDot} /><span style={S.cardTitle}>トラック必要台数目安</span></div>
          <div style={S.truckTabs}>
            {TRUCKS.map((t) => (
              <button key={t.key} style={{ ...S.truckTab, ...(truck === t.key ? S.truckTabOn : {}) }} onClick={() => setTruck(t.key)}>{t.label}</button>
            ))}
          </div>
          <div style={S.truckResult}>
            {truckNeed > 0 ? (<><span style={S.truckNum}>🚚 {truckNeed}</span><span style={S.truckUnit}>台</span><span style={S.truckNote}>（積載率 約{Math.round(loadRate)}%）</span></>)
              : <span style={S.truckNote}>数量がありません</span>}
          </div>
        </section>

        {/* 計算式 */}
        <section style={S.card}>
          <button style={S.collapseHead} onClick={() => setShowFormula((x) => !x)}>
            <span style={S.cardTitle}>📐 計算式</span><span style={S.arrow}>{showFormula ? "▾" : "▸"}</span>
          </button>
          {showFormula && (
            <div style={S.formulaBox}>
              <F t="足場面積" e={`長さ × 高さ = ${fmt(c.len, 1)} × ${fmt(c.h, 1)} = ${fmt(c.area, 1)} ㎡`} />
              <F t="スパン割り（1.8m優先）" e={`1.8m×${c.spanPlan.s18} ＋ 1.2m×${c.spanPlan.s12} ＋ 0.9m×${c.spanPlan.s09} ＋ 0.6m×${c.spanPlan.s06}＝割付${fmt(c.spanUsed, 1)}m／未調整残り${fmt(c.spanRemain, 1)}m／総スパン${c.spans}`} />
              <F t="段数" e={`切上(高さ ÷ 段高) = 切上(${fmt(c.h, 1)} ÷ ${coef.liftHeight}) = ${c.lifts}（踏板段数${c.boardTiers}／手すり段数${c.railTiers}）`} />
              <F t="組立人工" e={`面積 ÷ ${coef.buildDiv}㎡ = ${fmt(c.area, 1)} ÷ ${coef.buildDiv} = ${fmt(c.build, 2)} 人工`} />
              <F t="解体人工" e={`面積 ÷ ${coef.dismantleDiv}㎡ = ${fmt(c.area, 1)} ÷ ${coef.dismantleDiv} = ${fmt(c.dismantle, 2)} 人工`} />
              <F t="合計人工" e={`組立 + 解体 = ${fmt(c.build, 2)} + ${fmt(c.dismantle, 2)} = ${fmt(c.labor, 2)} 人工`} />
              <F t="ジャッキ数（建地本数）" e={`${spec.key.startsWith("M") ? "(スパン数+1)×2" : "スパン数+1"} = ${c.autoJacks}${c.jacksIsManual ? ` → 手動 ${c.jacks}` : ""} 本`} />
              <F t="支柱（高さ方向）" e={`最下段A_27 + A_36優先積上げ、端数は最寄り支柱。各数量 = ジャッキ数${c.jacks} × 1建地本数`} />
              {POST_SIZES.filter((p) => (c.postQty[p.key] || 0) > 0).map((p) => (
                <F key={"post" + p.key} t={`支柱 ${p.label}`} e={`${c.jacks} × ${c.postPlan[p.key]}本 = ${c.postQty[p.key]} 本`} />
              ))}
              <F t={`手すり（${spec.railSide}・規格別×${spec.railN}本）`} e={`各 = スパン数 × 手すり段数${c.railTiers} × ${spec.railN}`} />
              {c.railsBySize.filter((r) => r.qty > 0).map((r) => (
                <F key={"rail" + r.rail} t={`手摺 ${r.rail}（${r.size}m）`} e={`${c.spanPlan[SPAN_SIZES.find(s=>s.m===r.size).key]} × ${c.railTiers} × ${spec.railN} = ${r.qty} 本`} />
              ))}
              <F t={`アンチ（${spec.dual ? "A/B両表示・" : ""}規格別）`} e={c.anchLabelA + (spec.dual ? ` ／ ${c.anchLabelB}` : "")} />
              {c.anchA.filter((a) => a.qty > 0).map((a, i) => (
                <F key={"a" + i} t={`${a.width}アンチ ${a.code}（${a.size}m）${spec.dual ? "（A）" : ""}`} e={`スパン数(${a.size}m) × 踏板段数${c.boardTiers}${a.per > 1 ? ` × ${a.per}` : ""} = ${a.qty} 枚`} />
              ))}
              {spec.dual && c.anchB.filter((a) => a.qty > 0).map((a, i) => (
                <F key={"b" + i} t={`${a.width}アンチ ${a.code}（${a.size}m）（B）`} e={`スパン数(${a.size}m) × 踏板段数${c.boardTiers} × ${a.per} = ${a.qty} 枚`} />
              ))}
              <F t="通常ブレス（筋交 K_18）" e={`切上(段数÷${coef.braceLiftGroup}) × 切上(スパン数÷${coef.braceSpanGroup}) × ${coef.bracePerGroup}${input.stairDeduct && c.braceDeducted ? ` − 控除${c.braceDeducted}` : ""} = ${c.braces} 本`} />
              <F t="階段ブレス（筋交 K_18）" e={`切上(階段基数÷${coef.stairBraceGroup}) × ${coef.stairBracePer} = ${c.stairBraces} 本`} />
              <F t="筋交 K_18 合計" e={`通常 ${c.braces} ＋ 階段 ${c.stairBraces} = ${c.bracesTotal} 本`} />
              {input.wallTie && <F t="壁つなぎ" e={`切上(段数÷${coef.wallLiftGroup}) × 切上(スパン数÷${coef.wallSpanGroup}) = ${c.wallTies} 個`} />}
              {input.toeboard && <F t="巾木 4m（内側）" e={`切上((長さ−2m巾木分) ÷ 4) × 踏板段数 = 切上((${fmt(c.len,1)}−${c.toe2m * 2}) ÷ 4) × ${c.toeTiers} = ${c.toe4m} 枚`} />}
              {input.toeboard && c.toe2mTotal > 0 && <F t="巾木 2m（内側）" e={`手動 ${c.toe2m}枚 × 踏板段数 ${c.toeTiers} = ${c.toe2mTotal} 枚`} />}
              {input.sheet && <F t="シート" e={`スパン数 × 切上(高さ÷${coef.sheetHeight}) = ${c.spans} × ${ceil(c.h / (num(coef.sheetHeight, 5.1) || 5.1))} = ${c.sheets} 枚`} />}
            </div>
          )}
        </section>

        {/* 係数編集 */}
        <section style={S.card}>
          <button style={S.collapseHead} onClick={() => setShowCoef((x) => !x)}>
            <span style={S.cardTitle}>⚙ 係数を変更</span><span style={S.arrow}>{showCoef ? "▾" : "▸"}</span>
          </button>
          {showCoef && (
            <div style={{ ...S.fieldCol, marginTop: 12 }}>
              <div style={S.row2}><NumF label="段高" unit="m" v={coef.liftHeight} on={(v) => setC("liftHeight", v)} /><div style={S.field} /></div>
              <div style={S.row2}><NumF label="組立人工 1人工あたり" unit="㎡" v={coef.buildDiv} on={(v) => setC("buildDiv", v)} /><NumF label="解体人工 1人工あたり" unit="㎡" v={coef.dismantleDiv} on={(v) => setC("dismantleDiv", v)} /></div>
              <NumF label="シート1枚あたり高さ" unit="m" v={coef.sheetHeight} on={(v) => setC("sheetHeight", v)} />
              <div style={S.sectionMini}>ブレス</div>
              <div style={S.row2}><NumF label="何段ごと" unit="段" v={coef.braceLiftGroup} on={(v) => setC("braceLiftGroup", v)} /><NumF label="何スパンごと" unit="" v={coef.braceSpanGroup} on={(v) => setC("braceSpanGroup", v)} /></div>
              <NumF label="1グループ本数" unit="本" v={coef.bracePerGroup} on={(v) => setC("bracePerGroup", v)} />
              <div style={S.sectionMini}>階段ブレス</div>
              <div style={S.row2}><NumF label="階段何基ごと" unit="基" v={coef.stairBraceGroup} on={(v) => setC("stairBraceGroup", v)} /><NumF label="1グループ本数" unit="本" v={coef.stairBracePer} on={(v) => setC("stairBracePer", v)} /></div>
              <div style={S.sectionMini}>壁つなぎ</div>
              <div style={S.row2}><NumF label="何段ごと" unit="段" v={coef.wallLiftGroup} on={(v) => setC("wallLiftGroup", v)} /><NumF label="何スパンごと" unit="" v={coef.wallSpanGroup} on={(v) => setC("wallSpanGroup", v)} /></div>
              <button style={S.btnGhost} onClick={() => { setCoef(DEFAULT_COEF); flash("係数を初期値に戻しました"); }}>初期値に戻す</button>
            </div>
          )}
        </section>

        {/* 重量マスター（自動算出部材） */}
        <section style={S.card}>
          <button style={S.collapseHead} onClick={() => setShowWeights((x) => !x)}>
            <span style={S.cardTitle}>⚙ 自動算出部材の重量</span><span style={S.arrow}>{showWeights ? "▾" : "▸"}</span>
          </button>
          {showWeights && (
            <div style={{ marginTop: 12 }}>
              {WEIGHT_GROUPS.map((g) => (
                <div key={g.title} style={{ marginBottom: 14 }}>
                  <div style={S.sectionMini}>{g.title}</div>
                  {g.keys.map((k) => (
                    <div key={k} style={S.weightRow}>
                      <span style={S.weightLabel}>{k}</span>
                      <div style={S.weightInputWrap}>
                        <input style={S.weightInput} type="number" inputMode="decimal" value={weights[k]}
                          onChange={(e) => setWeights((w) => ({ ...w, [k]: e.target.value === "" ? 0 : parseFloat(e.target.value) }))} />
                        <span style={S.weightUnit}>kg</span>
                      </div>
                    </div>
                  ))}
                </div>
              ))}
              <button style={{ ...S.btnGhost, width: "100%" }} onClick={() => { setWeights(DEFAULT_WEIGHTS); flash("重量を初期値に戻しました"); }}>初期値に戻す</button>
            </div>
          )}
        </section>

        {/* CSV */}
        <section style={S.card}>
          <button style={S.btnPrimary} onClick={copyCSV} className="btn">📋 CSVコピー</button>
        </section>
      </main>

      <footer style={S.footer}>© サンワ工業株式会社 ／ 概算数量は目安です。正式な数量・構造は別途ご確認ください。</footer>
      {toast && <div style={S.toast}>{toast}</div>}
    </div>
  );
}

function anchHintText(spec) {
  if (spec.dual) return "A:500×1 ／ B:250×2（両表示・規格別）";
  if (spec.anchWidth === "400+250") return "400アンチ×2 ＋ 250アンチ×1（規格別）";
  const mul = spec.anchPerSpan || 1;
  return `${spec.anchWidth}アンチ${mul > 1 ? `×${mul}` : ""}（規格別）`;
}

/* ───────── 小コンポーネント ───────── */
const CardLabel = ({ t }) => (<div style={S.cardLabel}><span style={S.cardDot} /><span style={S.cardTitle}>{t}</span></div>);
const Text = ({ label, v, on, ph }) => (
  <div style={S.field}><label style={S.label}>{label}</label>
    <input style={S.input} value={v} placeholder={ph} onChange={(e) => on(e.target.value)} /></div>
);
const NumF = ({ label, unit, v, on, ph }) => (
  <div style={S.field}><label style={S.label}>{label}</label>
    <div style={S.inputWrap}>
      <input style={S.input} type="number" inputMode="decimal" min="0" value={v} placeholder={ph || "0"}
        onChange={(e) => on(e.target.value)} onFocus={(e) => e.target.select()} />
      {unit && <span style={S.unit}>{unit}</span>}
    </div></div>
);
const Toggle = ({ label, on, set }) => (
  <button style={{ ...S.toggle, ...(on ? S.toggleOn : {}) }} onClick={() => set(!on)}>
    <span style={{ ...S.toggleDot, ...(on ? S.toggleDotOn : {}) }}>{on ? "✓" : ""}</span>{label}</button>
);
const Hero = ({ label, value, unit, accent }) => (
  <div style={{ ...S.hero, ...(accent ? S.heroAccent : {}) }}>
    <div style={S.heroLabel}>{label}</div>
    <div style={{ ...S.heroValue, color: accent ? ORANGE : NAVY }}>
      {typeof value === "number" ? value.toLocaleString("ja-JP") : value}<span style={S.heroUnit}>{unit}</span></div></div>
);
const F = ({ t, e }) => (<div style={S.formulaRow}><div style={S.formulaTitle}>{t}</div><div style={S.formulaExpr}>{e}</div></div>);

/* ───────── スタイル ───────── */
const S = {
  page: { minHeight: "100vh", background: PAPER, color: "#1a1a1a", fontFamily: "'Hiragino Kaku Gothic ProN','Yu Gothic',YuGothic,Meiryo,sans-serif" },
  header: { position: "relative", background: NAVY, color: "#fff", overflow: "hidden" },
  stripe: { position: "absolute", top: 0, left: 0, right: 0, height: 6, background: "repeating-linear-gradient(45deg,#ff7a1a 0 14px,#1a1a1a 14px 28px)" },
  headWrap: { maxWidth: 720, margin: "0 auto", padding: "20px 16px 16px", display: "flex", alignItems: "center", gap: 12 },
  mark: { flexShrink: 0, width: 46, height: 46, borderRadius: 9, background: ORANGE, color: NAVY, fontWeight: 800, fontSize: 12, display: "flex", alignItems: "center", justifyContent: "center", boxShadow: "0 4px 12px rgba(0,0,0,.25)" },
  company: { fontSize: 11, opacity: 0.8, letterSpacing: 1 },
  h1: { fontSize: 18, fontWeight: 800, margin: 0, lineHeight: 1.2 },
  sub: { fontSize: 12, opacity: 0.75, marginTop: 2 },
  disclaimer: { background: "#fff5e6", borderBottom: "1px solid #f0d9b0", color: "#8a5a00", fontSize: 12.5, lineHeight: 1.6, padding: "9px 16px", textAlign: "center" },

  main: { maxWidth: 720, margin: "0 auto", padding: "14px 12px 0", display: "flex", flexDirection: "column", gap: 13 },
  card: { background: "#fff", borderRadius: 14, padding: "15px 14px 17px", border: "1px solid #e7e2d6", boxShadow: "0 1px 10px rgba(16,54,42,.05)" },
  cardLabel: { display: "flex", alignItems: "center", gap: 8, marginBottom: 14 },
  cardDot: { width: 8, height: 8, borderRadius: 2, background: ORANGE, transform: "rotate(45deg)" },
  cardTitle: { fontSize: 15.5, fontWeight: 800, color: NAVY, display: "flex", alignItems: "center", gap: 8 },
  badge: { fontSize: 11, fontWeight: 800, color: "#fff", background: ORANGE, borderRadius: 999, padding: "1px 8px" },

  fieldCol: { display: "flex", flexDirection: "column", gap: 12 },
  row2: { display: "flex", gap: 10 },
  field: { display: "flex", flexDirection: "column", gap: 5, flex: 1, minWidth: 0 },
  label: { fontSize: 12.5, fontWeight: 700, color: "#555" },
  inputWrap: { position: "relative", display: "flex", alignItems: "center" },
  input: { width: "100%", boxSizing: "border-box", padding: "11px 40px 11px 12px", fontSize: 16, border: "1.5px solid #d6cfbf", borderRadius: 9, background: "#fcfbf7", outline: "none", fontFamily: "inherit" },
  unit: { position: "absolute", right: 11, fontSize: 12, fontWeight: 700, color: "#999", pointerEvents: "none" },

  specGrid: { display: "flex", flexWrap: "wrap", gap: 7 },
  specBtn: { flex: "1 1 30%", minWidth: 96, padding: "9px 5px", border: "1.5px solid #d6cfbf", borderRadius: 10, background: "#fff", cursor: "pointer", fontFamily: "inherit", textAlign: "center" },
  specBtnOn: { borderColor: NAVY, background: "#eef4f1" },
  specMain: { fontSize: 12.5, fontWeight: 800, color: NAVY },
  specSub: { fontSize: 10, color: "#999", marginTop: 2 },
  anchHint: { marginTop: 8, fontSize: 11.5, color: "#a07a2a", background: "#fdf6e6", borderRadius: 8, padding: "7px 10px" },

  switchGrid: { display: "flex", flexWrap: "wrap", gap: 8 },
  toggle: { display: "flex", alignItems: "center", gap: 7, padding: "9px 13px", fontSize: 13.5, fontWeight: 700, border: "1.5px solid #d6cfbf", borderRadius: 999, background: "#fff", color: "#777", cursor: "pointer", fontFamily: "inherit" },
  toggleOn: { borderColor: NAVY, color: NAVY, background: "#eef4f1" },
  toggleDot: { width: 18, height: 18, borderRadius: "50%", border: "1.5px solid #ccc", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 11, color: "#fff" },
  toggleDotOn: { background: ORANGE, borderColor: ORANGE },
  miniNote: { fontSize: 11.5, color: "#a07a2a", background: "#fdf6e6", borderRadius: 8, padding: "8px 10px", margin: 0, lineHeight: 1.5 },
  note: { fontSize: 12.5, color: "#888", margin: "0 0 10px", lineHeight: 1.6 },

  resultSite: { fontSize: 15.5, fontWeight: 800, color: NAVY, marginBottom: 12, display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" },
  specTag: { fontSize: 11, fontWeight: 700, color: "#fff", background: ORANGE, borderRadius: 6, padding: "2px 8px" },
  heroGrid: { display: "flex", gap: 8, marginBottom: 8 },
  hero: { flex: 1, background: "#f7f5ef", borderRadius: 11, padding: "12px 6px", textAlign: "center", minWidth: 0 },
  heroAccent: { background: "#fff6ec" },
  heroLabel: { fontSize: 11.5, fontWeight: 700, color: "#888", marginBottom: 5 },
  heroValue: { fontSize: 22, fontWeight: 800, lineHeight: 1, wordBreak: "break-all" },
  heroUnit: { fontSize: 12, marginLeft: 2, color: "#888" },

  qtyTable: {},
  qHead: { display: "flex", alignItems: "center", padding: "6px 2px", borderBottom: "1px solid #eee7da", fontSize: 11, fontWeight: 700, color: "#999" },

  // ジャッキ
  jackRow: { display: "flex", gap: 12, alignItems: "flex-end" },
  jackAuto: { flex: 1, background: "#f7f5ef", borderRadius: 10, padding: "10px 12px", minWidth: 0 },
  jackAutoLabel: { fontSize: 11, fontWeight: 700, color: "#888" },
  jackAutoVal: { fontSize: 20, fontWeight: 800, color: NAVY, lineHeight: 1.2 },
  jackAutoNote: { fontSize: 10.5, color: "#a07a2a", marginTop: 2 },
  usingLine: { marginTop: 12, fontSize: 13.5, color: "#333", display: "flex", alignItems: "center", gap: 8 },
  manualTag: { fontSize: 10.5, fontWeight: 700, color: "#fff", background: ORANGE, borderRadius: 5, padding: "1px 7px" },

  // 支柱
  postSummary: { display: "flex", justifyContent: "space-between", fontSize: 12.5, fontWeight: 700, color: NAVY, background: "#f7f5ef", borderRadius: 8, padding: "8px 11px", marginBottom: 10, flexWrap: "wrap", gap: 4 },
  postTable: {},
  postHead: { display: "flex", alignItems: "center", padding: "5px 2px", borderBottom: "1px solid #eee7da", fontSize: 11, fontWeight: 700, color: "#999" },
  postRow: { display: "flex", alignItems: "center", padding: "7px 4px", borderBottom: "1px solid #f3efe5", borderRadius: 6 },
  postName: { flex: 1, fontSize: 14, fontWeight: 800, color: "#222", minWidth: 0 },
  postM: { fontSize: 11, color: "#999", fontWeight: 600, marginLeft: 6 },
  postPerWrap: { width: 90, display: "flex", alignItems: "center", justifyContent: "center", gap: 4 },
  stepBtn: { width: 26, height: 30, border: "1.5px solid #d6cfbf", background: "#fff", borderRadius: 7, fontSize: 16, fontWeight: 800, color: NAVY, cursor: "pointer", fontFamily: "inherit", lineHeight: 1, padding: 0 },
  postPerInput: { width: 34, boxSizing: "border-box", padding: "6px 2px", fontSize: 16, textAlign: "center", border: "1.5px solid #d6cfbf", borderRadius: 7, background: "#fff", outline: "none", fontFamily: "inherit", fontWeight: 800 },
  postQty: { width: 70, textAlign: "right", fontSize: 15, fontWeight: 800, color: NAVY },
  postQtyU: { fontSize: 11, color: "#999", marginLeft: 2, fontWeight: 700 },
  spanTotalRow: { display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 10, padding: "9px 12px", background: "#eef4f1", borderRadius: 9, fontSize: 13.5, fontWeight: 800, color: NAVY },
  spanTotalVal: { fontSize: 19, fontWeight: 800, color: ORANGE },
  tierGrid: { display: "flex", gap: 8 },
  tierBox: { flex: 1, background: "#f7f5ef", borderRadius: 11, padding: "12px 6px", textAlign: "center", minWidth: 0 },
  tierBoxAccent: { background: "#fff6ec" },
  tierLabel: { fontSize: 11.5, fontWeight: 700, color: "#888", marginBottom: 5 },
  tierVal: { fontSize: 22, fontWeight: 800, lineHeight: 1, color: NAVY },
  tierU: { fontSize: 12, marginLeft: 2, color: "#888" },
  tierFormula: { marginTop: 12, fontSize: 12.5, color: "#555", background: "#f7f5ef", borderRadius: 9, padding: "10px 12px", borderLeft: `3px solid ${ORANGE}`, lineHeight: 1.6, fontFamily: "'SFMono-Regular',Consolas,monospace", wordBreak: "break-all" },
  tierFormulaTitle: { display: "block", fontWeight: 800, color: NAVY, marginBottom: 3, fontFamily: "inherit" },

  // 巾木
  staticBox: { padding: "11px 12px", fontSize: 14, fontWeight: 700, color: "#666", background: "#f3efe5", borderRadius: 9, border: "1.5px solid #e7e2d6" },
  toeResult: { display: "flex", gap: 10, marginTop: 12 },
  toeBox: { flex: 1, background: "#fff6ec", borderRadius: 11, padding: "12px 8px", textAlign: "center" },
  toeLabel: { fontSize: 12, fontWeight: 700, color: "#888", marginBottom: 4 },
  toeVal: { fontSize: 24, fontWeight: 800, color: ORANGE, lineHeight: 1 },
  toeU: { fontSize: 13, marginLeft: 2, color: "#999" },
  toeNote: { fontSize: 11, color: "#999", marginTop: 4 },

  rowQ: { display: "flex", alignItems: "center", padding: "10px 2px", borderBottom: "1px solid #f1ede3" },
  rowSub: { background: "#fafaf6", padding: "6px 2px" },
  rowQName: { flex: 1, fontSize: 13.5, fontWeight: 700, color: "#333", minWidth: 0 },
  rowQVal: { width: 80, textAlign: "right", fontSize: 15.5, fontWeight: 800, color: NAVY },
  rowQUnit: { fontSize: 11.5, color: "#999", marginLeft: 2, fontWeight: 700 },
  rowQW: { width: 84, textAlign: "right", fontSize: 12, color: "#999", fontWeight: 600 },

  searchWrap: { position: "relative", display: "flex", alignItems: "center", marginBottom: 10 },
  searchIcon: { position: "absolute", left: 12, fontSize: 13, opacity: 0.5 },
  search: { width: "100%", boxSizing: "border-box", padding: "10px 34px", fontSize: 16, border: "1.5px solid #d6cfbf", borderRadius: 9, background: "#fcfbf7", outline: "none", fontFamily: "inherit" },
  clearS: { position: "absolute", right: 10, border: "none", background: "#ddd6c8", color: "#666", width: 22, height: 22, borderRadius: "50%", cursor: "pointer", fontSize: 11 },
  chips: { display: "flex", gap: 6, overflowX: "auto", paddingBottom: 4 },
  chip: { flexShrink: 0, padding: "6px 11px", fontSize: 12.5, fontWeight: 700, border: "1.5px solid #d6cfbf", borderRadius: 999, background: "#fff", color: "#777", cursor: "pointer", fontFamily: "inherit", whiteSpace: "nowrap" },
  chipOn: { background: NAVY, color: "#fff", borderColor: NAVY },
  partCat: { fontSize: 12, fontWeight: 800, color: ORANGE, padding: "4px 0", borderBottom: "1px solid #eee7da", marginBottom: 2 },
  partRow: { display: "flex", alignItems: "center", gap: 7, padding: "8px 4px", borderBottom: "1px solid #f3efe5", borderRadius: 6 },
  partName: { fontSize: 13.5, fontWeight: 700, color: "#222" },
  partSpec: { fontSize: 11.5, color: "#999", display: "flex", gap: 6, alignItems: "center" },
  noW: { fontSize: 9.5, color: "#b08400", background: "#fdf3d6", border: "1px solid #ecd99a", borderRadius: 4, padding: "0 4px", fontWeight: 700 },
  partW: { width: 48, textAlign: "center", fontSize: 12, color: "#777", flexShrink: 0 },
  partQty: { width: 56, flexShrink: 0, boxSizing: "border-box", padding: "7px 4px", fontSize: 16, textAlign: "center", border: "1.5px solid #d6cfbf", borderRadius: 7, background: "#fff", outline: "none", fontFamily: "inherit", fontWeight: 700 },
  partSum: { width: 58, textAlign: "right", fontSize: 12, fontWeight: 800, color: NAVY, flexShrink: 0 },

  totalBar: { display: "flex", alignItems: "center", justifyContent: "space-between", padding: "12px 14px", background: NAVY, borderRadius: 10, color: "#fff", fontSize: 14, fontWeight: 700 },
  totalVal: { fontSize: 24, fontWeight: 800 },
  kg: { fontSize: 13, marginLeft: 3, opacity: 0.8 },
  breakRow: { marginTop: 8, fontSize: 12, color: "#888", textAlign: "right" },

  truckTabs: { display: "flex", gap: 8, marginBottom: 12 },
  truckTab: { flex: 1, padding: "9px", fontSize: 13.5, fontWeight: 700, border: "1.5px solid #d6cfbf", borderRadius: 8, background: "#fff", color: "#777", cursor: "pointer", fontFamily: "inherit" },
  truckTabOn: { background: ORANGE, borderColor: ORANGE, color: "#fff" },
  truckResult: { display: "flex", alignItems: "baseline", gap: 6, flexWrap: "wrap" },
  truckNum: { fontSize: 25, fontWeight: 800, color: ORANGE },
  truckUnit: { fontSize: 14, fontWeight: 700, color: ORANGE },
  truckNote: { fontSize: 13, color: "#888" },

  collapseHead: { width: "100%", display: "flex", alignItems: "center", justifyContent: "space-between", background: "none", border: "none", cursor: "pointer", fontFamily: "inherit", padding: 0 },
  arrow: { fontSize: 12, color: ORANGE },
  formulaBox: { marginTop: 14, display: "flex", flexDirection: "column", gap: 8 },
  formulaRow: { background: "#f7f5ef", borderRadius: 9, padding: "9px 11px", borderLeft: `3px solid ${ORANGE}` },
  formulaTitle: { fontSize: 12.5, fontWeight: 800, color: NAVY, marginBottom: 2 },
  formulaExpr: { fontSize: 12.5, color: "#555", fontFamily: "'SFMono-Regular',Consolas,monospace", lineHeight: 1.5, wordBreak: "break-all" },

  sectionMini: { fontSize: 12, fontWeight: 800, color: ORANGE, marginTop: 4 },
  weightRow: { display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10 },
  weightLabel: { fontSize: 13.5, color: "#444", fontWeight: 600 },
  weightInputWrap: { position: "relative", display: "flex", alignItems: "center", width: 120 },
  weightInput: { width: "100%", boxSizing: "border-box", padding: "9px 34px 9px 10px", fontSize: 16, textAlign: "right", border: "1.5px solid #d6cfbf", borderRadius: 8, background: "#fcfbf7", outline: "none", fontFamily: "inherit", fontWeight: 700 },
  weightUnit: { position: "absolute", right: 10, fontSize: 11, color: "#999", fontWeight: 700 },

  btnPrimary: { width: "100%", padding: "14px", fontSize: 15, fontWeight: 800, color: "#fff", background: NAVY, border: "none", borderRadius: 10, cursor: "pointer", fontFamily: "inherit" },
  btnGhost: { padding: "12px", fontSize: 14, fontWeight: 800, color: "#666", background: "#fff", border: "1.5px solid #d6cfbf", borderRadius: 10, cursor: "pointer", fontFamily: "inherit" },

  footer: { maxWidth: 720, margin: "20px auto 0", padding: "14px 16px 34px", fontSize: 11, color: "#aaa", textAlign: "center", lineHeight: 1.6 },
  toast: { position: "fixed", bottom: 30, left: "50%", transform: "translateX(-50%)", background: "rgba(26,26,26,.92)", color: "#fff", padding: "11px 22px", borderRadius: 999, fontSize: 13.5, fontWeight: 700, zIndex: 50, boxShadow: "0 6px 20px rgba(0,0,0,.3)" },
};

const css = `
  * { -webkit-tap-highlight-color: transparent; }
  input[type=number]::-webkit-inner-spin-button,
  input[type=number]::-webkit-outer-spin-button { -webkit-appearance:none; margin:0; }
  input[type=number] { -moz-appearance:textfield; }
  input:focus { border-color:${ORANGE} !important; background:#fff !important; }
  .btn:active { transform: scale(.985); }
  .chips::-webkit-scrollbar { height:0; }
`;
