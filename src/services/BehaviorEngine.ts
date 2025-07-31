// src/services/BehaviorEngine.ts (タスク実行エンジン版)

import * as mineflayer from 'mineflayer';
import { EventEmitter } from 'events'; // EventEmitterをインポート
import { WorldKnowledge } from './WorldKnowledge';
import { FollowPlayerBehavior, FollowPlayerOptions } from '../behaviors/followPlayer';
import { MineBlockBehavior, MineBlockOptions } from '../behaviors/mineBlock';
import { CombatBehavior, CombatOptions } from '../behaviors/combat';
import { BotManager } from './BotManager';
import { Task } from '../types/mcp'; // Task型をインポート

// Behaviorの型定義を更新
type BehaviorName = Task['type'] | 'idle';

interface BehaviorInstance {
    start(): boolean;
    stop(): void;
    isRunning(): boolean;
    getOptions(): any;
}

// EventEmitterを継承して、イベントを通知できるようにする
export class BehaviorEngine extends EventEmitter {
    private bot: mineflayer.Bot;
    private worldKnowledge: WorldKnowledge;
    private botManager: BotManager;
    private activeBehaviorInstance: BehaviorInstance | null = null;
    private activeTask: Task | null = null;

    constructor(bot: mineflayer.Bot, worldKnowledge: WorldKnowledge, botManager: BotManager) {
        super(); // 親クラスのコンストラクタを呼び出す
        this.bot = bot;
        this.worldKnowledge = worldKnowledge;
        this.botManager = botManager;
        console.log('BehaviorEngine (Task-based) initialized.');
    }
    
    public setBotInstance(newBot: mineflayer.Bot): void {
        this.bot = newBot;
        console.log('BehaviorEngine: Bot instance updated.');
    }

    /**
     * TaskManagerから渡されたタスクを実行する
     * @param task 実行するタスクオブジェクト
     * @returns タスクの開始に成功したか
     */
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
            // TODO: 'goto', 'dropItems', 'patrol' などのBehaviorを後で追加
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

    /**
     * 現在実行中の行動を強制的に停止させる
     */
    public stopCurrentBehavior(): void {
        if (this.activeBehaviorInstance) {
            console.log(`[BehaviorEngine] Stopping current behavior for task: ${this.activeTask?.type}`);
            this.activeBehaviorInstance.stop();
            // monitorBehaviorCompletionが完了を検知して後処理をするので、ここではstop()を呼ぶだけ
        }
    }

    /**
     * 現在のBehaviorが完了するのを監視する
     * @param instance 監視対象のBehaviorインスタンス
     */
    private monitorBehaviorCompletion(instance: BehaviorInstance): void {
        const checkInterval = setInterval(() => {
            // 監視中に別のタスクが割り込んだ（または停止された）場合は、監視を終了
            if (!this.activeBehaviorInstance || instance !== this.activeBehaviorInstance) {
                clearInterval(checkInterval);
                return;
            }

            // Behaviorが終了したら、TaskManagerに通知
            if (!instance.isRunning()) {
                clearInterval(checkInterval);
                console.log(`[BehaviorEngine] Behavior for task ${this.activeTask?.type} completed.`);
                // TODO: 成功・失敗の判定をBehaviorから取得できるようにする
                this.emit('taskCompleted', this.activeTask, 'Completed successfully');
                this.activeBehaviorInstance = null;
                this.activeTask = null;
            }
        }, 500);
    }

    /**
     * 現在実行中のタスクを取得する
     * @returns 実行中のタスクオブジェクト、なければnull
     */
    public getActiveTask(): Task | null {
        return this.activeTask;
    }
}
