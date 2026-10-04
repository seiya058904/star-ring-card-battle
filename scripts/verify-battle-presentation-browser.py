"""Chromium checks for presentation, seeded compatibility and view teardown.

No combat values are injected. Replay cases choose legal cards and click the
real controls. Only the explicitly labelled element gallery calls the view
director directly; it asserts that the combat state and seed stay unchanged.
Use --baseline-ref <commit> to compare real replays against an existing checkout
commit, served by request interception without changing the working tree.
"""
import argparse
import asyncio
import hashlib
import json
import subprocess
import sys
import time
from pathlib import Path
from urllib.parse import urlparse
from playwright.async_api import async_playwright

sys.stdout.reconfigure(encoding="utf8")
parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument("--url", default="http://127.0.0.1:8000/")
parser.add_argument("--out", required=True)
parser.add_argument("--baseline-ref")
args = parser.parse_args()
out = Path(args.out).resolve()
out.mkdir(parents=True, exist_ok=True)
repo = Path(__file__).resolve().parent.parent
report = {"cases": [], "errors": []}
SNAPSHOT = """()=>{
 const s=gameEngine.state;
 const fighter=f=>({name:f.name,hp:f.hp,maxHp:f.maxHp,shield:f.shield,energy:f.energy,
   hand:f.hand.map(c=>c.id),draw:f.drawPile.map(c=>c.id),discard:f.discardPile.map(c=>c.id),
   statuses:f.statuses,summons:f.summons.map(({id,...rest})=>rest)});
 return {seed,turn:s.turn,round:s.round,over:s.gameOver,winner:s.winner,
   player:fighter(s.player),enemy:fighter(s.enemy),stats:s.combatStats,
   actions:s.actions.map(({cardInstanceId,...rest})=>rest)};
}"""


async def start(page, animation="high", character="human-lisaya"):
    await page.goto(args.url)
    await page.locator("[data-open-settings]:visible").click()
    await page.locator("#settingAnimation").select_option(animation)
    await page.locator("#settingBattleSpeed").select_option("ultra")
    await page.locator("#settingSound").select_option("off")
    await page.locator("#settingsSaveBtn").click()
    await page.evaluate("seed=1234567")
    await page.locator("[data-open-battle-prep]:visible").first.click()
    await page.locator("#chooseSandbox").click()
    await page.locator(f'[data-fixed-character="{character}"]').click()
    await page.wait_for_timeout(400)
    await page.wait_for_function("""()=>{
      const images=[...document.querySelectorAll('.unit-sprite')];
      return images.length===2 && images.every(img=>img.complete&&img.naturalWidth>0);
    }""")


async def replay(page):
    deadline = time.monotonic() + 75
    keyboard = True
    while time.monotonic() < deadline:
        d = await page.evaluate("""()=>{const s=gameEngine.state;return {
          over:s.gameOver,ready:canAcceptPlayerCardInput(),round:s.round,skip:s.player.skipAction,
          card:campaignMode.aiChoosePlay(s,'player')?.instanceId};}""")
        if d["over"] or (d["round"] >= 3 and d["ready"]):
            # main's dialogue callbacks advance its shared RNG 80-420ms after
            # actions. Compare at a settled boundary, not inside that interval.
            await page.wait_for_timeout(550)
            return await page.evaluate(SNAPSHOT)
        if not d["ready"]:
            await page.wait_for_timeout(80)
            continue
        if not d["skip"] and d.get("card"):
            card = page.locator(f'#playerHand .card[data-instance-id="{d["card"]}"]')
            if keyboard:
                await card.focus()
                await card.press("Enter")
                keyboard = False
            else:
                await card.click()
        else:
            await page.locator("#endTurnBtn").click()
        await page.wait_for_timeout(550)
    raise AssertionError("Two real rounds did not complete within 75s")


async def context_for(browser, baseline=False, reduced=False):
    ctx = await browser.new_context(viewport={"width":1440,"height":1000},
                                    reduced_motion="reduce" if reduced else "no-preference")
    if baseline:
        sources = {}
        for file in ["index.html", "js/campaign-ui.js", "js/audio-manager.js", "js/fixed-game-rules.js"]:
            sources[file] = subprocess.check_output(["git", "show", f"{args.baseline_ref}:{file}"], cwd=repo)
        base_path = urlparse(args.url).path.rstrip("/")

        async def serve(route):
            relative = urlparse(route.request.url).path.removeprefix(base_path).lstrip("/") or "index.html"
            if relative in sources:
                await route.fulfill(body=sources[relative], content_type="text/html; charset=utf-8" if relative.endswith("html") else "text/javascript; charset=utf-8")
            else:
                await route.continue_()
        await ctx.route("**/*", serve)
    page = await ctx.new_page()
    errors = []
    page.on("pageerror", lambda e: errors.append(str(e)))
    page.on("console", lambda m: errors.append(m.text) if m.type == "error" else None)
    page.on("response", lambda r: errors.append(f"HTTP {r.status}: {r.url}") if r.status >= 400 else None)
    return ctx, page, errors


async def gallery(page):
    # View-only gallery: no applyCard, damage, seed or save mutation.
    before = await page.evaluate("JSON.stringify({state:gameEngine.state,seed})")
    drawings = []
    for element in ["火", "冰", "风", "土", "雷", "光", "暗"]:
        await page.evaluate("""element=>{
          const card={name:element+' · 表现测试',element};
          const result={intent:'hostile-damage',targetId:'enemy',visualTargets:{impact:'enemy',shake:true}};
          const drama={tier:'advanced',enter:100,focus:100,charge:100,cast:2000,totalMin:5000};
          const stage=document.getElementById('playedCardStage');stage.className='played-card-stage show advanced';
          BattlePresentation.begin(card,result,drama,stage);BattlePresentation.impact(card,result,drama);
        }""", element)
        await page.wait_for_timeout(45)
        pixels = await page.locator("#battlefield").screenshot(path=str(out/f"element-{element}.png"))
        drawings.append(hashlib.sha256(pixels).hexdigest())
        await page.evaluate("BattlePresentation.stop();BattlePresentation.render(gameEngine.state)")
    assert len(set(drawings)) == 7, "Element treatments must differ"
    for intent in ["friendly-heal", "friendly-shield", "friendly-buff", "friendly-summon", "hostile-status"]:
        await page.evaluate("""intent=>{
          const card={name:'表现测试',element:'光'},
          result={intent,targetId:intent.startsWith('friendly')?'player':'enemy',visualTargets:{impact:intent.startsWith('friendly')?'player':'enemy',shake:false}},
          drama={tier:'normal',enter:100,focus:100,charge:100,cast:1000,totalMin:3000};
          BattlePresentation.begin(card,result,drama,document.getElementById('playedCardStage'));
          BattlePresentation.impact(card,result,drama);
        }""", intent)
        assert await page.locator(f".element-impact.{intent}").count() == 1
        await page.evaluate("BattlePresentation.stop();BattlePresentation.render(gameEngine.state)")
    after = await page.evaluate("JSON.stringify({state:gameEngine.state,seed})")
    assert before == after, "The view-only gallery changed combat or seeded state"
    assert await page.locator(".element-impact,.actor-casting").count() == 0
    assert await page.locator("#playedCardStage > *").count() == 0
    return {"elements":7,"intents":5,"stateUnchanged":True,"teardown":True}


async def characters(browser):
    ctx, page, errors = await context_for(browser)
    await page.goto(args.url)
    await page.locator("[data-open-battle-prep]:visible").first.click()
    await page.locator("#chooseSandbox").click()
    # The sandbox also offers the original NPC catalog. Scope this check to
    # the six campaign heroes; preserve every other fixed character unchanged.
    ids = await page.locator("[data-fixed-character]").evaluate_all("els=>els.filter(e=>BattlePresentation.heroFor({name:e.querySelector('h3').textContent})).map(e=>e.dataset.fixedCharacter)")
    assert len(ids) == 6
    result = []
    for character in ids:
        await start(page, character=character)
        entry = await page.evaluate("""()=>{const s=gameEngine.state,img=document.querySelector('#playerUnit .unit-sprite'),enemy=document.querySelector('#enemyUnit .unit-sprite');
          const cv=document.createElement('canvas');cv.width=img.naturalWidth;cv.height=img.naturalHeight;
          const c=cv.getContext('2d');c.drawImage(img,0,0);const pixels=c.getImageData(0,0,cv.width,cv.height).data;
          let edgePixels=0;for(let y=0;y<cv.height;y++)for(let x=0;x<cv.width;x++)
            if((x<8||y<8||x>=cv.width-8||y>=cv.height-8)&&pixels[(y*cv.width+x)*4+3])edgePixels++;
          return {
          name:s.player.name,hero:BattlePresentation.heroFor(s.player)?.id,imageReady:img.complete&&img.naturalWidth>0,
          enemyImageReady:enemy.complete&&enemy.naturalWidth>0,
          transparentPadding:edgePixels===0,
          deck:s.player.hand.length+s.player.drawPile.length+s.player.discardPile.length};}""")
        assert entry["hero"] and entry["imageReady"] and entry["enemyImageReady"] and entry["deck"] == 30, entry
        assert entry["transparentPadding"], entry
        card = await page.evaluate("campaignMode.aiChoosePlay(gameEngine.state,'player')?.instanceId")
        assert card, entry
        await page.locator(f'#playerHand .card[data-instance-id="{card}"]').click()
        await page.wait_for_function("!gameEngine.state.actionLocked && !effectsRenderer._playLock")
        assert await page.evaluate("gameEngine.state.actions.length") >= 1
        result.append(entry)
    assert len({e["hero"] for e in result}) == 6
    assert not errors, errors
    await ctx.close()
    return result


async def main():
    async with async_playwright() as pw:
        browser = await pw.chromium.launch(headless=True)
        for animation in ["high", "standard", "low"]:
            snapshots = []
            for baseline in ([True, False] if args.baseline_ref else [False]):
                ctx, page, errors = await context_for(browser, baseline)
                await start(page, animation)
                # main did not support hand keyboard input, so baseline uses the
                # exact existing click handler to compare the same legal action.
                if baseline:
                    await page.evaluate("document.getElementById('playerHand').addEventListener('keydown',e=>{if(e.key==='Enter')e.target.closest('.card')?.click();})")
                snapshot = await replay(page)
                assert not errors, errors
                snapshots.append(snapshot)
                await ctx.close()
            if args.baseline_ref:
                (out/f"replay-{animation}.json").write_text(json.dumps(snapshots,ensure_ascii=False,indent=2),encoding="utf8")
                assert snapshots[0] == snapshots[1], f"{animation}: main replay differs; see replay-{animation}.json"
            case = {"animation":animation,"round":snapshots[-1]["round"],"seed":snapshots[-1]["seed"],"mainEquivalent":bool(args.baseline_ref)}
            report["cases"].append(case)
            print(json.dumps(case,ensure_ascii=False), flush=True)
        ctx, page, errors = await context_for(browser)
        await start(page)
        assert await page.evaluate("audioManager.play('element-fire')") is False, "Mute must cover new accents"
        report["gallery"] = await gallery(page)
        # Exit while presentation timers are live. They may never reappear in
        # a new battle, and the inactive stage must be empty immediately.
        await page.locator("#battleExitBtn").click()
        await page.locator("#modalConfirmBtn").click()
        await page.wait_for_timeout(1800)
        assert await page.locator("#playedCardStage > *,.element-impact,.actor-casting").count() == 0
        assert not errors, errors
        await ctx.close()
        ctx, page, errors = await context_for(browser, reduced=True)
        await start(page)
        assert await page.evaluate("BattlePresentation.lowMotion()") is True
        report["reducedMotionReplay"] = await replay(page)
        assert not errors, errors
        await ctx.close()
        report["characters"] = await characters(browser)
        await browser.close()
    (out/"results.json").write_text(json.dumps(report,ensure_ascii=False,indent=2),encoding="utf8")
    print("presentation: PASS", flush=True)


asyncio.run(main())
