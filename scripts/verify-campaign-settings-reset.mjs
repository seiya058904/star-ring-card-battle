import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';
import { createSimRuntime, HARNESS_ROOT } from './balance-harness.mjs';
const html=await readFile(`${HARNESS_ROOT}/index.html`,'utf8');
function method(source,marker){const a=source.indexOf(marker);assert(a>=0);let i=source.indexOf('{',a),d=1,j=i+1;for(;d;j++){if(source[j]==='{')d++;if(source[j]==='}')d--;}return source.slice(a,j)}
for(const locks of [false,true])for(const entry of ['settings','route'])for(const victory of [false,true]){
 const h=await createSimRuntime(),c=h.context,toasts=[],nodes=new Map();let confirm;
 const node=id=>{if(!nodes.has(id))nodes.set(id,{value:'',textContent:'',innerHTML:'',addEventListener(event,fn){this[event]=fn},setAttribute(){},remove(){},insertAdjacentHTML(){},appendChild(){},querySelectorAll(){return []},classList:{add(){},remove(){},toggle(){},contains(){return false}}});return nodes.get(id)};
 c.document.getElementById=node;c.document.querySelectorAll=()=>[];c.document.querySelector=()=>null;
 c.uiRenderer.showToast=(text,type)=>toasts.push({text,type});c.uiRenderer.openConfirm=x=>{confirm=x};c.uiRenderer.openModal=(title,body,opts)=>opts?.afterRender?.();
 let queue=Promise.resolve();if(locks)c.navigator={locks:{request(name,fn){const task=queue.then(fn);queue=task.catch(()=>{});return task}}};
 const state=h.campaignUiHarness.start();assert.equal(state.campaign.progressGeneration,0);
 c.uiRenderer.openSettings=vm.runInContext(`({${method(html,'openSettings() {')}}).openSettings`,c);
 if(entry==='settings'){c.uiRenderer.openSettings();node('settingsCampaignResetBtn').click()}else{for(const fn of c.document.listeners.get('click')||[])fn({target:{closest:s=>s==='[data-open-campaign]'?{}:null},preventDefault(){},stopImmediatePropagation(){}});node('chooseCampaign').onclick();node('campaignResetBtn').onclick()}
 await confirm.onConfirm();assert.equal(h.gameEngine.state,state);const saved=()=>h.campaignMode.loadProgress(h.localStorage.getItem(h.campaignMode.STORAGE_KEY),h.campaignData.characters);
 assert.equal(saved().resetGeneration,1,`${entry} increments generation`);
 if(victory)state.enemy.hp=0;else state.player.hp=0;h.gameEngine.checkGameOver();await h.drain();await queue;
 assert.equal(saved().characters[state.campaign.characterId].unlockedStage,1);assert.equal(saved().recentBattles.length,0);
 await confirm.onConfirm();assert.equal(saved().resetGeneration,2);
 const fresh=h.campaignUiHarness.start();assert.equal(fresh.campaign.progressGeneration,2);fresh.enemy.hp=0;h.gameEngine.checkGameOver();await h.drain();await queue;
 assert.equal(saved().characters[fresh.campaign.characterId].unlockedStage,2);assert.equal(saved().recentBattles.length,1);
 for(const failure of ['read','write',...(locks?['lock']:[])]){
  const old=h.localStorage.getItem(h.campaignMode.STORAGE_KEY),get=h.localStorage.getItem,set=h.localStorage.setItem,request=c.navigator?.locks?.request;
  if(failure==='read')h.localStorage.getItem=()=>{throw Error('read')};
  if(failure==='write')h.localStorage.setItem=()=>{throw Error('write')};
  if(failure==='lock')c.navigator.locks.request=()=>Promise.reject(Error('lock'));
  const count=toasts.length;await confirm.onConfirm();
  assert.equal(toasts.length,count+1);assert.equal(toasts.at(-1).type,'error');
  h.localStorage.getItem=get;h.localStorage.setItem=set;if(locks)c.navigator.locks.request=request;
  assert.equal(h.localStorage.getItem(h.campaignMode.STORAGE_KEY),old);
 }
 await confirm.onConfirm();assert.equal(saved().resetGeneration,3);
 console.log(`PASS ${entry}, victory=${victory}, Web Locks=${locks}: real start/reset/checkGameOver/final showResult`);
}
