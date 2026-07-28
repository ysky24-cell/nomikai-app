import assert from "node:assert/strict";
import test from "node:test";
import { canPartyPackParticipantReveal, validateJohariHostTransition, validatePartyPackHostReveal } from "./party-pack-authorization.js";

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

function johari(overrides: Record<string, unknown> = {}) {
  return {
    step: "self",
    players: [{ id: "host" }, { id: "alice" }, { id: "bob" }],
    targetIndex: 0,
    selfSubmitted: { host: true, alice: true, bob: true },
    peerSubmitted: {
      host: { alice: true, bob: true },
      alice: { host: true, bob: true },
      bob: { host: true, alice: true },
    },
    ...overrides,
  };
}

test("gates Johari host transitions on complete submissions", () => {
  assert.equal(validateJohariHostTransition(null, johari({ step: "self", deckWordIds: ["w1"], targetIndex: 0, peerIndex: 0, selfSelections: {}, selfSubmitted: {}, peerSelections: {}, peerSubmitted: {} })), null);
  const currentSelf = johari({ selfSubmitted: { host: true, alice: false, bob: true } });
  assert.equal(validateJohariHostTransition(currentSelf, johari({ step: "peer", selfSubmitted: { host: true, alice: false, bob: true } })), "game_not_ready");
  assert.equal(validateJohariHostTransition(johari(), johari({ step: "peer" })), null);

  const currentPeer = johari({ step: "peer" });
  assert.equal(validateJohariHostTransition(currentPeer, johari({ step: "result", peerSubmitted: { host: { alice: true }, alice: { host: true, bob: true }, bob: { host: true, alice: true } } })), "game_not_ready");
  assert.equal(validateJohariHostTransition(currentPeer, johari({ step: "result" })), null);
});

test("rejects Johari phase skips and only completes the final result", () => {
  assert.equal(validateJohariHostTransition(johari(), johari({ step: "result" })), "host_required");
  assert.equal(validateJohariHostTransition(johari({ step: "setup" }), johari({ step: "self" })), "host_required");
  assert.equal(validateJohariHostTransition(johari({ step: "result", targetIndex: 1 }), johari({ step: "complete", targetIndex: 1 })), "host_required");
  assert.equal(validateJohariHostTransition(johari({ step: "result", targetIndex: 2 }), johari({ step: "complete", targetIndex: 2 })), null);
  const restart = johari({ step: "complete", targetIndex: 2 });
  assert.equal(validateJohariHostTransition(restart, johari({ step: "self", deckWordIds: ["w1"], targetIndex: 0, peerIndex: 0, selfSelections: {}, selfSubmitted: {}, peerSelections: {}, peerSubmitted: {} })), null);
  assert.equal(validateJohariHostTransition(restart, johari({ step: "self", targetIndex: 0, peerIndex: 0 })), "host_required");
});
