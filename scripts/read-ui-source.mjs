import { readFile } from "node:fs/promises";
import path from "node:path";

// Preserve DOM order when inspecting styles. The presentation stylesheet now
// lives outside the inline engine; ownership checks must read its actual source.
export async function readUiSource(root) {
  const html = await readFile(path.join(root, "index.html"), "utf8");
  const link = '<link id="battle-visual-polish-final" rel="stylesheet" href="assets/ui/battle-presentation.css">';
  if (!html.includes(link)) throw new Error("Missing authoritative presentation stylesheet");
  const css = await readFile(path.join(root, "assets/ui/battle-presentation.css"), "utf8");
  return html.replace(link, `<style id="battle-visual-polish-final">${css}</style>`);
}
