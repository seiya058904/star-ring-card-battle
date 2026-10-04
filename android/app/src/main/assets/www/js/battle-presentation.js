(function (global) {
  "use strict";

  // This director owns only view state. Combat, saves, input locks and random
  // numbers remain with their existing owners. No combat method is wrapped here.
  const heroes = [
    ["lisaya", "丽莎娅", "#e6cb8c"],
    ["luolinfo", "罗林福", "#b8a2ec"],
    ["eluxia", "艾露希娅", "#94dce2"],
    ["moluo", "摩罗哥", "#abc38b"],
    ["heka", "赫卡莫斯", "#e79c73"],
    ["su", "苏", "#c3b5e8"],
  ];
  const colors = { 火: "#ffa268", 冰: "#b8e8f5", 风: "#a3e6c4", 土: "#ddbb84", 雷: "#cab6ff", 光: "#f6e8af", 暗: "#bd99d2", 无: "#e3d2ac" };
  const intentNames = { "friendly-heal": "恢复", "friendly-shield": "守护", "friendly-buff": "蓄势", "friendly-summon": "召唤", "hostile-status": "控制", "hostile-damage": "攻击" };
  let cast = null;
  let battle = null;
  let turnKey = "";
  let resultKey = null;
  const timers = new Set();
  const animations = new Set();
  let summons = new Set();

  function heroFor(fighter) {
    const name = String(fighter?.name || "");
    const row = heroes.find(([, match]) => match === "苏" ? name === match : name.includes(match));
    return row ? { id: row[0], src: `assets/units/heroes-v2/${row[0]}.webp`, color: row[2] } : null;
  }
  // A URL inside a CSS custom property resolves where it is consumed. Resolve
  // from the document so the extracted stylesheet also works under Pages and
  // Android's appassets origin, without hardcoding either deployment root.
  function assetUrl(src) { return new URL(src, document.baseURI).href; }
  function lowMotion() {
    return global.uiRenderer?.settings?.animation === "low" || global.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
  }
  function delay(ms) { return global.scaledDramaMs?.(ms) ?? ms; }
  function field() { return document.getElementById("battlefield"); }
  function active(state, session) { return global.gameEngine?.isActiveBattle(state, session); }
  function later(fn, ms, state = global.gameEngine?.state, session = global.gameEngine?.sessionId) {
    const timer = setTimeout(() => { timers.delete(timer); if (active(state, session)) fn(); }, ms);
    timers.add(timer);
  }
  function motion(el, frames, options) {
    if (!el?.animate || lowMotion()) return;
    const animation = el.animate(frames, options);
    animations.add(animation);
    animation.onfinish = () => animations.delete(animation);
  }
  function anchor(side) {
    const f = field()?.getBoundingClientRect();
    const image = document.querySelector(`#${side === "player" ? "playerUnit" : "enemyUnit"} .unit-sprite`);
    const r = image?.getBoundingClientRect();
    if (!f || !r) return { x: 0, y: 0 };
    return { x: r.left + r.width * .5 - f.left, y: r.top + r.height * .5 - f.top };
  }
  function announcement(text, secondary, state) {
    const el = document.getElementById("turnAnnouncement");
    if (!el) return;
    el.replaceChildren();
    const title = document.createElement("strong"); title.textContent = text;
    const detail = document.createElement("span"); detail.textContent = secondary;
    el.append(title, detail);
    el.className = "turn-announcement show";
    later(() => el.classList.remove("show"), Math.max(650, delay(1300)), state);
  }
  function stop() {
    for (const timer of timers) clearTimeout(timer);
    timers.clear();
    for (const animation of animations) animation.cancel();
    animations.clear();
    cast = null; battle = null; turnKey = ""; summons = new Set();
    document.body.classList.remove("normal-drama", "enhanced-drama", "strong-drama", "advanced-drama", "ultimate-drama");
    document.querySelectorAll(".actor-casting").forEach(el => el.classList.remove("actor-casting"));
    document.querySelectorAll(".element-impact").forEach(el => el.remove());
    document.getElementById("turnAnnouncement")?.classList.remove("show");
    const stage = document.getElementById("playedCardStage");
    if (stage) { stage.replaceChildren(); stage.classList.remove("show"); }
  }

  function render(state) {
    if (!state || !field()) return;
    if (battle !== state) { stop(); battle = state; }
    for (const side of ["player", "enemy"]) {
      const fighter = state[side];
      const hero = heroFor(fighter);
      const unit = document.getElementById(`${side}Unit`);
      const area = document.getElementById(`${side}Area`);
      const accent = hero?.color || colors[fighter.element] || colors.无;
      for (const el of [unit, area]) {
        if (!el) continue;
        el.style.setProperty("--hero-accent", accent);
        el.dataset.element = fighter.element;
        el.dataset.hero = hero?.id || "enemy";
      }
      if (unit) {
        unit.classList.toggle("hero-unit", Boolean(hero));
        unit.dataset.affliction = fighter.statuses?.some(s => s.type === "冻结") ? "ice"
          : fighter.statuses?.some(s => s.type === "禁锢") ? "bind"
          : fighter.statuses?.some(s => s.type === "燃烧") ? "fire"
          : fighter.statuses?.some(s => s.type === "诅咒") ? "curse" : "";
        unit.classList.toggle("has-shield", Number(fighter.shield) > 0);
        unit.classList.toggle("defeated", Number(fighter.hp) <= 0);
        unit.classList.toggle("actor-casting", cast?.side === side);
      }
    }
    const label = document.getElementById("battleSceneLabel");
    const stage = state.campaign && global.campaignData?.stages[state.campaign.stage - 1];
    if (label) label.textContent = stage ? `${state.campaign.stage} / 5 · ${stage.name}` : "古代遗迹";
    const key = `${state.round}:${state.turn}`;
    if (turnKey !== key && !state.gameOver) {
      const opening = !turnKey;
      turnKey = key;
      announcement(opening ? "战斗开始" : state.turn === "player" ? "你的回合" : "敌方回合",
        opening ? stage?.name || "古代遗迹" : `第 ${state.round} 回合`, state);
    }
    const hand = document.getElementById("playerHand");
    if (hand) {
      hand.dataset.count = state.player.hand.length;
      hand.style.setProperty("--hand-count", Math.max(5, state.player.hand.length));
    }
    const liveSummons = new Set();
    document.querySelectorAll(".summon-unit").forEach(el => {
      liveSummons.add(el.dataset.summonId);
      if (!summons.has(el.dataset.summonId)) motion(el,
        [{ opacity: 0, transform: "translateY(18px) scale(.75)" }, { opacity: 1, transform: "translateY(0) scale(1)" }],
        { duration: delay(480), easing: "cubic-bezier(.16,1,.3,1)" });
    });
    summons = liveSummons;
  }

  function begin(card, result, drama, stage) {
    const state = global.gameEngine.state;
    // Resolve the source from the live turn; friendly effects correctly return
    // targetId === actor.id, so inferring the caster from the target is unsafe.
    const side = state.turn;
    const recipient = result.visualTargets?.impact || result.targetId;
    const color = colors[card.element] || colors.无;
    const now = performance.now();
    cast = { side, recipient, element: card.element, intent: result.intent, tier: drama.tier,
      started: now, impactAt: now + delay(drama.enter + drama.focus + drama.charge + drama.cast),
      end: now + delay(drama.totalMin), state, session: global.gameEngine.sessionId, impacted: false };
    stage.replaceChildren();
    stage.style.setProperty("--elm-p1", color);
    stage.style.setProperty("--cast-duration", `${delay(drama.totalMin)}ms`);
    stage.dataset.element = card.element;
    stage.dataset.side = side;
    const strip = document.createElement("div"); strip.className = "cast-title-strip";
    const icon = document.createElement("img"); icon.src = global.ASSETS.elements[card.element] || global.ASSETS.elements.无; icon.alt = "";
    const name = document.createElement("strong"); name.textContent = card.name;
    const meta = document.createElement("span"); meta.textContent = `${state[side].name} · ${intentNames[result.intent] || "技能"}`;
    strip.append(icon, name, meta); stage.append(strip);
    if (["advanced", "ultimate"].includes(drama.tier)) {
      const hero = heroFor(state[side]);
      const cameo = document.createElement("div"); cameo.className = "cast-cameo";
      const image = document.createElement("img"); image.src = hero?.src || document.querySelector(`#${side}Unit .unit-sprite`)?.src || ""; image.alt = "";
      cameo.append(image); stage.append(cameo);
    }
    const actor = document.getElementById(`${side}Unit`);
    actor?.classList.add("actor-casting");
    const dir = side === "player" ? 1 : -1;
    motion(actor?.querySelector(".unit-sprite"), [
      { transform: "translateX(0) scale(1)", offset: 0 },
      { transform: `translateX(${-dir * 8}px) scale(.97)`, offset: .3 },
      { transform: `translateX(${dir * 22}px) scale(1.035)`, offset: .7 },
      { transform: "translateX(0) scale(1)", offset: 1 },
    ], { duration: delay(drama.enter + drama.focus + drama.charge + drama.cast + 180), easing: "cubic-bezier(.22,.8,.28,1)" });
  }
  function finish() {
    document.querySelectorAll(".actor-casting").forEach(el => el.classList.remove("actor-casting"));
    cast = null;
  }
  function impact(card, result, drama) {
    if (!cast || !active(cast.state, cast.session)) return;
    cast.impacted = true; cast.hitAt = performance.now();
    const p = anchor(result.visualTargets?.impact || result.targetId);
    const f = field();
    const effect = document.createElement("div");
    effect.className = `element-impact element-${card.element} ${result.intent || ""} ${drama.tier}`;
    effect.style.cssText = `left:${p.x}px;top:${p.y}px;--effect-color:${colors[card.element] || colors.无};--impact-duration:${delay(620)}ms`;
    // Deliberate linework, rather than an indiscriminate particle burst.
    effect.innerHTML = '<i></i><i></i><i></i><i></i><i></i><i></i>';
    f?.append(effect);
    later(() => effect.remove(), Math.max(500, delay(850)), cast.state, cast.session);
    if (result.visualTargets?.shake && global.uiRenderer?.settings?.shake) {
      const image = document.querySelector(`#${cast.recipient}Unit .unit-sprite`);
      const dir = cast.recipient === "enemy" ? 1 : -1;
      motion(image, [{ transform: `translateX(${dir * 9}px) rotate(${dir * 2}deg)` }, { transform: "translateX(0) rotate(0)", offset: .6 }, { transform: "translateX(0) rotate(0)" }],
        { duration: delay(drama.tier === "ultimate" ? 440 : 260), easing: "cubic-bezier(.16,1,.3,1)" });
    }
  }

  function draw(ctx) {
    if (!cast || lowMotion() || !active(cast.state, cast.session)) return;
    const now = performance.now();
    if (now > cast.end) return;
    const a = anchor(cast.side), b = anchor(cast.recipient);
    const progress = Math.min(1, (now - cast.started) / Math.max(1, cast.impactAt - cast.started));
    const friendly = String(cast.intent).startsWith("friendly");
    const color = colors[cast.element] || colors.无;
    ctx.save(); ctx.strokeStyle = color; ctx.fillStyle = color; ctx.lineWidth = 2;
    if (!cast.impacted) {
      // A tightening ritual circle at the caster establishes anticipation.
      const r = 22 + 16 * (1 - progress);
      ctx.globalAlpha = .2 + progress * .45;
      ctx.beginPath(); ctx.ellipse(a.x, a.y + 34, r, r * .28, 0, 0, Math.PI * 2); ctx.stroke();
      if (!friendly && progress > .72) {
        const t = (progress - .72) / .28;
        const x = a.x + (b.x - a.x) * t, y = a.y + (b.y - a.y) * t;
        ctx.globalAlpha = .7;
        if (cast.element === "雷") {
          ctx.beginPath(); ctx.moveTo(a.x, a.y);
          for (let i = 1; i <= 9; i++) ctx.lineTo(a.x + (x - a.x) * i / 9, a.y + (y - a.y) * i / 9 + (i < 9 ? Math.sin(i * 13 + Math.floor(t * 8)) * 12 : 0));
          ctx.stroke();
        } else if (cast.element === "风") {
          for (let i = 0; i < 3; i++) { ctx.beginPath(); ctx.moveTo(x - (b.x - a.x) * .16, y + i * 8); ctx.quadraticCurveTo(x - 18, y - 28 + i * 8, x + 10, y + i * 8); ctx.stroke(); }
        } else if (cast.element === "土") {
          for (let i = 0; i < 5; i++) { const f = Math.min(t, i / 5); ctx.save(); ctx.translate(a.x + (b.x - a.x) * f, a.y + 70 + (b.y - a.y) * f); ctx.rotate(i * .7); ctx.fillRect(-4, -4, 8, 8); ctx.restore(); }
        } else if (cast.element === "冰") {
          ctx.beginPath(); ctx.moveTo(x + 18, y); ctx.lineTo(x, y - 7); ctx.lineTo(x - 9, y); ctx.lineTo(x, y + 7); ctx.closePath(); ctx.fill();
        } else {
          const tail = cast.element === "火" ? 44 : 26;
          const dir = b.x >= a.x ? 1 : -1;
          const g = ctx.createLinearGradient(x - dir * tail, y, x, y); g.addColorStop(0, "transparent"); g.addColorStop(1, color);
          ctx.strokeStyle = g; ctx.lineWidth = cast.element === "火" ? 7 : 3;
          ctx.beginPath(); ctx.moveTo(x - dir * tail, y); ctx.lineTo(x, y); ctx.stroke();
        }
      }
    } else {
      const t = Math.min(1, (now - cast.hitAt) / Math.max(1, delay(550)));
      ctx.globalAlpha = (1 - t) * .75;
      if (friendly) {
        ctx.strokeStyle = cast.intent === "friendly-heal" ? "#b5ecc7" : "#bcdef3";
        for (let i = 0; i < 2; i++) { ctx.beginPath(); ctx.ellipse(b.x, b.y + 62 - t * 70 - i * 14, 30 + t * 18, 10, 0, 0, Math.PI * 2); ctx.stroke(); }
      } else {
        const n = cast.tier === "ultimate" ? 16 : 9;
        for (let i = 0; i < n; i++) {
          const theta = i * 2.39996;
          const r = 12 + t * (28 + i * 3);
          const x = b.x + Math.cos(theta) * r, y = b.y + Math.sin(theta) * r;
          if (cast.element === "火") { ctx.fillRect(x, y - t * 30, 2, 5); }
          else if (cast.element === "冰") { ctx.save(); ctx.translate(x, y); ctx.rotate(theta); ctx.fillRect(-1, -6, 2, 12); ctx.restore(); }
          else if (cast.element === "风") { ctx.beginPath(); ctx.arc(b.x, b.y, r, theta + t, theta + t + .6); ctx.stroke(); }
          else if (cast.element === "土") { ctx.fillRect(x, y + t * t * 42, 4, 4); }
          else if (cast.element === "雷") { ctx.beginPath(); ctx.moveTo(b.x, b.y); ctx.lineTo(x, y); ctx.stroke(); }
          else { ctx.fillRect(x, y, 2, 2); }
        }
      }
    }
    ctx.restore();
  }
  function result(state) {
    const screen = document.getElementById("screen-result");
    if (!screen || !state || resultKey === state) return;
    resultKey = state;
    const won = state.winner === "player";
    screen.dataset.outcome = won ? "victory" : "defeat";
    const hero = heroFor(state.player);
    let art = screen.querySelector(".result-character");
    if (!art) { art = document.createElement("img"); art.className = "result-character"; art.alt = ""; screen.prepend(art); }
    art.src = hero?.src || document.querySelector("#playerUnit .unit-sprite")?.src || "";
    let seal = screen.querySelector(".result-seal");
    if (!seal) { seal = document.createElement("div"); seal.className = "result-seal"; screen.querySelector(".panel")?.prepend(seal); }
    seal.textContent = won ? "胜" : "败";
  }

  function decorateCharacters() {
    document.querySelectorAll(".campaign-card[data-campaign-character], .campaign-card[data-fixed-character]").forEach(button => {
      if (button.querySelector(".campaign-portrait")) return;
      const hero = heroFor({ name: button.querySelector("h3")?.textContent || "" });
      if (!hero) return;
      const image = document.createElement("img");
      image.className = "campaign-portrait"; image.src = hero.src; image.alt = "";
      button.append(image); button.style.setProperty("--hero-accent", hero.color);
    });
  }

  global.BattlePresentation = Object.freeze({ heroFor, assetUrl, render, begin, finish, impact, draw, anchor, stop, result, lowMotion, decorateCharacters });
})(globalThis);
