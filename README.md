# 飲み会アプリ

飲み会や交流会で使えるゲーム集です。参加者が各自のスマホから同じ部屋へ入るSynology版を正式版とし、1台の端末で遊ぶGitHub Pages版も体験用として公開しています。

## 公開URL

- 正式版: `main`ブランチをSynologyへ配置して利用します
- 1台共有版: https://ysky24-cell.github.io/nomikai-app/

静的版はGitHub Pagesだけで動きます。データベースやログインはなく、設定と進行状況はブラウザの `localStorage` に保存します。

## 遊び方

### 静的版

1. 公開URLを開きます。
2. トップ画面からゲームを選びます。
3. 参加者名、問題数、大人向け話題の利用可否などを設定します。
4. 画面を1台ずつ回しながら進めます。
5. 終了後は「初期化してトップへ」で最初の状態へ戻せます。

### Dockerルーム版

1. 代表者が「ルームを作る」を押します。代表者も通常の参加者として登録されます。
2. 参加者はQRコードまたはルームコードから参加します。
3. ルーム画面の参加者一覧に全員が表示されたら、ホストがゲームを選びます。
4. ゲームの説明と最低人数を確認して、ホストが開始します。
5. 各自の画面で回答、投票、手番操作を行います。非公開の回答や役職は本人だけに表示されます。
6. 結果公開、再戦、待機画面への復帰も全員へ同期されます。

ゲームごとに別の「参加」ボタンを押す必要はありません。ルーム画面にいる人が、そのままゲーム参加者になります。

## 収録ゲーム

静的版にはジョハリの窓、ウミガメのスープ、ワードウルフ、NGワードゲーム、二択トーク、匿名質問箱、人狼、第一印象ランキング、定番ゲームパックなどを収録しています。会話、推理、反射、クイズ、描画、運、盤面、トーナメント系を含む全33ゲームを選べます。

Dockerルーム版では全33ゲームを正式なv2同期ゲームとして扱います。共通の簡易ブリッジは使用していません。

同期する内容の例:

- ルーム参加者、接続状態、ホスト権限、観戦状態
- ゲーム開始、手番、回答待ち、進行、結果、再戦、リセット
- 役職、お題、本人だけの回答、投票、集計、得点
- カード選択、抽選、盤面、すごろく位置、資源と交渉、トーナメント表
- 再接続、ホスト交代、参加者の退出・削除、ルーム終了

## 正式版をSynologyで起動

必要なもの:

- Docker DesktopまたはDocker Engine
- Docker Compose
- Git

初回配置:

```bash
git clone https://github.com/ysky24-cell/nomikai-app.git
cd nomikai-app
git switch main
```

NASのIPに合わせて `.env` を作成してから、正式版Composeを起動します。

```bash
docker compose -p nomikai-app -f docker-compose.synology.yml --env-file .env up -d --build
```

既に `docker-room` ブランチを配置している場合は、次の一度だけ `main` へ切り替えます。`.env` とデータベース用Dockerボリュームはそのまま利用できます。

```bash
git fetch origin
git switch main
git pull --ff-only origin main
docker compose -p nomikai-app -f docker-compose.synology.yml --env-file .env up -d --build
```

NASのIP、公開ポート、`.env` の具体例は [docs/synology-docker.md](docs/synology-docker.md) を参照してください。

## ローカル開発用Docker

PC上で確認する場合は次を実行します。

```bash
docker compose up -d --build
```

- Web: http://localhost:5173/nomikai-app/
- API: http://localhost:3000/health

停止:

```bash
docker compose down
```

データベースも消して完全に初期化する場合だけ、次を使います。

```bash
docker compose down -v
```

環境変数や外部公開時の構成は [docs/docker-room-setup.md](docs/docker-room-setup.md) を参照してください。

## 開発とテスト

フロントエンド:

```bash
npm install
npm run lint
npm run typecheck
npm test
npm run build
npm run e2e
```

API:

```bash
cd server
npm install
npm run typecheck
npm test
```

Docker起動後の全ゲーム通し試験:

```bash
npm run room:shared-catalog:check
npm run room:lifecycle:check:all
```

APIを標準以外のポートで動かす場合は `API_URL` を指定します。

```bash
API_URL=http://localhost:3100 npm run room:lifecycle:check:all
```

## 構成

- Web: React、TypeScript、Vite
- リアルタイム通信: Socket.IO
- API: Node.js、Express、TypeScript
- データベース: PostgreSQL
- 複数API間の配信: Redis Adapter
- 静的版の保存: `localStorage`

ルーム状態はJSONへ投影しやすい構造にし、サーバー側でイベントとスナップショットを保存します。

## 既知の制限

- 静的版は1台共有用です。端末間同期、ログイン、ルーム、画像アップロードはありません。
- お絵描き、記憶描き、鼻歌などは実物の紙や声を使います。画像・音声そのものは保存・同期せず、役割、準備、回答、結果だけを同期します。
- ルーム版にアカウント認証はありません。ルームコードや引き継ぎ情報を知っている人が参加・復帰できます。
- 役職や非公開のお題は参加者向け画面では隠しますが、運営者が管理するデータベース内にはゲーム状態として保存されます。
- インターネット公開時はHTTPS、強いパスワード、アクセス制限、バックアップ、ログ監視、保存期間の設計が必要です。
- 飲酒を必須にするルールや危険な罰ゲームは実装していません。飲まない、休む、スキップする選択を優先してください。

## ブランチと版管理

- `main`: 正式版。Synology向けのWeb、API、PostgreSQL、Redisと、GitHub Pages向け1台共有ビルドをすべて収録
- `static-v1`: 静的版完成時点を残す保存タグ

今後の更新は`main`へ集約します。Synologyでは`main`を取得し、`docker-compose.synology.yml`で起動してください。
