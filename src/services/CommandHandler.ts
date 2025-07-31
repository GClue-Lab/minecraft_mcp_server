// src/services/CommandHandler.ts (状況報告強化版)

import { McpCommand } from '../types/mcp';
import { BotManager } from './BotManager';
import { WorldKnowledge } from './WorldKnowledge';
import { TaskManager } from './TaskManager';
import { ModeManager } from './ModeManager'; // ModeManagerをインポート

export class CommandHandler {
    private botManager: BotManager;
    private worldKnowledge: WorldKnowledge | null = null;
    private taskManager: TaskManager | null = null;
    private modeManager: ModeManager | null = null; // ModeManagerへの参照を持つ

    constructor(botManager: BotManager, worldKnowledge: WorldKnowledge | null, taskManager: TaskManager | null, modeManager: ModeManager | null) {
        this.botManager = botManager;
        this.worldKnowledge = worldKnowledge;
        this.taskManager = taskManager;
        this.modeManager = modeManager;
    }

    public isReady(): boolean {
        return !!this.worldKnowledge && !!this.taskManager && !!this.modeManager;
    }

    public setDependencies(worldKnowledge: WorldKnowledge, taskManager: TaskManager, modeManager: ModeManager): void {
        this.worldKnowledge = worldKnowledge;
        this.taskManager = taskManager;
        this.modeManager = modeManager;
    }

    public getWorldKnowledge(): WorldKnowledge | null { return this.worldKnowledge; }

    public async handleCommand(command: McpCommand): Promise<any> {
        if (!this.isReady() || !this.taskManager || !this.modeManager || !this.worldKnowledge) {
            throw new Error("Bot is not fully ready or connected.");
        }
        
        switch (command.type) {
            case 'setMiningMode':
                return this.taskManager.addTask('mine', { 
                    blockName: command.blockName, 
                    quantity: command.quantity 
                });

            case 'setFollowMode':
                this.modeManager.setFollowMode(command.mode === 'on', command.targetPlayer || null);
                return `Follow mode is now ${command.mode}.`;

            case 'setCombatMode':
                this.modeManager.setCombatMode(command.mode === 'on');
                // 警戒モードONなら、高優先度の戦闘タスクを追加
                if (command.mode === 'on') {
                    this.taskManager.addTask('combat', {}, 0);
                }
                return `Combat mode is now ${command.mode}.`;

            case 'getStatus':
                const bot = this.botManager.getBot()!;
                const modeStatus = this.modeManager.getStatus();
                const taskStatus = this.taskManager.getStatus();
                
                // 状況を整形して返す
                let report = `--- Bot Status Report ---\n`;
                report += `[Bot Info]\n`;
                report += `- Health: ${bot.health}\n- Food: ${bot.food}\n`;
                report += `- Position: ${bot.entity.position.toString()}\n\n`;
                
                report += `[Modes]\n`;
                report += `- Combat Mode: ${modeStatus.combatMode ? 'ON' : 'OFF'}\n`;
                report += `- Follow Mode: ${modeStatus.followMode ? `ON (Target: ${modeStatus.followTarget})` : 'OFF'}\n\n`;

                report += `[Tasks]\n`;
                if (taskStatus.activeTask) {
                    report += `- Active Task: ${taskStatus.activeTask.type} (ID: ${taskStatus.activeTask.taskId})\n`;
                } else {
                    report += `- Active Task: None (Idle or Default Behavior)\n`;
                }
                report += `- Queued Tasks: ${taskStatus.taskQueue.length}\n`;
                taskStatus.taskQueue.forEach((t, i) => {
                    report += `  ${i+1}. ${t.type} (Priority: ${t.priority})\n`;
                });
                
                return report;

            case 'stop':
                this.taskManager.stopCurrentTask();
                return "Stopped current task.";
                
            default:
                throw new Error(`Unknown command type received: ${command.type}`);
        }
    }
}
