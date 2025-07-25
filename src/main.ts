// src/main.ts (修正版)

import { BotManager } from './services/BotManager';
import { CommandHandler } from './services/CommandHandler';
import { WorldKnowledge } from './services/WorldKnowledge';
import { BehaviorEngine } from './services/BehaviorEngine';
import { McpApi } from './api/mcpApi';
import * as mineflayer from 'mineflayer'; // Mineflayerの型をimport

// 環境変数を読み込む
const MINECRAFT_SERVER_HOST = process.env.MINECRAFT_SERVER_HOST || 'localhost';
const MINECRAFT_SERVER_PORT = parseInt(process.env.MINECRAFT_SERVER_PORT || '25565', 10);
const BOT_USERNAME = process.env.BOT_USERNAME || 'MCPAgent';
const MCP_SERVER_PORT = parseInt(process.env.MCP_SERVER_PORT || '3000', 10);

// グローバルスコープでインスタンスを宣言（またはクラスでラップ）
let commandHandler: CommandHandler;
let mcpApi: McpApi;
let worldKnowledge: WorldKnowledge;
let behaviorEngine: BehaviorEngine;


async function startMcpServer() {
    console.log('--- Starting Minecraft MCP Server ---');
    console.log(`Targeting Minecraft Server: ${MINECRAFT_SERVER_HOST}:${MINECRAFT_SERVER_PORT}`);
    console.log(`Bot Username: ${BOT_USERNAME}`);
    console.log(`MCP API will listen on port: ${MCP_SERVER_PORT}`);

    try {
        const botManager = new BotManager(BOT_USERNAME, MINECRAFT_SERVER_HOST, MINECRAFT_SERVER_PORT);

        // APIサーバーはボットの接続状態に関わらずすぐに起動
        // commandHandlerはbotManagerのみで初期化し、
        // WorldKnowledge/BehaviorEngineはbotがspawnしてから設定する
        // ※ ここでの CommandHandler は BotManager のみで機能する部分（例: botStatus）は扱えるが、
        //    bot.entity や pathfinder を使うコマンドは WorldKnowledge/BehaviorEngine が初期化されるまで機能しない
        commandHandler = new CommandHandler(botManager, null as any, null as any); // 初期はnullで型アサーション、後で設定
        mcpApi = new McpApi(commandHandler, MCP_SERVER_PORT);
        mcpApi.start();
        console.log('MCP API server started.');


        // BotManagerの'spawn'イベントを購読し、ボットがスポーンしてから残りのサービスを初期化
        botManager.getBotInstanceEventEmitter().on('spawn', (bot: mineflayer.Bot) => {
            console.log('Bot spawned. Initializing WorldKnowledge and BehaviorEngine...');

            // ボットインスタンスが利用可能になったらこれらのサービスを初期化
            worldKnowledge = new WorldKnowledge(bot);
            behaviorEngine = new BehaviorEngine(bot, worldKnowledge);

            // CommandHandlerにWorldKnowledgeとBehaviorEngineのインスタンスをセット（または再初期化）
            // コンストラクタを変更する代わりに、setterメソッドをCommandHandlerに追加する方がクリーン
            commandHandler.setWorldKnowledge(worldKnowledge);
            commandHandler.setBehaviorEngine(behaviorEngine);

            console.log('WorldKnowledge and BehaviorEngine initialized and linked to CommandHandler.');
        });


        // ボットの接続を試行
        botManager.connect().catch(err => {
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
