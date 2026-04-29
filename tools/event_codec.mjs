#!/usr/bin/env -S deno run --allow-read --allow-write

const isDeno = typeof globalThis.Deno !== "undefined";
const isBun = typeof globalThis.Bun !== "undefined";
const isNode = typeof process !== "undefined" && !!process.versions?.node;

const TRIGGER_NAMES = {
  0: "Action Button",
  1: "Player Touch",
  2: "Event Touch",
  3: "Autorun",
  4: "Parallel",
};

const PRETTY_LABELS = {
  0: () => "",
  101: (p) => `Text: ${JSON.stringify(p)}`,
  102: (p) => `Show Choices: ${JSON.stringify(p[0])}`,
  103: (p) => `Input Number: ${JSON.stringify(p)}`,
  104: (p) => `Select Item: ${JSON.stringify(p)}`,
  105: () => "Show Scrolling Text",
  108: (p) => `Comment: ${String(p[0] ?? "")}`,
  111: (p) => `If: ${JSON.stringify(p)}`,
  112: () => "Loop",
  113: () => "Break Loop",
  115: () => "Exit Event Processing",
  117: (p) => `Common Event: ${p[0]}`,
  118: (p) => `Label: ${String(p[0] ?? "")}`,
  119: (p) => `Jump to Label: ${String(p[0] ?? "")}`,
  121: (p) => `Control Switches: ${JSON.stringify(p)}`,
  122: (p) => `Control Variables: ${JSON.stringify(p)}`,
  123: (p) => `Control Self Switch: ${JSON.stringify(p)}`,
  124: (p) => `Control Timer: ${JSON.stringify(p)}`,
  125: (p) => `Change Gold: ${JSON.stringify(p)}`,
  126: (p) => `Change Items: ${JSON.stringify(p)}`,
  127: (p) => `Change Weapons: ${JSON.stringify(p)}`,
  128: (p) => `Change Armors: ${JSON.stringify(p)}`,
  129: (p) => `Change Party Member: ${JSON.stringify(p)}`,
  135: (p) =>
    `Change Menu Access: ${Number(p[0]) === 0 ? "Disable" : "Enable"}`,
  201: (p) => `Transfer Player: ${JSON.stringify(p)}`,
  222: () => "Fadein Screen",
  230: (p) => `Wait: ${p[0]} frame(s)`,
  231: (p) => `Show Picture: #${p[0]}, ${p[1]}`,
  232: (p) => `Move Picture: #${p[0]}`,
  235: (p) => `Erase Picture: #${p[0]}`,
  250: (p) => `Play SE: ${JSON.stringify(p[0])}`,
  281: (p) => `Change Map Name Display: ${Number(p[0]) === 0 ? "ON" : "OFF"}`,
  322: (p) => `Change Actor Images: ${JSON.stringify(p)}`,
  352: () => "Open Save Screen",
  355: (p) => `Script: ${String(p[0] ?? "")}`,
  356: (p) => `Plugin Command: ${String(p[0] ?? "")}`,
  401: (p) => `Text Line: ${String(p[0] ?? "")}`,
  402: (p) => `When Choice: ${String(p[1] ?? p[0] ?? "")}`,
  403: () => "When Cancel",
  404: () => "End Choices",
  411: () => "Else",
  412: () => "End If",
  413: () => "Repeat Above",
  655: (p) => `Script (cont.): ${String(p[0] ?? "")}`,
};
let commonEventNameById = new Map();

function getArgs() {
  if (isDeno) return [...globalThis.Deno.args];
  if (isNode || isBun) return process.argv.slice(2);
  return [];
}
function parseCliArgs(argv) {
  const flags = {
    useMetadata: true,
  };
  const args = [];
  for (const a of argv) {
    if (a === "--no-metadata") flags.useMetadata = false;
    else args.push(a);
  }
  return { flags, args };
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
    try {
      await Deno.stat(filePath);
      return true;
    } catch {
      return false;
    }
  }
  const fs = await import("node:fs/promises");
  try {
    await fs.stat(filePath);
    return true;
  } catch {
    return false;
  }
}
async function mkdirp(dir) {
  if (isDeno) return await Deno.mkdir(dir, { recursive: true });
  const fs = await import("node:fs/promises");
  await fs.mkdir(dir, { recursive: true });
}

async function loadInterpreterCommandIds() {
  const candidates = [
    "src/rmmz_objects/Game_Interpreter.js",
    "corescript_190/rmmz_objects.js",
  ];
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
async function loadCommonEventNames() {
  const candidates = ["data/CommonEvents.json", "test/data/CommonEvents.json"];
  for (const filePath of candidates) {
    if (!(await exists(filePath))) continue;
    const all = JSON.parse(await readText(filePath));
    commonEventNameById = new Map(
      all.filter(Boolean).map((ev) => [Number(ev.id), String(ev.name ?? "")]),
    );
    return;
  }
}
const labelForCommand = (c) =>
  (PRETTY_LABELS[c.code]
    ? PRETTY_LABELS[c.code](c.parameters)
    : `Command ${c.code}`) || "";
function serializeEventCommands(commands) {
  const out = [];
  for (let i = 0; i < commands.length; i++) {
    const c = commands[i];
    const tabs = "\t".repeat(c.indent);
    if (c.code === 0) {
      out.push("");
      continue;
    }
    if (c.code === 355) {
      const scriptLines = [String(c.parameters?.[0] ?? "")];
      let j = i + 1;
      while (j < commands.length && commands[j].code === 655) {
        scriptLines.push(String(commands[j].parameters?.[0] ?? ""));
        j++;
      }
      i = j - 1;
      out.push(`${tabs}eval("""`);
      for (const line of scriptLines) out.push(`${tabs}${line}`);
      out.push(`${tabs}""")`);
      continue;
    }
    const rendered = renderPythonLikeCommand(c);
    if (rendered) out.push(`${tabs}${rendered}`);
    else
      out.push(
        `${tabs}- [${c.code}] ${labelForCommand(c)} | ${JSON.stringify(c.parameters)}`,
      );
  }
  return out;
}

function renderPythonLikeCommand(c) {
  if (c.code === 108) return `# ${String(c.parameters?.[0] ?? "")}`;
  if (c.code === 408) return `# ${String(c.parameters?.[0] ?? "")}`;
  if (c.code === 118)
    return `label ${JSON.stringify(String(c.parameters?.[0] ?? ""))}:`;
  if (c.code === 119)
    return `goto(${JSON.stringify(String(c.parameters?.[0] ?? ""))})`;
  if (c.code === 111) return `if ${decodeIfCondition(c.parameters)}:`;
  if (c.code === 411) return "else:";
  if (c.code === 412) return "# end if";
  if (c.code === 112) return "while True:";
  if (c.code === 413) return "# end while";
  if (c.code === 402)
    return `elif choice == ${JSON.stringify(String(c.parameters?.[1] ?? c.parameters?.[0] ?? ""))}:`;
  if (c.code === 403) return "else:  # when cancel";
  if (c.code === 404) return "# end choice";
  if (c.code === 201) return renderTransferPlayer(c.parameters);
  if (c.code === 230) return `wait(${Number(c.parameters?.[0] ?? 0)})`;
  if (c.code === 231) return renderShowPicture(c.parameters);
  if (c.code === 232) return renderMovePicture(c.parameters);
  if (c.code === 235) return `erasePicture(${Number(c.parameters?.[0] ?? 0)})`;
  if (c.code === 101) return renderBeginText(c.parameters);
  if (c.code === 401)
    return `text(${JSON.stringify(String(c.parameters?.[0] ?? ""))})`;
  if (c.code === 102)
    return `showChoices(${JSON.stringify(c.parameters?.[0] ?? [])})`;
  if (c.code === 123)
    return `SelfSwitch[${String(c.parameters?.[0] ?? "A")}] = ${Number(c.parameters?.[1] ?? 0) === 0 ? "ON" : "OFF"}`;
  if (c.code === 250)
    return `playSE(${JSON.stringify(c.parameters?.[0] ?? {})})`;
  if (c.code === 221) return "fadeoutScreen()";
  if (c.code === 222) return "fadeinScreen()";
  if (c.code === 356) return renderPluginCommand(c.parameters);
  if (c.code === 126) return renderChangeItems(c.parameters);
  if (c.code === 117) return renderCommonEventCall(c.parameters);
  if (c.code === 121) return renderControlSwitch(c.parameters);
  if (c.code === 122) return renderControlVariable(c.parameters);
  return null;
}

function renderPluginCommand(p) {
  const text = String(p?.[0] ?? "");
  if (text.startsWith("D_TEXT "))
    return `drawText(${JSON.stringify(text.slice(7))})`;
  if (text.startsWith("D_TEXT_SETTING "))
    return `setTextStyle(${JSON.stringify(text.slice(15))})`;
  if (text.startsWith("easing "))
    return `setEasing(${JSON.stringify(text.slice(7))})`;
  if (text.startsWith("GraphicalChoice "))
    return `graphicalChoice(${JSON.stringify(text.slice(16))})`;
  return `pluginCommand(${JSON.stringify(text)})`;
}

function renderShowPicture(p) {
  const [id, name, origin, , x, y, sx, sy, opacity, blend] = p ?? [];
  return `showPicture(id=${id}, name=${JSON.stringify(name)}, origin=${origin}, x=${x}, y=${y}, scaleX=${sx}, scaleY=${sy}, opacity=${opacity}, blend=${blend})`;
}

function renderBeginText(p) {
  const [faceName, faceIndex, bg, pos] = p ?? [];
  return `beginText(face=${JSON.stringify(faceName)}, faceIndex=${faceIndex}, background=${bg}, position=${pos})`;
}

function renderMovePicture(p) {
  const [id, origin, , , x, y, sx, sy, opacity, blend, duration, wait] =
    p ?? [];
  return `movePicture(id=${id}, origin=${origin}, x=${x}, y=${y}, scaleX=${sx}, scaleY=${sy}, opacity=${opacity}, blend=${blend}, duration=${duration}, wait=${Boolean(wait)})`;
}

function renderChangeItems(p) {
  const [itemId, opType, operandType, value] = p ?? [];
  const op = Number(opType) === 0 ? "+=" : "-=";
  const rhs =
    Number(operandType) === 0
      ? String(value ?? 0)
      : `Variable[${Number(value ?? 0)}]`;
  return `Items[${Number(itemId ?? 0)}] ${op} ${rhs}`;
}

function renderTransferPlayer(p) {
  const [mode, mapId, x, y, dir, fade] = p ?? [];
  if (Number(mode) === 0) {
    return `transferPlayer(mapId=${mapId}, x=${x}, y=${y}, direction=${dir}, fade=${fade})`;
  }
  return `transferPlayer(${JSON.stringify(p)})`;
}

function renderCommonEventCall(p) {
  const id = Number(p?.[0] ?? 0);
  const name = commonEventNameById.get(id);
  return `callCommonEvent(${id})${name ? `  # ${name}` : ""}`;
}

function renderControlSwitch(p) {
  const [start, end, value] = p ?? [];
  const target =
    Number(start) === Number(end)
      ? `ControlSwitch[${Number(start)}]`
      : `ControlSwitch[${Number(start)}:${Number(end)}]`;
  return `${target} = ${Number(value) === 0 ? "ON" : "OFF"}`;
}

function renderControlVariable(p) {
  const [start, end, op, operandType] = p ?? [];
  const target =
    Number(start) === Number(end)
      ? `ControlVariable[${Number(start)}]`
      : `ControlVariable[${Number(start)}:${Number(end)}]`;
  const operator = ["=", "+=", "-=", "*=", "/=", "%="][Number(op) ?? 0] ?? "=";
  let rhs = "0";
  if (Number(operandType) === 0) rhs = String(p?.[4] ?? 0);
  else if (Number(operandType) === 1) rhs = `Variable[${Number(p?.[4] ?? 0)}]`;
  else if (Number(operandType) === 2)
    rhs = `random(${p?.[4] ?? 0}, ${p?.[5] ?? 0})`;
  else if (Number(operandType) === 3)
    rhs = `GameData(${JSON.stringify(p?.slice(4) ?? [])})`;
  else if (Number(operandType) === 4)
    rhs = `Script(${JSON.stringify(String(p?.[4] ?? ""))})`;
  return `${target} ${operator} ${rhs}`;
}

function decodeIfCondition(params) {
  const t = params?.[0];
  if (t === 0) {
    const id = Number(params[1] ?? 0);
    const on = Number(params[2] ?? 0) === 0;
    return `Switch[${id}] == ${on ? "ON" : "OFF"}`;
  }
  if (t === 1) {
    const id = Number(params[1] ?? 0);
    const op =
      ["==", ">=", "<=", ">", "<", "!="][Number(params[4] ?? 0)] ?? "==";
    const rhsType = Number(params[2] ?? 0);
    const rhs =
      rhsType === 0
        ? String(params[3] ?? 0)
        : `Variable[${Number(params[3] ?? 0)}]`;
    return `Variable[${id}] ${op} ${rhs}`;
  }
  if (t === 2) {
    const ch = String(params[1] ?? "A");
    const on = Number(params[2] ?? 0) === 0;
    return `SelfSwitch[${ch}] == ${on ? "ON" : "OFF"}`;
  }
  if (t === 3) {
    const sec = Number(params[1] ?? 0);
    const op = Number(params[2] ?? 0) === 0 ? ">=" : "<=";
    const m = Math.floor(sec / 60);
    const s = sec % 60;
    return `Timer ${op} ${m}m ${s}s`;
  }
  if (t === 4) {
    const actorId = Number(params[1] ?? 0);
    const mode = Number(params[2] ?? 0);
    if (mode === 0) return `Actor[${actorId}].inParty == True`;
    if (mode === 1)
      return `Actor[${actorId}].name == ${JSON.stringify(String(params[3] ?? ""))}`;
    if (mode === 2)
      return `Actor[${actorId}].classId == ${Number(params[3] ?? 0)}`;
    if (mode === 3)
      return `Actor[${actorId}].skillId == ${Number(params[3] ?? 0)}`;
    if (mode === 4)
      return `Actor[${actorId}].weaponId == ${Number(params[3] ?? 0)}`;
    if (mode === 5)
      return `Actor[${actorId}].armorId == ${Number(params[3] ?? 0)}`;
    if (mode === 6)
      return `Actor[${actorId}].stateId == ${Number(params[3] ?? 0)}`;
  }
  if (t === 7)
    return `Gold ${["<=", ">=", "<", ">", "=="][Number(params[2] ?? 0)] ?? ">="} ${Number(params[1] ?? 0)}`;
  if (t === 8) return `Item[${Number(params[1] ?? 0)}] == owned`;
  if (t === 9)
    return `Weapon[${Number(params[1] ?? 0)}]${Number(params[2] ?? 0) ? ".withEquipment" : ""} == owned`;
  if (t === 10)
    return `Armor[${Number(params[1] ?? 0)}]${Number(params[2] ?? 0) ? ".withEquipment" : ""} == owned`;
  if (t === 11)
    return `Button[${JSON.stringify(String(params[1] ?? ""))}] == pressed`;
  if (t === 12) return `Script(${JSON.stringify(String(params[1] ?? ""))})`;
  if (t === 5)
    return `Enemy[${Number(params[1] ?? 0)}].appeared == ${Number(params[2] ?? 0) === 0 ? "True" : "False"}`;
  if (t === 6)
    return `Character[${Number(params[1] ?? 0)}].facing(${Number(params[2] ?? 0)})`;
  if (t === 13) return `Vehicle[${Number(params[1] ?? 0)}].driven == True`;
  return `Condition(${JSON.stringify(params)})`;
}
function parseEventCommands(lines) {
  const out = [];
  for (const line of lines) {
    if (!line.trim().startsWith("- [")) continue;
    const indent = (line.match(/^\t*/) ?? [""])[0].length;
    const trimmed = line.trim();
    const codeMatch = trimmed.match(/^- \[(\d+)]/);
    const divider = trimmed.lastIndexOf(" | ");
    if (!codeMatch || divider < 0) continue;
    out.push({
      code: Number(codeMatch[1]),
      indent,
      parameters: JSON.parse(trimmed.slice(divider + 3)),
    });
  }
  return out;
}
const makeHeader = (meta) =>
  Object.entries(meta).map(([k, v]) => `#% ${k}: ${JSON.stringify(v)}`);
function readHeader(lines) {
  const out = {};
  for (const line of lines) {
    if (!line.startsWith("#% ")) continue;
    const cut = line.slice(3);
    const idx = cut.indexOf(":");
    if (idx < 0) continue;
    out[cut.slice(0, idx).trim()] = JSON.parse(cut.slice(idx + 1).trim());
  }
  return out;
}
function toHtml(lines) {
  const esc = (s) =>
    s.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;");
  const colorize = (s) => {
    let out = esc(s);
    out = out.replace(
      /(\"(?:[^\"\\\\]|\\\\.)*\")/g,
      '<span style="color:#2e8b57">$1</span>',
    );
    out = out.replace(/\b(\d+)\b/g, '<span style="color:#b8860b">$1</span>');
    return out;
  };
  const body = lines
    .map((line) => {
      if (line.startsWith("#%"))
        return `<span style="color:gray">${esc(line)}</span>`;
      const tabs = (line.match(/^\t*/) ?? [""])[0].length;
      const rest = line.slice(tabs);
      if (rest.startsWith("label ")) {
        const m = rest.match(/^label\s+\"(.*)\":$/);
        const label = m ? m[1] : rest;
        return `${"&nbsp;&nbsp;&nbsp;&nbsp;".repeat(tabs)}<a id="label-${encodeURIComponent(label)}"></a><span style="color:seagreen">${colorize(rest)}</span>`;
      }
      if (rest.startsWith("goto(")) {
        const m = rest.match(/^goto\(\"(.*)\"\)$/);
        const label = m ? m[1] : "";
        return `${"&nbsp;&nbsp;&nbsp;&nbsp;".repeat(tabs)}<a href="#label-${encodeURIComponent(label)}" style="color:royalblue">${colorize(rest)}</a>`;
      }
      if (!rest.startsWith("- ["))
        return `${"&nbsp;&nbsp;&nbsp;&nbsp;".repeat(tabs)}<span style="color:teal">${colorize(rest)}</span>`;
      return `${"&nbsp;&nbsp;&nbsp;&nbsp;".repeat(tabs)}<span style="color:black">-</span> <span style="color:teal">${colorize(rest.slice(2))}</span>`;
    })
    .join("\n");
  return `<pre>${body}</pre>`;
}

function escapeHtml(s) {
  return s
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

async function renderEventCodeHtml(filePath) {
  const lines = (await readText(filePath)).split(/\r?\n/);
  return toHtml(lines);
}

async function buildMapPickerHtml(mapPath, mapFolder) {
  const map = JSON.parse(await readText(mapPath));
  const width = Number(map.width ?? 0);
  const height = Number(map.height ?? 0);
  const mapName = map.displayName || map.note || "(unnamed map)";
  const events = (map.events ?? []).filter(Boolean);

  const grouped = new Map();
  for (const ev of events) {
    const key = `${ev.x},${ev.y}`;
    if (!grouped.has(key)) grouped.set(key, []);
    grouped.get(key).push(ev);
  }

  const rows = [];
  for (let y = 0; y < height; y++) {
    const cells = [];
    for (let x = 0; x < width; x++) {
      const key = `${x},${y}`;
      const list = grouped.get(key) ?? [];
      const has = list.length > 0;
      const label = has ? String(list.length) : "";
      const title = has
        ? list.map((e) => `#${e.id} ${e.name}`).join(" | ")
        : "";
      const data = JSON.stringify(
        list.map((e) => ({ id: e.id, name: e.name, pages: e.pages.length })),
      );
      cells.push(
        `<td class="tile ${has ? "has-event" : ""}" data-events="${escapeHtml(data)}" title="${escapeHtml(title)}">${label}</td>`,
      );
    }
    rows.push(`<tr>${cells.join("")}</tr>`);
  }

  const eventHtmlById = {};
  for (const ev of events) {
    const pages = [];
    for (let pageNo = 1; pageNo <= ev.pages.length; pageNo++) {
      const filePath = `${mapFolder}/event${String(ev.id).padStart(3, "0")}_page${String(pageNo).padStart(2, "0")}.evt.txt`;
      pages.push({ page: pageNo, html: await renderEventCodeHtml(filePath) });
    }
    eventHtmlById[ev.id] = pages;
  }

  const html = `<!doctype html><html><head><meta charset="utf-8"><title>Map Picker</title>
<style>
body{font-family:Arial,sans-serif}table{border-collapse:collapse}td.tile{width:22px;height:22px;border:1px solid #ddd;text-align:center;font-size:11px}
.has-event{background:#ffefc2;cursor:pointer;font-weight:bold}#overlay{position:fixed;inset:0;background:rgba(0,0,0,.4);display:none}
#popup{position:fixed;left:5%;top:5%;width:90%;height:90%;background:#fff;border:1px solid #333;display:none;overflow:auto;padding:8px}
.tabs button{margin-right:4px}.eventTab{display:none}.eventTab.active{display:block}
</style></head><body>
<h2>${escapeHtml(mapName)} (${width}x${height})</h2>
<p>Click highlighted tiles to inspect events.</p>
<table>${rows.join("\n")}</table>
<div id="overlay"></div><div id="popup"><button onclick="closePopup()">Close</button><div id="content"></div></div>
<script>
const eventHtmlById = ${JSON.stringify(eventHtmlById)};
const overlay=document.getElementById('overlay'); const popup=document.getElementById('popup');
function closePopup(){overlay.style.display='none';popup.style.display='none';}
function openEvent(i){document.querySelectorAll('.eventTab').forEach((e,idx)=>e.classList.toggle('active',idx===i));}
function openPage(ei,pi){document.querySelectorAll('#ev_'+ei+' .page').forEach((e,idx)=>e.style.display=idx===pi?'block':'none');}
function showEventTabs(events){
  const content=document.getElementById('content');
  let out='<div class="tabs">';
  events.forEach((e,i)=>{out+='<button onclick="openEvent('+i+')">#'+e.id+' '+e.name+'</button>';});
  out+='</div>';
  events.forEach((e,i)=>{out+='<div class="eventTab" id="ev_'+i+'"><h3>Event #'+e.id+' '+e.name+'</h3>';
    const pages=eventHtmlById[e.id]||[];
    out+='<div class="tabs">'+pages.map((p,pi)=>'<button onclick="openPage('+i+','+pi+')">Page '+p.page+'</button>').join('')+'</div>';
    pages.forEach((p,pi)=>{out+='<div class="page" style="display:'+(pi===0?'block':'none')+'">'+p.html+'</div>';});
    out+='</div>';});
  content.innerHTML=out; openEvent(0); overlay.style.display='block'; popup.style.display='block';
}
document.querySelectorAll('td.has-event').forEach((td)=>td.addEventListener('click',()=>showEventTabs(JSON.parse(td.dataset.events))));
</script></body></html>`;
  await writeText(`${mapFolder}/picker.html`, html);
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
  await writeText(
    `${mapFolder}/_map.json`,
    `${JSON.stringify(stripped, null, 2)}\n`,
  );
  for (const ev of map.events ?? []) {
    if (!ev) continue;
    for (let pageIndex = 0; pageIndex < ev.pages.length; pageIndex++) {
      const page = ev.pages[pageIndex];
      const lines = [
        ...makeHeader({
          type: "map_event_page",
          mapId: Number(mapId),
          eventId: ev.id,
          eventName: ev.name,
          x: ev.x,
          y: ev.y,
          note: ev.note,
          pageIndex,
          trigger: page.trigger,
          triggerName: TRIGGER_NAMES[page.trigger] ?? "Unknown",
          conditions: page.conditions,
          interpreterCommandIds: allCommandIds,
        }),
        "",
        ...serializeEventCommands(page.list),
      ];
      const basePath = `${mapFolder}/event${String(ev.id).padStart(3, "0")}_page${String(pageIndex + 1).padStart(2, "0")}`;
      await writeEventFiles(basePath, lines);
    }
  }
  await buildMapPickerHtml(mapPath, mapFolder);
}

async function mergeMap(mapFolder, outMapPath) {
  const mapBase = JSON.parse(await readText(`${mapFolder}/_map.json`));
  const entries = isDeno
    ? [...Deno.readDirSync(mapFolder)]
    : await (
        await import("node:fs/promises")
      ).readdir(mapFolder, { withFileTypes: true });
  const files = entries
    .map((e) => (isDeno ? e.name : e.name))
    .filter((n) => /^event\d+_page\d+\.evt\.txt$/i.test(n))
    .sort();
  const eventsById = new Map();
  for (const name of files) {
    const text = await readText(`${mapFolder}/${name}`);
    const lines = text.split(/\r?\n/);
    const h = readHeader(lines);
    const list = parseEventCommands(lines);
    const id = h.eventId;
    if (!eventsById.has(id))
      eventsById.set(id, {
        id,
        name: h.eventName,
        note: h.note ?? "",
        x: h.x ?? 0,
        y: h.y ?? 0,
        pages: [],
      });
    const ev = eventsById.get(id);
    const page = h.fullPage ?? { conditions: h.conditions ?? {}, list: [] };
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
    const lines = [
      ...makeHeader({
        type: "common_event",
        id: ev.id,
        name: ev.name,
        trigger: ev.trigger,
        triggerName: TRIGGER_NAMES[ev.trigger] ?? "None",
        switchId: ev.switchId,
        interpreterCommandIds: allCommandIds,
      }),
      "",
      ...serializeEventCommands(ev.list),
    ];
    await writeEventFiles(
      `${folder}/common${String(ev.id).padStart(3, "0")}`,
      lines,
    );
  }
}

async function roundTrip(filePath) {
  const lines = (await readText(filePath)).split(/\r?\n/);
  console.log(
    JSON.stringify(
      { header: readHeader(lines), list: parseEventCommands(lines) },
      null,
      2,
    ),
  );
}
async function listCommands() {
  const ids = await loadInterpreterCommandIds();
  for (const id of ids)
    console.log(
      `${String(id).padStart(3, "0")}: ${PRETTY_LABELS[id] ? "pretty" : "generic"}`,
    );
}

const parsed = parseCliArgs(getArgs());
const [mode, ...args] = parsed.args;
const allCommandIds = await loadInterpreterCommandIds();
if (parsed.flags.useMetadata) {
  await loadCommonEventNames();
}
if (mode === "list-commands") await listCommands();
else if (mode === "extract-map")
  await extractMap(args[0], args[1] ?? "out_events", allCommandIds);
else if (mode === "merge-map")
  await mergeMap(args[0], args[1] ?? "merged_map.json");
else if (mode === "extract-common")
  await extractCommon(args[0], args[1] ?? "out_events", allCommandIds);
else if (mode === "roundtrip") await roundTrip(args[0]);
else
  console.log(
    `Usage:\n  deno run --allow-read --allow-write tools/event_codec.mjs list-commands\n  deno run --allow-read --allow-write tools/event_codec.mjs extract-map test/data/Map056.json out_events\n  deno run --allow-read --allow-write tools/event_codec.mjs merge-map out_events/map056 merged_map.json\n  deno run --allow-read --allow-write tools/event_codec.mjs extract-common test/data/CommonEvents.json out_events\n  deno run --allow-read tools/event_codec.mjs roundtrip out_events/map056/event001_page01.evt.txt`,
  );
