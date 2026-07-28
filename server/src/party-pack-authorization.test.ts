import assert from "node:assert/strict";
import test from "node:test";
import { canPartyPackParticipantReveal, validatePartyPackHostReveal } from "./party-pack-authorization.js";

function partyPack(overrides: Record<string, unknown> = {}) {
  return {
    step: "prompt",
    promptId: "truth-lie-01",
    answerVisible: false,
    currentPlayerIndex: 0,
    players: [{ id: "host" }, { id: "alice" }, { id: "bob" }],
    votes: {},
    guesses: {},
    ...overrides,
  };
}

test("rejects participant truth-lie/acting answerVisible shortcuts", () => {
  assert.equal(canPartyPackParticipantReveal("truth-lie", "host", "host", ["answerVisible"], true), false);
  assert.equal(canPartyPackParticipantReveal("acting", "host", "host", ["answerVisible"], true), false);
  assert.equal(canPartyPackParticipantReveal("typing", "host", "host", ["answerVisible"], true), true);
});

test("requires all truth-lie voters before host reveal", () => {
  const current = partyPack({ guesses: { truthLieAnswer: "1" } });
  const early = partyPack({ guesses: { truthLieAnswer: "1" }, answerVisible: true, votes: { alice: "0" } });
  const ready = partyPack({ guesses: { truthLieAnswer: "1" }, answerVisible: true, votes: { alice: "0", bob: "1" } });
  assert.equal(validatePartyPackHostReveal(current, early), "game_not_ready");
  assert.equal(validatePartyPackHostReveal(current, ready), null);
});

test("requires every player value-meter row before host reveal", () => {
  const current = partyPack({ promptId: "value-meter-01" });
  const early = partyPack({ promptId: "value-meter-01", answerVisible: true, votes: { host: "1", alice: "2", bob: "3" }, guesses: { host: "reason", alice: "reason" } });
  const ready = partyPack({ promptId: "value-meter-01", answerVisible: true, votes: { host: "1", alice: "2", bob: "3" }, guesses: { host: "reason", alice: "reason", bob: "reason" } });
  assert.equal(validatePartyPackHostReveal(current, early), "game_not_ready");
  assert.equal(validatePartyPackHostReveal(current, ready), null);
});
