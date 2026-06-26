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
curl -X POST http://localhost:3000/rooms/ROOMCD/game/start \
  -H "Content-Type: application/json" \
  -d "{\"gameKey\":\"impression-ranking\",\"gameTitle\":\"第一印象ランキング\",\"participantId\":\"HOST_ID\"}"
```

```bash
curl -X POST http://localhost:3000/rooms/ROOMCD/game/start \
  -H "Content-Type: application/json" \
  -d "{\"gameKey\":\"anonymous-box\",\"gameTitle\":\"匿名質問箱\",\"participantId\":\"HOST_ID\"}"
```

```bash
curl -X POST http://localhost:3000/rooms/ROOMCD/game/start \
  -H "Content-Type: application/json" \
  -d "{\"gameKey\":\"ng-word\",\"gameTitle\":\"NGワードゲーム\",\"participantId\":\"HOST_ID\"}"
```

```bash
curl -X POST http://localhost:3000/rooms/ROOMCD/game/start \
  -H "Content-Type: application/json" \
  -d "{\"gameKey\":\"acting-phrase-game\",\"gameTitle\":\"ひとこと演技ゲーム\",\"participantId\":\"HOST_ID\"}"
```

```bash
curl -X POST http://localhost:3000/rooms/ROOMCD/game/start \
  -H "Content-Type: application/json" \
  -d "{\"gameKey\":\"party-pack\",\"gameTitle\":\"定番ゲームパック\",\"participantId\":\"HOST_ID\"}"
```

```bash
curl -X POST http://localhost:3000/rooms/ROOMCD/game/start \
  -H "Content-Type: application/json" \
  -d "{\"gameKey\":\"turtle-soup\",\"gameTitle\":\"ウミガメのスープ\",\"participantId\":\"HOST_ID\"}"
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
- REST APIでは、ゲーム開始、次へ、完了、待機戻しをホストだけが実行できます
- Socket.IOのゲーム内状態更新では、参加者が対象ルームに所属していること、現在のゲームと一致すること、参加者更新の `updatedBy` が本人であることをサーバー側でも確認します
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
- 第一印象ランキングのルーム参加者取り込み、各自投票、集計、結果表示
- 第一印象ランキングで、参加者は自分の投票だけ操作できます
- 第一印象ランキングで、ホストはルーム参加者をプレイヤーとして取り込み、全員分の代行投票と結果表示、次のお題への進行ができます
- 匿名質問箱のルーム参加者取り込み、匿名質問投稿、質問開封、スキップ、完了
- 匿名質問箱で、参加者は匿名質問を投稿できます
- 匿名質問箱で、ホストはルーム参加者をメンバーとして取り込み、質問開封、次の質問、スキップ、完了を進行できます
- NGワードゲームのルーム参加者取り込み、本人だけ非表示のNGワード配布、踏んだ記録、タイマー、結果表示
- NGワードゲームで、参加者は自分以外のNGワードを確認し、踏んだ記録を追加できます
- NGワードゲームで、ホストはルーム参加者をプレイヤーとして取り込み、配布、タイマー、確認し直し、結果表示を進行できます
- ウミガメのスープのルーム参加者取り込み、出題者、質問ログ、ヒント、出題者だけの真相確認、全員への真相表示、次の問題への進行
- ウミガメのスープで、出題者またはホストは質問ログ、ヒント、真相表示、次の問題への進行を操作できます
- ウミガメのスープで、参加者は進行状況、質問ログ、ヒント、公開された真相を確認できます
- ジョハリの窓のルーム参加者取り込み、本人選択、周りの選択、4つの窓の結果表示
- ジョハリの窓で、参加者は自分が対象者または回答者になった時だけ選択できます
- ジョハリの窓で、ホストはルーム参加者をメンバーとして取り込み、対象者切り替えと結果表示を進行できます
- 山手線ゲームのルーム参加者取り込み、手番、回答記録、パス、アウト記録、次のお題への進行
- 山手線ゲームで、参加者は自分の番だけ回答、パス、アウト操作ができます
- 山手線ゲームで、ホストはルーム参加者をメンバーとして取り込み、全員分の代行入力とお題切り替えを進行できます
- 逆さ言葉ゲーム / 外来語禁止ゲームのルーム参加者取り込み、手番、セーフ、パス、アウト記録、次のお題への進行
- 逆さ言葉ゲーム / 外来語禁止ゲームで、参加者は自分の番だけセーフ、パス、アウト操作ができます
- 逆さ言葉ゲーム / 外来語禁止ゲームで、ホストはルーム参加者をメンバーとして取り込み、全員分の代行入力とお題切り替えを進行できます
- 曲名連想クイズ / お絵描きクイズ / 記憶だけでロゴを書く / 変な一言カルタ / エモヒント連想 / 人物当てヒントクイズ / 鼻歌イントロドンのルーム参加者取り込み、親、各自回答、正解表示、得点
- 当てる系ゲームで、参加者は自分の回答だけ入力できます
- 当てる系ゲームで、親は出題者用の答え確認と正解表示ができます
- 当てる系ゲームで、ホストは全員分の代行入力、正解判定、次のお題への進行ができます
- 2つの真実と1つの嘘のルーム参加者取り込み、話し手、嘘番号投票、正解集計、得点
- 価値観メーターのルーム参加者取り込み、各自の数字、数字を言わない例え、並び順表示
- スマホ早打ちゲームのルーム参加者取り込み、各自の入力文、誤字なし判定、得点
- 回答・集計系ゲームで、参加者は自分の回答だけ操作できます
- 回答・集計系ゲームで、ホストは全員分の代行入力、集計、次のお題への進行ができます
- ひとこと演技ゲームのルーム参加者取り込み、演者、感情選択、各自回答、結果表示、得点
- ひとこと演技ゲームで、演者は自分の感情を選択できます
- ひとこと演技ゲームで、回答者は自分の回答だけ操作できます
- ひとこと演技ゲームで、ホストは全員分の代行入力、結果表示、次のお題への進行ができます
- カウントアップゲームのルーム参加者取り込み、手番、現在の数字、セーフ/アウト記録
- ドキドキはずれカード / 安全はずれ抽選のルーム参加者取り込み、手番、はずれ位置、引いた枚数、セーフ/はずれ記録
- 腕相撲トーナメントのルーム参加者取り込み、対戦カード、勝者、勝利数
- 手番・抽選・対戦系ゲームで、参加者は自分の番や自分が入っている対戦だけ操作できます
- 手番・抽選・対戦系ゲームで、ホストは全員分の代行入力、混ぜ直し、次のお題への進行ができます
- 飲み会すごろく / 人生イベントすごろくのルーム参加者取り込み、手番、サイコロ、コマ位置、次のお題への進行
- シンプル陣取りのルーム参加者取り込み、手番、取得マス、盤面、次のお題への進行
- 資源交渉トークのルーム参加者取り込み、手番、各自資源、交渉者切り替え、次のお題への進行
- 盤面系ゲームで、参加者は自分の番や自分の資源だけ操作できます
- 盤面系ゲームで、ホストは全員分の代行入力とお題切り替えを進行できます
- 定番ゲームパックのルーム参加者取り込み、パック内ミニゲーム選択、手番、回答、投票、結果表示、得点、次のお題への進行
- 定番ゲームパックで、参加者は自分の番や自分の回答だけ操作できます
- 定番ゲームパックで、ホストは全員分の代行入力、結果表示、次のお題への進行ができます

## 既知の制限

- 人狼、ワードウルフ、二択トーク、マジョリティ系、第一印象ランキング、匿名質問箱、NGワードゲーム、ウミガメのスープ、ジョハリの窓、山手線ゲーム、逆さ言葉ゲーム、外来語禁止ゲーム、当てる系ゲーム、回答・集計系ゲーム、ひとこと演技ゲーム、手番・抽選・対戦系ゲーム、盤面系ゲーム、定番ゲームパック以外の補助操作はまだ端末ごとのローカル状態です。
- 人狼の役職とワードウルフのお題は画面上では本人だけに表示しますが、現時点ではルーム状態JSONに含まれます。信頼できる参加者同士で遊ぶ前提です。
- Socket.IOの状態更新には基本的なサーバー側権限チェックがあります。ただし、各ゲームの `votes` や `guesses` などのフィールド単位で「本人の欄だけ変更できる」ことを完全に検証する処理は今後の実装対象です。
- 役職やお題などの秘匿情報は、現時点では参加者ごとに別レスポンスへ分離していません。
- 静的版の `localStorage` 進行は残しています。
- 本番公開用のHTTPS、ドメイン、認証、監視は未設定です。
- 日本語フォルダ名の環境では、Composeのプロジェクト名を明示するため `-p nomikai-app` を付けて起動します。

## 次に作る候補

1. 細粒度権限強化: 投票者操作、回答欄、役職・お題情報の参加者別配信
2. 観戦者専用画面
3. AWS公開用の本番Docker構成
