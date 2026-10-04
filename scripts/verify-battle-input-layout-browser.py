"""Real Chromium regressions for modal input and battle hit-testing.

Requires the existing Python Playwright installation; no repository writes.
Serve the root, then run:
  python scripts/verify-battle-input-layout-browser.py --url http://127.0.0.1:8000/ --out <external-directory>
The Stage 1 fixture was earned through real UI play. All ring/hand setup below
uses actual cards, turn controls and resonance, never injected combat numbers.
Only stale-callback cases deliberately alter lifecycle flags to test rejection.
"""
import argparse
import asyncio
import json
import time
import sys
import traceback
from pathlib import Path
from playwright.async_api import async_playwright
sys.stdout.reconfigure(encoding="utf8")

parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument("--url", default="http://127.0.0.1:8000/")
parser.add_argument("--out", required=True)
parser.add_argument("--cases", default="geometry,modal,hand")
args = parser.parse_args()
out = Path(args.out).resolve()
out.mkdir(parents=True, exist_ok=True)
fixture = (Path(__file__).parent / "fixtures" / "stage1-earned-progress.json").read_text(encoding="utf8")
SNAP = """() => { const s=gameEngine.state; return {round:s.round,turn:s.turn,ring:s.campaign.playerRing,
  shield:s.player.shield,maxHp:s.player.maxHp,energy:s.player.energy,hand:s.player.hand.length,
  used:s.campaign.resonanceUsed,actions:s.actions.length,over:s.gameOver}; }"""


async def start(page, campaign=False):
    await page.goto(args.url)
    assert await page.title(), "Blank page identity"
    if campaign:
        await page.evaluate("raw=>localStorage.setItem(campaignMode.STORAGE_KEY,raw)", fixture)
        await page.reload()
    await page.locator("[data-open-settings]:visible").click()
    await page.locator("#settingBattleSpeed").select_option("ultra")
    await page.locator("#settingsSaveBtn").click()
    await page.locator("[data-open-battle-prep]:visible").first.click()
    await page.locator("#chooseCampaign" if campaign else "#chooseSandbox").click()
    if campaign:
        await page.locator('[data-campaign-character="lisaya"]').click()
        await page.locator('[data-campaign-stage="2"]').click()
        await page.locator("#campaignStartBtn").click()
        await page.locator("#mulliganConfirm").click()
    else:
        await page.locator('[data-fixed-character="human-lisaya"]').click()
    await page.wait_for_timeout(700)


async def ready(page):
    await page.wait_for_function("gameEngine.state.turn==='player' && !gameEngine.state.actionLocked && !effectsRenderer._playLock && !hasPendingOverrides()", timeout=20000)


async def earn_ring(page):
    deadline = time.monotonic() + 180
    while time.monotonic() < deadline:
        d = await page.evaluate("({over:gameEngine.state.gameOver,turn:gameEngine.state.turn,locked:!canAcceptPlayerCardInput(),skip:gameEngine.state.player.skipAction,ring:gameEngine.state.campaign.playerRing})")
        assert not d["over"], "Battle ended before resonance setup"
        if d["turn"] != "player" or d["locked"]:
            await page.wait_for_timeout(100)
            continue
        if d["ring"] >= 6 and not await page.locator("#resonanceBtn").is_disabled():
            return
        card = None if d["skip"] else await page.evaluate("""()=>{const s=gameEngine.state, cards=s.player.hand.filter(c=>campaignMode.effectiveCardCost(s,'player',c)<=s.player.energy);
          const low=cards.slice().sort((a,b)=>a.effects.filter(x=>x.type==='damage').reduce((v,x)=>v+(x.ratio||0),0)-b.effects.filter(x=>x.type==='damage').reduce((v,x)=>v+(x.ratio||0),0));
          return (cards.find(c=>getCardActionIntent(c)!=='hostile-damage')||low[0])?.instanceId||null;}""")
        if card:
            await page.locator(f'#playerHand .card[data-instance-id="{card}"]').click()
        else:
            await page.locator("#endTurnBtn").click()
        await page.wait_for_timeout(100)
    raise AssertionError("No legal resonance within 180s")


async def button_hits(page):
    await page.locator("#endTurnBtn").scroll_into_view_if_needed()
    await page.mouse.move(5, 5)
    await page.wait_for_timeout(1300)
    return await page.evaluate("""()=>{const b=document.querySelector('#endTurnBtn'),r=b.getBoundingClientRect(),h=document.querySelector('#playerHand');
      const hits=[];for(const y of [.05,.15,.5,.85,.95])for(const x of [.05,.15,.5,.85,.95]){const e=document.elementFromPoint(r.left+r.width*x,r.top+r.height*y);hits.push({x,y,onButton:b.contains(e),card:!!e?.closest('#playerHand .card'),hit:e?.className});}
      return {button:r.toJSON(),hand:h.getBoundingClientRect().toJSON(),hits,scrollWidth:h.scrollWidth,clientWidth:h.clientWidth};}""")


async def geometry(page):
    await start(page)
    evidence = []
    for width, height in [(1440,1000),(1280,900),(390,844),(320,740),(844,390),(390,1200),(980,500),(1024,600),(320,568)]:
        await page.set_viewport_size({"width":width,"height":height})
        await page.evaluate("document.querySelector('#screen-battle').scrollTop=0")
        await page.wait_for_timeout(350)
        data = await page.evaluate("""()=>{const field=document.querySelector('#battlefield').getBoundingClientRect();return {viewport:[innerWidth,innerHeight],field:field.toJSON(),
          horizontalOverflow:document.documentElement.scrollWidth>innerWidth,
          stats:['#playerArea','#enemyArea'].map(sel=>{const e=document.querySelector(sel),r=e.getBoundingClientRect();return {id:e.id,rect:r.toJSON(),text:e.textContent};})};}""")
        await page.screenshot(path=str(out/f"arena-{width}x{height}.png"))
        assert data["field"]["height"] >= 350, data
        assert not data["horizontalOverflow"], data
        if await page.locator("#cardPreviewPanel").is_visible():
            preview = await page.locator("#cardPreviewPanel").evaluate("""e=>{const r=e.getBoundingClientRect(),dock=e.closest('.hand-dock-v3').getBoundingClientRect();return {
              right:r.right,viewport:innerWidth,height:r.height,dockHeight:dock.height,overflow:getComputedStyle(e).overflowY};}""")
            assert preview["right"] <= preview["viewport"] and preview["height"] <= preview["dockHeight"], preview
            assert preview["overflow"] == "auto", "Full preview details must remain reachable"
            data["preview"] = preview
        # Core health/shield panels must remain wholly readable, not merely in DOM.
        for selector in ["#playerArea", "#enemyArea"]:
            await page.locator(selector).scroll_into_view_if_needed()
            readable = await page.locator(selector).evaluate("""e=>{const r=e.getBoundingClientRect(),f=document.querySelector('#battlefield').getBoundingClientRect();
              const hit=document.elementFromPoint(r.left+r.width/2,r.top+r.height/2);
              return {inside:r.left>=f.left&&r.right<=f.right&&r.top>=f.top&&r.bottom<=f.bottom,hit:!!hit&&e.contains(hit),rect:r.toJSON()};}""")
            assert readable["inside"] and readable["hit"], {"viewport":[width,height],"selector":selector,**readable}
        data["buttonHits"] = await button_hits(page)
        # The button intentionally has clipped corners. Even those corners must
        # never hit a card; its visible center must hit the command itself.
        assert data["buttonHits"]["hits"][12]["onButton"] and not any(p["card"] for p in data["buttonHits"]["hits"]), data
        # Last card is reachable by normal horizontal scrolling; commands remain separate.
        await page.locator("#playerHand .card").last.scroll_into_view_if_needed()
        assert await page.locator("#playerHand .card").last.is_visible()
        await page.screenshot(path=str(out/f"controls-{width}x{height}.png"))
        evidence.append(data)
    await page.set_viewport_size({"width":390,"height":844})
    await page.locator("#endTurnBtn").click()
    await page.wait_for_function("gameEngine.state.round>1")
    await page.locator("#battleSettingsBtn").click()
    await page.locator("#settingsSaveBtn").click()
    return evidence


async def modal(page):
    await start(page, True)
    await earn_ring(page)
    await page.wait_for_timeout(1000)
    before = await page.evaluate(SNAP)
    await page.locator("#resonanceBtn").click()
    for key in ["Shift+Tab", "Tab"] * 8:
        await page.keyboard.press(key)
        assert await page.evaluate("document.querySelector('#gameModal').contains(document.activeElement)"), "Focus escaped modal"
    await page.keyboard.press("Enter")
    # Enter on the final close button can close, but must never end the background turn.
    after_keys = await page.evaluate(SNAP)
    assert after_keys == before, {"before":before,"afterKeys":after_keys}
    if await page.evaluate("document.querySelector('#gameModal').classList.contains('hidden')"):
        await page.locator("#resonanceBtn").click()
    await page.screenshot(path=str(out/"modal-focus.png"))
    # Save the real bound callback to test lifecycle changes after opening.
    await page.evaluate("()=>{globalThis.savedResonanceClick=document.querySelector('[data-resonance=guard]').onclick;}")
    rejected = []
    for field, bad in [("turn","enemy"),("gameOver",True),("actionLocked",True)]:
        await page.evaluate("([key,value])=>{globalThis.oldInputValue=gameEngine.state[key];gameEngine.state[key]=value}", [field,bad])
        pre = await page.evaluate(SNAP)
        await page.locator('[data-resonance="guard"]').click()
        post = await page.evaluate(SNAP)
        assert pre == post, {"flag":field,"before":pre,"after":post}
        rejected.append(field)
        await page.evaluate("key=>gameEngine.state[key]=globalThis.oldInputValue", field)
    for flag in ["effectsRenderer._playLock", "pendingGameOverCheck.flag"]:
        await page.evaluate(f"globalThis.oldInputValue={flag};{flag}=true")
        pre = await page.evaluate(SNAP)
        await page.locator('[data-resonance="guard"]').click()
        assert await page.evaluate(SNAP) == pre, flag
        await page.evaluate(f"{flag}=globalThis.oldInputValue")
        rejected.append(flag)
    await page.evaluate("gameEngine.sessionId+=1")
    pre = await page.evaluate(SNAP)
    await page.locator('[data-resonance="guard"]').click()
    assert await page.evaluate(SNAP) == pre, "Stale session modified combat"
    await page.evaluate("gameEngine.sessionId-=1;uiRenderer.openSettings();savedResonanceClick()")
    assert await page.evaluate(SNAP) == pre, "Replaced modal callback modified combat"
    await page.locator("#settingsSaveBtn").click()
    await page.locator("#resonanceBtn").click()
    await page.locator('[data-resonance="guard"]').click()
    normal = await page.evaluate(SNAP)
    assert normal["shield"] - before["shield"] == round(before["maxHp"]*.12)
    assert normal["ring"] == 0 and normal["used"] and normal["turn"] == "player"
    await page.evaluate("savedResonanceClick()")
    assert await page.evaluate(SNAP) == normal, "Duplicate callback consumed twice"
    await page.locator("#battleSettingsBtn").click()
    for _ in range(20):
        await page.keyboard.press("Shift+Tab")
        assert await page.evaluate("document.querySelector('#gameModal').contains(document.activeElement)")
    await page.keyboard.press("Enter")
    assert await page.evaluate(SNAP) == normal
    if not await page.evaluate("document.querySelector('#gameModal').classList.contains('hidden')"):
        await page.locator("#settingsSaveBtn").click()
    await page.locator("#endTurnBtn").click()
    return {"before":before,"afterKeys":after_keys,"rejectedFlags":rejected,"normal":normal}


async def hand(page):
    await page.set_viewport_size({"width":1280,"height":900})
    await start(page, True)
    await earn_ring(page)
    previous = await page.evaluate("gameEngine.state.round")
    await page.locator("#endTurnBtn").click()
    await page.wait_for_function(f"gameEngine.state.round>{previous}")
    await ready(page)
    assert await page.evaluate("gameEngine.state.player.hand.length") == 5
    await page.locator("#resonanceBtn").click()
    await page.locator('[data-resonance="echo"]').click()
    assert await page.evaluate("gameEngine.state.player.hand.length") == 7
    matrix = []
    for width,height in [(1280,900),(1440,1000),(390,844)]:
        await page.set_viewport_size({"width":width,"height":height})
        hits = await button_hits(page)
        assert hits["hits"][12]["onButton"] and not any(p["card"] for p in hits["hits"]), hits
        for i in range(7):
            card = page.locator("#playerHand .card").nth(i)
            await card.scroll_into_view_if_needed()
            await card.hover()
            assert await card.evaluate("e=>{const r=e.getBoundingClientRect(),h=document.querySelector('#playerHand').getBoundingClientRect();return r.left>=h.left&&r.right<=h.right}"), "Card unreachable within hand"
        await page.screenshot(path=str(out/f"seven-hand-{width}x{height}.png"))
        matrix.append({"viewport":[width,height],**hits})
    await page.set_viewport_size({"width":1280,"height":900})
    hit = await button_hits(page)
    before = await page.evaluate(SNAP)
    r = hit["button"]
    await page.mouse.click(r["left"]+r["width"]/2,r["top"]+r["height"]/2)
    after = await page.evaluate(SNAP)
    assert after["actions"] == before["actions"] + 1 and after["turn"] == "enemy"
    assert after["hand"] == before["hand"] and after["energy"] == before["energy"], "Button click played a card"
    return {"matrix":matrix,"beforeClick":before,"afterClick":after}


async def main():
    result = []
    async with async_playwright() as pw:
        browser = await pw.chromium.launch(headless=True)
        for name in args.cases.split(","):
            context = await browser.new_context(viewport={"width":1440,"height":1000})
            page = await context.new_page()
            errors, consoles, failures = [], [], []
            page.on("pageerror", lambda error: errors.append(str(error)))
            page.on("console", lambda message: consoles.append(message.text) if message.type == "error" else None)
            page.on("requestfailed", lambda request: failures.append(request.url))
            try:
                data = await globals()[name](page)
                assert not errors and not consoles and not failures, [errors,consoles,failures]
                result.append({"case":name,"pass":True,"data":data,"errors":errors})
            except Exception as error:
                await page.screenshot(path=str(out/f"FAIL-{name}.png"))
                result.append({"case":name,"pass":False,"error":str(error),"traceback":traceback.format_exc(),"errors":errors,"console":consoles,"requests":failures})
            finally:
                await context.close()
                (out/"results.json").write_text(json.dumps(result,ensure_ascii=False,indent=2),encoding="utf8")
                print(f"{name}: {'PASS' if result[-1]['pass'] else 'FAIL'}", flush=True)
        await browser.close()
    (out/"results.json").write_text(json.dumps(result,ensure_ascii=False,indent=2),encoding="utf8")
    print(json.dumps(result,ensure_ascii=False,indent=2))
    assert all(item["pass"] for item in result), "Browser regression failed; see results.json"


asyncio.run(main())
