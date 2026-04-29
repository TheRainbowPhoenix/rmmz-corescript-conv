#!/usr/bin/env -S deno run --allow-read --allow-write

const isDeno = typeof globalThis.Deno !== "undefined";
const isBun = typeof globalThis.Bun !== "undefined";
const isNode = typeof process !== "undefined" && !!process.versions?.node;

const TRIGGER_NAMES = { 0: "Action Button", 1: "Player Touch", 2: "Event Touch", 3: "Autorun", 4: "Parallel" };

const PRETTY_LABELS = {
  0: () => "", 101: (p) => `Text: ${JSON.stringify(p)}`, 102: (p) => `Show Choices: ${JSON.stringify(p[0])}`,
  103: (p) => `Input Number: ${JSON.stringify(p)}`, 104: (p) => `Select Item: ${JSON.stringify(p)}`,
  105: () => "Show Scrolling Text", 108: (p) => `Comment: ${String(p[0] ?? "")}`,
  111: (p) => `If: ${JSON.stringify(p)}`, 112: () => "Loop", 113: () => "Break Loop", 115: () => "Exit Event Processing",
  117: (p) => `Common Event: ${p[0]}`, 118: (p) => `Label: ${String(p[0] ?? "")}`,
  119: (p) => `Jump to Label: ${String(p[0] ?? "")}`, 121: (p) => `Control Switches: ${JSON.stringify(p)}`,
  122: (p) => `Control Variables: ${JSON.stringify(p)}`, 123: (p) => `Control Self Switch: ${JSON.stringify(p)}`,
  124: (p) => `Control Timer: ${JSON.stringify(p)}`, 125: (p) => `Change Gold: ${JSON.stringify(p)}`,
  126: (p) => `Change Items: ${JSON.stringify(p)}`, 127: (p) => `Change Weapons: ${JSON.stringify(p)}`,
  128: (p) => `Change Armors: ${JSON.stringify(p)}`, 129: (p) => `Change Party Member: ${JSON.stringify(p)}`,
  135: (p) => `Change Menu Access: ${Number(p[0]) === 0 ? "Disable" : "Enable"}`,
  201: (p) => `Transfer Player: ${JSON.stringify(p)}`, 222: () => "Fadein Screen", 230: (p) => `Wait: ${p[0]} frame(s)`,
  231: (p) => `Show Picture: #${p[0]}, ${p[1]}`, 232: (p) => `Move Picture: #${p[0]}`, 235: (p) => `Erase Picture: #${p[0]}`,
  250: (p) => `Play SE: ${JSON.stringify(p[0])}`, 281: (p) => `Change Map Name Display: ${Number(p[0]) === 0 ? "ON" : "OFF"}`,
  322: (p) => `Change Actor Images: ${JSON.stringify(p)}`, 352: () => "Open Save Screen", 355: (p) => `Script: ${String(p[0] ?? "")}`,
  356: (p) => `Plugin Command: ${String(p[0] ?? "")}`, 401: (p) => `Text Line: ${String(p[0] ?? "")}`,
  402: (p) => `When Choice: ${String(p[1] ?? p[0] ?? "")}`, 403: () => "When Cancel", 404: () => "End Choices",
  411: () => "Else", 412: () => "End If", 413: () => "Repeat Above", 655: (p) => `Script (cont.): ${String(p[0] ?? "")}`,
};

function getArgs() {
  if (isDeno) return [...globalThis.Deno.args];
  if (isNode || isBun) return process.argv.slice(2);
  return [];
}
async function readText(filePath) {
  if (isDeno) return await Deno.readTextFile(filePath);
  const fs = await import("node:fs/promises");
  return await fs.readFile(filePath, "utf8");
}
async function writeText(filePath, text) {
  if (isDeno) return await Deno.writeTextFile(filePath, text);
  const fs = await import("node:fs/promises");
  await fs.writeFile(filePath, text, "utf8");
}
async function exists(filePath) {
  if (isDeno) {
    try { await Deno.stat(filePath); return true; } catch { return false; }
  }
  const fs = await import("node:fs/promises");
  try { await fs.stat(filePath); return true; } catch { return false; }
}
async function mkdirp(dir) {
  if (isDeno) return await Deno.mkdir(dir, { recursive: true });
  const fs = await import("node:fs/promises");
  await fs.mkdir(dir, { recursive: true });
}

async function loadInterpreterCommandIds() {
  const candidates = ["src/rmmz_objects/Game_Interpreter.js", "corescript_190/rmmz_objects.js"];
  for (const filePath of candidates) {
    if (!(await exists(filePath))) continue;
    const source = await readText(filePath);
    const ids = new Set();
    const re = /Game_Interpreter\.prototype\.command(\d+)\s*=\s*function/g;
    let m;
    while ((m = re.exec(source)) !== null) ids.add(Number(m[1]));
    if (ids.size > 0) return [...ids].sort((a, b) => a - b);
  }
  return [];
}
const labelForCommand = (c) => (PRETTY_LABELS[c.code] ? PRETTY_LABELS[c.code](c.parameters) : `Command ${c.code}`) || "";
const serializeEventCommands = (commands) => commands.map((c) => `${"\t".repeat(c.indent)}- [${c.code}] ${labelForCommand(c)} | ${JSON.stringify(c.parameters)}`);
function parseEventCommands(lines) {
  const out = [];
  for (const line of lines) {
    if (!line.trim().startsWith("- [")) continue;
    const indent = (line.match(/^\t*/) ?? [""])[0].length;
    const trimmed = line.trim();
    const codeMatch = trimmed.match(/^- \[(\d+)]/);
    const divider = trimmed.lastIndexOf(" | ");
    if (!codeMatch || divider < 0) continue;
    out.push({ code: Number(codeMatch[1]), indent, parameters: JSON.parse(trimmed.slice(divider + 3)) });
  }
  return out;
}
const makeHeader = (meta) => Object.entries(meta).map(([k, v]) => `#% ${k}: ${JSON.stringify(v)}`);
function readHeader(lines) {
  const out = {};
  for (const line of lines) {
    if (!line.startsWith("#% ")) continue;
    const cut = line.slice(3); const idx = cut.indexOf(":"); if (idx < 0) continue;
    out[cut.slice(0, idx).trim()] = JSON.parse(cut.slice(idx + 1).trim());
  }
  return out;
}
function toHtml(lines) {
  const esc = (s) => s.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;");
  const body = lines.map((line) => {
    if (line.startsWith("#%")) return `<span style="color:gray">${esc(line)}</span>`;
    const tabs = (line.match(/^\t*/) ?? [""])[0].length; const rest = line.slice(tabs);
    if (!rest.startsWith("- [")) return esc(line);
    return `${"&nbsp;&nbsp;&nbsp;&nbsp;".repeat(tabs)}<span style="color:black">-</span> <span style="color:teal">${esc(rest.slice(2))}</span>`;
  }).join("\n");
  return `<pre>${body}</pre>`;
}
async function writeEventFiles(basePath, lines) {
  await writeText(`${basePath}.evt.txt`, `${lines.join("\n")}\n`);
  await writeText(`${basePath}.evt.html`, toHtml(lines));
}

async function extractMap(mapPath, outDir, allCommandIds) {
  const map = JSON.parse(await readText(mapPath));
  const mapId = /Map(\d+)\.json$/i.exec(mapPath)?.[1] ?? "000";
  const mapFolder = `${outDir}/map${mapId}`;
  await mkdirp(mapFolder);
  const stripped = { ...map, events: [] };
  await writeText(`${mapFolder}/_map.json`, `${JSON.stringify(stripped, null, 2)}\n`);
  for (const ev of map.events ?? []) {
    if (!ev) continue;
    for (let pageIndex = 0; pageIndex < ev.pages.length; pageIndex++) {
      const page = ev.pages[pageIndex];
      const lines = [
        ...makeHeader({ type: "map_event_page", mapId: Number(mapId), eventId: ev.id, eventName: ev.name, x: ev.x, y: ev.y, note: ev.note, pageIndex, trigger: page.trigger, triggerName: TRIGGER_NAMES[page.trigger] ?? "Unknown", conditions: page.conditions, fullPage: page, interpreterCommandIds: allCommandIds }),
        "",
        ...serializeEventCommands(page.list),
      ];
      const basePath = `${mapFolder}/event${String(ev.id).padStart(3, "0")}_page${String(pageIndex + 1).padStart(2, "0")}`;
      await writeEventFiles(basePath, lines);
    }
  }
}

async function mergeMap(mapFolder, outMapPath) {
  const mapBase = JSON.parse(await readText(`${mapFolder}/_map.json`));
  const entries = isDeno ? [...Deno.readDirSync(mapFolder)] : (await (await import("node:fs/promises")).readdir(mapFolder, { withFileTypes: true }));
  const files = entries.map((e) => isDeno ? e.name : e.name).filter((n) => /^event\d+_page\d+\.evt\.txt$/i.test(n)).sort();
  const eventsById = new Map();
  for (const name of files) {
    const text = await readText(`${mapFolder}/${name}`);
    const lines = text.split(/\r?\n/);
    const h = readHeader(lines);
    const list = parseEventCommands(lines);
    const id = h.eventId;
    if (!eventsById.has(id)) eventsById.set(id, { id, name: h.eventName, note: h.note ?? "", x: h.x ?? 0, y: h.y ?? 0, pages: [] });
    const ev = eventsById.get(id);
    const page = h.fullPage;
    page.list = list;
    ev.pages[h.pageIndex] = page;
  }
  const maxId = Math.max(0, ...eventsById.keys());
  const events = Array(maxId + 1).fill(null);
  for (const [id, ev] of eventsById.entries()) events[id] = ev;
  mapBase.events = events;
  await writeText(outMapPath, `${JSON.stringify(mapBase, null, 2)}\n`);
}

async function extractCommon(commonPath, outDir, allCommandIds) {
  const all = JSON.parse(await readText(commonPath));
  const folder = `${outDir}/common`;
  await mkdirp(folder);
  for (const ev of all) {
    if (!ev) continue;
    const lines = [...makeHeader({ type: "common_event", id: ev.id, name: ev.name, trigger: ev.trigger, triggerName: TRIGGER_NAMES[ev.trigger] ?? "None", switchId: ev.switchId, fullEvent: ev, interpreterCommandIds: allCommandIds }), "", ...serializeEventCommands(ev.list)];
    await writeEventFiles(`${folder}/common${String(ev.id).padStart(3, "0")}`, lines);
  }
}

async function roundTrip(filePath) {
  const lines = (await readText(filePath)).split(/\r?\n/);
  console.log(JSON.stringify({ header: readHeader(lines), list: parseEventCommands(lines) }, null, 2));
}
async function listCommands() {
  const ids = await loadInterpreterCommandIds();
  for (const id of ids) console.log(`${String(id).padStart(3, "0")}: ${PRETTY_LABELS[id] ? "pretty" : "generic"}`);
}

const [mode, ...args] = getArgs();
const allCommandIds = await loadInterpreterCommandIds();
if (mode === "list-commands") await listCommands();
else if (mode === "extract-map") await extractMap(args[0], args[1] ?? "out_events", allCommandIds);
else if (mode === "merge-map") await mergeMap(args[0], args[1] ?? "merged_map.json");
else if (mode === "extract-common") await extractCommon(args[0], args[1] ?? "out_events", allCommandIds);
else if (mode === "roundtrip") await roundTrip(args[0]);
else console.log(`Usage:\n  deno run --allow-read --allow-write tools/event_codec.mjs list-commands\n  deno run --allow-read --allow-write tools/event_codec.mjs extract-map test/data/Map056.json out_events\n  deno run --allow-read --allow-write tools/event_codec.mjs merge-map out_events/map056 merged_map.json\n  deno run --allow-read --allow-write tools/event_codec.mjs extract-common test/data/CommonEvents.json out_events\n  deno run --allow-read tools/event_codec.mjs roundtrip out_events/map056/event001_page01.evt.txt`);
