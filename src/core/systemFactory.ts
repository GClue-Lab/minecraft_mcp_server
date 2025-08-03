// src/core/systemFactory.ts (修正後)

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
    const commandHandler = new CommandHandler(botManager, null, null, null, null, chatReporter);

    botManager.getBotInstanceEventEmitter().on('spawn', (bot: mineflayer.Bot) => {
        if (!commandHandler.isReady()) {
            
            //const mcData = require('minecraft-data')(bot.version);
            //bot.registry = mcData;



            // ★ 修正: 古いbehaviorEngineの宣言を削除し、依存関係の順序を整理
            const worldKnowledge = new WorldKnowledge(bot);
            const modeManager = new ModeManager(chatReporter);
            const taskManager = new TaskManager(chatReporter);
            
            // ★ 修正: 正しい引数でbehaviorEngineを一度だけ生成する
            const behaviorEngine = new BehaviorEngine(bot, worldKnowledge, botManager, chatReporter, taskManager); 
            
            const statusManager = new StatusManager(bot, worldKnowledge, taskManager, modeManager, behaviorEngine);
            const planner = new Planner(behaviorEngine, taskManager, modeManager, worldKnowledge, statusManager, chatReporter);
            
            commandHandler.setDependencies(taskManager, modeManager, statusManager, behaviorEngine);
        } else {
            // TODO: 再接続時のインスタンス更新処理
        }
        // ★ spawnのたびに Movements をセット（再接続にも対応）
         const defaultMove = new Movements(bot);
         bot.pathfinder.setMovements(defaultMove);
    });

    return commandHandler;
}
