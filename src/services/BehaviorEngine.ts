// src/services/BehaviorEngine.ts (デバッグ報告版)

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

export class BehaviorEngine extends EventEmitter {
    private bot: mineflayer.Bot;
    private worldKnowledge: WorldKnowledge;
    private botManager: BotManager;
    private chatReporter: ChatReporter;
    private activeBehaviorInstance: any | null = null;
    private activeTask: Task | null = null;

    constructor(bot: mineflayer.Bot, worldKnowledge: WorldKnowledge, botManager: BotManager, chatReporter: ChatReporter) {
        super();
        this.bot = bot;
        this.worldKnowledge = worldKnowledge;
        this.botManager = botManager;
        this.chatReporter = chatReporter;
    }
    
    public setBotInstance(newBot: mineflayer.Bot): void {
        this.bot = newBot;
    }

    public executeTask(task: Task): boolean {
        if (this.activeBehaviorInstance) return false;

        this.activeTask = task;
        let newBehaviorInstance: any | null = null;

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

    public stopCurrentBehavior(): void {
        this.chatReporter.reportError("[DEBUG] BehaviorEngine: stopCurrentBehavior() called.");
        if (this.activeBehaviorInstance && this.activeTask) {
            const stoppedTask = this.activeTask;
            this.activeBehaviorInstance.stop();
            this.activeBehaviorInstance = null;
            this.activeTask = null;
            this.emit('taskFinished', stoppedTask, 'Cancelled by user');
        }
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
