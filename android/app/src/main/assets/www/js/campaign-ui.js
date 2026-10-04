(function (global) {
  const data = global.campaignData;
  const mode = global.campaignMode;
  const campaignRules = global.campaignRules;
  const campaignRuntime = global.campaignRuntime;

  const escapeHtml = global.escapeHtml;
  const progressKey = mode.STORAGE_KEY;
  let selectedCharacter = data.characters[0].id;
  let selectedDifficulty = "normal";
  let selectedStage = 1;
  const CAMPAIGN_CHARACTER_MAP = { lisaya: "human-lisaya", luolinfo: "human-luolinfo", eluxia: "elf-eluxia", moluo: "orc-moluo", heka: "demon-heka", su: "godkin-su" };
  const difficulty = () => data.difficulties[selectedDifficulty] || data.difficulties.normal;
  const progress = () => { try { return mode.loadProgress(localStorage.getItem(progressKey), data.characters); } catch { return mode.defaultProgress(data.characters); } };
  const character = () => data.characters.find(item => item.id === selectedCharacter) || data.characters[0];
  const stage = () => data.stages[selectedStage - 1];
  const campaignDeck = item => fixedCardLibrary.createRuntimeDeck(CAMPAIGN_CHARACTER_MAP[item.id]);
  // 第五关 Boss（level 100 元祖龙神）防御经济定标：以审计实测面板为基准，
  // damage/defense/heal 三因子直接作用于战斗 profile（伤害、固定减伤、护盾、治疗全链路）。
  const STAGE5_BOSS_TUNING = { hp: .07, damage: .09, defense: .004, heal: .01 };
  // 第四关（释迦格，龙族）此前没有任何专项归一化：龙族档案是 hp 1.55 / damage 1.32 / defense 1.18，
  // 叠上关卡倍率 1.10 后敌方同时更坦克也更痛，血量甚至是第 5 关首领的 2.3 倍——
  // 难度在第 4/5 关之间倒挂，实测第 4 关对六名角色 × 三档难度胜率全为 0%。
  // 这里用与第 5 关相同的归一化口径补上：第 5 关的 .07/.09/.004/.01 是在"敌方等级/玩家等级 ≈ 7.86"
  // 下标定的，第 4 关的敌方等级已由 levelOffset 归到同一水平（比值 ≈ 1），故按同一每单位压缩率换算。
  const STAGE4_BOSS_TUNING = { hp: .55, damage: .71, defense: .031, heal: .079 };
  // 需要 profile 压缩的首领关（键为 campaign-data 的 stage.id）；未列出的关卡不做压缩。
  const STAGE_BOSS_TUNING = { "dragon-king": STAGE4_BOSS_TUNING, "ancestral-dragon": STAGE5_BOSS_TUNING };

  const enemyDeck = (currentStage, playerLevel) => {
    const source = fixedCardLibrary.characterDefinitions.find(item => item.name === currentStage.enemyName) || fixedCardLibrary.charactersById["dragon-yemosu"];
    const deck = fixedCardLibrary.createRuntimeDeck(source.id);
    const tuning = difficulty();
    // 敌方等级归一化（只降不升，仅限声明了 levelOffset 的关卡）：遭遇强度不超过
    // 「挑战者等级 + 该关设计偏移」。不加这一步时，敌方 level 是世界观绝对值（第 4 关 94 级），
    // 而 levelHp 的指数曲线会把敌方生命与每张牌数值放大到玩家量级的 10^3 倍：
    // 62 级角色进第 4 关第 1 回合被秒，93 级角色也打不动。只降不升保证第 1–3 关
    // 对高等级角色的现有强度逐位不变。
    // 第 5 关（ancestral-dragon）明确豁免：STAGE5_BOSS_TUNING = { hp:.07, damage:.09,
    // defense:.004, heal:.01 } 是围绕固定 Lv100 元祖龙神专项定标的，改 Boss 基础等级
    // 等于间接重新标定第 5 关。故第 5 关恒为原始 Lv100，四因子与 Boss 阶段全部不动。
    const cappedLevel = Number.isFinite(currentStage.levelOffset)
      ? Math.min(100, (Number(playerLevel) || source.level) + currentStage.levelOffset)
      : source.level;
    deck.level = Math.max(1, Math.min(source.level, cappedLevel));
    // 第五关首领战专项调参：审计实测 levelHp(100) 指数曲线使 Boss 生命 29.45B、
    // 每回合伤害 1~2B、护盾 0.6B~4.7B 不衰减、固定减伤 ~770M，首领二阶段真实不可达。
    // 生命压缩走 maxHpMultiplier；伤害/防御/治疗压缩在 startCampaign 中按 profile 统一缩放，
    // 保留敌方行为、星环共鸣与首领阶段机制，使战斗“难但可通过合理游玩获胜”。
    const bossTuning = STAGE_BOSS_TUNING[currentStage.id] || null;
    deck.maxHpMultiplier = tuning.hp * (bossTuning ? bossTuning.hp : 1);
    deck.cards = deck.cards.map(card => ({ ...card, effectMultiplier: tuning.power }));
    return deck;
  };
  function renderCampaignHome() {
    const saved = progress();
    const current = saved.characters[selectedCharacter];
    uiRenderer.openModal("战役模式", `<p class="small-note">固定角色 · 连续关卡 · 本地进度</p><p class="small-note">星环共鸣：每打出一张牌获得星环格；集满 6 格后，可在己方回合点击“共鸣”选择特殊效果。</p><h3 style="margin:14px 0 8px">选择角色</h3><div class="campaign-grid">${data.characters.map(item => `<button type="button" class="campaign-card ${item.id === selectedCharacter ? "selected" : ""}" data-campaign-character="${item.id}"><h3>${item.name}</h3><div>${item.title} · ${item.race}</div><div>世界观等级 ${item.loreLevel}</div><div>${item.elements.join(" / ")} · ${item.passive}</div><small>${item.playStyle}</small><p style="margin-top:6px">首章进度：${saved.characters[item.id].completed ? "已完成" : `第 ${saved.characters[item.id].unlockedStage} 关已解锁`}</p></button>`).join("")}</div><h3 style="margin:14px 0 8px">难度</h3><div class="campaign-grid">${Object.entries(data.difficulties).map(([id, value]) => `<button type="button" class="campaign-stage ${id === selectedDifficulty ? "selected" : ""}" data-campaign-difficulty="${id}"><b>${value.label}</b><small>生命 ×${value.hp} · 威力 ×${value.power}</small></button>`).join("")}</div><h3 style="margin:14px 0 8px">关卡路线</h3><div class="campaign-grid">${data.stages.map(item => `<button type="button" class="campaign-stage ${item.order === selectedStage ? "selected" : ""}" data-campaign-stage="${item.order}" ${item.order > current.unlockedStage ? "disabled" : ""}><h3>${item.order}. ${item.name}</h3><div>${item.enemyName}</div><small>${item.intent}</small></button>`).join("")}</div><div class="modal-actions"><button class="ghost" id="campaignResetBtn" type="button">重置进度</button><button class="ghost" id="campaignCloseBtn" type="button">取消</button><button id="campaignStartBtn" type="button" ${mode.authorizeStage(current, selectedStage) ? "" : "disabled"}>进入第${selectedStage}关</button></div>`, { modalClass: "campaign-modal", afterRender: bindCampaignHome });
  }
  function bindCampaignHome() {
    document.querySelectorAll("[data-campaign-character]").forEach(button => button.onclick = () => { selectedCharacter = button.dataset.campaignCharacter; selectedStage = mode.clampStage(progress().characters[selectedCharacter], selectedStage); renderCampaignHome(); });
    document.querySelectorAll("[data-campaign-difficulty]").forEach(button => button.onclick = () => { selectedDifficulty = button.dataset.campaignDifficulty; renderCampaignHome(); });
    document.querySelectorAll("[data-campaign-stage]").forEach(button => button.onclick = () => { selectedStage = Number(button.dataset.campaignStage); renderCampaignHome(); });
    document.getElementById("campaignCloseBtn").onclick = () => uiRenderer.closeModal();
    document.getElementById("campaignStartBtn").onclick = startCampaign;
    document.getElementById("campaignResetBtn").onclick = () => uiRenderer.openConfirm({ title: "重置战役进度？", message: "六名角色的首章进度和最近战斗记录都会清除。", confirmText: "确认重置", onConfirm: async () => {
      try {
        await mode.resetProgress(localStorage, data.characters);
        selectedStage = 1;
        renderCampaignHome();
        uiRenderer.showToast("战役进度已重置");
      } catch {
        uiRenderer.showToast("存储不可用或存档无效，重置失败，请重试", "error");
      }
    }, onCancel: () => renderCampaignHome() });
    const recent = progress().recentBattles.slice(0, 5);
    if (recent.length) {
      const container = document.createElement("div");
      container.className = "campaign-recent";
      const title = document.createElement("h3");
      title.style.margin = "14px 0 8px";
      title.textContent = "最近战绩";
      container.appendChild(title);
      recent.forEach(item => {
        const row = document.createElement("p");
        row.className = "small-note";
        row.textContent = `${data.characters.find(character => character.id === item.characterId)?.name || "未知角色"} · 第${item.stage}关 · ${item.victory ? "胜利" : "失败"} · ${item.score} · ${item.rounds}回合`;
        container.appendChild(row);
      });
      document.getElementById("modalBody")?.appendChild(container);
    }
  }
  function startCampaign(snapshot) {
    // 使用包装层传入的单次 progress 快照：authorizeStage、代际记录与开战基于同一状态，
    // 防止其他标签页刚执行 reset 后，旧 UI 上仍显示为已解锁的关卡趁机启动。
    const saved = snapshot || progress();
    const player = character(); const currentStage = stage(); const playerDeck = campaignDeck(player); const state = gameEngine.start(playerDeck, enemyDeck(currentStage, playerDeck.level));
    state.gameMode = "campaign"; state.campaign = { characterId: player.id, stage: selectedStage, difficulty: selectedDifficulty, playerRing: 0, enemyRing: 0, resonanceUsed: false, enemyResonanceUsed: false, costReduction: 0, enemyCostReduction: 0, intent: null, passiveTriggers: 0, passives: { turn: {}, match: {}, round: 0 }, progressGeneration: Number(saved.resetGeneration) || 0 };
    state.enemy.name = currentStage.enemyName; state.enemy.campaignStyle = currentStage.style;
    // 首领关（第4/5关）：按 STAGE_BOSS_TUNING 缩放战斗 profile（伤害/固定减伤/护盾/治疗全链路各只缩放一次）。
    const bossTuning = STAGE_BOSS_TUNING[currentStage.id];
    if (bossTuning && state.enemy?.profile) {
      state.enemy.profile = {
        ...state.enemy.profile,
        damage: (state.enemy.profile.damage || 1) * bossTuning.damage,
        defense: (state.enemy.profile.defense || 1) * bossTuning.defense,
        heal: (state.enemy.profile.heal || 1) * bossTuning.heal,
      };
    }
    const enemyEnergy = battleRules.roundEnergy(state.round, state.enemy.maxEnergy); const openingPlan = mode.intentFor(state.enemy.hand.map(card => ({ ...card, effectiveCost: mode.effectiveCardCost(state, "enemy", card) })), enemyEnergy, state.enemy.campaignStyle, mode.aiContextFor(state, "enemy")); state.campaign.intent = { type: openingPlan.type, cardInstanceId: openingPlan.card?.instanceId || "", description: `${state.enemy.name}正在准备${openingPlan.type}。`, generatedRound: state.round };
    // 难度倍率已写入敌方卡组和生命，玩家仍使用角色真实等级。
    state.campaignStats = state.combatStats;
    uiRenderer.closeModal(); uiRenderer.nav("battle"); uiRenderer.render(); renderCampaignHud(); showMulligan();
  }
  function showMulligan() {
    const state = gameEngine.state; uiRenderer.openModal("开局换牌", `<p class="small-note">最多选择两张牌；确认后本场不能再次换牌。</p><div class="campaign-grid" id="mulliganCards">${state.player.hand.map(card => `<button type="button" class="campaign-card" data-mulligan="${card.instanceId}"><b>${escapeHtml(card.name)}</b><small>${escapeHtml(card.element)} · 费用 ${escapeHtml(card.cost)}</small></button>`).join("")}</div><div class="modal-actions"><button id="mulliganConfirm" type="button">确认换牌（0/2）</button></div>`, { modalClass: "campaign-modal", afterRender: () => { const selected = new Set(); document.querySelectorAll("[data-mulligan]").forEach(button => button.onclick = () => { if (!selected.has(button.dataset.mulligan) && selected.size >= 2) return; selected.has(button.dataset.mulligan) ? selected.delete(button.dataset.mulligan) : selected.add(button.dataset.mulligan); button.classList.toggle("selected", selected.has(button.dataset.mulligan)); document.getElementById("mulliganConfirm").textContent = `确认换牌（${selected.size}/2）`; }); document.getElementById("mulliganConfirm").onclick = () => { const indexes = state.player.hand.map((card, index) => selected.has(card.instanceId) ? index : -1).filter(index => index >= 0); const returned = indexes.map(index => state.player.hand[index]); state.player.hand = state.player.hand.filter((_, index) => !indexes.includes(index)); gameEngine.draw(state.player, indexes.length); state.player.drawPile = shuffle(state.player.drawPile.concat(returned)); uiRenderer.closeModal(); state.campaign.mulliganDone = true; uiRenderer.render(); renderCampaignHud(); }; } });
  }
  function renderCampaignHud() { const state = gameEngine.state; if (!state?.campaign) { document.getElementById("campaignHud")?.remove(); return; } let hud = document.getElementById("campaignHud"); if (!hud) { hud = document.createElement("div"); hud.id = "campaignHud"; hud.className = "campaign-hud"; document.getElementById("battlefield")?.appendChild(hud); } const ring = value => Array.from({ length: 6 }, (_, i) => `<i class="${i < value ? "on" : ""}"></i>`).join(""); const intent = mode.isFormalIntent(state.campaign.intent) ? state.campaign.intent : null; const intentLabel = intent ? `${intent.type} · ${intent.description}` : "敌方正在重新评估"; hud.innerHTML = `<span>我</span><span class="campaign-ring">${ring(state.campaign.playerRing)}</span><span>敌</span><span class="campaign-ring">${ring(state.campaign.enemyRing)}</span><button type="button" id="resonanceBtn" ${state.turn !== "player" || state.player.skipAction || state.campaign.playerRing < 6 || state.campaign.resonanceUsed ? "disabled" : ""}>共鸣</button><span class="campaign-intent">敌方意图：${escapeHtml(intentLabel)}</span>`; document.getElementById("resonanceBtn")?.addEventListener("click", openResonance); }
  function openResonance() {
    const state = gameEngine.state;
    if (!state?.campaign || !canAcceptPlayerCardInput() || state.player.skipAction || state.campaign.playerRing < 6 || state.campaign.resonanceUsed) return;
    const session = gameEngine.sessionId;
    uiRenderer.openModal("星环共鸣", `<p class="small-note">选择一种效果，使用后星环清零；每回合只能使用一次。</p><div class="campaign-grid"><button class="campaign-stage" data-resonance="star"><h3>星耀</h3><small>下一张牌费用减少2，最低为0。</small></button><button class="campaign-stage" data-resonance="echo"><h3>回响</h3><small>抽2张牌并获得1点能量。</small></button><button class="campaign-stage" data-resonance="guard"><h3>守环</h3><small>获得最大生命12%的护盾。</small></button></div>`, {
      modalClass: "campaign-modal",
      afterRender: () => {
        const revision = uiRenderer._modalRevision;
        document.querySelectorAll("[data-resonance]").forEach(button => {
          button.onclick = () => activateResonance(button.dataset.resonance, state, session, revision);
        });
      },
    });
  }
  function activateResonance(type, expectedState = gameEngine.state, expectedSession = gameEngine.sessionId, modalRevision = null) {
    const state = gameEngine.state;
    if (!state?.campaign || !gameEngine.isActiveBattle(expectedState, expectedSession) || !canAcceptPlayerCardInput()
      || state.player.skipAction || state.campaign.playerRing < 6 || state.campaign.resonanceUsed
      || !["star", "echo", "guard"].includes(type)) return false;
    if (modalRevision !== null && (!uiRenderer.isModalOpen() || uiRenderer._modalRevision !== modalRevision)) return false;
    state.campaign.playerRing = 0;
    state.campaign.resonanceUsed = true;
    mode.recordCombatEvent(state.campaignStats, { type: "resonance", side: "player" });
    if (type === "star") state.campaign.costReduction = 2;
    if (type === "echo") {
      gameEngine.draw(state.player, 2);
      state.player.energy = Math.min(state.player.maxEnergy, state.player.energy + 1);
    }
    if (type === "guard") {
      const shield = mode.resonanceShield(state.player.maxHp);
      state.player.shield += shield;
      mode.recordCombatEvent(state.campaignStats, { type: "shield", amount: shield });
    }
    gameEngine.log(`[星环共鸣] 玩家激活${type === "star" ? "星耀" : type === "echo" ? "回响" : "守环"}。`);
    uiRenderer.closeModal(); audioManager.play("resonance-activate"); uiRenderer.render(); renderCampaignHud();
    return true;
  }
  function refreshEffectiveCardCosts() { const state = gameEngine.state; if (!state?.campaign) return; document.querySelectorAll("#playerHand .card").forEach(element => { const card = state.player.hand.find(item => item.instanceId === element.dataset.instanceId); if (!card) return; const cost = mode.effectiveCardCost(state, "player", card); element.classList.toggle("unplayable", state.turn !== "player" || cost > state.player.energy); element.dataset.effectiveCost = String(cost); const costElement = element.querySelector(".card-cost"); if (costElement) { costElement.textContent = String(cost); costElement.setAttribute("aria-label", `${cost} 能量`); if (cost !== card.cost) costElement.style.backgroundImage = "none"; } }); const canPlay = state.turn === "player" && state.player.hand.some(card => mode.effectiveCardCost(state, "player", card) <= state.player.energy); document.getElementById("endTurnBtn")?.classList.toggle("pulse", state.turn === "player" && !canPlay); }
  const renderBaseCardPreview = global.renderBaseCardPreview; renderCardPreview = function (card) { const state = gameEngine.state; if (!card) return renderBaseCardPreview(card); const effectiveCost = state?.campaign ? mode.effectiveCardCost(state, "player", card) : undefined; return renderBaseCardPreview(card, { effectiveCost }); };
  const renderBattleSurface = uiRenderer.renderBattleSurface.bind(uiRenderer); uiRenderer.render = function () { renderBattleSurface(); refreshEffectiveCardCosts(); renderCampaignHud(); };
  document.querySelectorAll("[data-open-campaign]").forEach(button => button.addEventListener("click", renderCampaignHome));
  document.querySelector(".home-mobile-btn-campaign")?.setAttribute("hidden", "");

  function clearCampaignUi() { document.getElementById("campaignHud")?.remove(); document.querySelectorAll(".campaign-passive-notice").forEach(node => node.remove()); }
  function campaignNotice(text) { uiRenderer.showToast(text); const banner = document.getElementById("skillBanner"); if (banner) { banner.textContent = text; banner.classList.add("show"); setTimeout(() => banner.classList.remove("show"), 1600); } }
  function showModeChooser() { uiRenderer.openModal("选择战斗模式", `<p class="small-note">开始战斗后选择本次玩法。首页入口保持不变。</p><div class="campaign-grid"><button type="button" class="campaign-stage" id="chooseSandbox"><h3>沙盒模式</h3><small>自由选择、生成和测试卡组。</small></button><button type="button" class="campaign-stage" id="chooseCampaign"><h3>战役模式</h3><small>固定角色、连续关卡、本地进度。</small></button></div>`, { modalClass: "campaign-modal", afterRender: () => { document.getElementById("chooseSandbox").onclick = () => { uiRenderer.closeModal(); uiRenderer.openBattlePrep(); }; document.getElementById("chooseCampaign").onclick = () => { uiRenderer.closeModal(); renderCampaignHome(); }; } }); }
  document.addEventListener("click", event => { const campaignButton = event.target.closest?.("[data-open-campaign]"); const sandboxButton = event.target.closest?.("[data-open-battle-prep]"); const homeActive = document.getElementById("screen-home")?.classList.contains("active"); if ((campaignButton || (sandboxButton && homeActive))) { event.preventDefault(); event.stopImmediatePropagation(); showModeChooser(); } }, true);

  const originalNav = uiRenderer.nav.bind(uiRenderer); uiRenderer.nav = function (name) { if (name === "home") clearCampaignUi(); return originalNav(name); };
  const originalSandboxStart = uiRenderer.startBattle.bind(uiRenderer); uiRenderer.startBattle = async function () { clearCampaignUi(); if (gameEngine.state?.campaign) gameEngine.invalidateBattle(); return originalSandboxStart(); };
  const originalStartCampaign = startCampaign;
  startCampaign = function () { const saved = progress(); const entry = saved.characters[selectedCharacter]; if (!entry || !data.stages[selectedStage - 1] || !mode.authorizeStage(entry, selectedStage)) { selectedStage = mode.clampStage(entry, selectedStage); uiRenderer.showToast("当前角色尚未解锁该关卡", "error"); renderCampaignHome(); return false; } setCombatInputLocked(false); clearHpDisplayOverrides(); pendingGameOverCheck.flag = false; resetBattleViewTransform(); clearCampaignUi(); return originalStartCampaign(saved); };
  document.addEventListener("visibilitychange", () => { if (document.hidden) audioManager.stop(); });
  // 结果页按钮区按"当前结算属于哪种模式"整体重建：
  // 战役结算写入战役按钮；沙盒分支由 fixed-game-rules.js 负责恢复沙盒按钮，
  // 两边都不依赖"上一次是哪种模式"的顺序假设。
  function resultButtonRow() { return document.querySelector("#screen-result .button-row"); }
  global.campaignResultActions = function campaignResultActions(state, ui) {
    const row = resultButtonRow();
    if (!row) return;
    const won = state.winner === "player";
    row.innerHTML = mode.resultActions({ victory: won, stage: state.campaign.stage }).map(action => `<button type="button" data-campaign-result="${action}">${action === "next" ? "下一关" : action === "retry" ? "重试本关" : action === "route" ? "返回战役路线" : "返回首页"}</button>`).join("");
    row.querySelectorAll("[data-campaign-result]").forEach(button => button.onclick = () => { const action = button.dataset.campaignResult; if (action === "home") { ui.nav("home"); return; } if (action === "route") { renderCampaignHome(); return; } selectedStage = action === "next" ? Math.min(5, state.campaign.stage + 1) : state.campaign.stage; startCampaign(); });
  };
  campaignRuntime.configurePresentation({
    renderHud: renderCampaignHud,
    notice: campaignNotice,
    playSound: name => audioManager.play(name),
    playDrawSound: () => audioManager.play("card-draw"),
  });
  campaignRuntime.install();
  // 无头平衡模拟/验证的驱动接口：只暴露“选择角色/关卡/难度 → 开局 → 共鸣”这条真实路径，
  // 不复制任何规则。模拟器用它跑真实 startCampaign，避免出现第二套战役开局逻辑。
  global.campaignUiHarness = {
    start: () => { startCampaign(); return gameEngine.state; },
    activateResonance,
    characterMap: CAMPAIGN_CHARACTER_MAP,
    select(characterId, stage, difficulty) {
      if (data.characters.some(item => item.id === characterId)) selectedCharacter = characterId;
      const entry = progress().characters[selectedCharacter];
      if (mode.authorizeStage(entry, stage)) selectedStage = stage;
      if (data.difficulties[difficulty]) selectedDifficulty = difficulty;
    },
    currentSelection: () => ({ characterId: selectedCharacter, stage: selectedStage, difficulty: selectedDifficulty }),
  };
})(globalThis);
