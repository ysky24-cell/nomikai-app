export function isPartyPackValueMeterRowComplete(clue: string, value: string): boolean {
  return Boolean(clue.trim() && value.trim());
}
