// src/main.ts (最終配線版)

import { BotManager } from './services/BotManager';
import { CommandHandler } from './services/CommandHandler';
import { WorldKnowledge } from './services/WorldKnowledge';
import { BehaviorEngine } from './services/BehaviorEngine';
import { TaskManager } from './services/TaskManager';
import { ModeManager } from './services/ModeManager'; // ModeManagerをインポート
import * as mineflayer from 'mineflayer';
import { McpCommand } from './types/mcp';
import { createInterface } from 'node:readline/promises';

// (ログ抑制処理とBOT_TOOLS_SCHEMAは変更なし)
if (process.env.STDIO_MODE === 'true') { /* ... */ }
const BOT_TOOLS_SCHEMA = [ /* ... */ ];

function sendResponse(responseObject: any) { /* ... */ }

async function main() {
    const MINECRAFT_SERVER_HOST = process.env.MINECRAFT_SERVER_HOST || 'localhost';
    const MINECRAFT_SERVER_PORT = parseInt(process.env.MINECRAFT_SERVER_PORT || '25565', 10);
    const BOT_USERNAME = process.env.BOT_USERNAME || 'MCP_Bot';

    const botManager = new BotManager(BOT_USERNAME, MINECRAFT_SERVER_HOST, MINECRAFT_SERVER_PORT);
    // 初期状態ではすべてnullで生成
    const commandHandler = new CommandHandler(botManager, null, null, null);

    botManager.getBotInstanceEventEmitter().on('spawn', (bot: mineflayer.Bot) => {
        if (!commandHandler.isReady()) {
            // --- 依存関係のインスタンス化を修正 ---
            const worldKnowledge = new WorldKnowledge(bot);
            const behaviorEngine = new BehaviorEngine(bot, worldKnowledge, botManager);
            const modeManager = new ModeManager(); // ModeManagerを生成
            const taskManager = new TaskManager(behaviorEngine, modeManager); // TaskManagerに両方を注入
            commandHandler.setDependencies(worldKnowledge, taskManager, modeManager); // CommandHandlerにすべて注入
        } else {
            commandHandler.getWorldKnowledge()?.setBotInstance(bot);
            // TODO: 再接続時のBehaviorEngineインスタンス更新
        }
    });

    // (以降のmain関数のループ部分は変更なし)
    botManager.connect().catch(err => { /* 静音モードでは何もしない */ });
    const rl = createInterface({ input: process.stdin, crlfDelay: Infinity });
    for await (const line of rl) {
        try {
            const request = JSON.parse(line);
            if (request.jsonrpc === '2.0' && request.method) {
                if (request.method === 'initialize') { /* ... */ continue; }
                if (request.method === 'notifications/initialized') { continue; }
                if (request.method === 'tools/list') { /* ... */ continue; }
                if (request.method === 'tools/call') {
                    while (!commandHandler.isReady()) { await new Promise(resolve => setTimeout(resolve, 200)); }
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
        } catch (e) { /* 無視 */ }
    }
}

main();
