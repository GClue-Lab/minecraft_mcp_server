// src/services/CommandHandler.ts (再設計版)

import { McpCommand } from '../types/mcp';
import { BotManager } from './BotManager';
import { WorldKnowledge } from './WorldKnowledge';
import { TaskManager } from './TaskManager';
import { ModeManager } from './ModeManager';
import { StatusManager } from './StatusManager';
import { Vec3 } from 'vec3';

/**
 * main.tsからコマンドを受け取り、各Managerに処理を振り分ける司令塔。
 * 古いコマンド体系と新しいアーキテクチャの間の「翻訳者」として機能する。
 */
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
        if (!this.isReady() || !this.taskManager || !this.modeManager || !this.statusManager || !this.worldKnowledge) {
            throw new Error("Bot is not fully ready or connected.");
        }
        
        switch (command.type) {
            // 「採掘モード」ではなく「採掘タスクの追加」として処理
            case 'setMiningMode':
                const home = this.statusManager.getHome();
                const mineTaskId = this.taskManager.addTask('mine', { 
                    blockName: command.blockName, 
                    quantity: command.quantity 
                });
                // 拠点設定があれば、自動でアイテム保管タスクも追加
                if (home) {
                    this.taskManager.addTask('dropItems', { position: home });
                    return `Mining task (ID: ${mineTaskId}) and Drop task have been queued.`;
                }
                return `Mining task started with ID: ${mineTaskId}`;

            // ★ここを修正: モード設定とタスク実行を連動させる
            case 'setFollowMode':
                this.modeManager.setFollowMode(command.mode === 'on', command.targetPlayer || null);
                // ONにする場合、TaskManagerにデフォルト行動を再評価させる
                if (command.mode === 'on') {
                    this.taskManager.startDefaultBehavior();
                } else {
                    // OFFにする場合、現在のタスクが追従なら停止させる
                    this.taskManager.stopCurrentTaskIfItIs('follow');
                }
                return `Follow mode is now ${command.mode}.`;

            // ★ここを修正: モード設定とタスク実行を連動させる
            case 'setCombatMode':
                this.modeManager.setCombatMode(command.mode === 'on');
                if (command.mode === 'on') {
                    // 警戒モードONなら、高優先度の戦闘タスクを追加して即時索敵を開始
                    this.taskManager.addTask('combat', {}, 0);
                } else {
                    // OFFにする場合、現在のタスクが戦闘なら停止させる
                    this.taskManager.stopCurrentTaskIfItIs('combat');
                }
                return `Combat mode is now ${command.mode}.`;

            case 'setHome':
                if (!command.position) throw new Error("Position is required for setHome.");
                this.statusManager.setHome(new Vec3(command.position.x, command.position.y, command.position.z));
                return `Home position has been set to ${command.position.x}, ${command.position.y}, ${command.position.z}`;

            // ★ここを修正: より詳細で分かりやすいレポートを返す
            case 'getStatus':
                const status = this.statusManager.getFullStatus();
                const taskStatus = this.taskManager.getStatus();
                const modeStatus = this.modeManager.getStatus();

                let report = `--- Bot Status Report ---\n`;
                report += `[Bot Info]\n- Health: ${status.health}, Food: ${status.hunger}\n- Position: ${status.position.toString()}\n`;
                report += `- Home: ${status.homePosition ? status.homePosition.toString() : 'Not set'}\n\n`;
                
                report += `[Mode Settings]\n`;
                report += `- Combat Mode: ${modeStatus.combatMode ? 'ON' : 'OFF'}\n`;
                report += `- Follow Mode: ${modeStatus.followMode ? `ON (Target: ${modeStatus.followTarget})` : 'OFF'}\n\n`;

                report += `[Task Status]\n`;
                if (taskStatus.activeTask) {
                    report += `- Active Task: ${taskStatus.activeTask.type} (ID: ${taskStatus.activeTask.taskId})\n`;
                } else {
                    report += `- Active Task: None (Idle)\n`;
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
