// src/main.ts (修正版 - サービスの重複初期化防止)

import { BotManager } from './services/BotManager';
import { CommandHandler } from './services/CommandHandler';
import { WorldKnowledge } from './services/WorldKnowledge';
import { BehaviorEngine } from './services/BehaviorEngine';
import { McpApi } from './api/mcpApi';
import * as mineflayer from 'mineflayer';

// 環境変数を読み込む
const MINECRAFT_SERVER_HOST = process.env.MINECRAFT_SERVER_HOST || 'localhost';
const MINECRAFT_SERVER_PORT = parseInt(process.env.MINECRAFT_SERVER_PORT || '25565', 10);
const BOT_USERNAME = process.env.BOT_USERNAME || 'MCPAgent';
const MCP_SERVER_PORT = parseInt(process.env.MCP_SERVER_PORT || '3000', 10);

// グローバルスコープでインスタンスを宣言（またはクラスでラップ）
let commandHandler: CommandHandler;
let mcpApi: McpApi;
let worldKnowledge: WorldKnowledge | null = null; // null許容に
let behaviorEngine: BehaviorEngine | null = null; // null許容に
let botManagerInstance: BotManager; // BotManagerインスタンスを保持

async function startMcpServer() {
    console.log('--- Starting Minecraft MCP Server ---');
    console.log(`Targeting Minecraft Server: ${MINECRAFT_SERVER_HOST}:${MINECRAFT_SERVER_PORT}`);
    console.log(`Bot Username: ${BOT_USERNAME}`);
    console.log(`MCP API will listen on port: ${MCP_SERVER_PORT}`);

    try {
        botManagerInstance = new BotManager(BOT_USERNAME, MINECRAFT_SERVER_HOST, MINECRAFT_SERVER_PORT);

        // CommandHandlerをまず初期化（BotManagerのみで動作する部分のために）
        commandHandler = new CommandHandler(botManagerInstance, null, null); 
        mcpApi = new McpApi(commandHandler, MCP_SERVER_PORT);
        mcpApi.start();
        console.log('MCP API server started.');


        // BotManagerの'spawn'イベントを購読し、ボットがスポーンしたらコアサービスを初期化
        // ただし、既に初期化されている場合はスキップする
        botManagerInstance.getBotInstanceEventEmitter().on('spawn', (bot: mineflayer.Bot) => {
            if (worldKnowledge && behaviorEngine) {
                console.log('Bot spawned again. Core services already initialized. Skipping re-initialization.');
                // 既存のインスタンスにボットを再接続する処理（あれば）
                worldKnowledge.setBotInstance(bot); // WorldKnowledgeにもボットインスタンスを更新するメソッドを追加
                behaviorEngine.setBotInstance(bot); // BehaviorEngineにもボットインスタンスを更新するメソッドを追加
                return;
            }

            console.log('Bot spawned. Initializing WorldKnowledge and BehaviorEngine...');

            worldKnowledge = new WorldKnowledge(bot);
            // BehaviorEngineのコンストラクタでBotManagerを受け取る
            behaviorEngine = new BehaviorEngine(bot, worldKnowledge, botManagerInstance); 
            
            // CommandHandlerにWorldKnowledgeとBehaviorEngineのインスタンスをセット
            commandHandler.setWorldKnowledge(worldKnowledge);
            commandHandler.setBehaviorEngine(behaviorEngine);

            console.log('WorldKnowledge and BehaviorEngine initialized and linked to CommandHandler.');
        });


        // ボットの接続を試行
        botManagerInstance.connect().catch(err => {
            console.error("Initial bot connection failed but server will continue to run and retry:", err.message);
        });

        console.log('MCP Server initialization complete. Bot connection initiated.');

    } catch (error) {
        console.error('Failed to start MCP Server:', error);
        process.exit(1); // サーバー起動失敗時はプロセスを終了
    }
}

// サーバー起動関数を実行
startMcpServer();
