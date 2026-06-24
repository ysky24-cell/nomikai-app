# 飲み会用アプリ

飲み会・懇親会・チーム交流で使えるミニゲーム集アプリです。

トップ画面を各ゲームへの入口にし、参加者がその場でスマートフォンからすぐ遊べる体験を目指します。

## 初期搭載候補

- 二択トーク
- ワードウルフ
- NGワードゲーム

以下は追加予定です。

- ジョハリの窓
- ウミガメのスープ
- 第一印象ランキング
- 匿名質問箱

## 公開ページ

GitHub Pagesで公開する静的アプリです。

公開URL: https://ysky24-cell.github.io/nomikai-app/

## ローカル起動

```bash
npm install
npm run dev
```

## ビルド

```bash
npm run build
```

## データ保存

初期版ではデータベースを使いません。参加者、投票、ゲーム進行はブラウザ内の状態と`localStorage`に保存します。

## 要件定義

各ゲームごとの要件定義は [docs/requirements.md](docs/requirements.md) を参照してください。

実装に向けた詳細仕様は [docs/game-details.md](docs/game-details.md) を参照してください。
