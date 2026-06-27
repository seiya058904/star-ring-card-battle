import { cp, mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
const repositoryRoot = path.resolve(scriptDirectory, "..");
const sourceIndex = path.join(repositoryRoot, "index.html");
const sourceAssets = path.join(repositoryRoot, "assets");
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

const viewportPattern = /<meta name="viewport"[^>]*>/;
const androidViewport =
  '<meta name="viewport" content="width=1920, user-scalable=no">';

const sourceHtml = await readFile(sourceIndex, "utf8");
if (!viewportPattern.test(sourceHtml)) {
  throw new Error("Root index.html has no viewport meta tag.");
}

const androidHtml = sourceHtml.replace(viewportPattern, androidViewport);

await mkdir(androidWebRoot, { recursive: true });
await writeFile(androidIndex, androidHtml, "utf8");
await cp(sourceAssets, androidAssets, {
  recursive: true,
  force: true,
  errorOnExist: false,
});

console.log("Synced root web assets and injected the Android desktop viewport.");
