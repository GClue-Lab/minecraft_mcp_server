// src/services/CommandHandler.ts (最終修正版)

import { McpCommand, Task } from '../types/mcp';
import { BotManager } from './BotManager';
import { WorldKnowledge } from './WorldKnowledge';
import { TaskManager } from './TaskManager'; // BehaviorEngineの代わりにTaskManagerをインポート

export class CommandHandler {
    private botManager: BotManager;
    private worldKnowledge: WorldKnowledge | null = null;
    private taskManager: TaskManager | null = null;

    // 依存関係を更新
    constructor(botManager: BotManager, worldKnowledge: WorldKnowledge | null, taskManager: TaskManager | null) {
        this.botManager = botManager;
        this.worldKnowledge = worldKnowledge;
        this.taskManager = taskManager;
    }

    public isReady(): boolean {
        return !!this.worldKnowledge && !!this.taskManager;
    }

    // 依存関係注入メソッドも更新
    public setDependencies(worldKnowledge: WorldKnowledge, taskManager: TaskManager): void {
        this.worldKnowledge = worldKnowledge;
        this.taskManager = taskManager;
    }

    public getWorldKnowledge(): WorldKnowledge | null { return this.worldKnowledge; }

    /**
     * main.ts や mcpApi.ts から古い形式のコマンドを受け取り、処理する
     * @param command McpCommand形式のコマンド
     * @returns 処理結果
     */
    public async handleCommand(command: McpCommand): Promise<any> {
        if (!this.isReady() || !this.taskManager || !this.worldKnowledge) {
            throw new Error("Bot is not fully ready or connected.");
        }
        
        // McpCommandをTaskManagerへの命令に変換
        switch (command.type) {
            case 'setMiningMode':
                const taskId = this.taskManager.addTask('mine', { 
                    blockName: command.blockName, 
                    quantity: command.quantity 
                });
                return `Mining task started with ID: ${taskId}`;

            case 'setFollowMode':
                if (command.mode === 'on') {
                    if (!command.targetPlayer) throw new Error("targetPlayer is required.");
                    if (!this.worldKnowledge.findPlayer(command.targetPlayer)) {
                        throw new Error(`Player '${command.targetPlayer}' not found.`);
                    }
                    const followTaskId = this.taskManager.addTask('follow', { 
                        targetPlayer: command.targetPlayer 
                    });
                    return `Follow task started with ID: ${followTaskId}`;
                } else {
                    this.taskManager.stopCurrentTask();
                    return "Stopped current task.";
                }

            case 'setCombatMode':
                if (command.mode === 'on') {
                     const combatTaskId = this.taskManager.addTask('combat', {}, 0); // 優先度0
                     return `Combat task started with ID: ${combatTaskId}`;
                } else {
                    this.taskManager.stopCurrentTask();
                    return "Stopped current task.";
                }

            case 'getStatus':
                const bot = this.botManager.getBot()!;
                return {
                    status: this.taskManager.getStatus(),
                    health: bot.health,
                    food: bot.food,
                    position: bot.entity.position
                };

            case 'stop':
                this.taskManager.stopCurrentTask();
                return "All current actions have been stopped.";
                
            default:
                throw new Error(`Unknown command type received: ${command.type}`);
        }
    }
}
