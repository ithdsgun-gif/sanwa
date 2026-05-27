# 足場 数量・人工数 算出ツール（サンワ工業）

足場の長さ・高さ・仕様を入力すると、スパン割り・段数・人工数・部材数量・概算重量を即時計算する React Web アプリです。ログイン・データ保存なし。URL を開くだけで社員が使えます。スマホ対応。

## 機能

- 入力：足場長さ／足場高さ／足場仕様／階段基数／踏板段数／手すり段数／シート・巾木・壁つなぎの有無
- 計算：スパン割り（1.8 / 1.2 / 0.9 / 0.6m）、足場段数（高さ÷1.8 切上）、組立人工（面積÷35）、解体人工（面積÷60）、筋交 K_18、アンチ規格別、手すり規格別、支柱数量、巾木4m/2m、シート（5.1m）、壁つなぎ（2段2スパンに1か所）
- 出力：数量表／人工表／計算式表示／CSV コピー
- 係数・部材重量はアプリ内で変更可能

## ローカルで動かす

Node.js 18 以上が必要です。

```bash
npm install
npm run dev
```

ブラウザで表示される `http://localhost:5173` を開きます。

本番ビルドを確認する場合：

```bash
npm run build
npm run preview
```

## Vercel で公開する手順

### 方法A：GitHub 経由（おすすめ・更新が楽）

1. このフォルダを GitHub にリポジトリとして push する
   ```bash
   git init
   git add .
   git commit -m "init scaffold tool"
   git branch -M main
   git remote add origin https://github.com/＜あなたのユーザー名＞/scaffold-tool.git
   git push -u origin main
   ```
2. https://vercel.com にログイン（GitHub アカウントで可）
3. 「Add New… → Project」→ 先ほどのリポジトリを Import
4. Framework Preset が **Vite** になっていることを確認（自動検出されます）
   - Build Command: `npm run build`
   - Output Directory: `dist`
   - ※通常は自動設定なので変更不要
5. 「Deploy」を押す
6. 数十秒で `https://＜プロジェクト名＞.vercel.app` という URL が発行されます。これを社員に共有すれば完了です。

以後、GitHub に push するたびに自動で再デプロイされます。

### 方法B：Vercel CLI（GitHub を使わない）

```bash
npm install -g vercel
vercel
```

質問に答えていくと（基本そのまま Enter で OK）、本番 URL が発行されます。
`vercel --prod` で本番反映できます。

## ファイル構成

```
scaffold-app/
├── index.html          … エントリ HTML（モバイル viewport 設定済み）
├── package.json        … 依存関係とスクリプト
├── vite.config.js      … Vite 設定（React プラグイン）
├── vercel.json         … Vercel 設定（framework: vite）
├── .gitignore
├── README.md
└── src/
    ├── main.jsx        … React の起動ポイント
    ├── App.jsx         … アプリ本体（全計算ロジック・UI）
    └── index.css       … リセット CSS
```

## 注意

本ツールは正式な構造計算ではなく、見積・段取り用の概算数量です。実施工は資材表・構造計算で別途ご確認ください。
