// src/services/CommandHandler.ts (修正後)

import { McpCommand } from '../types/mcp';
import { BotManager } from './BotManager';
import { TaskManager } from './TaskManager';
import { ModeManager } from './ModeManager';
import { StatusManager } from './StatusManager';
import { BehaviorEngine } from './BehaviorEngine';
import { Vec3 } from 'vec3';

export class CommandHandler {
    private botManager: BotManager;
    private taskManager: TaskManager | null = null;
    private modeManager: ModeManager | null = null;
    private statusManager: StatusManager | null = null;
    private behaviorEngine: BehaviorEngine | null = null;

    constructor(
        botManager: BotManager, 
        taskManager: TaskManager | null, 
        modeManager: ModeManager | null, 
        statusManager: StatusManager | null,
        behaviorEngine: BehaviorEngine | null
    ) {
        this.botManager = botManager;
        this.taskManager = taskManager;
        this.modeManager = modeManager;
        this.statusManager = statusManager;
        this.behaviorEngine = behaviorEngine;
    }

    public isReady(): boolean {
        return !!this.taskManager && !!this.modeManager && !!this.statusManager && !!this.behaviorEngine;
    }

    public setDependencies(
        taskManager: TaskManager, 
        modeManager: ModeManager, 
        statusManager: StatusManager,
        behaviorEngine: BehaviorEngine
    ): void {
        this.taskManager = taskManager;
        this.modeManager = modeManager;
        this.statusManager = statusManager;
        this.behaviorEngine = behaviorEngine;
    }

    public async handleCommand(command: McpCommand): Promise<any> {
        if (!this.isReady() || !this.taskManager || !this.modeManager || !this.statusManager || !this.behaviorEngine) {
            throw new Error("Bot is not fully ready or connected.");
        }
        
        switch (command.type) {
            // ★ここから修正: setMiningMode のロジックを全面的に書き換え
            case 'setMiningMode':
                if (command.mode === 'on') {
                    if (!command.blockName || !command.quantity) {
                        throw new Error("blockName and quantity are required to turn mining mode on.");
                    }
                    this.modeManager.setMiningMode(true);
                    this.taskManager.addMiningTask('mine', { 
                        blockName: command.blockName, 
                        quantity: command.quantity 
                    });
                    
                    const home = this.statusManager.getHome();
                    if (home) {
                        // 採掘後のアイテムドロップタスクは一般キューに追加
                        this.taskManager.addGeneralTask('dropItems', { position: home });
                    }
                    return `Mining mode ON. Task queued to mine ${command.quantity} of ${command.blockName}.`;
                
                } else if (command.mode === 'off') {
                    this.modeManager.setMiningMode(false);
                    this.taskManager.clearMiningTasks(); 
                    
                    const currentTask = this.behaviorEngine.getActiveTask();
                    if (currentTask && currentTask.type === 'mine') {
                        this.behaviorEngine.stopCurrentBehavior();
                    }
                    return `Mining mode OFF. All mining tasks have been cleared.`;
                } else {
                    throw new Error("Mode ('on' or 'off') is required for setMiningMode.");
                }

            case 'setFollowMode':
                this.modeManager.setFollowMode(command.mode === 'on', command.targetPlayer || null);
                return `Follow mode is now ${command.mode}.`;

            case 'setCombatMode':
                this.modeManager.setCombatMode(command.mode === 'on');
                return `Combat mode is now ${command.mode}.`;

            case 'setHome':
                if (!command.position) throw new Error("Position is required.");
                this.statusManager.setHome(new Vec3(command.position.x, command.position.y, command.position.z));
                return `Home position set.`;

            case 'getStatus':
                const fullStatus = this.statusManager.getFullStatus();
                const taskStatus = this.taskManager.getStatus();

                let report = `--- Bot Status Report ---\n`;
                report += `[Bot Info]\n- Health: ${fullStatus.health}, Food: ${fullStatus.hunger}\n- Position: ${fullStatus.position.toString()}\n`;
                report += `- Home: ${fullStatus.homePosition ? fullStatus.homePosition.toString() : 'Not set'}\n\n`;
                report += `[Mode Settings]\n`;
                report += `- Combat Mode: ${fullStatus.modes.combatMode ? 'ON' : 'OFF'}\n`;
                report += `- Follow Mode: ${fullStatus.modes.followMode ? `ON (Target: ${fullStatus.modes.followTarget})` : 'OFF'}\n`;
                // ★ここを修正: miningModeの状態をレポートに追加
                report += `- Mining Mode: ${fullStatus.modes.miningMode ? 'ON' : 'OFF'}\n\n`;
                report += `[Task Status]\n`;
                if (fullStatus.currentTask) {
                    report += `- Active Task: ${fullStatus.currentTask.type} (ID: ${fullStatus.currentTask.taskId})\n`;
                } else {
                    report += `- Active Task: None (Idle)\n`;
                }
                // ★ここを修正: 複数のキューの内容をレポート
                report += `- Queued Mining Tasks: ${taskStatus.miningQueue.length}\n`;
                taskStatus.miningQueue.forEach((t, i) => {
                    report += `  ${i+1}. ${t.type} (Priority: ${t.priority})\n`;
                });
                report += `- Queued General Tasks: ${taskStatus.generalQueue.length}\n`;
                taskStatus.generalQueue.forEach((t, i) => {
                    report += `  ${i+1}. ${t.type} (Priority: ${t.priority})\n`;
                });
                return report;

            case 'stop':
                this.behaviorEngine.stopCurrentBehavior();
                return "Stopped current task.";
                
            default:
                throw new Error(`Unknown command type received: ${command.type}`);
        }
    }
}
