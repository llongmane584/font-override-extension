# Font Override JP — Chrome Extension

Windows環境で `system-ui` / `Yu Gothic UI` 等の見づらいフォントを **Noto Sans JP** で自動的に上書きするChrome拡張機能。

## インストール

1. [Google Fonts](https://fonts.google.com/noto/specimen/Noto+Sans+JP) から **Noto Sans JP** をダウンロードしてシステムにインストール
2. Chrome で `chrome://extensions/` を開く
3. 右上の「デベロッパーモード」をONにする
4. 「パッケージ化されていない拡張機能を読み込む」をクリック
5. この `font-override-extension` フォルダを選択

## 機能

### 2つのモード

| モード | 動作 |
|--------|------|
| **Smart**（デフォルト） | `system-ui`, `Yu Gothic`, `Meiryo`, `sans-serif` 等の対象フォントのみ上書き。アイコンフォントやmonospaceフォントは保持。 |
| **Force** | CSS `!important` で全要素のフォントを強制上書き（アイコンフォント系クラスは除外を試みる）。 |

### サイトごとの設定

ツールバーのアイコンをクリックして、サイトごとに以下を設定可能：

- **グローバル設定に従う** — 全体設定に連動
- **常に有効（Force）** — そのサイトだけForceモードで上書き
- **無効** — そのサイトでは上書きしない

### ウェイト補正

フォントの太さを相対的に調整できます（-300 〜 +300、50刻み）。

元の `font-weight` に対してオフセット値を加算するため、見出し（700）と本文（400）の太さの差は維持されます。`system-ui` → Noto Sans JP への切り替えで文字が細く感じる場合に `+50` 〜 `+100` 程度を設定すると効果的です。

ポップアップのスライダーで調整でき、プレビューで 400（通常）と 700（太字）の変化を確認できます。

## ファイル構成

```
font-override-extension/
├── manifest.json    … 拡張機能定義 (Manifest V3)
├── content.js       … フォント上書きロジック
├── background.js    … バッジ管理
├── popup.html       … ポップアップUI
├── popup.js         … ポップアップロジック
├── icon48.png       … アイコン
├── icon128.png      … アイコン
└── README.md
```

## カスタマイズ

### 上書きフォントの変更

`content.js` の先頭にある `DEFAULT_FONT` を変更：

```js
const DEFAULT_FONT = '"BIZ UDPGothic"'; // 例: BIZ UDPゴシック
```

### 上書き対象フォントの追加・削除

`content.js` の `OVERRIDE_TARGETS` 配列を編集。値は小文字で記載。

### 保護パターンの追加

アイコンフォント等で上書きされてしまう場合は `PRESERVE_PATTERNS` に正規表現を追加。

## 注意

- 設定変更後はページのリロードが必要です
- Smartモードでは `getComputedStyle` を使って判定するため、SPA等で動的にスタイルが変わるサイトでは一部取りこぼしが発生する可能性があります。その場合はForceモードを使用してください
- Noto Sans JP がシステムにインストールされていない場合、ブラウザの既定 sans-serif にフォールバックします
