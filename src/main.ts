// src/main.ts (最終修正版)

import { BotManager } from './services/BotManager';
import { CommandHandler } from './services/CommandHandler';
import { WorldKnowledge } from './services/WorldKnowledge';
import { BehaviorEngine } from './services/BehaviorEngine';
import { TaskManager } from './services/TaskManager';
import { ModeManager } from './services/ModeManager';
import { StatusManager } from './services/StatusManager';
import * as mineflayer from 'mineflayer';
import { McpCommand } from './types/mcp';
import { createInterface } from 'node:readline/promises';

if (process.env.STDIO_MODE === 'true') {
    console.log = () => {};
    console.warn = () => {};
    console.info = () => {};
    console.debug = () => {};
    console.error = () => {};
}

const BOT_TOOLS_SCHEMA = [
  { "name": "minecraft_get_status", "description": "ボットの現在の状態を取得する。", "inputSchema": { "type": "object", "properties": {}, "required": [] } },
  { "name": "minecraft_stop_behavior", "description": "ボットの現在の行動を停止させる。", "inputSchema": { "type": "object", "properties": {}, "required": [] } },
  { "name": "minecraft_set_mining_mode", "description": "ボットに特定のブロックを指定した数量だけ採掘させる。", "inputSchema": { "type": "object", "properties": { "blockName": { "type": "string" }, "quantity": { "type": "integer" } }, "required": ["blockName", "quantity"] } },
  { "name": "minecraft_set_follow_mode", "description": "ボットに特定のプレイヤーを追従させる、または追従を停止させる。", "inputSchema": { "type": "object", "properties": { "mode": { "type": "string", "enum": ["on", "off"] }, "targetPlayer": { "type": "string" } }, "required": ["mode"] } },
  { "name": "minecraft_set_combat_mode", "description": "ボットの戦闘モードを設定する。", "inputSchema": { "type": "object", "properties": { "mode": { "type": "string", "enum": ["on", "off"] } }, "required": ["mode"] } },
  { "name": "minecraft_set_home", "description": "ボットの拠点（ホーム）の座標を設定する。", "inputSchema": { "type": "object", "properties": { "position": { "type": "object", "properties": { "x": { "type": "number" }, "y": { "type": "number" }, "z": { "type": "number" } }, "required": ["x", "y", "z"] } }, "required": ["position"] } }
];

function sendResponse(responseObject: any) {
    process.stdout.write(JSON.stringify(responseObject) + '\n');
}

async function main() {
    const MINECRAFT_SERVER_HOST = process.env.MINECRAFT_SERVER_HOST || 'localhost';
    const MINECRAFT_SERVER_PORT = parseInt(process.env.MINECRAFT_SERVER_PORT || '25565', 10);
    const BOT_USERNAME = process.env.BOT_USERNAME || 'MCP_Bot';

    const botManager = new BotManager(BOT_USERNAME, MINECRAFT_SERVER_HOST, MINECRAFT_SERVER_PORT);
    
    // ★ここからが新しい初期化ロジック★
    // 1. CommandHandlerを、中身が空の状態で先にインスタンス化する
    const commandHandler = new CommandHandler(botManager, null, null, null, null);

    // 2. 'spawn'イベントを受け取ったら、各Managerを生成し、CommandHandlerに依存関係を注入して完成させる
    botManager.getBotInstanceEventEmitter().on('spawn', (bot: mineflayer.Bot) => {
        if (!commandHandler.isReady()) {
            const worldKnowledge = new WorldKnowledge(bot);
            const behaviorEngine = new BehaviorEngine(bot, worldKnowledge, botManager);
            const modeManager = new ModeManager();
            const taskManager = new TaskManager(behaviorEngine, modeManager, botManager, worldKnowledge);
            const statusManager = new StatusManager(bot, worldKnowledge, taskManager, modeManager);
            
            // 最初に生成したCommandHandlerインスタンスの中身をここで設定する
            commandHandler.setDependencies(worldKnowledge, taskManager, modeManager, statusManager);
        } else {
            // 再接続時の処理
            commandHandler.getWorldKnowledge()?.setBotInstance(bot);
            // TODO: 他のManagerのインスタンスも更新する
        }
    });
    // ★ここまで新しい初期化ロジック★

    botManager.connect().catch(err => { /* 静音モード */ });

    const rl = createInterface({ input: process.stdin, crlfDelay: Infinity });
    for await (const line of rl) {
        try {
            const request = JSON.parse(line);
            if (request.jsonrpc === '2.0' && request.method) {
                if (request.method === 'initialize' || request.method === 'notifications/initialized') {
                    sendResponse({ jsonrpc: '2.0', id: request.id, result: { capabilities: {} } });
                    continue;
                }
                if (request.method === 'tools/list') {
                    sendResponse({ jsonrpc: '2.0', id: request.id, result: { tools: BOT_TOOLS_SCHEMA } });
                    continue;
                }
                if (request.method === 'tools/call') {
                    // ★ここを修正: commandHandlerはnullではないことが保証されるため、!commandHandlerチェックは不要
                    while (!commandHandler.isReady()) { 
                        await new Promise(resolve => setTimeout(resolve, 200)); 
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
                        case 'minecraft_set_home': command = { type: 'setHome', ...args, id: request.id }; break;
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
