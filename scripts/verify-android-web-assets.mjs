import { createHash } from "node:crypto";
import { existsSync } from "node:fs";
import { readFile, readdir } from "node:fs/promises";
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

const failures = [];

function requirePath(targetPath, description) {
  if (!existsSync(targetPath)) {
    failures.push(`${description}不存在：${path.relative(repositoryRoot, targetPath)}`);
  }
}

async function listFiles(rootDirectory, currentDirectory = rootDirectory) {
  const entries = await readdir(currentDirectory, { withFileTypes: true });
  const files = [];

  for (const entry of entries) {
    const entryPath = path.join(currentDirectory, entry.name);
    if (entry.isDirectory()) {
      files.push(...(await listFiles(rootDirectory, entryPath)));
    } else if (entry.isFile()) {
      files.push(path.relative(rootDirectory, entryPath).replaceAll("\\", "/"));
    }
  }

  return files.sort();
}

async function sha256(targetPath) {
  return createHash("sha256").update(await readFile(targetPath)).digest("hex");
}

function findConcreteAssetReferences(html) {
  const references = new Set();
  const pattern = /assets\/[A-Za-z0-9_./-]+\.[A-Za-z0-9]+/g;

  for (const match of html.matchAll(pattern)) {
    references.add(match[0]);
  }

  return [...references].sort();
}

requirePath(sourceIndex, "根目录 index.html");
requirePath(sourceAssets, "根目录 assets/");
requirePath(androidIndex, "Android 版 index.html");
requirePath(androidAssets, "Android 版 assets/");

if (failures.length === 0) {
  const [sourceHtml, androidHtml] = await Promise.all([
    readFile(sourceIndex, "utf8"),
    readFile(androidIndex, "utf8"),
  ]);

  if ((await sha256(sourceIndex)) !== (await sha256(androidIndex))) {
    failures.push("Android 版 index.html 与根目录 index.html 内容不一致");
  }

  const references = findConcreteAssetReferences(androidHtml);
  const missingReferences = references.filter(
    (reference) => !existsSync(path.join(androidWebRoot, ...reference.split("/"))),
  );

  for (const reference of missingReferences) {
    failures.push(`index.html 引用的素材不存在：${reference}`);
  }

  const [sourceFiles, androidFiles] = await Promise.all([
    listFiles(sourceAssets),
    listFiles(androidAssets),
  ]);
  const sourceSet = new Set(sourceFiles);
  const androidSet = new Set(androidFiles);

  for (const relativePath of sourceFiles) {
    if (!androidSet.has(relativePath)) {
      failures.push(`Android assets 缺少文件：assets/${relativePath}`);
      continue;
    }

    const sourcePath = path.join(sourceAssets, ...relativePath.split("/"));
    const androidPath = path.join(androidAssets, ...relativePath.split("/"));
    if ((await sha256(sourcePath)) !== (await sha256(androidPath))) {
      failures.push(`Android assets 文件内容不一致：assets/${relativePath}`);
    }
  }

  for (const relativePath of androidFiles) {
    if (!sourceSet.has(relativePath)) {
      failures.push(`Android assets 存在根目录没有的额外文件：assets/${relativePath}`);
    }
  }

  if (failures.length === 0) {
    console.log(
      `Android 网页素材校验通过：${references.length} 个静态引用，${sourceFiles.length} 个素材文件。`,
    );
  }
}

if (failures.length > 0) {
  console.error("Android 网页素材校验失败：");
  for (const failure of failures) {
    console.error(`- ${failure}`);
  }
  process.exitCode = 1;
}
