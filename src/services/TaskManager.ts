// src/services/TaskManager.ts (高機能版)

import { Task } from '../types/mcp';
import { BehaviorEngine } from './BehaviorEngine';
import { ModeManager } from './ModeManager';
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
    private activeTask: Task | null = null;

    constructor(behaviorEngine: BehaviorEngine, modeManager: ModeManager) {
        this.behaviorEngine = behaviorEngine;
        this.modeManager = modeManager;
        console.log('TaskManager (Advanced) initialized.');

        // ★ここを修正: イベントリスナーの引数に型を追加
        this.behaviorEngine.on('taskCompleted', (task: Task | null, result: any) => this.onTaskFinished(task));
        this.behaviorEngine.on('taskFailed', (task: Task | null, reason: any) => this.onTaskFinished(task));
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
            this.taskQueue.unshift(this.activeTask);
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

    public getStatus() {
        return {
            activeTask: this.activeTask,
            taskQueue: this.taskQueue.map(t => ({ id: t.taskId, type: t.type, priority: t.priority})),
        };
    }
}
