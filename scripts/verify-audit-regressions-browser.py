"""Browser evidence for the 2026-10-10 audit fixes.

Serve the repository root and run with --url and an external --out directory.
Requires Python Playwright and Chromium, like the existing browser suites.
Result cases inject only the terminal HP boundary; subsequent actions are real
visible clicks. Storage cases deliberately inject browser I/O faults. The guard
case reaches an affordable attack through real turns, uses an actual fixed summon
card, sets guard HP to one and owner shield to zero, then clicks the attack.
These are targeted fixtures, not full battle playthroughs.
The optional --mirror-url checks generated assets in Chromium, not Android WebView.
"""
import argparse
import asyncio
import json
from pathlib import Path
from urllib.parse import urlsplit

from playwright.async_api import async_playwright

parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument("--url", default="http://127.0.0.1:8000/")
parser.add_argument("--mirror-url")
parser.add_argument("--out", required=True)
args = parser.parse_args()
out = Path(args.out).resolve()
out.mkdir(parents=True, exist_ok=True)


async def start(page, url=None, confirm=True):
    await page.goto(url or args.url)
    await page.evaluate("seed=123456")
    await page.locator("[data-open-settings]:visible").click()
    await page.locator("#settingBattleSpeed").select_option("ultra")
    await page.locator("#settingsSaveBtn").click()
    await page.locator("[data-open-battle-prep]:visible").first.click()
    await page.locator("#chooseCampaign").click()
    await page.locator('[data-campaign-character="lisaya"]').click()
    await page.locator('[data-campaign-difficulty="normal"]').click()
    await page.locator('[data-campaign-stage="1"]').click()
    await page.locator("#campaignStartBtn").click()
    if confirm:
        await page.locator("#mulliganConfirm").click()
        await ready(page)


async def ready(page):
    await page.wait_for_function("canAcceptPlayerCardInput()", timeout=20000)


async def finish(page):
    await page.evaluate("gameEngine.state.enemy.hp=0;gameEngine.checkGameOver()")
    await page.wait_for_selector('[data-campaign-result="retry"]')


async def result_context(page, action):
    await start(page)
    await finish(page)
    await page.wait_for_function("JSON.parse(localStorage.getItem(campaignMode.STORAGE_KEY))?.characters.lisaya.unlockedStage===2")
    await page.locator('[data-campaign-result="route"]').click()
    await page.locator('[data-campaign-character="luolinfo"]').click()
    await page.locator('[data-campaign-difficulty="hard"]').click()
    await page.locator("#campaignCloseBtn").click()
    await page.locator(f'[data-campaign-result="{action}"]').click()
    result = await page.evaluate("({character:gameEngine.state.campaign.characterId,difficulty:gameEngine.state.campaign.difficulty,stage:gameEngine.state.campaign.stage})")
    assert result == {"character": "lisaya", "difficulty": "normal", "stage": 2 if action == "next" else 1}, result
    return result


async def storage_error(page, failure):
    await start(page)
    initial = await page.evaluate("""failure=>{
      const key=campaignMode.STORAGE_KEY;
      const progress=campaignMode.defaultProgress(campaignData.characters);
      progress.characters.luolinfo={unlockedStage:5,completed:true};progress.revision=42;
      const raw=failure==='invalid-json'?'{':JSON.stringify(progress);
      localStorage.setItem(key,raw);
      window.auditGetItem=Storage.prototype.getItem;
      if(failure==='read') Storage.prototype.getItem=function(k){if(k===key)throw Error('audit read fault');return auditGetItem.call(this,k);};
      if(failure==='lock-rejection') Object.defineProperty(navigator,'locks',{configurable:true,value:{request:()=>Promise.reject(Error('audit lock fault'))}});
      return raw;
    }""", failure)
    await finish(page)
    toast = page.locator("#toastLayer .toast.error", has_text="战役进度保存失败")
    await toast.wait_for(state="visible")
    assert await toast.count() == 1
    # A second real final-render invocation must not write or show a second error.
    await page.evaluate("uiRenderer.showResult()")
    await page.wait_for_timeout(80)
    assert await toast.count() == 1
    raw = await page.evaluate("Storage.prototype.getItem=window.auditGetItem;localStorage.getItem(campaignMode.STORAGE_KEY)")
    assert raw == initial, "Original save bytes were overwritten"
    return {"failure": failure, "originalBytesPreserved": True, "failureToastCount": 1}


async def mulligan_double_click(page):
    await start(page, confirm=False)
    await page.locator("[data-mulligan]").first.click()
    await page.evaluate("""()=>{const b=document.querySelector('#mulliganConfirm'),original=b.onclick;
      window.auditConfirmCalls=0;b.onclick=function(e){auditConfirmCalls++;return original.call(this,e);};}""")
    await page.locator("#mulliganConfirm").dblclick(delay=35)
    result = await page.evaluate("({calls:auditConfirmCalls,done:gameEngine.state.campaign.mulliganDone,modalOpen:uiRenderer.isModalOpen()})")
    assert result == {"calls": 1, "done": True, "modalOpen": False}, result
    return result


async def guard_feedback(page):
    await start(page)
    card_id = None
    for _ in range(6):
        card_id = await page.evaluate("""()=>{const s=gameEngine.state;return s.player.hand.find(c=>
          c.effects.some(e=>e.type==='damage')&&effectiveCardCost(s,'player',c)<=s.player.energy)?.instanceId;}""")
        if card_id:
            break
        current_round = await page.evaluate("gameEngine.state.round")
        await page.locator("#endTurnBtn").click()
        await page.wait_for_function("r=>gameEngine.state.round>r&&canAcceptPlayerCardInput()", arg=current_round)
    assert card_id, "No affordable attack after six real turns"
    setup = await page.evaluate("""cardId=>{
      const s=gameEngine.state;
      const summonCard=fixedCardLibrary.createRuntimeDeck('godkin-star').cards.find(c=>c.name==='沙王领主Ⅲ');
      gameEngine.applyCard(s.enemy,s.player,summonCard);
      const guard=s.enemy.summons[0];guard.hp=1;s.enemy.shield=0;
      const card=s.player.hand.find(c=>c.instanceId===cardId);
      window.auditGuardEvents=[];
      const original=effectsRenderer.showSummonGuardDamage;
      effectsRenderer.showSummonGuardDamage=function(event){const value=original.call(this,event);
        auditGuardEvents.push({...event,visible:!!document.querySelector('.summon-float-text.guard')});return value;};
      uiRenderer.render();
      return {cardId:card.instanceId,cardName:card.name,guardId:guard.id};
    }""", card_id)
    await ready(page)
    await page.locator(f'#playerHand .card[data-instance-id="{setup["cardId"]}"]').click()
    await page.wait_for_function("auditGuardEvents.length>0")
    events = await page.evaluate("auditGuardEvents")
    assert len(events) == 1 and events[0]["amount"] == 1 and events[0]["visible"], events
    assert events[0]["id"] == setup["guardId"] and events[0]["ownerId"] == "enemy", events
    await ready(page)
    assert await page.evaluate("gameEngine.state.enemy.summons.length") == 0
    return {"attack": setup["cardName"], "guardEvents": events, "defeatedGuardRemoved": True}


async def mirror_offline(page):
    origin = urlsplit(args.mirror_url)
    external, bad_responses = [], []

    async def restrict(route):
        url = urlsplit(route.request.url)
        if url.scheme in ("http", "https") and (url.scheme, url.netloc) != (origin.scheme, origin.netloc):
            external.append(route.request.url)
            await route.abort()
        else:
            await route.continue_()

    page.on("response", lambda response: bad_responses.append({"url": response.url, "status": response.status}) if response.status >= 400 else None)
    await page.route("**/*", restrict)
    await start(page, url=args.mirror_url)
    await page.locator("#battleSettingsBtn").click()
    await page.locator("#settingsSaveBtn").click()
    await page.wait_for_function("Array.from(document.querySelectorAll('#battlefield img')).every(i=>i.complete&&i.naturalWidth>0)")
    viewport = await page.locator('meta[name="viewport"]').get_attribute("content")
    assert "width=1920" in viewport, viewport
    assert not external and not bad_responses, {"external": external, "badResponses": bad_responses}
    return {"viewport": viewport, "externalRequests": external, "badResponses": bad_responses, "platform": "Chromium only"}


async def main():
    report = []
    cases = [("result-retry", lambda p: result_context(p, "retry")),
             ("result-next", lambda p: result_context(p, "next")),
             *[(f"save-{f}", lambda p, f=f: storage_error(p, f)) for f in ("invalid-json", "read", "lock-rejection")],
             ("mulligan-native-double-click", mulligan_double_click),
             ("guard-feedback", guard_feedback)]
    if args.mirror_url:
        cases.append(("generated-mirror-offline", mirror_offline))
    async with async_playwright() as pw:
        browser = await pw.chromium.launch(headless=True)
        for name, run in cases:
            context = await browser.new_context(viewport={"width": 1440, "height": 1000})
            page = await context.new_page()
            errors = []
            page.on("pageerror", lambda error: errors.append(str(error)))
            page.on("console", lambda message: errors.append(message.text) if message.type == "error" else None)
            try:
                result = await run(page)
                assert not errors, errors
                report.append({"case": name, "passed": True, "result": result, "errors": errors})
                print(f"{name}: PASS", flush=True)
                if name in ("result-next", "save-invalid-json", "generated-mirror-offline"):
                    await page.screenshot(path=str(out / f"{name}.jpg"), type="jpeg", quality=72)
            except Exception as error:
                report.append({"case": name, "passed": False, "error": str(error), "errors": errors})
                await page.screenshot(path=str(out / f"{name}-failure.png"))
                raise
            finally:
                (out / "results.json").write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding="utf8")
                await context.close()
        await browser.close()
    print(f"audit browser regressions: {len(report)}/{len(report)} PASS", flush=True)


asyncio.run(main())
