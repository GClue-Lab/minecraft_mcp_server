// src/main.ts (ログ完全抑制版)

import { BotManager } from './services/BotManager';
import { CommandHandler } from './services/CommandHandler';
import { WorldKnowledge } from './services/WorldKnowledge';
import { BehaviorEngine } from './services/BehaviorEngine';
import { TaskManager } from './services/TaskManager';
import { ModeManager } from './services/ModeManager';
import * as mineflayer from 'mineflayer';
import { McpCommand } from './types/mcp';
import { createInterface } from 'node:readline/promises';

// ===== ★ここを修正：console.errorも抑制する★ =====
if (process.env.STDIO_MODE === 'true') {
    console.log = () => {};
    console.warn = () => {};
    console.info = () => {};
    console.debug = () => {};
    console.error = () => {}; // この行を追加
}
// ===== ★ここまで修正★ =====

// (BOT_TOOLS_SCHEMAは変更なし)
const BOT_TOOLS_SCHEMA = [
  { "name": "minecraft_get_status", "description": "ボットの現在の状態を取得する。", "inputSchema": { "type": "object", "properties": {}, "required": [] } },
  { "name": "minecraft_stop_behavior", "description": "ボットの現在の行動を停止させる。", "inputSchema": { "type": "object", "properties": {}, "required": [] } },
  { "name": "minecraft_set_mining_mode", "description": "ボットに特定のブロックを指定した数量だけ採掘させる。", "inputSchema": { "type": "object", "properties": { "blockName": { "type": "string" }, "quantity": { "type": "integer" } }, "required": ["blockName", "quantity"] } },
  { "name": "minecraft_set_follow_mode", "description": "ボットに特定のプレイヤーを追従させる、または追従を停止させる。", "inputSchema": { "type": "object", "properties": { "mode": { "type": "string", "enum": ["on", "off"] }, "targetPlayer": { "type": "string" } }, "required": ["mode"] } },
  { "name": "minecraft_set_combat_mode", "description": "ボットの戦闘モードを設定する。", "inputSchema": { "type": "object", "properties": { "mode": { "type": "string", "enum": ["on", "off"] } }, "required": ["mode"] } }
];

function sendResponse(responseObject: any) {
    process.stdout.write(JSON.stringify(responseObject) + '\n');
}

async function main() {
    const MINECRAFT_SERVER_HOST = process.env.MINECRAFT_SERVER_HOST || 'localhost';
    const MINECRAFT_SERVER_PORT = parseInt(process.env.MINECRAFT_SERVER_PORT || '25565', 10);
    const BOT_USERNAME = process.env.BOT_USERNAME || 'MCP_Bot';

    const botManager = new BotManager(BOT_USERNAME, MINECRAFT_SERVER_HOST, MINECRAFT_SERVER_PORT);
    const commandHandler = new CommandHandler(botManager, null, null, null);

    botManager.getBotInstanceEventEmitter().on('spawn', (bot: mineflayer.Bot) => {
        if (!commandHandler.isReady()) {
            const worldKnowledge = new WorldKnowledge(bot);
            const behaviorEngine = new BehaviorEngine(bot, worldKnowledge, botManager);
            const modeManager = new ModeManager();
            const taskManager = new TaskManager(behaviorEngine, modeManager);
            commandHandler.setDependencies(worldKnowledge, taskManager, modeManager);
        } else {
            commandHandler.getWorldKnowledge()?.setBotInstance(bot);
        }
    });

    botManager.connect().catch(err => { /* 静音モード */ });

    const rl = createInterface({ input: process.stdin, crlfDelay: Infinity });
    for await (const line of rl) {
        try {
            const request = JSON.parse(line);

            if (request.jsonrpc === '2.0' && request.method) {
                
                // --- 初期化シーケンス ---
                if (request.method === 'initialize') {
                    sendResponse({
                        jsonrpc: '2.0',
                        id: request.id,
                        result: {
                            capabilities: {},
                            protocolVersion: request.params.protocolVersion,
                            serverInfo: { name: "my-minecraft-bot", version: "2.0.0" }
                        }
                    });
                    continue;
                }
                if (request.method === 'notifications/initialized') {
                    continue;
                }
                if (request.method === 'tools/list') {
                    sendResponse({
                        jsonrpc: '2.0',
                        id: request.id,
                        result: { tools: BOT_TOOLS_SCHEMA }
                    });
                    continue;
                }
                
                // --- 通常業務 ---
                if (request.method === 'tools/call') {
                    while (!commandHandler.isReady()) {
                        await new Promise(resolve => setTimeout(resolve, 100));
                    }
                    
                    const toolName = request.params.name;
                    const args = request.params.arguments;
                    let command: McpCommand | null = null;
                    switch (toolName) {
                        case 'minecraft_get_status': command = { type: 'getStatus', id: request.id }; break;
                        case 'minecraft_stop_behavior': command = { type: 'stop', id: request.id }; break;
                        case 'minecraft_set_mining_mode': command = { type: 'setMiningMode', mode: 'on', ...args, id: request.id }; break;
                        case 'minecraft_set_follow_mode': command = { type: 'setFollowMode', ...args, id: request.id }; break;
                        case 'minecraft_set_combat_mode': command = { type: 'setCombatMode', ...args, id: request.id }; break;
                    }
                    
                    if (command) {
                        try {
                            const result = await commandHandler.handleCommand(command);
                            const resultString = typeof result === 'string' ? result : JSON.stringify(result, null, 2);
                            sendResponse({ jsonrpc: '2.0', id: request.id, result: { content: [{ type: "text", text: resultString }] } });
                        } catch (error: any) {
                            sendResponse({ jsonrpc: '2.0', id: request.id, error: { code: -32000, message: error.message } });
                        }
                    }
                    continue;
                }
            }
        } catch (e) { /* JSONパース失敗などは無視 */ }
    }
}

main();
