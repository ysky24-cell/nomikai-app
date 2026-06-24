export type UrlCandidateGameKey =
  | "majority-game"
  | "truth-lie-game"
  | "count-up-game"
  | "reverse-word-game"
  | "song-association-quiz"
  | "drawing-quiz"
  | "hazard-card-game"
  | "typing-speed-game"
  | "memory-logo-drawing"
  | "value-meter-game"
  | "acting-phrase-game"
  | "party-sugoroku"
  | "territory-board-game"
  | "weird-karuta-game"
  | "emo-hint-game"
  | "resource-negotiation-game"
  | "life-event-sugoroku"
  | "arm-wrestling-tournament"
  | "safe-random-draw"
  | "person-hint-quiz"
  | "large-majority-game"
  | "humming-intro-quiz"
  | "loanword-ban-game"
  | "werewolf-game";

export type UrlCandidateGameGroup = "url" | "talk" | "reaction" | "luck" | "drawing" | "board" | "large";

export type UrlCandidateIconName =
  | "timer"
  | "vote"
  | "question"
  | "shield"
  | "sparkles"
  | "trophy"
  | "list";

export type UrlCandidateGameKind =
  | "default"
  | "count-up"
  | "drawing"
  | "hazard"
  | "typing"
  | "value"
  | "acting"
  | "sugoroku"
  | "territory"
  | "tournament"
  | "draw";

export type UrlCandidatePromptRating = "normal" | "adult";

export type UrlCandidatePrompt = {
  id: string;
  category: string;
  rating: UrlCandidatePromptRating;
  title: string;
  instruction: string;
  options?: readonly string[];
  answer?: string;
  tips: readonly string[];
  targetNumber?: number;
};

export type UrlCandidateGameConfig = {
  key: UrlCandidateGameKey;
  articleOrder: number;
  title: string;
  description: string;
  people: string;
  minutes: string;
  accent: "teal" | "coral" | "indigo" | "gold";
  icon: UrlCandidateIconName;
  groups: readonly UrlCandidateGameGroup[];
  kind: UrlCandidateGameKind;
  minPlayers: number;
  maxPlayers: number;
  setupSteps: readonly string[];
  playSteps: readonly string[];
  judgeTips: readonly string[];
  answerMode?: "hidden" | "open";
  prompts: readonly UrlCandidatePrompt[];
};

type PromptScene = {
  id: string;
  label: string;
  angle: string;
};

type GameSpec = Omit<UrlCandidateGameConfig, "prompts"> & {
  style:
    | "majority"
    | "truthLie"
    | "countUp"
    | "reverse"
    | "song"
    | "drawing"
    | "hazard"
    | "typing"
    | "memoryLogo"
    | "value"
    | "acting"
    | "sugoroku"
    | "territory"
    | "karuta"
    | "emoHint"
    | "negotiation"
    | "life"
    | "arm"
    | "draw"
    | "person"
    | "loanword"
    | "werewolf";
};

const scenes: readonly PromptScene[] = [
  { id: "icebreak", label: "はじめやすい", angle: "初対面でも答えやすく" },
  { id: "food", label: "食べ物", angle: "食べ物の話に寄せて" },
  { id: "holiday", label: "休日", angle: "休日の過ごし方に寄せて" },
  { id: "daily", label: "日常", angle: "毎日の小さな出来事から" },
  { id: "work", label: "仕事仲間", angle: "職場やチームの空気で" },
  { id: "travel", label: "おでかけ", angle: "旅行や外出の話で" },
  { id: "entertainment", label: "エンタメ", angle: "映画や音楽のノリで" },
  { id: "memory", label: "思い出", angle: "懐かしい記憶を混ぜて" },
  { id: "future", label: "もしも", angle: "もしもの想像で" },
  { id: "party", label: "飲み会", angle: "今日の場に合わせて" },
];

const normalTopics = [
  "最近ハマっているもの",
  "つい頼みたくなるメニュー",
  "休日に行きたい場所",
  "朝の小さな習慣",
  "チームで助かる行動",
  "旅行に持っていくもの",
  "昔よく見ていた番組",
  "学生時代の思い出",
  "一日だけ増やしたい能力",
  "飲み会でありがたい人",
  "コンビニで買いがちなもの",
  "カラオケで盛り上がる雰囲気",
  "部屋にあると落ち着くもの",
  "地味だけど好きな時間",
  "仕事終わりにしたいこと",
  "旅先で撮りたい写真",
  "みんなにすすめたい作品",
  "子どもの頃の遊び",
  "未来にありそうな道具",
  "乾杯前に言いたい一言",
  "冷蔵庫にあると安心するもの",
  "雨の日の過ごし方",
  "最近うれしかったこと",
  "苦手だけど克服したいこと",
  "会議で助かる一言",
  "移動中にしたいこと",
  "何度でも見たい景色",
  "思わず笑った失敗",
  "架空の新サービス",
  "二次会で起きがちなこと",
] as const;

const adultTopics = [
  "気になる人との距離感",
  "初デートで見たい一面",
  "恋人にだけ見せる顔",
  "ドキッとする褒め言葉",
  "大人の余裕を感じる行動",
  "夜に話すと盛り上がる話題",
  "連絡頻度のちょうどよさ",
  "好きな人に言われたい一言",
  "付き合う前の境界線",
  "恋愛で譲れない価値観",
  "少し照れる理想の誘い方",
  "二人きりで行きたい場所",
  "色気を感じるしぐさ",
  "秘密にしておきたい弱点",
  "忘れられない恋の思い出",
  "大人っぽいプレゼント",
  "距離が縮まる会話",
  "嫉妬してしまう瞬間",
  "恋人との休日プラン",
  "ちょっと攻めた質問",
  "好意に気づくサイン",
  "好きな香りの話",
  "甘え上手だと思う行動",
  "本命にだけすること",
  "夜景が似合う場面",
  "照れ隠しの言い方",
  "一緒にいると安心する人",
  "大人の失敗談",
  "恋バナで聞きたい本音",
  "終電前に迷う一言",
] as const;

const adultScene: PromptScene = { id: "adult", label: "大人向け", angle: "夜の話題として無理なく" };

const setupBase = [
  "参加者を登録し、Hな話題のON/OFFと今回使う設問数を選びます。",
  "お題カードを読み、画面に出ている進め方に沿って遊びます。",
  "答えにくい話題はスキップして、場の空気を優先します。",
  "勝敗より、理由や言い間違いから会話が広がることを大事にします。",
] as const;

const safetyTips = [
  "飲酒の強要、身体的に危ない罰、誰かを責める流れは禁止です。",
  "迷ったら司会が明るく判定し、テンポよく次へ進みます。",
  "大人向けONでも、露骨すぎる話や個人情報に踏み込みすぎる話はスキップします。",
] as const;

function reverseText(value: string) {
  return [...value].reverse().join("");
}

function optionsFor(style: GameSpec["style"], topic: string, scene: PromptScene, index: number) {
  switch (style) {
    case "majority":
      return [`A: ${topic}を優先する`, `B: ${scene.label}らしい別案を選ぶ`];
    case "truthLie":
      return ["1つ目が嘘", "2つ目が嘘", "3つ目が嘘"];
    case "acting":
      return ["うれしい", "照れている", "焦っている", "余裕がある"];
    case "negotiation":
      return ["時間", "情報", "応援", "小さな特典"];
    case "loanword":
      return ["カタカナ語禁止", "固有名詞は司会判断", "言い換え歓迎"];
    case "value":
      return ["1に近い例え", "50くらいの例え", "100に近い例え"];
    case "arm":
      return ["通常勝負", "利き手ではない手", "5秒だけ耐える", "笑わせ禁止"];
    case "werewolf":
      return ["6人: 人狼1/占い師1/村人4", "8人: 人狼2/占い師1/騎士1/村人4", "10人以上: 人狼2/占い師1/騎士1/霊媒師1/村人残り"];
    default:
      return index % 3 === 0 ? ["司会判断", "拍手で決める", "理由を一言"] : undefined;
  }
}

function answerFor(style: GameSpec["style"], topic: string, scene: PromptScene, index: number) {
  switch (style) {
    case "reverse":
      return reverseText(topic);
    case "typing":
      return `${scene.label}の話題で、${topic}について一言ずつ話しましょう`;
    case "karuta":
    case "emoHint":
    case "person":
    case "song":
      return topic;
    case "werewolf":
      return "夜: 人狼の相談、占い、騎士の守り、霊媒師の確認を順に処理。昼: 3分話し合って投票。村人側は人狼を全員追放、人狼側は村人と同数になれば勝ちです。";
    default:
      return index % 5 === 0 ? `${topic}を使った例を1つ出す` : undefined;
  }
}

function promptCopy(style: GameSpec["style"], topic: string, scene: PromptScene) {
  switch (style) {
    case "majority":
      return "自分の好みではなく、この場で多数派になりそうな方を同時に選びます。少数派をいじりすぎず、理由を聞いて会話にします。";
    case "truthLie":
      return `話し手は「${topic}」に関する短い話を3つ出します。2つは本当、1つは嘘にして、聞き手が質問してから嘘を当てます。`;
    case "countUp":
      return "1人が1から3個まで数字を進めます。画面の目標数字を言ってしまった人がアウトです。逆算しながら進めます。";
    case "reverse":
      return "表示された言葉を、できるだけ早く逆から読みます。詰まったら答えを見て、みんなで一度声に出してから次へ進みます。";
    case "song":
      return `音源は使わず、「${topic}」から連想する曲名や歌手をヒントで当てます。鼻歌や手拍子は短く、分かりやすくします。`;
    case "drawing":
      return `出題者は「${topic}」を絵で表します。文字や記号で直接答えを書くのは禁止です。早く当てた人と伝わる絵に拍手します。`;
    case "hazard":
      return "画面のカードを順番に引きます。1枚だけはずれがあります。はずれを引いても罰ではなく、軽い一言トークで次へ進みます。";
    case "typing":
      return "表示された短文をスマホのメモやチャットへ正確に入力します。誤字なしで一番早い人が勝ちです。";
    case "memoryLogo":
      return `誰もが知っていそうな「${topic}」を、検索せず記憶だけで描きます。本物に近い賞、味がある賞を拍手で決めます。`;
    case "value":
      return `心の中で1から100の数字を決め、「${topic}」の強さを数字なしで例えます。全員で小さい順に並べます。`;
    case "acting":
      return `演じる人は「${topic}」を、選んだ感情だけで言います。説明は禁止で、周りは感情を当てます。`;
    case "sugoroku":
      return "サイコロを振って進み、止まったマスのお題を軽くこなします。飲酒強要や暴露強要はなしです。";
    case "territory":
      return "順番にマスを取り、取ったマスのお題に答えます。隣同士をつなげる、角を取るなど場で作戦を話します。";
    case "karuta":
      return `読み手は「${topic}」を直接言わず、特徴だけで説明します。分かった人は手元の札を取るつもりで答えます。`;
    case "emoHint":
      return `出題者は「${topic}」を直接言わず、抽象的なヒントを出します。全員正解でも全員不正解でもなく、数人だけ伝わる表現を狙います。`;
    case "negotiation":
      return "配られた資源が足りない想定で、相手と交換交渉をします。説得、譲歩、条件提示のうまさを楽しみます。";
    case "life":
      return "サイコロで進み、止まったイベントに対して選択肢を選びます。良い話も波乱も笑える範囲で扱います。";
    case "arm":
      return "画面で対戦順とハンデを決め、無理のない腕相撲をします。痛みが出たら即中止です。";
    case "draw":
      return "カードを順番に引き、当たりやはずれを確認します。食べ物の辛さや危険な罰は使わず、安全な一言お題に置き換えます。";
    case "person":
      return `出題者は「${topic}」に合う人物を思い浮かべ、写真なしでヒントを出します。個人を傷つける表現は避けます。`;
    case "loanword":
      return `「${topic}」について、カタカナ語を避けて30秒説明します。詰まったら周りが言い換えを助けてもOKです。`;
    case "werewolf":
      return `短時間人狼です。司会は役職を秘密で配り、「${topic}」を最初の昼の雑談テーマにして、怪しい発言や反応を手がかりに話し合います。追放された人も観戦や司会補助で参加できます。`;
    default:
      return `${scene.angle}、お題に沿って短く遊びます。`;
  }
}

function titleFor(style: GameSpec["style"], topic: string, scene: PromptScene) {
  const prefix: Record<GameSpec["style"], string> = {
    majority: "多数派予想",
    truthLie: "2真実1嘘",
    countUp: "カウントアップ",
    reverse: "逆さ言葉",
    song: "曲名連想",
    drawing: "お絵描き",
    hazard: "ドキドキカード",
    typing: "早打ち",
    memoryLogo: "記憶描き",
    value: "価値観メーター",
    acting: "ひとこと演技",
    sugoroku: "飲み会すごろく",
    territory: "陣取り",
    karuta: "変な一言カルタ",
    emoHint: "エモヒント",
    negotiation: "資源交渉",
    life: "人生イベント",
    arm: "腕相撲",
    draw: "安全はずれ抽選",
    person: "人物当て",
    loanword: "外来語禁止",
    werewolf: "人狼ゲーム",
  };
  return `${prefix[style]}: ${topic} (${scene.label})`;
}

function buildPrompts(spec: GameSpec): UrlCandidatePrompt[] {
  const normalPrompts = scenes.flatMap((scene, sceneIndex) =>
    normalTopics.map((topic, topicIndex) => {
      const index = sceneIndex * normalTopics.length + topicIndex;
      return {
        id: `${spec.key}-normal-${String(index + 1).padStart(3, "0")}`,
        category: scene.id,
        rating: "normal" as const,
        title: titleFor(spec.style, topic, scene),
        instruction: promptCopy(spec.style, topic, scene),
        options: optionsFor(spec.style, topic, scene, index),
        answer: answerFor(spec.style, topic, scene, index),
        tips: [scene.angle, ...spec.judgeTips.slice(0, 2)],
        targetNumber: spec.style === "countUp" ? 21 + ((index % 10) + 1) * 3 : undefined,
      };
    }),
  );

  const adultPrompts = adultTopics.map((topic, index) => ({
    id: `${spec.key}-adult-${String(index + 1).padStart(2, "0")}`,
    category: adultScene.id,
    rating: "adult" as const,
    title: titleFor(spec.style, topic, adultScene),
    instruction: promptCopy(spec.style, topic, adultScene),
    options: optionsFor(spec.style, topic, adultScene, index),
    answer: answerFor(spec.style, topic, adultScene, index),
    tips: [adultScene.angle, "答えにくい人がいたらすぐスキップします。", ...spec.judgeTips.slice(0, 1)],
    targetNumber: spec.style === "countUp" ? 24 + (index % 8) * 3 : undefined,
  }));

  return [...normalPrompts, ...adultPrompts];
}

const specs: readonly GameSpec[] = [
  {
    key: "majority-game",
    articleOrder: 3,
    title: "マジョリティゲーム",
    description: "この場の多数派を読み切る二択心理戦",
    people: "3人から",
    minutes: "5分から",
    accent: "teal",
    icon: "vote",
    groups: ["url", "talk", "large"],
    kind: "default",
    minPlayers: 3,
    maxPlayers: 30,
    style: "majority",
    setupSteps: setupBase,
    playSteps: ["A/Bを読み上げます。", "多数派だと思う方を同時に選びます。", "理由を一言ずつ聞きます。"],
    judgeTips: ["多数派が勝ちですが、同数なら全員セーフにします。", "少数派を責めず、意外な視点として拾います。"],
  },
  {
    key: "truth-lie-game",
    articleOrder: 4,
    title: "2つの真実と1つの嘘",
    description: "本当2つと嘘1つを混ぜて当て合う",
    people: "2人から",
    minutes: "5分から",
    accent: "gold",
    icon: "question",
    groups: ["url", "talk"],
    kind: "default",
    minPlayers: 2,
    maxPlayers: 20,
    style: "truthLie",
    setupSteps: setupBase,
    playSteps: ["話し手がお題に沿って3つ話します。", "聞き手は質問します。", "嘘だと思う番号を同時に選びます。"],
    judgeTips: ["嘘は大げさすぎない方が盛り上がります。", "暴露ではなく、意外な一面が出る話にします。"],
  },
  {
    key: "count-up-game",
    articleOrder: 5,
    title: "カウントアップゲーム",
    description: "目標数字を避けながら1から3個ずつ進める",
    people: "2人から",
    minutes: "3分から",
    accent: "indigo",
    icon: "timer",
    groups: ["url", "reaction"],
    kind: "count-up",
    minPlayers: 2,
    maxPlayers: 20,
    style: "countUp",
    setupSteps: setupBase,
    playSteps: ["現在の数字から1から3個進めます。", "目標数字を言った人がアウトです。", "逆算で相手に目標を踏ませます。"],
    judgeTips: ["計算ミスも笑って進めます。", "詰まったら司会が現在値を読み上げます。"],
  },
  {
    key: "reverse-word-game",
    articleOrder: 6,
    title: "逆さ言葉ゲーム",
    description: "表示された言葉を逆から読む反射ゲーム",
    people: "2人から",
    minutes: "3分から",
    accent: "coral",
    icon: "timer",
    groups: ["url", "reaction"],
    kind: "default",
    minPlayers: 2,
    maxPlayers: 20,
    style: "reverse",
    answerMode: "hidden",
    setupSteps: setupBase,
    playSteps: ["司会が言葉を読みます。", "指名された人が逆から読みます。", "答えを表示して確認します。"],
    judgeTips: ["3秒を目安にします。", "噛んでも場が温まれば成功です。"],
  },
  {
    key: "song-association-quiz",
    articleOrder: 7,
    title: "曲名連想クイズ",
    description: "音源なしで曲名や歌手をヒントから当てる",
    people: "2人から",
    minutes: "5分から",
    accent: "teal",
    icon: "question",
    groups: ["url", "talk", "reaction"],
    kind: "default",
    minPlayers: 2,
    maxPlayers: 20,
    style: "song",
    answerMode: "hidden",
    setupSteps: setupBase,
    playSteps: ["出題者だけ答えを見ます。", "曲の雰囲気や思い出をヒントにします。", "分かった人から答えます。"],
    judgeTips: ["音源は使わず鼻歌や手拍子は短くします。", "世代差が出たらヒントを増やします。"],
  },
  {
    key: "drawing-quiz",
    articleOrder: 8,
    title: "お絵描きクイズ",
    description: "絵で伝えて周りが答えを当てる",
    people: "2人から",
    minutes: "5分から",
    accent: "gold",
    icon: "sparkles",
    groups: ["url", "drawing", "large"],
    kind: "drawing",
    minPlayers: 2,
    maxPlayers: 30,
    style: "drawing",
    answerMode: "hidden",
    setupSteps: setupBase,
    playSteps: ["出題者だけ答えを見ます。", "紙やスマホメモに絵を描きます。", "回答者は早く答えます。"],
    judgeTips: ["文字で答えを書くのは禁止です。", "絵心より伝わる工夫を褒めます。"],
  },
  {
    key: "hazard-card-game",
    articleOrder: 9,
    title: "ドキドキはずれカード",
    description: "1枚だけはずれの安全な運試し",
    people: "2人から",
    minutes: "3分から",
    accent: "coral",
    icon: "shield",
    groups: ["url", "luck"],
    kind: "hazard",
    minPlayers: 2,
    maxPlayers: 20,
    style: "hazard",
    setupSteps: setupBase,
    playSteps: ["順番にカードを1枚引きます。", "はずれを引いたら軽い一言お題に答えます。", "罰ではなく笑って次へ進みます。"],
    judgeTips: ["食べ物の辛さや危険な罰は使いません。", "後半の休憩ゲームとして短く遊びます。"],
  },
  {
    key: "typing-speed-game",
    articleOrder: 11,
    title: "スマホ早打ちゲーム",
    description: "短文を早く正確に入力する",
    people: "2人から",
    minutes: "3分から",
    accent: "indigo",
    icon: "timer",
    groups: ["url", "reaction"],
    kind: "typing",
    minPlayers: 2,
    maxPlayers: 20,
    style: "typing",
    answerMode: "open",
    setupSteps: setupBase,
    playSteps: ["表示された短文を確認します。", "合図で各自のスマホに入力します。", "誤字なしで早い人が勝ちです。"],
    judgeTips: ["送信先はメモアプリでもOKです。", "誤字は惜しい賞として拾います。"],
  },
  {
    key: "memory-logo-drawing",
    articleOrder: 10,
    title: "記憶だけでロゴを書く",
    description: "見慣れたものを記憶だけで描く",
    people: "2人から",
    minutes: "5分から",
    accent: "gold",
    icon: "sparkles",
    groups: ["url", "drawing"],
    kind: "drawing",
    minPlayers: 2,
    maxPlayers: 20,
    style: "memoryLogo",
    answerMode: "hidden",
    setupSteps: setupBase,
    playSteps: ["お題を見ます。", "検索せず記憶だけで描きます。", "一斉に見せて拍手で賞を決めます。"],
    judgeTips: ["固有ロゴを正確に再現する必要はありません。", "味がある絵を歓迎します。"],
  },
  {
    key: "value-meter-game",
    articleOrder: 12,
    title: "価値観メーター",
    description: "1から100の強さを言葉で例える協力ゲーム",
    people: "2人から",
    minutes: "5分から",
    accent: "teal",
    icon: "sparkles",
    groups: ["url", "talk", "large"],
    kind: "value",
    minPlayers: 2,
    maxPlayers: 20,
    style: "value",
    setupSteps: setupBase,
    playSteps: ["各自が心の中で数字を決めます。", "数字を言わずに例えます。", "小さい順に並べます。"],
    judgeTips: ["数字そのものを連想させすぎないようにします。", "ズレた理由を聞くと盛り上がります。"],
  },
  {
    key: "acting-phrase-game",
    articleOrder: 13,
    title: "ひとこと演技ゲーム",
    description: "同じ一言を感情だけで演じ分ける",
    people: "3人から",
    minutes: "5分から",
    accent: "coral",
    icon: "question",
    groups: ["url", "talk", "reaction"],
    kind: "acting",
    minPlayers: 3,
    maxPlayers: 20,
    style: "acting",
    setupSteps: setupBase,
    playSteps: ["演じる人だけ感情を選びます。", "声と表情だけで一言を言います。", "周りが感情を当てます。"],
    judgeTips: ["演技が苦手な人には声だけでもOKにします。", "当てる側は茶化しすぎません。"],
  },
  {
    key: "party-sugoroku",
    articleOrder: 14,
    title: "飲み会すごろく",
    description: "止まったマスのお題で進む安全すごろく",
    people: "2人から",
    minutes: "10分から",
    accent: "gold",
    icon: "list",
    groups: ["url", "board", "large"],
    kind: "sugoroku",
    minPlayers: 2,
    maxPlayers: 20,
    style: "sugoroku",
    setupSteps: setupBase,
    playSteps: ["順番にサイコロを振ります。", "止まったマスのお題に答えます。", "先にゴールした人を拍手します。"],
    judgeTips: ["飲酒強要マスは作りません。", "答えにくいマスはスキップできます。"],
  },
  {
    key: "territory-board-game",
    articleOrder: 15,
    title: "シンプル陣取り",
    description: "マスを取り合う軽いボード風ゲーム",
    people: "2人から",
    minutes: "10分から",
    accent: "indigo",
    icon: "trophy",
    groups: ["url", "board"],
    kind: "territory",
    minPlayers: 2,
    maxPlayers: 4,
    style: "territory",
    setupSteps: setupBase,
    playSteps: ["順番に空いているマスを取ります。", "取ったマスのお題に答えます。", "多く取った人が勝ちです。"],
    judgeTips: ["細かい盤面ルールよりテンポを優先します。", "作戦を口に出すと盛り上がります。"],
  },
  {
    key: "weird-karuta-game",
    articleOrder: 16,
    title: "変な一言カルタ",
    description: "特徴説明から正解ワードを探す知的ゆるゲーム",
    people: "2人から",
    minutes: "5分から",
    accent: "teal",
    icon: "question",
    groups: ["url", "talk", "reaction"],
    kind: "default",
    minPlayers: 2,
    maxPlayers: 20,
    style: "karuta",
    answerMode: "hidden",
    setupSteps: setupBase,
    playSteps: ["読み手だけ答えを見ます。", "形や雰囲気を説明します。", "分かった人が答えます。"],
    judgeTips: ["専門知識より説明の面白さを楽しみます。", "分からない時はヒントを増やします。"],
  },
  {
    key: "emo-hint-game",
    articleOrder: 17,
    title: "エモヒント連想",
    description: "抽象ヒントから答えを当てる感性ゲーム",
    people: "3人から",
    minutes: "5分から",
    accent: "coral",
    icon: "sparkles",
    groups: ["url", "talk"],
    kind: "default",
    minPlayers: 3,
    maxPlayers: 20,
    style: "emoHint",
    answerMode: "hidden",
    setupSteps: setupBase,
    playSteps: ["出題者だけ答えを見ます。", "抽象的なヒントを出します。", "数人だけ分かる表現を狙います。"],
    judgeTips: ["全員正解でも全員不正解でも笑って次へ進みます。", "感性の違いを楽しみます。"],
  },
  {
    key: "resource-negotiation-game",
    articleOrder: 18,
    title: "資源交渉トーク",
    description: "足りない資源を交渉で集める会話ゲーム",
    people: "3人から",
    minutes: "10分から",
    accent: "gold",
    icon: "trophy",
    groups: ["url", "talk", "board"],
    kind: "default",
    minPlayers: 3,
    maxPlayers: 8,
    style: "negotiation",
    setupSteps: setupBase,
    playSteps: ["各自が足りない資源を宣言します。", "相手に交換条件を出します。", "一番納得感のある交渉を拍手で決めます。"],
    judgeTips: ["強引な交渉ではなく、相手が得する条件を考えます。", "勝敗より説得の工夫を拾います。"],
  },
  {
    key: "life-event-sugoroku",
    articleOrder: 19,
    title: "人生イベントすごろく",
    description: "架空の人生イベントを選んで進む",
    people: "2人から",
    minutes: "10分から",
    accent: "indigo",
    icon: "list",
    groups: ["url", "board", "talk"],
    kind: "sugoroku",
    minPlayers: 2,
    maxPlayers: 12,
    style: "life",
    setupSteps: setupBase,
    playSteps: ["順番にサイコロを振ります。", "止まったイベントを読みます。", "選択肢と理由を一言話します。"],
    judgeTips: ["現実の事情を深掘りしすぎません。", "架空の人生として軽く遊びます。"],
  },
  {
    key: "arm-wrestling-tournament",
    articleOrder: 20,
    title: "腕相撲トーナメント",
    description: "安全注意つきの対戦表とハンデ決め",
    people: "2人から",
    minutes: "5分から",
    accent: "coral",
    icon: "trophy",
    groups: ["url", "reaction"],
    kind: "tournament",
    minPlayers: 2,
    maxPlayers: 16,
    style: "arm",
    setupSteps: setupBase,
    playSteps: ["画面の対戦順を見ます。", "必要ならハンデを選びます。", "痛みが出たらすぐ中止します。"],
    judgeTips: ["力差がある時はハンデをつけます。", "机や姿勢が不安定なら実施しません。"],
  },
  {
    key: "safe-random-draw",
    articleOrder: 21,
    title: "安全はずれ抽選",
    description: "危険な罰なしのロシアン風抽選",
    people: "2人から",
    minutes: "3分から",
    accent: "gold",
    icon: "shield",
    groups: ["url", "luck"],
    kind: "draw",
    minPlayers: 2,
    maxPlayers: 20,
    style: "draw",
    setupSteps: setupBase,
    playSteps: ["順番にカードを引きます。", "はずれなら軽いお題に答えます。", "誰が引いたかを当てる遊びにしてもOKです。"],
    judgeTips: ["辛い食べ物や危険な罰は使いません。", "表情を隠して当て合うと盛り上がります。"],
  },
  {
    key: "person-hint-quiz",
    articleOrder: 22,
    title: "人物当てヒントクイズ",
    description: "写真なしで人物をヒントから当てる",
    people: "2人から",
    minutes: "5分から",
    accent: "teal",
    icon: "question",
    groups: ["url", "talk", "large"],
    kind: "default",
    minPlayers: 2,
    maxPlayers: 30,
    style: "person",
    answerMode: "hidden",
    setupSteps: setupBase,
    playSteps: ["出題者だけ答えを見ます。", "人物の特徴を傷つけない言葉でヒントにします。", "分かった人が答えます。"],
    judgeTips: ["容姿いじりや個人情報の深掘りは避けます。", "共通の知人の場合は全員が分かる範囲にします。"],
  },
  {
    key: "large-majority-game",
    articleOrder: 23,
    title: "大人数マジョリティ",
    description: "10人以上でも回しやすい多数派勝ち残り",
    people: "10人から",
    minutes: "5分から",
    accent: "indigo",
    icon: "vote",
    groups: ["url", "talk", "large"],
    kind: "default",
    minPlayers: 3,
    maxPlayers: 50,
    style: "majority",
    setupSteps: setupBase,
    playSteps: ["A/Bを読みます。", "多数派だと思う方へ移動または挙手します。", "勝ち残り方式で数問続けます。"],
    judgeTips: ["移動が難しい場では指番号で選びます。", "人数が多いほど説明を短くします。"],
  },
  {
    key: "humming-intro-quiz",
    articleOrder: 24,
    title: "鼻歌イントロドン",
    description: "音源なしで鼻歌やリズムから当てる",
    people: "2人から",
    minutes: "5分から",
    accent: "coral",
    icon: "timer",
    groups: ["url", "reaction", "large"],
    kind: "default",
    minPlayers: 2,
    maxPlayers: 30,
    style: "song",
    answerMode: "hidden",
    setupSteps: setupBase,
    playSteps: ["出題者だけ答えを見ます。", "鼻歌、手拍子、雰囲気ヒントを出します。", "一番早く分かった人が答えます。"],
    judgeTips: ["音源は内蔵しません。", "知らない人が多そうならヒントを増やします。"],
  },
  {
    key: "loanword-ban-game",
    articleOrder: 25,
    title: "外来語禁止ゲーム",
    description: "カタカナ語を避けて説明する言い換え遊び",
    people: "2人から",
    minutes: "5分から",
    accent: "teal",
    icon: "shield",
    groups: ["url", "talk", "reaction"],
    kind: "default",
    minPlayers: 2,
    maxPlayers: 20,
    style: "loanword",
    setupSteps: setupBase,
    playSteps: ["テーマを読みます。", "カタカナ語を避けて説明します。", "言ってしまったら周りが優しく指摘します。"],
    judgeTips: ["固有名詞は司会判断にします。", "言い換えの面白さを褒めます。"],
  },
  {
    key: "werewolf-game",
    articleOrder: 26,
    title: "人狼ゲーム",
    description: "役職を隠して、昼の話し合いと投票で人狼を探す",
    people: "6人から",
    minutes: "15分から",
    accent: "indigo",
    icon: "shield",
    groups: ["url", "talk", "large"],
    kind: "default",
    minPlayers: 6,
    maxPlayers: 12,
    style: "werewolf",
    answerMode: "open",
    setupSteps: [
      "参加者を6〜12人で登録し、司会を1人決めます。司会は役職を秘密で割り当てます。",
      "基本役職は人狼、村人、占い師。人数が多い場合は騎士や霊媒師を追加します。",
      "夜は目を閉じて役職行動、昼は話し合い、最後に投票で1人を追放します。",
      "脱落した人も責めず、観戦や司会補助で場を見守ります。",
    ],
    playSteps: [
      "司会が夜を宣言し、人狼、占い師、騎士、霊媒師の順に静かに行動します。",
      "朝になったら司会が結果を発表し、全員で3分ほど話し合います。",
      "投票で一番疑われた人を追放し、勝利条件を満たすまで夜と昼を繰り返します。",
    ],
    judgeTips: [
      "飲酒や暴露を罰にせず、推理と会話のゲームとして進めます。",
      "個人攻撃になりそうな言い方は司会がやわらかく止めます。",
      "初心者が多い時は占い師と騎士だけにして、役職を増やしすぎません。",
    ],
  },
];

export const urlCandidateGameConfigs: readonly UrlCandidateGameConfig[] = specs.map((spec) => ({
  ...spec,
  prompts: buildPrompts(spec),
}));

export const urlCandidateGameKeys = urlCandidateGameConfigs.map((config) => config.key);

export const urlCandidateGameByKey = Object.fromEntries(
  urlCandidateGameConfigs.map((config) => [config.key, config]),
) as Record<UrlCandidateGameKey, UrlCandidateGameConfig>;
