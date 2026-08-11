export type SyncProgression = "simultaneous" | "turn" | "count-up";

export type SyncGameDefinition = {
  key: string;
  title: string;
  rule: string;
  examplePrompt: string;
  inputLabel: string;
  inputPlaceholder: string;
  progression: SyncProgression;
};

const definitions: readonly SyncGameDefinition[] = [
  { key: "yamanote", title: "山手線ゲーム", rule: "ルーム参加者の順番をサーバーが管理します。現在の人だけが答えられ、重複は拒否されます。パス・アウトも共有され、全員の1巡で結果になります。", examplePrompt: "東京の駅名", inputLabel: "あなたの言葉", inputPlaceholder: "例：新宿", progression: "turn" },
  { key: "ng-word", title: "NGワードゲーム", rule: "サーバーが参加者ごとに1語を割り当てます。自分の語だけ常に非表示で、他の人の語は確認できます。ヒットは罰や飲酒ではなく、誰が記録したかだけを共有します。", examplePrompt: "今日あったうれしいこと", inputLabel: "ヒットを記録する対象", inputPlaceholder: "会話でNGワードを言った人を選択", progression: "turn" },
  { key: "party-pack", title: "定番ゲームパック", rule: "ホストがミニゲームを1つ選び、サーバーがテキストのお題と進行方式を固定します。手番制・同時入力をゲームごとに切り替え、結果公開まで回答を隠します。", examplePrompt: "最近ハマっていること", inputLabel: "あなたの回答", inputPlaceholder: "例：朝の散歩", progression: "turn" },
  { key: "johari-window", title: "ジョハリの窓", rule: "まず自分の特徴を選び、次に他の全員への印象を同時に選びます。提出内容は結果まで非公開です。", examplePrompt: "自分と周りから見た特徴", inputLabel: "特徴ワード", inputPlaceholder: "自分の特徴と、他の参加者への印象を選択", progression: "simultaneous" },
  { key: "turtle-soup", title: "ウミガメのスープ", rule: "参加者は質問を共有ログへ投稿し、ホストだけが truth を確認して、はい・いいえ・関係ありませんに分類します。ヒントは段階公開、truth はホストの公開操作まで非表示です。", examplePrompt: "なぜ彼は傘を持たずに外出した？", inputLabel: "あなたの質問", inputPlaceholder: "例：その日は晴れていましたか？", progression: "turn" },
  { key: "truth-lie-game", title: "2つの真実と1つの嘘", rule: "サーバーが決めた話し手だけが3つの発言と嘘の位置を提出し、ほかの参加者は結果公開まで非公開で投票します。", examplePrompt: "最近あった3つの出来事", inputLabel: "嘘だと思う番号", inputPlaceholder: "1 / 2 / 3", progression: "simultaneous" },
  { key: "count-up-game", title: "カウントアップゲーム", rule: "順番に1〜3個の数字を進めます。目標数に到達した人が負けです。", examplePrompt: "目標 30", inputLabel: "進める数字", inputPlaceholder: "例：1,2", progression: "count-up" },
  { key: "reverse-word-game", title: "逆さ言葉ゲーム", rule: "サーバーが管理するお題と順番に従い、答える・パス・アウトで自動進行します。不正入力と二重送信はサーバーが安全に扱います。", examplePrompt: "さくら", inputLabel: "逆から読んだ言葉", inputPlaceholder: "例：らくさ", progression: "turn" },
  { key: "song-association-quiz", title: "曲名連想クイズ", rule: "サーバーが管理する進行役だけが曲名や歌手を設定し、ヒントを段階公開します。ほかの参加者の予想は結果まで非公開です。", examplePrompt: "夏・海・夕方", inputLabel: "あなたの答え", inputPlaceholder: "曲名または歌手名", progression: "simultaneous" },
  { key: "drawing-quiz", title: "お絵描きクイズ", rule: "描き手だけが答えを設定し、画像を送らず準備状態を共有します。ほかの参加者は文章で予想し、結果公開まで非公開です。", examplePrompt: "動物", inputLabel: "絵から予想した答え", inputPlaceholder: "例：長い首の動物", progression: "simultaneous" },
  { key: "hazard-card-game", title: "ドキドキはずれカード", rule: "順番にカードを1枚選び、引いた結果を共有します。", examplePrompt: "1〜5から1枚選ぶ", inputLabel: "選ぶカード番号", inputPlaceholder: "1〜5", progression: "turn" },
  { key: "typing-speed-game", title: "スマホ早打ちゲーム", rule: "同じ文章を全員同時に入力し、正確さと早さを競います。", examplePrompt: "今日はみんなで楽しく遊ぼう", inputLabel: "入力文｜ミリ秒", inputPlaceholder: "例：今日はみんなで楽しく遊ぼう｜1200", progression: "simultaneous" },
  { key: "memory-logo-drawing", title: "記憶だけでロゴを書く", rule: "見本を思い出しながら、全員同時に特徴を描写します。", examplePrompt: "身近な店のロゴ", inputLabel: "覚えている特徴", inputPlaceholder: "例：丸い枠の中に緑の文字", progression: "simultaneous" },
  { key: "value-meter-game", title: "価値観メーター", rule: "全員が数値と理由を非公開で提出し、全員分が揃ったあとにサーバーが平均・中央値・分布を確定します。", examplePrompt: "休日は予定を入れたい", inputLabel: "数値｜理由", inputPlaceholder: "例：72｜外出が好き", progression: "simultaneous" },
  { key: "acting-phrase-game", title: "ひとこと演技ゲーム", rule: "順番に同じ一言を感情つきで演じ、ほかの人が当てます。", examplePrompt: "『大丈夫です』を喜んで演じる", inputLabel: "演技の感情・ヒント", inputPlaceholder: "例：大喜び", progression: "turn" },
  { key: "party-sugoroku", title: "飲み会すごろく", rule: "順番にサイコロ結果と止まったマスのお題を進めます。", examplePrompt: "止まったマス：最近笑ったこと", inputLabel: "マスのお題への回答", inputPlaceholder: "例：電車で聞こえた会話", progression: "turn" },
  { key: "territory-board-game", title: "シンプル陣取り", rule: "順番に取りたいマスと理由を宣言して、盤面を進めます。", examplePrompt: "3×3盤面の空きマスを選ぶ", inputLabel: "選ぶマス", inputPlaceholder: "例：B2", progression: "turn" },
  { key: "weird-karuta-game", title: "変な一言カルタ", rule: "読み札のヒントから思い浮かぶ言葉を、全員同時に入力します。", examplePrompt: "『朝から全力で眠い』", inputLabel: "取る札", inputPlaceholder: "思い浮かんだ言葉", progression: "simultaneous" },
  { key: "funny-line-karuta", title: "面白い一言カルタ", rule: "共有された読み札に対する回答をサーバーが原子操作で受け付け、最初の一人だけを勝者として確定します。", examplePrompt: "『朝から全力で眠い』", inputLabel: "札を取る回答", inputPlaceholder: "思い浮かんだ一言", progression: "simultaneous" },
  { key: "emo-hint-game", title: "エモヒント連想", rule: "サーバーが管理する進行役だけが答えを設定し、抽象的なヒントを段階公開します。予想は結果まで非公開です。", examplePrompt: "雨上がり・帰り道・少し寂しい", inputLabel: "連想したもの", inputPlaceholder: "例：放課後", progression: "simultaneous" },
  { key: "resource-negotiation-game", title: "資源交渉トーク", rule: "全員が必要な資源と交換案を同時に出し、その後に交渉します。", examplePrompt: "木材2と食料1を集めよう", inputLabel: "出せる物｜ほしい物", inputPlaceholder: "例：木材1｜食料1", progression: "simultaneous" },
  { key: "life-event-sugoroku", title: "人生イベントすごろく", rule: "順番にイベントを選び、選んだ理由を共有します。", examplePrompt: "臨時収入を何に使う？", inputLabel: "選択と理由", inputPlaceholder: "例：旅行｜思い出を作りたい", progression: "turn" },
  { key: "arm-wrestling-tournament", title: "腕相撲トーナメント", rule: "順番に対戦結果を入力して、対戦表を進めます。", examplePrompt: "第1試合の勝者", inputLabel: "勝者の名前", inputPlaceholder: "例：やすこ", progression: "turn" },
  { key: "safe-random-draw", title: "安全はずれ抽選", rule: "順番に番号を選び、安全な抽選結果を進めます。", examplePrompt: "1〜6から1枚選ぶ", inputLabel: "選ぶ番号", inputPlaceholder: "1〜6", progression: "turn" },
  { key: "person-hint-quiz", title: "人物当てヒントクイズ", rule: "サーバーが管理する進行役だけが人物を設定し、ヒントを段階公開します。参加者の予想と正解は結果公開まで非公開です。", examplePrompt: "写真なしで人物を当てよう", inputLabel: "人物の予想", inputPlaceholder: "例：スポーツ選手", progression: "simultaneous" },
  { key: "large-majority-game", title: "大人数マジョリティ", rule: "全員が同時に多数派だと思う答えを選びます。", examplePrompt: "朝型？夜型？", inputLabel: "あなたの答え", inputPlaceholder: "例：夜型", progression: "simultaneous" },
  { key: "humming-intro-quiz", title: "鼻歌イントロドン", rule: "歌い手だけが曲名を設定し、音声を保存せずに参加者の文字予想を受け付けます。サーバーの受付順で結果と得点を確定します。", examplePrompt: "夏の定番曲", inputLabel: "曲名の予想", inputPlaceholder: "例：サビに『海』が出てくる", progression: "simultaneous" },
  { key: "loanword-ban-game", title: "外来語禁止ゲーム", rule: "サーバーが管理する説明役と禁止語を使い、答える・パス・アウトで自動進行します。禁止語の使用はストライクとして記録されます。", examplePrompt: "スマホを外来語なしで説明", inputLabel: "言い換え", inputPlaceholder: "例：持ち運べる電話", progression: "turn" },
  { key: "fast-typing-game", title: "サーバー判定早打ち", rule: "同じ文章を全員が入力し、サーバーが正しい完了だけを受け付けて到着順のランキングを確定します。クライアントの得点は採用しません。", examplePrompt: "今日はみんなで楽しく遊ぼう", inputLabel: "表示文と同じ文章", inputPlaceholder: "お題をそのまま入力", progression: "simultaneous" },
  { key: "memory-drawing-game", title: "記憶描きゲーム", rule: "お題のターゲットをサーバーが保持し、全員は画像を送らず特徴を文章で提出します。投票後にホストがターゲットを公開し、票数を確定します。", examplePrompt: "身近な店のロゴ", inputLabel: "覚えている特徴", inputPlaceholder: "例：丸い枠と緑の文字", progression: "simultaneous" },
  { key: "acting-game", title: "ひとこと演技ゲーム", rule: "サーバーが演者と感情を選び、演者だけに秘密の感情を表示します。ほかの参加者は非公開で予想し、結果公開時に得点を確定します。", examplePrompt: "『大丈夫です』を演じる", inputLabel: "演技から予想した感情", inputPlaceholder: "例：うれしい", progression: "simultaneous" },
];

export const syncGameDefinitionByKey = Object.fromEntries(definitions.map((definition) => [definition.key, definition])) as Record<string, SyncGameDefinition>;

export function getSyncGameDefinition(key: string): SyncGameDefinition {
  return syncGameDefinitionByKey[key] ?? {
    key,
    title: key,
    rule: "全員で同期して進めるゲームです。",
    examplePrompt: "自由にお題を入力",
    inputLabel: "あなたの回答",
    inputPlaceholder: "回答を入力",
    progression: "simultaneous",
  };
}
