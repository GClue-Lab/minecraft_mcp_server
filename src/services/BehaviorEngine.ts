// src/services/BehaviorEngine.ts (中断処理改善版)

import * as mineflayer from 'mineflayer';
import { EventEmitter } from 'events';
import { WorldKnowledge } from './WorldKnowledge';
import { FollowPlayerBehavior } from '../behaviors/followPlayer';
import { MineBlockBehavior } from '../behaviors/mineBlock';
import { CombatBehavior } from '../behaviors/combat';
import { DropItemsBehavior } from '../behaviors/dropItems';
import { BotManager } from './BotManager';
import { Task } from '../types/mcp';
import { ChatReporter } from './ChatReporter'; // ★インポートを追加

// (BehaviorInstanceのインターフェース定義は変更なし)

export class BehaviorEngine extends EventEmitter {
    private bot: mineflayer.Bot;
    private worldKnowledge: WorldKnowledge;
    private botManager: BotManager;
    private activeBehaviorInstance: any | null = null;
    private activeTask: Task | null = null;
    private chatReporter: ChatReporter; 

    constructor(bot: mineflayer.Bot, worldKnowledge: WorldKnowledge, botManager: BotManager, chatReporter: ChatReporter) {
        super();
        this.bot = bot;
        this.worldKnowledge = worldKnowledge;
        this.botManager = botManager;
        this.chatReporter = chatReporter; // ★保持する
    }
    
    public setBotInstance(newBot: mineflayer.Bot): void {
        this.bot = newBot;
    }

    public executeTask(task: Task): boolean {
        if (this.activeBehaviorInstance) return false;

        this.activeTask = task;
        let newBehaviorInstance: any | null = null;

        // ★各Behaviorのインスタンス化時に chatReporter を渡す
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
     * ★ここから修正: 中断時に即座にイベントを発行する
     */
    public stopCurrentBehavior(): void {
        if (this.activeBehaviorInstance) {
            const stoppedTask = this.activeTask;
            this.activeBehaviorInstance.stop();
            this.activeBehaviorInstance = null;
            this.activeTask = null;
            // 即座にイベントを発行してTaskManagerに通知
            this.emit('taskFinished', stoppedTask, 'Cancelled by user');
        }
    }

    /**
     * ★ここを修正: 監視ロジックを単純化
     */
    private monitorBehaviorCompletion(instance: any): void {
        const checkInterval = setInterval(() => {
            // 外部から中断された場合、インスタンスがnullになっているので監視を終了
            if (instance !== this.activeBehaviorInstance) {
                clearInterval(checkInterval);
                return;
            }

            // 正常に完了した場合
            if (!instance.isRunning()) {
                clearInterval(checkInterval);
                this.emit('taskFinished', this.activeTask, 'Completed successfully');
                this.activeBehaviorInstance = null;
                this.activeTask = null;
            }
        }, 500);
    }

    public getActiveTask(): Task | null {
        return this.activeTask;
    }
}
