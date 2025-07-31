// src/services/TaskManager.ts (リスポーン対応版)

import { Task } from '../types/mcp';
import { BehaviorEngine } from './BehaviorEngine';
import { ModeManager } from './ModeManager';
import { BotManager } from './BotManager';
import { randomUUID } from 'crypto';

const TASK_PRIORITIES: { [key in Task['type']]: number } = {
    'combat': 0,
    'mine': 5,
    'goto': 8,
    'follow': 10,
    'dropItems': 12,
    'patrol': 15,
};

export class TaskManager {
    private taskQueue: Task[] = [];
    private behaviorEngine: BehaviorEngine;
    private modeManager: ModeManager;
    private botManager: BotManager;
    private activeTask: Task | null = null;

    constructor(behaviorEngine: BehaviorEngine, modeManager: ModeManager, botManager: BotManager) {
        this.behaviorEngine = behaviorEngine;
        this.modeManager = modeManager;
        this.botManager = botManager;
        console.log('TaskManager (Respawn-Aware) initialized.');

        this.behaviorEngine.on('taskCompleted', (task: Task | null, result: any) => this.onTaskFinished(task));
        this.behaviorEngine.on('taskFailed', (task: Task | null, reason: any) => this.onTaskFinished(task));

        const eventEmitter = this.botManager.getBotInstanceEventEmitter();
        eventEmitter.on('death', () => this.handleBotDeath());
        eventEmitter.on('respawn', () => this.handleBotRespawn());
    }
    
    private handleBotDeath(): void {
        console.warn('[TaskManager] Bot has died. Clearing all tasks and states.');
        this.behaviorEngine.stopCurrentBehavior();
        this.activeTask = null;
        this.taskQueue = [];
    }

    private handleBotRespawn(): void {
        console.log('[TaskManager] Bot has respawned. Re-evaluating behavior.');
        this.tick();
    }

    public addTask(type: Task['type'], args: any, priority?: number): string {
        const newTask: Task = {
            taskId: randomUUID(),
            type: type,
            arguments: args,
            status: 'pending',
            priority: priority ?? TASK_PRIORITIES[type] ?? 99,
            createdAt: Date.now(),
        };
        
        console.log(`[TaskManager] New task received: ${type} (Priority: ${newTask.priority})`);
        
        if (this.activeTask && newTask.priority < this.activeTask.priority) {
            console.log(`[TaskManager] INTERRUPT: New task has higher priority. Stopping current task.`);
            if (this.activeTask.taskId.startsWith('default-')) {
                // デフォルトタスクはキューに戻さない
            } else {
                this.taskQueue.unshift(this.activeTask);
            }
            this.behaviorEngine.stopCurrentBehavior();
        }
        
        this.taskQueue.push(newTask);
        this.taskQueue.sort((a, b) => a.priority - b.priority || a.createdAt - b.createdAt);
        
        this.tick();
        return newTask.taskId;
    }
    
    private onTaskFinished(task: Task | null) {
        console.log(`[TaskManager] Task finished: ${task?.taskId}`);
        this.activeTask = null;
        this.tick();
    }

    private tick(): void {
        if (this.activeTask) return;

        if (this.taskQueue.length > 0) {
            this.activeTask = this.taskQueue.shift()!;
            this.activeTask.status = 'running';
            console.log(`[TaskManager] Executing next task from queue: ${this.activeTask.type}`);
            this.behaviorEngine.executeTask(this.activeTask);
            return;
        }
        
        this.startDefaultBehavior();
    }
    
    public startDefaultBehavior(): void {
        if (this.activeTask) return;

        if (this.modeManager.isFollowMode() && this.modeManager.getFollowTarget()) {
            const followTask: Task = {
                taskId: 'default-follow',
                type: 'follow',
                arguments: { targetPlayer: this.modeManager.getFollowTarget() },
                status: 'running',
                priority: TASK_PRIORITIES.follow,
                createdAt: Date.now()
            };
            this.activeTask = followTask;
            console.log(`[TaskManager] Queue is empty. Starting default behavior: Follow`);
            this.behaviorEngine.executeTask(this.activeTask);
        }
    }
    
    public stopCurrentTask(): void {
        if (this.activeTask) {
            this.behaviorEngine.stopCurrentBehavior();
        }
    }

    public stopCurrentTaskIfItIs(type: Task['type']): void {
        if (this.activeTask && this.activeTask.type === type) {
            this.stopCurrentTask();
        }
    }

    public getStatus() {
        return {
            activeTask: this.activeTask,
            taskQueue: this.taskQueue.map(t => ({ id: t.taskId, type: t.type, priority: t.priority})),
        };
    }
}
