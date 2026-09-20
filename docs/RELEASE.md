# リリース手順

version++ / タグ / GitHub Release / 更新履歴 (`CHANGELOG.md`) を 1 回のリリースでまとめて進めるための手順書。
上から順に実行する。**中断条件が書いてある箇所で条件を満たさなかったら、その場で止めて原因を潰す。**
先へ進めてはいけない。

スクリプトは用意していない。手順が数回まわって固まるまでは、文章のまま運用する。

## ブランチ運用

- `dev` が統合ブランチ。機能追加も修正も PR は `dev` 宛てに出してマージする
  (GitHub の既定ブランチも `dev`。`gh pr create` はそのまま `dev` 宛てになる)。
- `main` は**リリース済みの状態そのもの**。利用者は `main` (またはタグ) を
  「パッケージ化されていない拡張機能」として読み込む。自動デプロイは無い。
- **リリースとは `dev` を `main` へ昇格させること**。バージョンを上げる区切りはここにしかない。
- リリース作業では issue もブランチも立てない。この手順書自体が承認済みの計画なので、
  `dev` に直接コミットして昇格する。

## バージョン番号の決め方

`X.Y.Z`。置き場所は `manifest.json` の `"version"` だけ (`package.json` には持たない)。
Chrome の制約で、使えるのは数字とドットだけ。`-beta` のような接尾辞は付けられない。

`§0` で集めた変更一覧を見て決める。

| | 上げ方 | 例 |
|---|---|---|
| 保存済みの設定が引き継がれないなど、利用者に設定し直しを強いる変更がある | major | `1.2.3` → `2.0.0` |
| 目に見える機能追加・UI 変更が **1 つでもある** | minor | `1.0.0` → `1.1.0` |
| バグ修正・文言・内部整理**だけ** | patch | `1.1.0` → `1.1.1` |

minor と patch で迷ったら minor。

---

## §0 前提を揃える

```bash
git switch dev && git pull
git log $(git describe --tags --abbrev=0)..dev --oneline
```

出てきたコミットが今回のリリースの中身。ここからバージョンを決め、利用者向けのノートを起草する。

`git describe --tags --abbrev=0` はタグを引けないと exit 128 になり、
`$(...)` が空になった結果 `git log ..dev` が **何も出さずに成功する**。無言の空振りなので、
コミットが 1 件も出なかったら「変更が無い」ではなく「タグが引けていない」を先に疑う
(`git fetch --tags` し忘れなど)。

## §1 2 ファイルを更新する

リリースが触るのはこの 2 つだけ。

| ファイル | 何を |
|---|---|
| `manifest.json` | `"version"` を新しい番号にする |
| `CHANGELOG.md` | 既存の版の**上**に `## X.Y.Z - YYYY-MM-DD` の節を 1 つ差し込み、ノートを箇条書きで書く |

守ること:

- **見出しは `## X.Y.Z - YYYY-MM-DD` の形から崩さない。** `test/version.test.js` がこの形で読み、
  外れた `## ` 行があれば落ちる。
- **日付は `main` へ昇格する日**。ノートを起草した日ではない。`Get-Date -Format yyyy-MM-dd` で取る。
  昇格が翌日にずれ込んだら日付を書き直す。
- **文面はコミット件名の羅列にしない。** 利用者に何が変わったかを、利用者の言葉で書く。
- **1 変更 = 1 行。目安の行数は持たない。** 行数は変更の件数の結果でしかない。
  目標を決めると、そこへ届かせるために中身が水増しされる。
- **1 行に収まらない補足は書かない。** 2 行目に切り出せば 2 件目の変更に見えるし、
  同じ行に押し込むのも違う。実装の都合など、利用者が読んで得るものが無い文字列は消す。
- **`Unreleased` の節を作ってはいけない。** 見出しの形から外れるうえ、
  `test/version.test.js` が `manifest.json` の `"version"` と先頭の版の一致を要求するので、
  必ず落ちる。ノートを小出しに溜める運用は取れない設計になっている —— リリース時にまとめて書く。

## §2 関門 (通らなければ中断する)

```bash
npm test
```

`test/version.test.js` が本命。`manifest.json` と `CHANGELOG.md` の版の一致、見出しの形、
ISO 8601 の日付、新しい順の並び、各版にノートがあることを見張る。
**なお `npm test` は CI でも Git フックでも走らない。ここで人が走らせるのが唯一の実行機会。**

続けて、読み込んでいる拡張機能で実際に確かめる。**`dev` の作業ツリーそのもの**を読み込むこと
(`--ff-only` で昇格するので、ここで見たものがそのまま `main` になる):

1. `chrome://extensions/` で本拡張の再読み込みボタンを押す
2. 拡張機能のカードに「エラー」ボタンが出ていないこと
3. 「Service Worker」のリンクから開く DevTools のコンソールに、**エラーも警告も 1 本も無い**こと
4. ポップアップを開き、右上のバージョン表記が新しい番号になっていること。
   ポップアップを右クリック →「検証」で、ポップアップのコンソールにも何も出ていないこと
5. 日本語のページを開き、今回の変更点が意図どおりに動くこと。ページのコンソールに
   拡張機能由来のエラーも警告も無いこと

`playwright-cli` を使うなら `-s=<名前>` で別セッションを切る —— 既定セッションは
人が開いているブラウザに繋がる。

## §3 `dev` にコミットして push

```bash
git commit -am "chore(release): v1.1.0"
git push origin dev
```

コミット本文には §1 で書いたノートをそのまま入れておくと、§6 で使い回せる。

## §4 `main` へ昇格

```bash
git switch main && git pull
git merge --ff-only dev
git push origin main
```

`--ff-only` が安全装置。**失敗したら中断する。** それは `main` に `dev` が持っていない
コミットがある証拠 —— 取り込み忘れた hotfix (§7) がほぼ確実に原因。
`git switch dev && git merge main` で追従させ、**§2 からやり直す**。
`--ff-only` を外して回避してはいけない。

`dev → main` を squash merge してはいけない。`dev` が恒久的に分岐し、以後の昇格が全部壊れる。

## §5 タグを打つ

`main` が §2 で確かめたコミットと同じであることを確かめてから打つ。

```bash
git rev-parse main dev   # 2 行が同じ値であること
git tag -a v1.1.0 -m "v1.1.0"
git push origin v1.1.0
```

## §6 GitHub Release

```bash
mkdir -p tmp/release/v1.1.0
# tmp/release/v1.1.0/notes.md を書く
gh release create v1.1.0 --title "v1.1.0" --notes-file tmp/release/v1.1.0/notes.md
```

GitHub に送るテキストは `./tmp/` に一時ファイルを作って `--notes-file` で渡す。
本文は §1 のノートをそのまま流用し、compare リンクを添える:

```markdown
## 変更点

- ...

**Full Changelog**: https://github.com/llongmane584/font-override-extension/compare/v1.0.0...v1.1.0
```

compare リンクの左側は**前回のタグ**。

配布用の zip は作らない。GitHub が Release に自動で付ける Source code (zip) を展開すれば、
そのまま読み込める (`vendor/` は追跡しているので、`node_modules` は実行時に要らない)。

## §7 hotfix

原則として hotfix も `dev` を通す。どうしても直接 `main` に入れた場合は、
**その場で** `dev` を追従させる:

```bash
git switch dev && git merge main
```

これを飛ばすと次のリリースの `--ff-only` (§4) が落ちる。
利用者に見える修正なら、patch リリースとして §1 からやり直す。

## §8 やってはいけないこと

- `Unreleased` の節を置く (§1 — `test/version.test.js` が必ず落ちる)
- `CHANGELOG.md` の見出しの形を崩す (§1 — `test/version.test.js` が落ちる)
- `package.json` に `"version"` を足す (版の置き場所は `manifest.json` だけ)
- 日付をノート起草日にする (§1 — 昇格日を書く)
- 1 変更に 2 行目を足す (§1 — 2 件目の変更に見える。補足は畳まず削除する)
- `npm test` だけで済ませ、拡張機能を再読み込みして確かめない (§2)
- `dev → main` を squash merge する (§4 — `dev` が恒久的に分岐する)
- `--ff-only` が落ちたとき、`--ff-only` を外して通す (§4 — hotfix を取り込み忘れている)
- `dev` と違うコミットにタグを打つ (§5)
- hotfix を `main` に入れたまま `dev` に戻さない (§7)
