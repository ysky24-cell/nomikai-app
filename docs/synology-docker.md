# Synology Docker / Container Manager ホスト準備

Synology NAS の Docker / Container Manager で、ルーム同期版を動かすためのメモです。既存の `docker-compose.yml` はローカル開発向けのまま残し、Synology では `docker-compose.synology.yml` を使います。

## 事前に決める値

- `WEB_PORT`: フロントを公開するNAS側ポート。既定は `5173`。
- `API_PORT`: APIを公開するNAS側ポート。既定は `3000`。
- `CLIENT_ORIGIN`: ブラウザで開くフロントのオリジン。例: `http://192.168.1.10:5173`
- `VITE_API_URL`: ブラウザから見えるAPI URL。例: `http://192.168.1.10:3000`
- `POSTGRES_PASSWORD`: DBパスワード。公開運用では既定値から変更します。

`CLIENT_ORIGIN` はパスを含めず、`http://NAS_IP:5173` のようにスキーム、ホスト、ポートだけを書きます。フロント画面そのものは Vite の `base` 設定により `http://NAS_IP:5173/nomikai-app/` で開きます。

NASのIPとドメインを併用する場合は、`CLIENT_ORIGIN` をカンマ区切りで指定できます。

```env
CLIENT_ORIGIN=http://192.168.1.10:5173,https://nomikai.example.com
```

## 配置場所

Synology 側では、日本語や空白を含まないパスに置くのが無難です。

```text
/volume1/docker/nomikai-app
```

日本語パスでも動くことはありますが、Container Manager の画面、バックアップスクリプト、Compose のプロジェクト名でつまずきやすくなります。起動コマンドでは `-p nomikai-app` を付けて、プロジェクト名を固定します。

## .env の例

`docker-compose.synology.yml` と同じ場所に `.env` を作ります。

```env
WEB_PORT=5173
API_PORT=3000
POSTGRES_USER=nomikai
POSTGRES_PASSWORD=change-this-password
POSTGRES_DB=nomikai
CLIENT_ORIGIN=http://192.168.1.10:5173
VITE_API_URL=http://192.168.1.10:3000
```

ポートを変えた場合は、`CLIENT_ORIGIN` と `VITE_API_URL` にも外から見えるポートを反映します。ブラウザ上の `localhost` はNASではなく閲覧端末自身を指すため、Synology運用では `localhost` を使わないでください。

参加者のスマホや別PCから開く場合も、共有するURLは `http://NAS_IP:5173/nomikai-app/` です。`VITE_API_URL` が `http://localhost:3000` のままだと、ルーム参加、Socket.IO同期、引き継ぎコードでの復帰が参加者端末から失敗します。

## 起動

SSHでNASに入り、配置先ディレクトリで実行します。

```bash
docker compose -p nomikai-app -f docker-compose.synology.yml --env-file .env up -d --build
```

起動確認:

```bash
docker compose -p nomikai-app -f docker-compose.synology.yml ps
curl http://192.168.1.10:3000/health
```

ブラウザでは次を開きます。

```text
http://192.168.1.10:5173/nomikai-app/
```

Container Manager の「プロジェクト」から作成する場合も、Compose ファイルには `docker-compose.synology.yml` を使い、環境変数には上記 `.env` と同じ値を入れます。

## LAN内スマホ確認チェック

- PCとスマホを同じLANに接続します。
- PCまたはスマホのブラウザで `http://NAS_IP:3000/health` を開き、APIに届くことを確認します。
- スマホで `http://NAS_IP:5173/nomikai-app/` を開き、ルーム作成またはコード参加を試します。
- `CLIENT_ORIGIN` は `http://NAS_IP:5173` のように、ブラウザで開くオリジンだけを入れます。末尾の `/nomikai-app/` は含めません。
- `VITE_API_URL` は `http://NAS_IP:3000` にします。変更した場合は `--build` 付きでwebを作り直します。

## 参加者引き継ぎコード

別端末や別ブラウザで同じ参加者として復帰する場合は、ホスト端末で参加者一覧の「発行」を押し、対象参加者用の引き継ぎコードを出します。参加者は新しい端末で `http://NAS_IP:5173/nomikai-app/` を開き、「引き継ぎコードで復帰」にルームコードと引き継ぎコードを入力します。

引き継ぎコードは8桁、10分有効で、一回使用すると無効になります。同じ参加者へ再発行した場合も、前に出した未使用コードは無効です。期限切れ、使用済み、対象参加者が削除済みの場合は復帰できないため、ホストが新しいコードを発行します。

この操作も参加者端末のブラウザからAPIへ直接アクセスします。Synology上で動いていても `localhost` ではなく、参加者端末から到達できるNAS IPまたは設定済みドメインを `VITE_API_URL` に入れてください。

引き継ぎ後も、古い端末が同じ参加者として開いたままなら同時に操作できます。必要に応じて、古い端末側では「この端末だけ退出」を押してください。

## このComposeでの違い

- `web` は `npm run build` 後、`vite preview` でビルド済みフロントを配信します。
- `api` は TypeScript をビルドしてから `npm start` で実行します。
- `db` と `redis` は外部ポートを公開しません。コンテナ間通信だけで使います。
- PostgreSQL は `postgres_data` ボリュームに永続化します。
- Redis は `redis_data` ボリュームにAOFを保存します。主要データはPostgreSQL側に残ります。
- すべてのサービスに `restart: unless-stopped` を付け、NAS再起動後に戻りやすくしています。

## 更新と設定変更

アプリ更新時:

```bash
docker compose -p nomikai-app -f docker-compose.synology.yml --env-file .env up -d --build
```

`VITE_API_URL` はフロントのビルド時に埋め込まれるため、APIのURLやポートを変えたときも `--build` 付きで `web` を作り直します。

## DBバックアップ

例:

```bash
docker compose -p nomikai-app -f docker-compose.synology.yml --env-file .env exec -T db pg_dump -U nomikai nomikai > nomikai-backup.sql
```

復元例:

```bash
cat nomikai-backup.sql | docker compose -p nomikai-app -f docker-compose.synology.yml --env-file .env exec -T db psql -U nomikai nomikai
```

`POSTGRES_USER` や `POSTGRES_DB` を変えた場合は、コマンド内の `nomikai` も同じ値に置き換えます。

## つまずきやすい点

- ポート競合: `5173` や `3000` が他コンテナと重なる場合は `WEB_PORT` / `API_PORT` を変え、`CLIENT_ORIGIN` / `VITE_API_URL` も合わせます。
- CORS: フロントを開いたURLのオリジンと `CLIENT_ORIGIN` が一致していないと、APIやSocket.IO接続が失敗します。
- API URL: `VITE_API_URL=http://localhost:3000` のままだと、参加者のスマホが自分自身へ接続しに行きます。引き継ぎコードでの復帰もAPIに届かないため、LAN内運用では `http://NAS_IP:3000` を使います。
- DB永続化: `postgres_data` ボリュームを削除するとルーム履歴も消えます。Container Manager の削除操作でボリュームまで消さないよう注意します。
- DB初期値: `POSTGRES_USER` / `POSTGRES_PASSWORD` / `POSTGRES_DB` は初回に `postgres_data` が作られる時だけ反映されます。ボリューム作成後に変える場合は、DB内のユーザー変更またはバックアップ後の再作成が必要です。
- 日本語パス: NAS上の配置先は `/volume1/docker/nomikai-app` のようなASCIIパスを推奨します。
- リバースプロキシ: Socket.IO の WebSocket を通す必要があります。まずは `http://NAS_IP:5173/nomikai-app/` と `http://NAS_IP:3000/health` で直接動作確認してから、HTTPS化します。
- パス付きAPIプロキシ: 現状は `VITE_API_URL` にAPIのルートURLを入れる想定です。`https://example.com/api` のようなパス配下プロキシは追加設定なしでは避けます。
