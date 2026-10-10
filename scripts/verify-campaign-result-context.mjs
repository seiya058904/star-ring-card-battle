import assert from "node:assert/strict";
import { createSimRuntime } from "./balance-harness.mjs";

// Run the real campaign UI bindings and real start/authorization chain. The
// adapter only represents visible modal/result buttons, not campaign rules.
function installUiAdapter(rt) {
  const { document, uiRenderer: ui } = rt.context;
  const getOriginalElement = document.getElementById.bind(document);
  let modalButtons = [];
  let resultButtons = [];
  let modalOpen = false;
  let screen = "home";
  const toasts = [];
  const datasetKey = name => name.slice(5).replace(/-([a-z])/g, (_, char) => char.toUpperCase());
  function buttonsFrom(html) {
    return [...String(html).matchAll(/<button\b([^>]*)>/g)].map(match => {
      const attributes = Object.fromEntries([...match[1].matchAll(/([\w-]+)="([^"]*)"/g)].map(item => [item[1], item[2]]));
      const button = document.createElement("button");
      button.id = attributes.id || "";
      button.disabled = /\bdisabled\b/.test(match[1]);
      button.dataset = Object.fromEntries(Object.entries(attributes).filter(([name]) => name.startsWith("data-")).map(([name, value]) => [datasetKey(name), value]));
      button.addEventListener = (type, handler) => { if (type === "click") button.onclick = handler; };
      return button;
    });
  }
  function query(buttons, selector) {
    if (selector.startsWith("#")) return buttons.filter(button => button.id === selector.slice(1));
    const match = selector.match(/^\[(data-[\w-]+)(?:="([^"]+)")?\]$/);
    if (!match) return [];
    const key = datasetKey(match[1]);
    return buttons.filter(button => button.dataset[key] !== undefined && (match[2] === undefined || button.dataset[key] === match[2]));
  }
  const row = document.createElement("div");
  let rowHtml = "";
  Object.defineProperty(row, "innerHTML", { get: () => rowHtml, set: html => { rowHtml = html; resultButtons = buttonsFrom(html); } });
  row.querySelectorAll = selector => query(resultButtons, selector);
  row.querySelector = selector => row.querySelectorAll(selector)[0] || null;
  document.getElementById = id => modalButtons.find(button => button.id === id) || getOriginalElement(id);
  document.querySelectorAll = selector => query([...modalButtons, ...resultButtons], selector);
  document.querySelector = selector => selector === "#screen-result .button-row" ? row : document.querySelectorAll(selector)[0] || null;
  ui.openModal = (title, html, options = {}) => {
    ui._modalRevision = (ui._modalRevision || 0) + 1;
    modalOpen = true;
    modalButtons = buttonsFrom(html);
    options.afterRender?.();
  };
  ui.closeModal = () => { ui._modalRevision = (ui._modalRevision || 0) + 1; modalOpen = false; };
  ui.isModalOpen = () => modalOpen;
  ui.nav = name => { screen = name; };
  ui.showToast = message => toasts.push(message);
  function click(scope, selector) {
    const buttons = scope === "modal" ? modalButtons : resultButtons;
    const button = query(buttons, selector)[0];
    assert.ok(button && !button.disabled, `缺少可点击按钮：${selector}`);
    assert.ok(scope === "modal" ? modalOpen : !modalOpen && screen === "result", `按钮当前不可见或被模态遮挡：${selector}`);
    assert.equal(typeof button.onclick, "function", `真实 UI 未绑定按钮：${selector}`);
    return button.onclick();
  }
  return { click, toasts };
}

async function completedBattle({ allUnlocked = true } = {}) {
  const rt = await createSimRuntime();
  const progress = rt.seedProgress();
  if (!allUnlocked) {
    Object.values(progress.characters).forEach(entry => { entry.unlockedStage = 1; });
    progress.characters.lisaya.unlockedStage = 3;
    rt.localStorage.setItem(rt.campaignMode.STORAGE_KEY, JSON.stringify(progress));
  }
  const ui = installUiAdapter(rt);
  rt.setSeed(7341);
  rt.campaignUiHarness.select("lisaya", 2, "normal");
  const state = rt.campaignUiHarness.start();
  ui.click("modal", "#mulliganConfirm");
  await rt.drain();
  state.gameOver = true;
  state.winner = "player";
  rt.context.uiRenderer.showResult();
  return { rt, ui, state };
}

function changeRouteSelection(ui, { character = "heka", difficulty = "hard", cancel = true } = {}) {
  ui.click("result", '[data-campaign-result="route"]');
  ui.click("modal", `[data-campaign-character="${character}"]`);
  ui.click("modal", `[data-campaign-difficulty="${difficulty}"]`);
  if (cancel) ui.click("modal", "#campaignCloseBtn");
}

let checked = 0;
for (const allUnlocked of [true, false]) {
  for (const action of ["retry", "next"]) {
    const { rt, ui, state } = await completedBattle({ allUnlocked });
    changeRouteSelection(ui);
    ui.click("result", `[data-campaign-result="${action}"]`);
    const next = rt.gameEngine.state;
    assert.notEqual(next, state, `${action} 应为原角色启动新战斗，不得受路线中另一角色的锁关影响`);
    assert.equal(next.campaign.characterId, state.campaign.characterId, `${action} 不得串到取消选择的角色`);
    assert.equal(next.campaign.difficulty, state.campaign.difficulty, `${action} 必须保留已结算战斗的难度`);
    assert.equal(next.campaign.stage, state.campaign.stage + (action === "next" ? 1 : 0), `${action} 的关卡必须来自结算状态`);
    assert.equal(next.player.name, state.player.name, `${action} 的真实玩家卡组必须属于原角色`);
    const expectedPower = rt.campaignData.difficulties[state.campaign.difficulty].power;
    assert.ok([...next.enemy.hand, ...next.enemy.drawPile].every(card => card.effectMultiplier === expectedPower), `${action} 的实际敌方倍率必须使用原难度`);
    checked += 1;
  }
}

// Result identity is not authorization: a reset must still lock the old stage.
for (const action of ["retry", "next"]) {
  const { rt, ui, state } = await completedBattle();
  changeRouteSelection(ui);
  await rt.campaignMode.resetProgress(rt.localStorage, rt.campaignData.characters);
  const afterReset = rt.localStorage.getItem(rt.campaignMode.STORAGE_KEY);
  const session = rt.gameEngine.sessionId;
  ui.click("result", `[data-campaign-result="${action}"]`);
  assert.equal(rt.gameEngine.state, state, `${action} 不得绕过重置后的关卡授权`);
  assert.equal(rt.gameEngine.sessionId, session, `${action} 被拒绝时不得启动新战斗`);
  assert.equal(rt.localStorage.getItem(rt.campaignMode.STORAGE_KEY), afterReset, `${action} 不得恢复重置前的存档`);
  assert.ok(ui.toasts.some(message => message.includes("尚未解锁")), `${action} 必须告知玩家关卡尚未解锁`);
  checked += 1;
}

// Explicitly entering a different route is still an intentional new selection.
{
  const { rt, ui, state } = await completedBattle({ allUnlocked: false });
  changeRouteSelection(ui, { cancel: false });
  ui.click("modal", "#campaignStartBtn");
  const next = rt.gameEngine.state;
  assert.notEqual(next, state, "路线进入按钮应开始明确选中的新战斗");
  assert.equal(next.campaign.characterId, "heka", "返回路线后允许主动选择其他角色");
  assert.equal(next.campaign.difficulty, "hard", "路线进入按钮应使用主动选择的难度");
  assert.equal(next.campaign.stage, 1, "路线进入仍遵守选中角色的解锁关卡");
  checked += 1;
}

console.log(`Campaign result context: ${checked} cases PASS (retry/next identity, difficulty, locked-character isolation, reset authorization, explicit route selection).`);
