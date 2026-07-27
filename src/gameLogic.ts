export type RandomSource = () => number;

export type WerewolfRole = "werewolf" | "villager" | "seer" | "knight" | "medium";

export type WerewolfAssignment = {
  playerId: string;
  role: WerewolfRole;
  alive: boolean;
};

export type PlayerLike = { id: string };

export function shuffle<T>(items: readonly T[], random: RandomSource = Math.random): T[] {
  const copied = [...items];
  for (let index = copied.length - 1; index > 0; index -= 1) {
    const next = Math.floor(Math.min(0.999999999, Math.max(0, random())) * (index + 1));
    [copied[index], copied[next]] = [copied[next], copied[index]];
  }
  return copied;
}

export function createHazardIndex(
  random: RandomSource = Math.random,
  cardCount = 8,
): number {
  const safeCardCount = Math.max(1, Math.floor(cardCount));
  const normalizedRandom = Math.min(0.999999999, Math.max(0, random()));
  return Math.floor(normalizedRandom * safeCardCount) + 1;
}

export type DrawResult = "safe" | "hazard";

export function resolveHazardDraw(drawNumber: number, hazardIndex: number): DrawResult {
  return drawNumber === hazardIndex ? "hazard" : "safe";
}

export function normalizeYamanoteAnswer(value: string): string {
  return value.normalize("NFKC").toLocaleLowerCase().replace(/[^\p{L}\p{N}]/gu, "");
}

export function getWerewolfRoleDeck(playerCount: number): WerewolfRole[] {
  const safePlayerCount = Math.max(0, Math.floor(playerCount));
  const roles: WerewolfRole[] =
    safePlayerCount <= 6
      ? ["werewolf", "seer", "knight"]
      : safePlayerCount <= 8
        ? ["werewolf", "werewolf", "seer", "knight"]
        : safePlayerCount <= 10
          ? ["werewolf", "werewolf", "seer", "knight", "medium"]
          : ["werewolf", "werewolf", "werewolf", "seer", "knight", "medium"];
  const villagerCount = Math.max(0, safePlayerCount - roles.length);
  return [...roles, ...Array.from({ length: villagerCount }, () => "villager" as const)];
}

export function createWerewolfAssignments<T extends PlayerLike>(
  players: readonly T[],
  random: RandomSource = Math.random,
): WerewolfAssignment[] {
  const roles = shuffle(getWerewolfRoleDeck(players.length), random);
  return players.map((player, index) => ({
    playerId: player.id,
    role: roles[index],
    alive: true,
  }));
}

export type VoteTallyRow<T extends PlayerLike> = {
  player: T;
  count: number;
};

export function tallyVotes<T extends PlayerLike>(
  votes: Readonly<Record<string, string>>,
  candidates: readonly T[],
) {
  const rows: VoteTallyRow<T>[] = candidates.map((player) => ({
    player,
    count: Object.values(votes).filter((targetId) => targetId === player.id).length,
  }));
  const maxVotes = Math.max(0, ...rows.map((row) => row.count));
  const topTargetIds = rows
    .filter((row) => row.count === maxVotes && maxVotes > 0)
    .map((row) => row.player.id);
  return { rows, maxVotes, topTargetIds };
}
