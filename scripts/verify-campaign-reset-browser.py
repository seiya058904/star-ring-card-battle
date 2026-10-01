import asyncio, json, os
from playwright.async_api import async_playwright
async def main():
 async with async_playwright() as pw:
  browser=await pw.chromium.launch(headless=True)
  for locks in [True,False]:
   for entry in ['settings','route']:
    context=await browser.new_context();errors=[]
    if not locks:await context.add_init_script("Object.defineProperty(navigator,'locks',{value:undefined})")
    a=await context.new_page();b=await context.new_page()
    for p in [a,b]:
     p.on('pageerror',lambda e:errors.append(str(e)))
     await p.goto('http://127.0.0.1:4188/')
     await p.evaluate('campaignUiHarness.start()')
    if entry=='settings':
     await a.evaluate('uiRenderer.openSettings()');await a.locator('#settingsCampaignResetBtn').click()
    else:
     await a.evaluate("document.querySelector('[data-open-campaign]').click()")
     await a.locator('#chooseCampaign').click();await a.locator('#campaignResetBtn').click()
    # Actual production confirmation control, not direct reset invocation.
    await a.get_by_role('button',name='确认重置',exact=True).click()
    await a.wait_for_function("JSON.parse(localStorage.getItem(campaignMode.STORAGE_KEY))?.resetGeneration===1")
    for page,win in [(a,False),(b,True)]:
     await page.evaluate("win=>{gameEngine.state[win?'enemy':'player'].hp=0;gameEngine.checkGameOver()}",win)
     await page.wait_for_function("gameEngine.state.campaign.resultRendered")
    result=await a.evaluate('JSON.parse(localStorage.getItem(campaignMode.STORAGE_KEY))')
    assert result['resetGeneration']==1 and len(result['recentBattles'])==0
    assert all(c['unlockedStage']==1 for c in result['characters'].values())
    assert not errors,errors
    os.makedirs('browser-evidence',exist_ok=True)
    await a.screenshot(path=f'browser-evidence/{entry}-{locks}.png')
    print(json.dumps({'entry':entry,'locks':locks,'sameOriginPages':2,'oldWinAndLossBlocked':True,'errors':errors}))
    await context.close()
  await browser.close()
asyncio.run(main())
