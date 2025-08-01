// src/main.ts (リファクタリング版)

import { BotManager } from './services/BotManager';
import { handleInitializationSequence } from './core/initializer'; // 初期化処理をインポート
import { setupBotSystem } from './core/systemFactory'; // システム構築処理をインポート
import { McpCommand } from './types/mcp';
import { createInterface } from 'node:readline/promises';

// ログ抑制処理
if (process.env.STDIO_MODE === 'true') {
    console.log = () => {}; console.warn = () => {}; console.info = () => {};
    console.debug = () => {}; console.error = () => {};
}

// 応答送信関数
function sendResponse(responseObject: any) {
    // 応答が空オブジェクトの場合は何も送信しない (initialized通知用)
    if (Object.keys(responseObject).length === 0) return;
    process.stdout.write(JSON.stringify(responseObject) + '\n');
}

// メインの非同期関数
async function main() {
    const MINECRAFT_SERVER_HOST = process.env.MINECRAFT_SERVER_HOST || 'localhost';
    const MINECRAFT_SERVER_PORT = parseInt(process.env.MINECRAFT_SERVER_PORT || '25565', 10);
    const BOT_USERNAME = process.env.BOT_USERNAME || 'MCP_Bot';

    // 1. BotManagerを生成
    const botManager = new BotManager(BOT_USERNAME, MINECRAFT_SERVER_HOST, MINECRAFT_SERVER_PORT);
    
    // 2. システム構築処理を呼び出し、完成済みのCommandHandlerを取得
    const commandHandler = setupBotSystem(botManager);

    // 3. サーバーへ接続開始
    botManager.connect().catch(err => { /* 静音モード */ });

    // 4. mcpoからのリクエストを待機するメインループ
    const rl = createInterface({ input: process.stdin, crlfDelay: Infinity });
    for await (const line of rl) {
        try {
            const request = JSON.parse(line);
            if (!request.jsonrpc || request.jsonrpc !== '2.0') continue;

            // 4a. 初期化シーケンスの処理を委譲
            const initResponse = handleInitializationSequence(request);
            if (initResponse) {
                sendResponse(initResponse);
                continue;
            }

            // 4b. 通常のコマンド呼び出し処理
            if (request.method === 'tools/call') {
                // ボットの準備が整うまで待機
                while (!commandHandler.isReady()) { 
                    await new Promise(resolve => setTimeout(resolve, 200)); 
                }
                
                // コマンドの変換と実行
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
            }
        } catch (e) { /* JSONパース失敗などは無視 */ }
    }
}

main();
