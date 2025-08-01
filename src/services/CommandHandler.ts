// src/services/CommandHandler.ts (Planner対応版)

import { McpCommand } from '../types/mcp';
import { BotManager } from './BotManager';
import { TaskManager } from './TaskManager';
import { ModeManager } from './ModeManager';
import { StatusManager } from './StatusManager';
import { BehaviorEngine } from './BehaviorEngine'; // BehaviorEngineをインポート
import { Vec3 } from 'vec3';

export class CommandHandler {
    private botManager: BotManager;
    private taskManager: TaskManager | null = null;
    private modeManager: ModeManager | null = null;
    private statusManager: StatusManager | null = null;
    private behaviorEngine: BehaviorEngine | null = null; // BehaviorEngineへの参照を追加

    constructor(
        botManager: BotManager, 
        taskManager: TaskManager | null, 
        modeManager: ModeManager | null, 
        statusManager: StatusManager | null,
        behaviorEngine: BehaviorEngine | null // コンストラクタで受け取る
    ) {
        this.botManager = botManager;
        this.taskManager = taskManager;
        this.modeManager = modeManager;
        this.statusManager = statusManager;
        this.behaviorEngine = behaviorEngine; // 参照を保持
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
            case 'setMiningMode':
                const home = this.statusManager.getHome();
                const mineTaskId = this.taskManager.addTask('mine', { 
                    blockName: command.blockName, 
                    quantity: command.quantity 
                });
                if (home) this.taskManager.addTask('dropItems', { position: home });
                return `Mining task queued.`;

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
                report += `- Follow Mode: ${fullStatus.modes.followMode ? `ON (Target: ${fullStatus.modes.followTarget})` : 'OFF'}\n\n`;
                report += `[Task Status]\n`;
                if (fullStatus.currentTask) {
                    report += `- Active Task: ${fullStatus.currentTask.type} (ID: ${fullStatus.currentTask.taskId})\n`;
                } else {
                    report += `- Active Task: None (Idle)\n`;
                }
                report += `- Queued Tasks: ${taskStatus.taskQueue.length}\n`;
                taskStatus.taskQueue.forEach((t, i) => {
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
