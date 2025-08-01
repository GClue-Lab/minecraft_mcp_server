// src/core/systemFactory.ts (デバッグ報告版)

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

export function setupBotSystem(botManager: BotManager): CommandHandler {
    
    const chatReporter = new ChatReporter(botManager);
    // ★★★★★★★★★★ ここを修正 ★★★★★★★★★★
    const commandHandler = new CommandHandler(botManager, null, null, null, null, chatReporter);

    botManager.getBotInstanceEventEmitter().on('spawn', (bot: mineflayer.Bot) => {
        if (!commandHandler.isReady()) {
            const worldKnowledge = new WorldKnowledge(bot);
            const behaviorEngine = new BehaviorEngine(bot, worldKnowledge, botManager, chatReporter);
            const modeManager = new ModeManager(chatReporter);
            // ★★★★★★★★★★ ここを修正 ★★★★★★★★★★
            const taskManager = new TaskManager(chatReporter);
            const statusManager = new StatusManager(bot, worldKnowledge, taskManager, modeManager, behaviorEngine);
            
            const planner = new Planner(behaviorEngine, taskManager, modeManager, worldKnowledge, statusManager, chatReporter);
            
            commandHandler.setDependencies(taskManager, modeManager, statusManager, behaviorEngine);
        } else {
            // TODO: 再接続時のインスタンス更新処理
        }
    });

    return commandHandler;
}
