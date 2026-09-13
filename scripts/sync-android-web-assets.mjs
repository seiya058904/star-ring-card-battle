import { copyFile, cp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
const repositoryRoot = path.resolve(scriptDirectory, "..");
const sourceIndex = path.join(repositoryRoot, "index.html");
const sourceAssets = path.join(repositoryRoot, "assets");
const sourceJs = path.join(repositoryRoot, "js");
const androidWebRoot = path.join(
  repositoryRoot,
  "android",
  "app",
  "src",
  "main",
  "assets",
  "www",
);
const androidIndex = path.join(androidWebRoot, "index.html");
const androidAssets = path.join(androidWebRoot, "assets");
const androidJs = path.join(androidWebRoot, "js");
const rootIconNames = ["icon.png", "icon-32.png", "icon-192.png"];

const viewportPattern = /<meta name="viewport"[^>]*>/;
const androidViewport =
  '<meta name="viewport" content="width=1920, user-scalable=no">';

const sourceHtml = await readFile(sourceIndex, "utf8");
if (!viewportPattern.test(sourceHtml)) {
  throw new Error("Root index.html has no viewport meta tag.");
}

const androidHtml = sourceHtml.replace(viewportPattern, androidViewport);

// 先删除镜像目录再整树复制：cp(force) 只覆盖不删除，
// 源头已移除的素材/脚本必须在同步时从镜像中一并消失。
// www 根目录只存放本脚本产物（index.html/assets/js/图标），可以安全清空子树。
await mkdir(androidWebRoot, { recursive: true });
await rm(androidAssets, { recursive: true, force: true });
await rm(androidJs, { recursive: true, force: true });
await writeFile(androidIndex, androidHtml, "utf8");
await cp(sourceAssets, androidAssets, {
  recursive: true,
  force: true,
  errorOnExist: false,
});
await cp(sourceJs, androidJs, {
  recursive: true,
  force: true,
  errorOnExist: false,
});
for (const iconName of rootIconNames) {
  await copyFile(path.join(repositoryRoot, iconName), path.join(androidWebRoot, iconName));
}

console.log("Synced root web assets and injected the Android desktop viewport.");
await import("./verify-android-web-assets.mjs");
