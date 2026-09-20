# CLAUDE.md

## Project Overview

Windows で `system-ui` / `Yu Gothic UI` などの見づらい日本語フォントを Noto Sans JP で上書きする
Chrome 拡張機能 (Manifest V3)。ビルド工程は無く、リポジトリをそのまま
「パッケージ化されていない拡張機能」として読み込む。

## Branching and Releases

- `dev` が統合ブランチ。機能追加も修正も PR は `dev` 宛てに出す (GitHub の既定ブランチも `dev`)。
- `main` はリリース済みの状態そのもの。`dev` を `main` へ昇格させることがリリースで、
  バージョンはそのときにだけ上げる。
- リリース (version++ / タグ / GitHub Release / `CHANGELOG.md`) は
  [`docs/RELEASE.md`](docs/RELEASE.md) の手順で行う。リリース作業では issue もブランチも立てない。
- バージョンの置き場所は `manifest.json` の `"version"` だけ。`CHANGELOG.md` の先頭の版との一致は
  `test/version.test.js` が見張る。

## Testing

- `pnpm test` (`node --test`)。CI も Git フックも無いので、変更のたびに手で走らせる。
