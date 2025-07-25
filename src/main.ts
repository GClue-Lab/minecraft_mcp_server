// src/main.ts v1.2 (修正 - debug.enableコード削除)

import { BotManager } from './services/BotManager';
import { CommandHandler } from './services/CommandHandler';
import { WorldKnowledge } from './services/WorldKnowledge';
import { BehaviorEngine } from './services/BehaviorEngine';
import { McpApi } from './api/mcpApi';
import * as mineflayer from 'mineflayer';
// import { Console } from 'console'; // Consoleモジュールは不要なので削除

// 環境変数を読み込む
const MINECRAFT_SERVER_HOST = process.env.MINECRAFT_SERVER_HOST || 'localhost';
const MINECRAFT_SERVER_PORT = parseInt(process.env.MINECRAFT_SERVER_PORT || '25565', 10);
const BOT_USERNAME = process.env.BOT_USERNAME || 'MCP_CLI_Bot';
const MCP_SERVER_PORT = parseInt(process.env.MCP_SERVER_PORT || '3000', 10);

// --- ここを修正: debug.enable のコードを削除 ---
// 代わりに、サーバー起動時にコマンドラインで NODE_DEBUG=mineflayer-pathfinder を設定する
console.log('mineflayer-pathfinder debug logging will be controlled by NODE_DEBUG environment variable.');
// --- 修正終わり ---

let commandHandler: CommandHandler;
let mcpApi: McpApi;
let worldKnowledge: WorldKnowledge | null = null;
let behaviorEngine: BehaviorEngine | null = null;
let botManagerInstance: BotManager;

async function startMcpServer() {
    console.log('--- Starting Minecraft MCP Server ---');
    console.log(`Targeting Minecraft Server: ${MINECRAFT_SERVER_HOST}:${MINECRAFT_SERVER_PORT}`);
    console.log(`Bot Username: ${BOT_USERNAME}`);
    console.log(`MCP API will listen on port: ${MCP_SERVER_PORT}`);

    try {
        botManagerInstance = new BotManager(BOT_USERNAME, MINECRAFT_SERVER_HOST, MINECRAFT_SERVER_PORT);

        commandHandler = new CommandHandler(botManagerInstance, null, null); 
        mcpApi = new McpApi(commandHandler, MCP_SERVER_PORT);
        mcpApi.start();
        console.log('MCP API server started.');

        botManagerInstance.getBotInstanceEventEmitter().on('spawn', (bot: mineflayer.Bot) => {
            if (worldKnowledge && behaviorEngine) {
                console.log('Bot spawned again. Core services already initialized. Skipping re-initialization.');
                worldKnowledge.setBotInstance(bot);
                behaviorEngine.setBotInstance(bot);
                return;
            }

            console.log('Bot spawned. Initializing WorldKnowledge and BehaviorEngine...');

            worldKnowledge = new WorldKnowledge(bot);
            behaviorEngine = new BehaviorEngine(bot, worldKnowledge, botManagerInstance); 
            
            commandHandler.setWorldKnowledge(worldKnowledge);
            commandHandler.setBehaviorEngine(behaviorEngine);

            console.log('WorldKnowledge and BehaviorEngine initialized and linked to CommandHandler.');
        });

        botManagerInstance.connect().catch(err => {
            console.error("Initial bot connection failed but server will continue to run and retry:", err.message);
        });

        console.log('MCP Server initialization complete. Bot connection initiated.');

    } catch (error) {
        console.error('Failed to start MCP Server:', error);
        process.exit(1);
    }
}

startMcpServer();
