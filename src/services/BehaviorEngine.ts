// src/services/BehaviorEngine.ts (中断・再開対応版)

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
import { TaskManager } from './TaskManager'; // ★インポートを追加

export class BehaviorEngine extends EventEmitter {
    private bot: mineflayer.Bot;
    private worldKnowledge: WorldKnowledge;
    private botManager: BotManager;
    private chatReporter: ChatReporter;
    private taskManager: TaskManager; // ★プロパティを追加
    private activeBehaviorInstance: any | null = null;
    private activeTask: Task | null = null;

    constructor(
        bot: mineflayer.Bot, 
        worldKnowledge: WorldKnowledge, 
        botManager: BotManager, 
        chatReporter: ChatReporter,
        taskManager: TaskManager // ★コンストラクタで受け取る
    ) {
        super();
        this.bot = bot;
        this.worldKnowledge = worldKnowledge;
        this.botManager = botManager;
        this.chatReporter = chatReporter;
        this.taskManager = taskManager; // ★保持する
    }
    
    public setBotInstance(newBot: mineflayer.Bot): void {
        this.bot = newBot;
    }

    public executeTask(task: Task): boolean {
        if (this.activeBehaviorInstance) return false;

        this.activeTask = task;
        let newBehaviorInstance: any | null = null;

        // ★コンストラクタに task.arguments を渡すように修正
        switch (task.type) {
            case 'mine':
                newBehaviorInstance = new MineBlockBehavior(this.bot, this.worldKnowledge, this.chatReporter, task.arguments);
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
        return false;
    }

    /**
     * 現在の行動を停止する。理由に応じてタスクの復帰処理を行う。
     * @param options 停止の理由。'interrupt'は再開を前提とした中断、'cancel'は完全な破棄。
     */
    public stopCurrentBehavior(options: { reason: 'interrupt' | 'cancel' } = { reason: 'cancel' }): void {
        this.chatReporter.reportError(`[DEBUG] BehaviorEngine: stopCurrentBehavior() called with reason: ${options.reason}`);
        if (!this.activeBehaviorInstance || !this.activeTask) return;

        const stoppedTask = this.activeTask;
        const behavior = this.activeBehaviorInstance;

        // 理由が「中断」であり、タスクを再開させたい場合
        if (options.reason === 'interrupt') {
            // 1. Behaviorから進捗を取得する
            if (typeof behavior.getProgress === 'function') {
                stoppedTask.arguments.progress = behavior.getProgress();
                this.chatReporter.reportError(`[DEBUG] BehaviorEngine: Saved task progress.`);
            }
            
            // 2. TaskManagerにタスクを戻す
            if (stoppedTask.queueType === 'mining') {
                this.taskManager.requeueMiningTask(stoppedTask);
            } else if (stoppedTask.queueType === 'general') {
                this.taskManager.requeueGeneralTask(stoppedTask);
            }
        }
        
        // 共通の停止処理
        behavior.stop();
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
                this.chatReporter.reportError("[DEBUG] BehaviorEngine: Detected that behavior is no longer running.");
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

    public getActiveTask(): Task | null {
        return this.activeTask;
    }
}
