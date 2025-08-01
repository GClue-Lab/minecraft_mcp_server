// src/services/CommandHandler.ts (修正版)

import { McpCommand } from '../types/mcp';
import { BotManager } from './BotManager';
import { WorldKnowledge } from './WorldKnowledge';
import { TaskManager } from './TaskManager';
import { ModeManager } from './ModeManager';
import { StatusManager } from './StatusManager';
import { Vec3 } from 'vec3';

export class CommandHandler {
    private botManager: BotManager;
    private worldKnowledge: WorldKnowledge | null = null;
    private taskManager: TaskManager | null = null;
    private modeManager: ModeManager | null = null;
    private statusManager: StatusManager | null = null;

    constructor(
        botManager: BotManager, 
        worldKnowledge: WorldKnowledge | null, 
        taskManager: TaskManager | null, 
        modeManager: ModeManager | null, 
        statusManager: StatusManager | null
    ) {
        this.botManager = botManager;
        this.worldKnowledge = worldKnowledge;
        this.taskManager = taskManager;
        this.modeManager = modeManager;
        this.statusManager = statusManager;
    }

    public isReady(): boolean {
        return !!this.worldKnowledge && !!this.taskManager && !!this.modeManager && !!this.statusManager;
    }

    public setDependencies(
        worldKnowledge: WorldKnowledge, 
        taskManager: TaskManager, 
        modeManager: ModeManager, 
        statusManager: StatusManager
    ): void {
        this.worldKnowledge = worldKnowledge;
        this.taskManager = taskManager;
        this.modeManager = modeManager;
        this.statusManager = statusManager;
    }

    public getWorldKnowledge(): WorldKnowledge | null { return this.worldKnowledge; }

    public async handleCommand(command: McpCommand): Promise<any> {
        if (!this.isReady() || !this.taskManager || !this.modeManager || !this.statusManager) {
            throw new Error("Bot is not fully ready or connected.");
        }
        
        switch (command.type) {
            case 'setMiningMode':
                const home = this.statusManager.getHome();
                const mineTaskId = this.taskManager.addTask('mine', { 
                    blockName: command.blockName, 
                    quantity: command.quantity 
                });
                if (home) {
                    this.taskManager.addTask('dropItems', { position: home });
                    return `Mining task (ID: ${mineTaskId}) and Drop task have been queued.`;
                }
                return `Mining task started with ID: ${mineTaskId}`;

            case 'setFollowMode':
                this.modeManager.setFollowMode(command.mode === 'on', command.targetPlayer || null);
                if (command.mode === 'off') {
                    this.taskManager.stopCurrentTaskIfItIs('follow');
                }
                return `Follow mode is now ${command.mode}.`;

            case 'setCombatMode':
                this.modeManager.setCombatMode(command.mode === 'on');
                if (command.mode === 'off') {
                    this.taskManager.stopCurrentTaskIfItIs('combat');
                }
                return `Combat mode is now ${command.mode}.`;

            case 'setHome':
                if (!command.position) throw new Error("Position is required for setHome.");
                this.statusManager.setHome(new Vec3(command.position.x, command.position.y, command.position.z));
                return `Home position has been set to ${command.position.x}, ${command.position.y}, ${command.position.z}`;

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
                if (taskStatus.activeTask) {
                    report += `- Active Task: ${taskStatus.activeTask.type} (ID: ${taskStatus.activeTask.taskId})\n`;
                } else {
                    report += `- Active Task: None (Idle or waiting for default behavior)\n`;
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
