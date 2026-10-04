import assert from "node:assert/strict";
import vm from "node:vm";
import { createSimRuntime } from "./balance-harness.mjs";

// Real final campaign/engine chain; only the negative input flags are fixtures.
const rt = await createSimRuntime();
rt.setSeed(1234);
rt.seedProgress();
rt.campaignUiHarness.select("lisaya", 2, "normal");
const state = rt.campaignUiHarness.start();
state.campaign.playerRing = 6;
const snapshot = () => JSON.stringify({ ring:state.campaign.playerRing,used:state.campaign.resonanceUsed,
  shield:state.player.shield,energy:state.player.energy,hand:state.player.hand,stats:state.campaignStats });
const reject = (name, setup, cleanup) => {
  setup();
  const before = snapshot();
  rt.campaignUiHarness.activateResonance("guard");
  assert.equal(snapshot(), before, `${name} must not consume resonance or modify combat`);
  cleanup();
};
reject("enemy turn", () => { state.turn = "enemy"; }, () => { state.turn = "player"; });
reject("game over", () => { state.gameOver = true; }, () => { state.gameOver = false; });
reject("action lock", () => { state.actionLocked = true; }, () => { state.actionLocked = false; });
reject("effect lock", () => { rt.context.effectsRenderer._playLock = 1; }, () => { rt.context.effectsRenderer._playLock = 0; });
reject("pending game over", () => vm.runInContext("pendingGameOverCheck.flag=true", rt.context), () => vm.runInContext("pendingGameOverCheck.flag=false", rt.context));
reject("skip action", () => { state.player.skipAction = true; }, () => { state.player.skipAction = false; });
const beforeInvalid = snapshot();
rt.campaignUiHarness.activateResonance("invalid");
assert.equal(snapshot(), beforeInvalid, "Invalid option must not consume ring");
const beforeShield = state.player.shield;
rt.campaignUiHarness.activateResonance("guard");
assert.equal(state.player.shield - beforeShield, rt.campaignMode.resonanceShield(state.player.maxHp));
assert.equal(state.campaign.playerRing, 0);
assert.equal(state.campaign.resonanceUsed, true);
const once = snapshot();
rt.campaignUiHarness.activateResonance("guard");
assert.equal(snapshot(), once, "A repeated activation must have no effects");
console.log("Campaign resonance input: 9 cases PASS (live turn/lifecycle/locks, normal guard, exactly once).");
