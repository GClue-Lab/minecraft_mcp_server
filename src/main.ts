// src/main.ts (修正版)

import { BotManager } from './services/BotManager';
import { CommandHandler } from './services/CommandHandler';
import { WorldKnowledge } from './services/WorldKnowledge';
import { BehaviorEngine } from './services/BehaviorEngine';
import { TaskManager } from './services/TaskManager'; // ===== 追加 =====
import * as mineflayer from 'mineflayer';
import { createInterface } from 'node:readline/promises';

// ===== ここからツール定義を新しい設計に合わせて変更 =====
const BOT_TOOLS_SCHEMA = [
  {
    "name": "get_full_status",
    "description": "ボットの包括的な状態（HP、空腹、位置、インベントリ、装備、周辺環境、現在タスク）を取得する。"
  },
  {
    "name": "add_task",
    "description": "ボットのタスクキューに新しいタスクを追加する。",
    "inputSchema": {
      "type": "object",
      "properties": {
        "taskType": { "type": "string", "enum": ["mine", "follow", "combat", "goto", "dropItems", "patrol"] },
        "arguments": { "type": "object", "description": "タスクタイプに応じた引数。例: {'blockName': 'stone', 'quantity': 10}" },
        "priority": { "type": "integer", "description": "タスクの優先度（0が最高）。省略時はデフォルト値。" }
      },
      "required": ["taskType", "arguments"]
    }
  },
  {
    "name": "cancel_task",
    "description": "指定したIDのタスクをキャンセルする。",
    "inputSchema": {
      "type": "object",
      "properties": { "taskId": { "type": "string" } },
      "required": ["taskId"]
    }
  },
  {
    "name": "get_task_queue",
    "description": "現在のタスクキューの内容を一覧で取得する。"
  }
];
// ===== ここまでツール定義の変更 =====


function sendResponse(responseObject: any) {
    process.stdout.write(JSON.stringify(responseObject) + '\n');
}

async function main() {
    const MINECRAFT_SERVER_HOST = process.env.MINECRAFT_SERVER_HOST || 'localhost';
    const MINECRAFT_SERVER_PORT = parseInt(process.env.MINECRAFT_SERVER_PORT || '25565', 10);
    const BOT_USERNAME = process.env.BOT_USERNAME || 'MCP_Bot';

    const botManager = new BotManager(BOT_USERNAME, MINECRAFT_SERVER_HOST, MINECRAFT_SERVER_PORT);
    
    // ===== ここからインスタンス化のロジックを変更 =====
    // CommandHandlerはまだTaskManagerを知らないので、nullで初期化
    const commandHandler = new CommandHandler(botManager, null);

    botManager.getBotInstanceEventEmitter().on('spawn', (bot: mineflayer.Bot) => {
        // CommandHandlerが既にすべてのインスタンスを持っているかチェック
        if (!commandHandler.isReady()) {
            const worldKnowledge = new WorldKnowledge(bot);
            const behaviorEngine = new BehaviorEngine(bot, worldKnowledge, botManager);
            const taskManager = new TaskManager(behaviorEngine); // TaskManagerをインスタンス化
            
            // CommandHandlerに必要なインスタンスをすべて設定
            commandHandler.setDependencies(worldKnowledge, behaviorEngine, taskManager);
        } else {
            // 既存のインスタンスに新しいbotインスタンスを設定
            commandHandler.getWorldKnowledge()?.setBotInstance(bot);
            commandHandler.getBehaviorEngine()?.setBotInstance(bot);
        }
    });
    // ===== ここまでインスタンス化のロジックの変更 =====

    botManager.connect().catch(err => { /* 静音モードでは何もしない */ });

    const rl = createInterface({ input: process.stdin, crlfDelay: Infinity });

    for await (const line of rl) {
        try {
            const request = JSON.parse(line);

            if (request.jsonrpc === '2.0' && request.method) {
                if (request.method === 'initialize' || request.method === 'notifications/initialized') continue;
                
                if (request.method === 'tools/list') {
                    sendResponse({ jsonrpc: '2.0', id: request.id, result: { tools: BOT_TOOLS_SCHEMA } });
                    continue;
                }
                if (request.method === 'tools/call') {
                    while (!commandHandler.isReady()) {
                        await new Promise(resolve => setTimeout(resolve, 200));
                    }
                    
                    try {
                        // コマンド処理をCommandHandlerに完全に委譲
                        const result = await commandHandler.handleToolCall(request.params.name, request.params.arguments);
                        
                        const resultString = typeof result === 'string' ? result : JSON.stringify(result, null, 2);
                        sendResponse({
                            jsonrpc: '2.0',
                            id: request.id,
                            result: { content: [{ type: "text", text: resultString }] }
                        });
                    } catch (error: any) {
                        sendResponse({ jsonrpc: '2.0', id: request.id, error: { code: -32000, message: error.message } });
                    }
                    continue;
                }
            }
        } catch (e) { /* 無視 */ }
    }
}

main();

