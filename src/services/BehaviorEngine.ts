// src/services/BehaviorEngine.ts (タスク実行エンジン版)

import * as mineflayer from 'mineflayer';
import { EventEmitter } from 'events';
import { WorldKnowledge } from './WorldKnowledge';
import { FollowPlayerBehavior, FollowPlayerOptions } from '../behaviors/followPlayer';
import { MineBlockBehavior, MineBlockOptions } from '../behaviors/mineBlock';
import { CombatBehavior, CombatOptions } from '../behaviors/combat';
import { DropItemsBehavior, DropItemsOptions } from '../behaviors/dropItems';
import { BotManager } from './BotManager';
import { Task } from '../types/mcp';

interface BehaviorInstance {
    start(): boolean;
    stop(): void;
    isRunning(): boolean;
    getOptions(): any;
}

/**
 * TaskManagerから指示された単一のタスクを実行することに特化したクラス。
 * 実行結果はイベントとしてTaskManagerに通知する。
 */
export class BehaviorEngine extends EventEmitter {
    private bot: mineflayer.Bot;
    private worldKnowledge: WorldKnowledge;
    private botManager: BotManager;
    private activeBehaviorInstance: BehaviorInstance | null = null;
    private activeTask: Task | null = null;

    constructor(bot: mineflayer.Bot, worldKnowledge: WorldKnowledge, botManager: BotManager) {
        super();
        this.bot = bot;
        this.worldKnowledge = worldKnowledge;
        this.botManager = botManager;
        console.log('BehaviorEngine (Task-based) initialized.');
    }
    
    public setBotInstance(newBot: mineflayer.Bot): void {
        this.bot = newBot;
        console.log('BehaviorEngine: Bot instance updated.');
    }

    public executeTask(task: Task): boolean {
        if (this.activeBehaviorInstance) {
            console.warn('[BehaviorEngine] Another task is already running. Cannot execute new task.');
            return false;
        }

        this.activeTask = task;
        let newBehaviorInstance: BehaviorInstance | null = null;

        console.log(`[BehaviorEngine] Executing task: ${task.type} (ID: ${task.taskId})`);

        switch (task.type) {
            case 'mine':
                newBehaviorInstance = new MineBlockBehavior(this.bot, this.worldKnowledge, task.arguments as MineBlockOptions);
                break;
            case 'follow':
                newBehaviorInstance = new FollowPlayerBehavior(this.bot, this.worldKnowledge, task.arguments as FollowPlayerOptions);
                break;
            case 'combat':
                newBehaviorInstance = new CombatBehavior(this.bot, this.worldKnowledge, task.arguments as CombatOptions);
                break;
            case 'dropItems':
                newBehaviorInstance = new DropItemsBehavior(this.bot, task.arguments as DropItemsOptions);
                break;
            default:
                console.error(`[BehaviorEngine] Unknown task type: ${task.type}`);
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
                console.error(`[BehaviorEngine] Failed to start behavior for task: ${task.type}`);
                this.emit('taskFailed', this.activeTask, 'Behavior failed to start');
                this.activeTask = null;
                return false;
            }
        }
        return false;
    }

    public stopCurrentBehavior(): void {
        if (this.activeBehaviorInstance) {
            console.log(`[BehaviorEngine] Stopping current behavior for task: ${this.activeTask?.type}`);
            this.activeBehaviorInstance.stop();
        }
    }

    private monitorBehaviorCompletion(instance: BehaviorInstance): void {
        const checkInterval = setInterval(() => {
            if (!this.activeBehaviorInstance || instance !== this.activeBehaviorInstance) {
                clearInterval(checkInterval);
                return;
            }
            if (!instance.isRunning()) {
                clearInterval(checkInterval);
                console.log(`[BehaviorEngine] Behavior for task ${this.activeTask?.type} completed.`);
                this.emit('taskCompleted', this.activeTask, 'Completed successfully');
                this.activeBehaviorInstance = null;
                this.activeTask = null;
            }
        }, 500);
    }

    public getActiveTask(): Task | null {
        return this.activeTask;
    }
}
