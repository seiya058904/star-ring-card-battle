import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";

// Runs only against an isolated CI emulator and the APK built from this checkout.
const apk = "android/app/build/outputs/apk/debug/app-debug.apk";
const packageName = "com.seiya.starcardbattle";
const activity = `${packageName}/.MainActivity`;
const expectedUrl = "https://appassets.androidplatform.net/assets/www/index.html";
const gradle = readFileSync("android/app/build.gradle", "utf8");
const versionName = gradle.match(/versionName = "([^"]+)"/)?.[1];
const versionCode = Number(gradle.match(/versionCode = (\d+)/)?.[1]);
assert.ok(versionName && Number.isSafeInteger(versionCode), "version metadata missing");

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
    ws.addEventListener("open", resolve, { once: true });
    ws.addEventListener("error", reject, { once: true });
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
    if (result.exceptionDetails) throw new Error(result.exceptionDetails.text);
    return result.result.value;
  }
  return { evaluate, close: () => ws.close() };
}

console.log(`APK install: ${adb("install", "-r", apk)}`);
assert.match(adb("shell", "pm", "path", packageName), /^package:\S+/);
const packageInfo = adb("shell", "dumpsys", "package", packageName);
assert.match(packageInfo, new RegExp(`versionCode=${versionCode}(?:\\s|$)`));
assert.match(packageInfo, new RegExp(`versionName=${versionName.replaceAll(".", "\\.")}(?:\\s|$)`));
console.log(`Package/version verified: ${packageName} ${versionName} (${versionCode})`);

// The local asset URL must work without any network path on this CI emulator.
adb("shell", "cmd", "connectivity", "airplane-mode", "enable");
adb("shell", "svc", "wifi", "disable");
adb("shell", "svc", "data", "disable");
assert.equal(adb("shell", "settings", "get", "global", "airplane_mode_on"), "1");
assert.equal(adb("shell", "settings", "get", "global", "wifi_on"), "0");

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
  const save = await first.evaluate(`(() => {
    const value = campaignMode.defaultProgress(campaignData.characters);
    localStorage.setItem(campaignMode.STORAGE_KEY, JSON.stringify(value));
    return {key:campaignMode.STORAGE_KEY, raw:localStorage.getItem(campaignMode.STORAGE_KEY)};
  })()`);
  assert.equal(save.key, "star-ring-campaign-progress-v1");
  assert.ok(save.raw?.includes('"characters"'));
  console.log(`WebView loaded: ${JSON.stringify(state)}; offline image bytes=${asset.bytes}; isolated campaign save written`);
  first.close();
  start();
  const second = await connectPage();
  try {
    const restored = await eventually(() => second.evaluate(`(() => {
      const raw = localStorage.getItem(campaignMode.STORAGE_KEY);
      return {ready:document.readyState, raw, loaded:campaignMode.loadProgress(raw,campaignData.characters)};
    })()`).then(value => {
      assert.equal(value?.raw, save.raw);
      assert.deepEqual(value.loaded, JSON.parse(save.raw));
      return value;
    }));
    assert.ok(restored.ready);
    console.log("PASS: real APK install/start, offline WebView and asset, version, campaign localStorage and read contract across process restart");
  } finally { second.close(); }
} finally { first.close(); }
