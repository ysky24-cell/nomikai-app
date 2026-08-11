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
  { key: "yamanote", title: "山手線ゲーム", rule: "順番に、お題に合う言葉を1つずつ答えます。全員が1回ずつ答えると1ラウンド完了です。", examplePrompt: "東京の駅名", inputLabel: "あなたの言葉", inputPlaceholder: "例：新宿", progression: "turn" },
  { key: "ng-word", title: "NGワードゲーム", rule: "順番に会話の一言を入力します。言ってはいけない言葉を避けながら全員で1巡します。", examplePrompt: "今日あったうれしいこと", inputLabel: "あなたの一言", inputPlaceholder: "例：ランチがおいしかった", progression: "turn" },
  { key: "party-pack", title: "定番ゲームパック", rule: "カードのお題に沿って、順番に答えます。", examplePrompt: "最近ハマっていること", inputLabel: "あなたの回答", inputPlaceholder: "例：朝の散歩", progression: "turn" },
  { key: "johari-window", title: "ジョハリの窓", rule: "お題にもっとも当てはまる人を、全員同時に選びます。", examplePrompt: "一番相談しやすい人", inputLabel: "選んだ人と理由", inputPlaceholder: "例：やすこ｜話をよく聞いてくれる", progression: "simultaneous" },
  { key: "turtle-soup", title: "ウミガメのスープ", rule: "順番に、はい・いいえで答えられる質問を1つずつ出します。", examplePrompt: "なぜ彼は傘を持たずに外出した？", inputLabel: "あなたの質問", inputPlaceholder: "例：その日は晴れていましたか？", progression: "turn" },
  { key: "truth-lie-game", title: "2つの真実と1つの嘘", rule: "全員が同時に、嘘だと思う番号を選びます。", examplePrompt: "1〜3のうち嘘はどれ？", inputLabel: "嘘だと思う番号", inputPlaceholder: "1 / 2 / 3", progression: "simultaneous" },
  { key: "count-up-game", title: "カウントアップゲーム", rule: "順番に1〜3個の数字を進めます。目標数に到達した人が負けです。", examplePrompt: "目標 30", inputLabel: "進める数字", inputPlaceholder: "例：1,2", progression: "count-up" },
  { key: "reverse-word-game", title: "逆さ言葉ゲーム", rule: "表示されたお題を逆から読み、順番に入力します。", examplePrompt: "さくら", inputLabel: "逆から読んだ言葉", inputPlaceholder: "例：らくさ", progression: "turn" },
  { key: "song-association-quiz", title: "曲名連想クイズ", rule: "ヒントから連想した曲名や歌手を、順番に答えます。", examplePrompt: "夏・海・夕方", inputLabel: "あなたの答え", inputPlaceholder: "曲名または歌手名", progression: "turn" },
  { key: "drawing-quiz", title: "お絵描きクイズ", rule: "順番にお題を描写し、ほかの人は答えを考えます。", examplePrompt: "動物", inputLabel: "絵の説明・ヒント", inputPlaceholder: "例：長い首で草を食べる", progression: "turn" },
  { key: "hazard-card-game", title: "ドキドキはずれカード", rule: "順番にカードを1枚選び、引いた結果を共有します。", examplePrompt: "1〜5から1枚選ぶ", inputLabel: "選ぶカード番号", inputPlaceholder: "1〜5", progression: "turn" },
  { key: "typing-speed-game", title: "スマホ早打ちゲーム", rule: "同じ文章を全員同時に入力し、正確さと早さを競います。", examplePrompt: "今日はみんなで楽しく遊ぼう", inputLabel: "入力文｜ミリ秒", inputPlaceholder: "例：今日はみんなで楽しく遊ぼう｜1200", progression: "simultaneous" },
  { key: "memory-logo-drawing", title: "記憶だけでロゴを書く", rule: "見本を思い出しながら、全員同時に特徴を描写します。", examplePrompt: "身近な店のロゴ", inputLabel: "覚えている特徴", inputPlaceholder: "例：丸い枠の中に緑の文字", progression: "simultaneous" },
  { key: "value-meter-game", title: "価値観メーター", rule: "お題への共感度を1〜100で、全員同時に示します。", examplePrompt: "休日は予定を入れたい", inputLabel: "数値｜理由", inputPlaceholder: "例：72｜外出が好き", progression: "simultaneous" },
  { key: "acting-phrase-game", title: "ひとこと演技ゲーム", rule: "順番に同じ一言を感情つきで演じ、ほかの人が当てます。", examplePrompt: "『大丈夫です』を喜んで演じる", inputLabel: "演技の感情・ヒント", inputPlaceholder: "例：大喜び", progression: "turn" },
  { key: "party-sugoroku", title: "飲み会すごろく", rule: "順番にサイコロ結果と止まったマスのお題を進めます。", examplePrompt: "止まったマス：最近笑ったこと", inputLabel: "マスのお題への回答", inputPlaceholder: "例：電車で聞こえた会話", progression: "turn" },
  { key: "territory-board-game", title: "シンプル陣取り", rule: "順番に取りたいマスと理由を宣言して、盤面を進めます。", examplePrompt: "3×3盤面の空きマスを選ぶ", inputLabel: "選ぶマス", inputPlaceholder: "例：B2", progression: "turn" },
  { key: "weird-karuta-game", title: "変な一言カルタ", rule: "読み札のヒントから思い浮かぶ言葉を、全員同時に入力します。", examplePrompt: "『朝から全力で眠い』", inputLabel: "取る札", inputPlaceholder: "思い浮かんだ言葉", progression: "simultaneous" },
  { key: "emo-hint-game", title: "エモヒント連想", rule: "抽象的なヒントから連想した答えを、全員同時に入力します。", examplePrompt: "雨上がり・帰り道・少し寂しい", inputLabel: "連想したもの", inputPlaceholder: "例：放課後", progression: "simultaneous" },
  { key: "resource-negotiation-game", title: "資源交渉トーク", rule: "全員が必要な資源と交換案を同時に出し、その後に交渉します。", examplePrompt: "木材2と食料1を集めよう", inputLabel: "出せる物｜ほしい物", inputPlaceholder: "例：木材1｜食料1", progression: "simultaneous" },
  { key: "life-event-sugoroku", title: "人生イベントすごろく", rule: "順番にイベントを選び、選んだ理由を共有します。", examplePrompt: "臨時収入を何に使う？", inputLabel: "選択と理由", inputPlaceholder: "例：旅行｜思い出を作りたい", progression: "turn" },
  { key: "arm-wrestling-tournament", title: "腕相撲トーナメント", rule: "順番に対戦結果を入力して、対戦表を進めます。", examplePrompt: "第1試合の勝者", inputLabel: "勝者の名前", inputPlaceholder: "例：やすこ", progression: "turn" },
  { key: "safe-random-draw", title: "安全はずれ抽選", rule: "順番に番号を選び、安全な抽選結果を進めます。", examplePrompt: "1〜6から1枚選ぶ", inputLabel: "選ぶ番号", inputPlaceholder: "1〜6", progression: "turn" },
  { key: "person-hint-quiz", title: "人物当てヒントクイズ", rule: "順番に人物についてのヒントを出し、答えを進めます。", examplePrompt: "写真なしで人物を当てよう", inputLabel: "ヒントまたは答え", inputPlaceholder: "例：スポーツ選手です", progression: "turn" },
  { key: "large-majority-game", title: "大人数マジョリティ", rule: "全員が同時に多数派だと思う答えを選びます。", examplePrompt: "朝型？夜型？", inputLabel: "あなたの答え", inputPlaceholder: "例：夜型", progression: "simultaneous" },
  { key: "humming-intro-quiz", title: "鼻歌イントロドン", rule: "順番に鼻歌やリズムのヒントを出し、答えを進めます。", examplePrompt: "夏の定番曲", inputLabel: "曲名またはヒント", inputPlaceholder: "例：サビに『海』が出てくる", progression: "turn" },
  { key: "loanword-ban-game", title: "外来語禁止ゲーム", rule: "順番にカタカナ語を使わずに説明します。", examplePrompt: "スマホを外来語なしで説明", inputLabel: "言い換え", inputPlaceholder: "例：持ち運べる電話", progression: "turn" },
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
