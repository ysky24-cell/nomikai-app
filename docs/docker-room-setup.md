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
curl -X POST http://localhost:3000/rooms/ROOMCD/host/transfer \
  -H "Content-Type: application/json" \
  -d "{\"participantId\":\"HOST_ID\",\"targetParticipantId\":\"NEXT_HOST_ID\"}"
```

```bash
curl -X DELETE http://localhost:3000/rooms/ROOMCD/participants/TARGET_ID \
  -H "Content-Type: application/json" \
  -d "{\"participantId\":\"HOST_ID\"}"
```

```bash
curl -X POST http://localhost:3000/rooms/ROOMCD/game/start \
  -H "Content-Type: application/json" \
  -d "{\"gameKey\":\"werewolf-game\",\"gameTitle\":\"人狼ゲーム\",\"participantId\":\"HOST_ID\"}"
```

```bash
curl -X POST http://localhost:3000/rooms/ROOMCD/game/start \
  -H "Content-Type: application/json" \
  -d "{\"gameKey\":\"word-wolf\",\"gameTitle\":\"ワードウルフ\",\"participantId\":\"HOST_ID\"}"
```

```bash
curl -X POST http://localhost:3000/rooms/ROOMCD/game/start \
  -H "Content-Type: application/json" \
  -d "{\"gameKey\":\"two-choice\",\"gameTitle\":\"二択トーク\",\"participantId\":\"HOST_ID\"}"
```

```bash
curl -X POST http://localhost:3000/rooms/ROOMCD/game/start \
  -H "Content-Type: application/json" \
  -d "{\"gameKey\":\"majority-game\",\"gameTitle\":\"マジョリティゲーム\",\"participantId\":\"HOST_ID\"}"
```

```bash
curl -X POST http://localhost:3000/rooms/ROOMCD/game/start \
  -H "Content-Type: application/json" \
  -d "{\"gameKey\":\"large-majority-game\",\"gameTitle\":\"大人数マジョリティ\",\"participantId\":\"HOST_ID\"}"
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
- 保存済みルームへの再接続
- ホストによるゲーム選択
- 開始、次へ、完了、待機戻し
- ホスト交代
- ホストによる参加者削除
- ホスト交代や削除後の参加者画面更新
- Socket.IOによる参加者画面への進行状態配信
- ルームで選ばれたゲームを各端末で開く導線
- 人狼ゲームの配役、夜行動、昼議論タイマー、順番投票、同票処理、勝敗判定
- 人狼ゲームで、参加者は自分の役職確認と自分の投票順の操作ができます
- 人狼ゲームで、ホストはルーム参加者をプレイヤーとして取り込み、司会端末として進行できます
- ワードウルフの各自お題確認、会話タイマー、順番投票、結果表示
- ワードウルフで、参加者は自分のお題確認と自分の投票順の操作ができます
- ワードウルフで、ホストはルーム参加者をプレイヤーとして取り込み、進行役として配布と会話・投票切り替えができます
- 二択トークの各自投票、集計、結果表示
- 二択トークで、参加者は自分の投票だけ操作できます
- 二択トークで、ホストはルーム参加者をプレイヤーとして取り込み、全員分の代行投票と結果表示ができます
- マジョリティゲーム / 大人数マジョリティの各自投票、集計表示
- マジョリティ系で、参加者は自分の投票だけ操作できます
- マジョリティ系で、ホストはルーム参加者をプレイヤーとして取り込み、全員分の代行投票と次のお題への進行ができます

## 既知の制限

- 人狼、ワードウルフ、二択トーク、マジョリティ系以外の各ゲーム内操作、カードめくり、回答入力はまだ端末ごとのローカル状態です。
- 人狼の役職とワードウルフのお題は画面上では本人だけに表示しますが、現時点ではルーム状態JSONに含まれます。信頼できる参加者同士で遊ぶ前提です。
- ソケット更新はUI側で操作権限を制御しています。参加者ごとの厳密なサーバー権限検証は今後の実装対象です。
- 静的版の `localStorage` 進行は残しています。
- 本番公開用のHTTPS、ドメイン、認証、監視は未設定です。
- 日本語フォルダ名の環境では、Composeのプロジェクト名を明示するため `-p nomikai-app` を付けて起動します。

## 次に作る候補

1. 権限強化: ホスト操作、投票者操作、役職・お題情報の参加者別配信
2. 観戦者専用画面
3. 第一印象ランキングの投票同期
4. AWS公開用の本番Docker構成
