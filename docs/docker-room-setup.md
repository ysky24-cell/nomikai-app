# Docker / ルーム版セットアップ

`docker-room` ブランチでは、静的版のReactアプリにルーム同期用APIを追加しています。

## 構成

- `web`: React + Vite
- `api`: Node.js + Express + Socket.IO
- `db`: PostgreSQL
- `redis`: Redis

## 初回起動

必要に応じて `.env.example` を `.env` にコピーして値を変えます。変更しなければ、`docker-compose.yml` のデフォルト値で起動できます。

```bash
docker compose -p nomikai-app up --build
```

起動後のURL:

- フロント: http://localhost:5173/nomikai-app/
- APIヘルスチェック: http://localhost:3000/health

## 実装済みAPI

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

```bash
curl -X POST http://localhost:3000/rooms/ROOMCD/game/start \
  -H "Content-Type: application/json" \
  -d "{\"gameKey\":\"werewolf-game\",\"gameTitle\":\"人狼ゲーム\",\"participantId\":\"HOST_ID\"}"
```

```bash
curl -X POST http://localhost:3000/rooms/ROOMCD/game/advance \
  -H "Content-Type: application/json" \
  -d "{\"participantId\":\"HOST_ID\"}"
```

```bash
curl -X POST http://localhost:3000/rooms/ROOMCD/game/complete \
  -H "Content-Type: application/json" \
  -d "{\"participantId\":\"HOST_ID\"}"
```

```bash
curl -X POST http://localhost:3000/rooms/ROOMCD/game/reset \
  -H "Content-Type: application/json" \
  -d "{\"participantId\":\"HOST_ID\"}"
```

## 現在の同期範囲

- ルーム作成、参加、接続状態表示
- ホストによるゲーム選択
- 開始、次へ、完了、待機戻し
- Socket.IOによる参加者画面への進行状態配信
- ルームで選ばれたゲームを各端末で開く導線

## 既知の制限

- 各ゲーム内の配役、投票、カードめくり、回答入力はまだ端末ごとのローカル状態です。
- 静的版の `localStorage` 進行は残しています。
- 本番公開用のHTTPS、ドメイン、認証、監視は未設定です。
- 日本語フォルダ名の環境では、Composeのプロジェクト名を明示するため `-p nomikai-app` を付けて起動します。

## 次に作る候補

1. 人狼ゲームの完全ルーム同期
2. ワードウルフの各自お題確認と投票同期
3. 二択トーク、マジョリティの投票同期
4. ホスト交代、再接続、参加者削除
5. AWS公開用の本番Docker構成
