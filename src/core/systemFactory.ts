// src/core/systemFactory.ts (新規作成)

import { BotManager } from '../services/BotManager';
import { CommandHandler } from '../services/CommandHandler';
import { WorldKnowledge } from '../services/WorldKnowledge';
import { BehaviorEngine } from '../services/BehaviorEngine';
import { TaskManager } from '../services/TaskManager';
import { ModeManager } from '../services/ModeManager';
import { StatusManager } from '../services/StatusManager';
import { ChatReporter } from '../services/ChatReporter';
import { Planner } from '../services/Planner';
import * as mineflayer from 'mineflayer';

/**
 * ボットのシステム全体を構築し、依存関係を解決する「組立工場」。
 * @param botManager サーバー接続を管理するBotManager
 * @returns 完全に初期化されたCommandHandlerインスタンス
 */
export function setupBotSystem(botManager: BotManager): CommandHandler {
    
    const chatReporter = new ChatReporter(botManager);
    // CommandHandlerは、中身が空の状態で先にインスタンス化しておく
    const commandHandler = new CommandHandler(botManager, null, null, null, null);

    // ボットの接続が完了したら、すべての依存関係を解決して注入する
    botManager.getBotInstanceEventEmitter().on('spawn', (bot: mineflayer.Bot) => {
        if (!commandHandler.isReady()) {
            const worldKnowledge = new WorldKnowledge(bot);
            const behaviorEngine = new BehaviorEngine(bot, worldKnowledge, botManager, chatReporter);
            const modeManager = new ModeManager(chatReporter);
            const taskManager = new TaskManager(); // Planner体制では引数なし
            const statusManager = new StatusManager(bot, worldKnowledge, taskManager, modeManager, behaviorEngine);
            
            // PlannerをすべてのManagerと連携させて生成
            const planner = new Planner(behaviorEngine, taskManager, modeManager, worldKnowledge, statusManager);
            
            // CommandHandlerに必要なManagerを注入して完成させる
            commandHandler.setDependencies(taskManager, modeManager, statusManager, behaviorEngine);
        } else {
            // TODO: 再接続時のインスタンス更新処理
        }
    });

    return commandHandler;
}
