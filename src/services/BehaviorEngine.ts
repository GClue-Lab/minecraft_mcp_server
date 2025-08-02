// src/services/BehaviorEngine.ts (修正後)

import * as mineflayer from 'mineflayer';
import { EventEmitter } from 'events';
import { WorldKnowledge } from './WorldKnowledge';
import { FollowPlayerBehavior } from '../behaviors/followPlayer';
import { MineBlockBehavior } from '../behaviors/mineBlock';
import { CombatBehavior } from '../behaviors/combat';
import { DropItemsBehavior } from '../behaviors/dropItems';
import { BotManager } from './BotManager';
import { Task } from '../types/mcp';
import { ChatReporter } from './ChatReporter';
import { TaskManager } from './TaskManager';

export class BehaviorEngine extends EventEmitter {
    private bot: mineflayer.Bot;
    private worldKnowledge: WorldKnowledge;
    private botManager: BotManager;
    private taskManager: TaskManager;
    private activeBehaviorInstance: any | null = null;
    private activeTask: Task | null = null;
    private chatReporter: ChatReporter; // ★ 修正: プロパティを復元

    constructor(
        bot: mineflayer.Bot, 
        worldKnowledge: WorldKnowledge, 
        botManager: BotManager, 
        chatReporter: ChatReporter,
        taskManager: TaskManager
    ) {
        super();
        this.bot = bot;
        this.worldKnowledge = worldKnowledge;
        this.botManager = botManager;
        this.taskManager = taskManager;
        this.chatReporter = chatReporter; // ★ 修正: プロパティを復元
    }
    
    public setBotInstance(newBot: mineflayer.Bot): void {
        this.bot = newBot;
    }

    // ★ 修正: getActiveTaskメソッドを復元
    public getActiveTask(): Task | null {
        return this.activeTask;
    }

    public executeTask(task: Task): boolean {
        if (this.activeTask) return false;

        this.activeTask = task;
        let newBehaviorInstance: any | null = null;
        switch (task.type) {
            case 'mine':
                newBehaviorInstance = new MineBlockBehavior(this.bot, this.worldKnowledge, this.chatReporter, task);
                break;
            case 'follow':
                newBehaviorInstance = new FollowPlayerBehavior(this.bot, this.worldKnowledge, task.arguments);
                break;
            case 'combat':
                newBehaviorInstance = new CombatBehavior(this.bot, this.worldKnowledge, task.arguments);
                break;
            case 'dropItems':
                newBehaviorInstance = new DropItemsBehavior(this.bot, task.arguments);
                break;
            default:
                this.emit('taskFailed', this.activeTask, 'Unknown task type');
                this.activeTask = null;
                return false;
        }

        if (newBehaviorInstance) {
            const started = newBehaviorInstance.start();
            if (started) {
                this.activeBehaviorInstance = newBehaviorInstance;
                this.monitorBehaviorCompletion(newBehaviorInstance);
                return true;
            } else {
                this.emit('taskFailed', this.activeTask, 'Behavior failed to start');
                this.activeTask = null;
                return false;
            }
        }
        // ★ 修正: 関数が必ず値を返すようにする
        return false;
    }

    public stopCurrentBehavior(options: { reason: 'interrupt' | 'cancel' } = { reason: 'cancel' }): void {
        if (!this.activeTask || !this.activeBehaviorInstance) return;

        const stoppedTask = this.activeTask;
        
        if (options.reason === 'interrupt') {
            this.taskManager.setTaskStatus(stoppedTask.taskId, 'pending');
            this.chatReporter.reportError(`[DEBUG] Task ${stoppedTask.taskId} interrupted and set to pending.`);
        } else { // 'cancel' の場合
            this.taskManager.removeTask(stoppedTask.taskId);
        }

        this.activeBehaviorInstance.stop();
        this.activeBehaviorInstance = null;
        this.activeTask = null;
        this.emit('taskFinished', stoppedTask, `Stopped due to ${options.reason}`);
    }

    private monitorBehaviorCompletion(instance: any): void {
        const checkInterval = setInterval(() => {
            if (instance !== this.activeBehaviorInstance) {
                clearInterval(checkInterval);
                return;
            }
            if (!instance.isRunning()) {
                clearInterval(checkInterval);
                const finishedTask = this.activeTask;
                this.activeBehaviorInstance = null;
                this.activeTask = null;
                if (finishedTask) {
                    this.emit('taskFinished', finishedTask, 'Completed successfully');
                }
            }
        }, 500);
    }
}
