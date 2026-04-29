const fs = require('fs');
const path = require('path');

const commandMap = {
    101: "ShowText",
    102: "ShowChoices",
    103: "InputNumber",
    104: "SelectItem",
    105: "ShowScrollingText",
    108: "Comment",
    109: "Skip",
    111: "If",
    112: "Loop",
    113: "BreakLoop",
    115: "ExitEventProcessing",
    117: "CommonEvent",
    118: "Label",
    119: "JumpToLabel",
    121: "ControlSwitches",
    122: "ControlVariables",
    123: "ControlSelfSwitch",
    124: "ControlTimer",
    125: "ChangeGold",
    126: "ChangeItems",
    127: "ChangeWeapons",
    128: "ChangeArmors",
    129: "ChangePartyMember",
    132: "ChangeBattleBgm",
    133: "ChangeVictoryMe",
    134: "ChangeSaveAccess",
    135: "ChangeMenuAccess",
    136: "ChangeEncounterDisable",
    137: "ChangeFormationAccess",
    138: "ChangeWindowColor",
    139: "ChangeDefeatMe",
    140: "ChangeVehicleBgm",
    201: "TransferPlayer",
    202: "SetVehicleLocation",
    203: "SetEventLocation",
    204: "ScrollMap",
    205: "SetMovementRoute",
    206: "GettingOnOffVehicle",
    211: "ChangeTransparency",
    212: "ShowAnimation",
    213: "ShowBalloonIcon",
    214: "EraseEvent",
    216: "ChangePlayerFollowers",
    217: "GatherFollowers",
    221: "FadeoutScreen",
    222: "FadeinScreen",
    223: "TintScreen",
    224: "FlashScreen",
    225: "ShakeScreen",
    230: "Wait",
    231: "ShowPicture",
    232: "MovePicture",
    233: "RotatePicture",
    234: "TintPicture",
    235: "ErasePicture",
    236: "SetWeatherEffect",
    241: "PlayBgm",
    242: "FadeoutBgm",
    243: "SaveBgm",
    244: "ReplayBgm",
    245: "PlayBgs",
    246: "FadeoutBgs",
    249: "PlayMe",
    250: "PlaySe",
    251: "StopSe",
    261: "PlayMovie",
    281: "ChangeMapNameDisplay",
    282: "ChangeTileset",
    283: "ChangeBattleBack",
    284: "ChangeParallax",
    285: "GetLocationInfo",
    301: "BattleProcessing",
    302: "ShopProcessing",
    303: "NameInputProcessing",
    311: "ChangeHp",
    312: "ChangeMp",
    313: "ChangeState",
    314: "RecoverAll",
    315: "ChangeExp",
    316: "ChangeLevel",
    317: "ChangeParameter",
    318: "ChangeSkill",
    319: "ChangeEquipment",
    320: "ChangeName",
    321: "ChangeClass",
    322: "ChangeActorImages",
    323: "ChangeVehicleImage",
    324: "ChangeNickname",
    325: "ChangeProfile",
    326: "ChangeTp",
    331: "ChangeEnemyHp",
    332: "ChangeEnemyMp",
    333: "ChangeEnemyState",
    334: "EnemyRecoverAll",
    335: "EnemyAppear",
    336: "EnemyTransform",
    337: "ShowBattleAnimation",
    339: "ForceAction",
    340: "AbortBattle",
    342: "ChangeEnemyTp",
    351: "OpenSaveScreen",
    352: "OpenMenuScreen",
    353: "GameOver",
    354: "ReturnToTitleScreen",
    355: "Script",
    356: "PluginCommand",
    357: "PluginCommandMZ",
    401: "TextData",
    402: "When",
    403: "WhenCancel",
    404: "ChoicesEnd",
    405: "ShowTextString",
    408: "CommentData",
    411: "Else",
    412: "BranchEnd",
    413: "RepeatAbove",
    601: "IfWin",
    602: "IfEscape",
    603: "IfLose",
    604: "BattleProcessingEnd",
    605: "ShopItem",
    655: "ScriptData"
};

const reverseCommandMap = Object.entries(commandMap).reduce((acc, [k, v]) => {
    acc[v] = parseInt(k, 10);
    return acc;
}, {});

function getCommandName(code) {
    return commandMap[code] || `Command_${code}`;
}

function getCommandCode(name) {
    if (reverseCommandMap[name] !== undefined) {
        return reverseCommandMap[name];
    }
    if (name.startsWith("Command_")) {
        return parseInt(name.replace("Command_", ""), 10);
    }
    throw new Error(`Unknown command name: ${name}`);
}

// Function to stringify a parameter
function stringifyParam(param) {
    return JSON.stringify(param);
}

// Function to parse parameters string
function parseParams(paramStr) {
    if (!paramStr.trim()) return [];
    return JSON.parse(`[${paramStr}]`);
}

// Extraction logic for a command list
function stringifyList(list) {
    let result = '';
    for (const command of list) {
        const indentStr = '\t'.repeat(command.indent);
        const commandName = getCommandName(command.code);
        const paramsStr = command.parameters.map(stringifyParam).join(', ');
        result += `${indentStr}${commandName}(${paramsStr})\n`;
    }
    return result;
}

// Rebuilding logic for a command list
function parseList(text) {
    const list = [];
    const lines = text.split('\n');
    for (let line of lines) {
        if (!line.trim()) continue;
        const indent = (line.match(/^\t*/) || [''])[0].length;
        line = line.trim();
        const match = line.match(/^([a-zA-Z0-9_]+)\((.*)\)$/);
        if (!match) {
            throw new Error(`Failed to parse line: ${line}`);
        }
        const name = match[1];
        const paramsStr = match[2];
        const code = getCommandCode(name);
        const parameters = parseParams(paramsStr);
        list.push({
            code: code,
            indent: indent,
            parameters: parameters
        });
    }
    return list;
}

// Map Extraction
function extractMap(mapFilePath) {
    const mapData = JSON.parse(fs.readFileSync(mapFilePath, 'utf8'));
    const mapName = path.basename(mapFilePath, '.json');
    const outDir = path.join(path.dirname(mapFilePath), mapName);

    if (!fs.existsSync(outDir)) {
        fs.mkdirSync(outDir, { recursive: true });
    }

    const events = mapData.events;
    delete mapData.events;

    fs.writeFileSync(path.join(outDir, `${mapName}_base.json`), JSON.stringify(mapData, null, 2));

    if (events) {
        for (let i = 0; i < events.length; i++) {
            const event = events[i];
            if (!event) continue;

            let eventText = '';

            // Extract pages
            const pages = event.pages;
            const eventHeader = { ...event };
            delete eventHeader.pages;

            const eventIdStr = String(event.id).padStart(3, '0');
            const eventFileName = `Event${eventIdStr}.txt`;
            const eventOutPath = path.join(outDir, eventFileName);

            eventText += `=== HEADER ===\n${JSON.stringify(eventHeader)}\n=== END HEADER ===\n\n`;

            for (let j = 0; j < pages.length; j++) {
                const page = pages[j];
                const list = page.list;
                const pageHeader = { ...page };
                delete pageHeader.list;

                eventText += `=== PAGE ${j} ===\n${JSON.stringify(pageHeader)}\n=== END PAGE ===\n\n`;
                eventText += stringifyList(list) + '\n';
            }

            fs.writeFileSync(eventOutPath, eventText);
        }
    }
}

// Map Building
function buildMap(mapDir) {
    const mapName = path.basename(mapDir);
    const basePath = path.join(mapDir, `${mapName}_base.json`);
    const mapData = JSON.parse(fs.readFileSync(basePath, 'utf8'));

    const events = [];
    const files = fs.readdirSync(mapDir).filter(f => f.startsWith('Event') && f.endsWith('.txt'));

    // Maintain maximum event ID to properly size the events array
    let maxId = 0;

    for (const file of files) {
        const text = fs.readFileSync(path.join(mapDir, file), 'utf8');
        const headerMatch = text.match(/=== HEADER ===\n(.*?)\n=== END HEADER ===/s);
        if (!headerMatch) throw new Error(`Invalid event file format: ${file}`);

        const event = JSON.parse(headerMatch[1]);
        event.pages = [];
        maxId = Math.max(maxId, event.id);

        const pageSections = text.split(/=== PAGE \d+ ===\n/).slice(1);
        for (const section of pageSections) {
            const pageMatch = section.match(/(.*?)\n=== END PAGE ===\n(.*)/s);
            if (!pageMatch) throw new Error(`Invalid page format in ${file}`);

            const pageHeader = JSON.parse(pageMatch[1]);
            const listText = pageMatch[2].trim();
            const list = parseList(listText);

            // Try to match key order of original RM: 'list' is usually right after image
            const page = { ...pageHeader };

            // Insert list at original position if we could guess it, else at end
            const orderedPage = {};
            for (const key of Object.keys(pageHeader)) {
                orderedPage[key] = pageHeader[key];
                if (key === 'image') {
                     orderedPage.list = list;
                }
            }
            if (!orderedPage.list) {
                 orderedPage.list = list;
            }

            event.pages.push(orderedPage);
        }

        // Reconstruct event with proper key ordering
        const orderedEvent = { id: event.id, name: event.name, note: event.note, pages: event.pages, x: event.x, y: event.y };
        for (let k in event) {
            if (!(k in orderedEvent)) {
                 orderedEvent[k] = event[k];
            }
        }

        events[event.id] = orderedEvent;
    }

    // Ensure the array has null for empty slots up to maxId
    // events[0] is typically null in RPG Maker
    for (let i = 0; i <= maxId; i++) {
        if (!events[i]) {
            events[i] = null;
        }
    }

    mapData.events = events;
    return mapData;
}

// Common Events Extraction
function extractCommonEvents(commonEventsPath) {
    const commonEventsData = JSON.parse(fs.readFileSync(commonEventsPath, 'utf8'));
    const outDir = path.join(path.dirname(commonEventsPath), 'CommonEvents');

    if (!fs.existsSync(outDir)) {
        fs.mkdirSync(outDir, { recursive: true });
    }

    // commonEventsData is typically an array where index 0 is null
    for (let i = 1; i < commonEventsData.length; i++) {
        const event = commonEventsData[i];
        if (!event) continue;

        let eventText = '';
        const list = event.list;
        const eventHeader = { ...event };
        delete eventHeader.list;

        const eventIdStr = String(event.id).padStart(4, '0');
        const eventFileName = `CommonEvent_${eventIdStr}.txt`;
        const eventOutPath = path.join(outDir, eventFileName);

        eventText += `=== HEADER ===\n${JSON.stringify(eventHeader)}\n=== END HEADER ===\n\n`;
        eventText += stringifyList(list) + '\n';

        fs.writeFileSync(eventOutPath, eventText);
    }
}

// Common Events Building
function buildCommonEvents(commonEventsDir) {
    const events = [];
    const files = fs.readdirSync(commonEventsDir).filter(f => f.startsWith('CommonEvent_') && f.endsWith('.txt'));

    let maxId = 0;

    for (const file of files) {
        const text = fs.readFileSync(path.join(commonEventsDir, file), 'utf8');
        const match = text.match(/=== HEADER ===\n(.*?)\n=== END HEADER ===\n(.*)/s);
        if (!match) throw new Error(`Invalid common event file format: ${file}`);

        const eventHeader = JSON.parse(match[1]);
        const listText = match[2].trim();
        const list = parseList(listText);

        // Reconstruct event with proper key ordering: id, list, name, switchId, trigger
        const orderedEvent = { id: eventHeader.id, list: list };
        for (let k in eventHeader) {
            if (!(k in orderedEvent)) {
                 orderedEvent[k] = eventHeader[k];
            }
        }

        maxId = Math.max(maxId, orderedEvent.id);
        events[orderedEvent.id] = orderedEvent;
    }

    for (let i = 0; i <= maxId; i++) {
        if (!events[i]) {
            events[i] = null;
        }
    }

    return events;
}

// Command Line Interface
if (require.main === module) {
    const args = process.argv.slice(2);
    const mode = args[0];
    const targetPath = args[1];

    if (!mode || !targetPath) {
        console.error("Usage: node converter.js <extractMap|buildMap|extractCommonEvents|buildCommonEvents> <path>");
        process.exit(1);
    }

    try {
        if (mode === 'extractMap') {
            extractMap(targetPath);
            console.log(`Extracted map ${targetPath}`);
        } else if (mode === 'buildMap') {
            const mapData = buildMap(targetPath);
            const outPath = targetPath + '_rebuilt.json';
            fs.writeFileSync(outPath, JSON.stringify(mapData)); // Don't pretty print for exact match testing
            console.log(`Built map to ${outPath}`);
        } else if (mode === 'extractCommonEvents') {
            extractCommonEvents(targetPath);
            console.log(`Extracted common events from ${targetPath}`);
        } else if (mode === 'buildCommonEvents') {
            const eventsData = buildCommonEvents(targetPath);
            const outPath = targetPath + '_rebuilt.json';
            fs.writeFileSync(outPath, JSON.stringify(eventsData));
            console.log(`Built common events to ${outPath}`);
        } else {
            console.error(`Unknown mode: ${mode}`);
            process.exit(1);
        }
    } catch (e) {
        console.error(`Error: ${e.message}`);
        console.error(e.stack);
        process.exit(1);
    }
}

module.exports = {
    extractMap,
    buildMap,
    extractCommonEvents,
    buildCommonEvents
};
