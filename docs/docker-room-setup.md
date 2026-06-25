# Docker / ルーム版セットアップ

`docker-room` ブランチでは、静的版のReactアプリにルーム同期用APIを足していきます。

## 構成

- `web`: React + Vite
- `api`: Node.js + Express + Socket.IO
- `db`: PostgreSQL
- `redis`: Redis

## 初回起動

必要に応じて `.env.example` を `.env` にコピーして値を変えます。変更しなければ、`docker-compose.yml` のデフォルト値で起動できます。

```bash
docker compose up --build
```

起動後のURL:

- フロント: http://localhost:5173
- APIヘルスチェック: http://localhost:3000/health

## 最小API

```bash
curl http://localhost:3000/health
```

```bash
curl -X POST http://localhost:3000/rooms \
  -H "Content-Type: application/json" \
  -d "{\"hostName\":\"幹事\"}"
```

```bash
curl -X POST http://localhost:3000/rooms/ROOMCD/join \
  -H "Content-Type: application/json" \
  -d "{\"name\":\"参加者A\"}"
```

## 次に作るもの

1. フロントにルーム作成・参加画面を追加する
2. Socket.IOクライアントを導入する
3. 人狼ゲームをルーム同期に対応する
4. ワードウルフ、二択トークへ広げる
5. AWS公開用に本番Dockerfileと環境変数を分ける
