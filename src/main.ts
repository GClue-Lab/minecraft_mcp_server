// src/main.ts (初期化シーケンス解説付き)

import { BotManager } from './services/BotManager';
import { CommandHandler } from './services/CommandHandler';
import { WorldKnowledge } from './services/WorldKnowledge';
import { BehaviorEngine } from './services/BehaviorEngine';
import { TaskManager } from './services/TaskManager';
import { ModeManager } from './services/ModeManager';
import * as mineflayer from 'mineflayer';
import { McpCommand } from './types/mcp';
import { createInterface } from 'node:readline/promises';

// (ログ抑制処理は変更なし)
if (process.env.STDIO_MODE === 'true') { /* ... */ }

// ボットの能力を定義する「ツールカタログ」
const BOT_TOOLS_SCHEMA = [
  { "name": "minecraft_get_status", "description": "ボットの現在の状態を取得する。", "inputSchema": { "type": "object", "properties": {}, "required": [] } },
  { "name": "minecraft_stop_behavior", "description": "ボットの現在の行動を停止させる。", "inputSchema": { "type": "object", "properties": {}, "required": [] } },
  { "name": "minecraft_set_mining_mode", "description": "ボットに特定のブロックを指定した数量だけ採掘させる。", "inputSchema": { "type": "object", "properties": { "blockName": { "type": "string" }, "quantity": { "type": "integer" } }, "required": ["blockName", "quantity"] } },
  { "name": "minecraft_set_follow_mode", "description": "ボ.tsに特定のプレイヤーを追従させる、または追従を停止させる。", "inputSchema": { "type": "object", "properties": { "mode": { "type": "string", "enum": ["on", "off"] }, "targetPlayer": { "type": "string" } }, "required": ["mode"] } },
  { "name": "minecraft_set_combat_mode", "description": "ボットの戦闘モードを設定する。", "inputSchema": { "type": "object", "properties": { "mode": { "type": "string", "enum": ["on", "off"] } }, "required": ["mode"] } }
];

// mcpoへ応答を送信する唯一の関数
function sendResponse(responseObject: any) {
    process.stdout.write(JSON.stringify(responseObject) + '\n');
}

async function main() {
    const MINECRAFT_SERVER_HOST = process.env.MINECRAFT_SERVER_HOST || 'localhost';
    const MINECRAFT_SERVER_PORT = parseInt(process.env.MINECRAFT_SERVER_PORT || '25565', 10);
    const BOT_USERNAME = process.env.BOT_USERNAME || 'MCP_Bot';

    const botManager = new BotManager(BOT_USERNAME, MINECRAFT_SERVER_HOST, MINECRAFT_SERVER_PORT);
    const commandHandler = new CommandHandler(botManager, null, null, null);

    // ボットの準備が整ったら、各種Managerを初期化してCommandHandlerに渡す
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

    // 標準入力を一行ずつ非同期に読み取るループ
    const rl = createInterface({ input: process.stdin, crlfDelay: Infinity });
    for await (const line of rl) {
        try {
            const request = JSON.parse(line);

            if (request.jsonrpc === '2.0' && request.method) {
                
                // ===== ここからが初期化シーケンス（受付・挨拶） =====

                // ステップ1: mcpoからの「はじめまして」に応答する
                if (request.method === 'initialize') {
                    console.error("Received initialize request."); // デバッグ用に標準エラー出力へ
                    sendResponse({
                        jsonrpc: '2.0',
                        id: request.id,
                        result: {
                            capabilities: {},
                            protocolVersion: request.params.protocolVersion,
                            serverInfo: { name: "my-minecraft-bot", version: "2.0.0" }
                        }
                    });
                    continue; // 挨拶が終わったので、次のリクエストを待つ
                }

                // ステップ2: mcpoからの「挨拶ありがとう」は無視する
                if (request.method === 'notifications/initialized') {
                    console.error("Received initialized notification.");
                    continue; // 応答不要なので、次のリクエストを待つ
                }

                // ステップ3: mcpoからの「何ができますか？」にツールカタログを渡す
                if (request.method === 'tools/list') {
                    console.error("Received tools/list request.");
                    sendResponse({
                        jsonrpc: '2.0',
                        id: request.id,
                        result: { tools: BOT_TOOLS_SCHEMA }
                    });
                    continue; // カタログを渡したので、次のリクエストを待つ
                }
                
                // ===== ここまでが初期化シーケンス =====


                // ===== ここからが通常業務（仕事の依頼） =====
                // 初期化シーケンス以外のリクエスト（tools/call）が来たら、初めてCommandHandlerを呼び出す
                if (request.method === 'tools/call') {
                    console.error(`Received tools/call: ${request.params.name}`);
                    
                    // ボットの準備ができるまで待機
                    while (!commandHandler.isReady()) {
                        await new Promise(resolve => setTimeout(resolve, 100));
                    }
                    
                    // tool名を古いMcpCommand形式に変換
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
                            // CommandHandlerに実際の処理を依頼
                            const result = await commandHandler.handleCommand(command);
                            const resultString = typeof result === 'string' ? result : JSON.stringify(result, null, 2);
                            sendResponse({ jsonrpc: '2.0', id: request.id, result: { content: [{ type: "text", text: resultString }] } });
                        } catch (error: any) {
                            sendResponse({ jsonrpc: '2.0', id: request.id, error: { code: -32000, message: error.message } });
                        }
                    }
                    continue; // 業務完了
                }
            }
        } catch (e) { /* JSONパース失敗などは無視 */ }
    }
}

main();
