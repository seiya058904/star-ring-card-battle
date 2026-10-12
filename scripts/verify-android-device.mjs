import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";

// Runs only against an isolated CI emulator and the APK built from this checkout.
const apk = "android/app/build/outputs/apk/debug/app-debug.apk";
const previousApk = process.env.PREVIOUS_APK;
assert.ok(previousApk, "previous release APK path is required for upgrade verification");
const packageName = "com.seiya.starcardbattle";
const activity = `${packageName}/.MainActivity`;
const expectedUrl = "https://appassets.androidplatform.net/assets/www/index.html";
const gradle = readFileSync("android/app/build.gradle", "utf8");
const versionName = gradle.match(/versionName = "([^"]+)"/)?.[1];
const versionCode = Number(gradle.match(/versionCode = (\d+)/)?.[1]);
assert.ok(versionName && Number.isSafeInteger(versionCode), "version metadata missing");
setTimeout(() => { throw new Error("Android device verification exceeded 5 minutes after emulator boot"); }, 300000).unref();

function adb(...args) {
  return execFileSync("adb", args, { encoding: "utf8", timeout: 30000 }).trim();
}
async function eventually(task, limitMs = 90000) {
  const deadline = Date.now() + limitMs;
  let failure;
  while (Date.now() < deadline) {
    try { return await task(); } catch (error) { failure = error; }
    await new Promise(resolve => setTimeout(resolve, 1000));
  }
  throw failure || new Error("timed out");
}
function start() {
  adb("shell", "am", "force-stop", packageName);
  const output = adb("shell", "am", "start", "-W", "-n", activity);
  assert.match(output, /Status: ok|Complete/, `Activity did not start: ${output}`);
}
function verifyInstalledVersion(expectedName, expectedCode) {
  assert.match(adb("shell", "pm", "path", packageName), /^package:\S+/);
  const packageInfo = adb("shell", "dumpsys", "package", packageName);
  assert.match(packageInfo, new RegExp(`versionCode=${expectedCode}(?:\\s|$)`));
  assert.match(packageInfo, new RegExp(`versionName=${expectedName.replaceAll(".", "\\.")}(?:\\s|$)`));
  console.log(`Package/version verified: ${packageName} ${expectedName} (${expectedCode})`);
}
async function closeNormally(page) {
  page.close();
  adb("shell", "input", "keyevent", "4");
  // Let Activity.onDestroy/WebView finish after the user's normal Back action.
  await new Promise(resolve => setTimeout(resolve, 5000));
}
async function saveByGame(page) {
  return page.evaluate(`Promise.resolve(campaignMode.resetProgress(localStorage,campaignData.characters)).then(saved => ({
    key: campaignMode.STORAGE_KEY,
    revision: saved.revision,
    raw: localStorage.getItem(campaignMode.STORAGE_KEY)
  }))`);
}
async function connectPage() {
  const pid = await eventually(() => {
    const value = adb("shell", "pidof", packageName).split(/\s+/)[0];
    assert.match(value, /^\d+$/);
    return value;
  });
  adb("forward", "tcp:9222", `localabstract:webview_devtools_remote_${pid}`);
  const target = await eventually(async () => {
    const response = await fetch("http://127.0.0.1:9222/json", { signal: AbortSignal.timeout(3000) });
    assert.equal(response.status, 200);
    const pages = await response.json();
    const page = pages.find(item => item.type === "page" && item.url === expectedUrl);
    assert.ok(page?.webSocketDebuggerUrl, `offline WebView page missing: ${JSON.stringify(pages.map(item => item.url))}`);
    return page;
  });
  const ws = new WebSocket(target.webSocketDebuggerUrl);
  await new Promise((resolve, reject) => {
    const timer = setTimeout(() => { ws.close(); reject(new Error("WebView CDP socket did not open")); }, 10000);
    ws.addEventListener("open", () => { clearTimeout(timer); resolve(); }, { once: true });
    ws.addEventListener("error", error => { clearTimeout(timer); reject(error); }, { once: true });
  });
  let nextId = 0;
  async function evaluate(expression) {
    const id = ++nextId;
    const result = await new Promise((resolve, reject) => {
      const timer = setTimeout(() => { ws.removeEventListener("message", onMessage); reject(new Error("CDP evaluation timed out")); }, 10000);
      function onMessage(event) {
        const data = JSON.parse(event.data);
        if (data.id !== id) return;
        clearTimeout(timer);
        ws.removeEventListener("message", onMessage);
        if (data.error) reject(new Error(JSON.stringify(data.error)));
        else resolve(data.result);
      }
      ws.addEventListener("message", onMessage);
      ws.send(JSON.stringify({ id, method: "Runtime.evaluate", params: { expression, returnByValue: true, awaitPromise: true } }));
    });
    if (result.exceptionDetails) throw new Error(result.exceptionDetails.exception?.description || result.exceptionDetails.text);
    return result.result.value;
  }
  return { evaluate, close: () => ws.close() };
}

console.log(`Previous release install: ${adb("install", "-r", previousApk)}`);
verifyInstalledVersion("1.2.8", 13);

// The local asset URL must work without any network path on this CI emulator.
adb("shell", "cmd", "connectivity", "airplane-mode", "enable");
adb("shell", "svc", "wifi", "disable");
adb("shell", "svc", "data", "disable");
assert.equal(adb("shell", "settings", "get", "global", "airplane_mode_on"), "1");
assert.equal(adb("shell", "settings", "get", "global", "wifi_on"), "0");

start();
const previousPage = await connectPage();
let oldSave;
try {
  console.log("Previous WebView connected; waiting for campaign runtime");
  await eventually(() => previousPage.evaluate(`({
    home: document.querySelector('#screen-home')?.classList.contains('active'),
    mode: typeof campaignMode === 'object' && typeof campaignMode.resetProgress === 'function',
    data: typeof campaignData === 'object' && Array.isArray(campaignData.characters) && campaignData.characters.length > 0
  })`).then(value => {
    assert.ok(value?.home && value?.mode && value?.data, JSON.stringify(value));
  }));
  oldSave = await saveByGame(previousPage);
  assert.equal(oldSave.key, "star-ring-campaign-progress-v1");
  assert.equal(oldSave.revision, 1);
  assert.ok(oldSave.raw?.includes('"characters"'));
  console.log("Previous v1.2.8 game save committed through resetProgress");
  await closeNormally(previousPage);
  console.log("Previous Activity closed normally");
} finally { previousPage.close(); }

console.log(`Candidate upgrade install: ${adb("install", "-r", apk)}`);
verifyInstalledVersion(versionName, versionCode);
start();
const first = await connectPage();
try {
  const state = await eventually(() => first.evaluate(`({
    ready: document.readyState,
    title: document.title,
    home: document.querySelector('#screen-home')?.classList.contains('active'),
    image: document.querySelector('#homeTitleImage')?.complete && document.querySelector('#homeTitleImage')?.naturalWidth > 0,
    runtime: typeof gameEngine === 'object' && typeof campaignMode === 'object'
  })`).then(value => {
    assert.ok(value?.home && value?.image && value?.runtime, JSON.stringify(value));
    return value;
  }));
  const asset = await first.evaluate(`fetch('assets/backgrounds/home-title-screen.png').then(async r => ({ok:r.ok, bytes:(await r.arrayBuffer()).byteLength}))`);
  assert.ok(asset.ok && asset.bytes > 100, `offline asset unavailable: ${JSON.stringify(asset)}`);
  const upgraded = await first.evaluate(`(() => {
    const raw = localStorage.getItem(campaignMode.STORAGE_KEY);
    return {raw, loaded:campaignMode.loadProgress(raw,campaignData.characters), strict:campaignMode.readProgressForWrite(localStorage,campaignData.characters)};
  })()`);
  assert.equal(upgraded.raw, oldSave.raw, "v1.2.8 campaign save changed during APK upgrade");
  assert.deepEqual(upgraded.loaded, JSON.parse(oldSave.raw));
  assert.deepEqual(upgraded.strict, JSON.parse(oldSave.raw));
  console.log("Previous campaign save survived in-place APK upgrade and passed strict read");
  const save = await saveByGame(first);
  assert.equal(save.revision, 2);
  assert.ok(save.raw?.includes('"characters"'));
  console.log(`WebView loaded: ${JSON.stringify(state)}; offline image bytes=${asset.bytes}; old campaign save compatible; new save committed`);
  await closeNormally(first);
  console.log("Candidate Activity closed normally; starting fresh process");
  start();
  const second = await connectPage();
  try {
    const restored = await eventually(() => second.evaluate(`(() => {
      const raw = localStorage.getItem(campaignMode.STORAGE_KEY);
      return {ready:document.readyState, raw, loaded:campaignMode.loadProgress(raw,campaignData.characters), strict:campaignMode.readProgressForWrite(localStorage,campaignData.characters)};
    })()`).then(value => {
      assert.equal(value?.raw, save.raw);
      assert.deepEqual(value.loaded, JSON.parse(save.raw));
      assert.deepEqual(value.strict, JSON.parse(save.raw));
      return value;
    }));
    assert.ok(restored.ready);
    console.log("PASS: v1.2.8 to candidate install upgrade, offline WebView and asset, campaign resetProgress/readProgressForWrite across normal-close process restart");
  } finally { second.close(); }
} finally { first.close(); }
