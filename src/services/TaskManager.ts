// src/services/TaskManager.ts (連携機能付き)

import { Task } from '../types/mcp';
import { BehaviorEngine } from './BehaviorEngine';
import { randomUUID } from 'crypto';

export class TaskManager {
    private taskQueue: Task[] = [];
    private behaviorEngine: BehaviorEngine;
    private isEngineBusy: boolean = false;

    constructor(behaviorEngine: BehaviorEngine) {
        this.behaviorEngine = behaviorEngine;
        console.log('TaskManager initialized.');

        // BehaviorEngineからのイベントをリッスンする
        this.behaviorEngine.on('taskCompleted', (task, result) => {
            console.log(`[TaskManager] Received taskCompleted for ID: ${task.taskId}`);
            this.isEngineBusy = false;
            this.tick(); // 次のタスクへ
        });

        this.behaviorEngine.on('taskFailed', (task, reason) => {
            console.error(`[TaskManager] Received taskFailed for ID: ${task.taskId}. Reason: ${reason}`);
            this.isEngineBusy = false;
            this.tick(); // 次のタスクへ
        });
    }

    public addTask(type: Task['type'], args: any, priority: number = 10): string {
        const newTask: Task = {
            taskId: randomUUID(),
            type: type,
            arguments: args,
            status: 'pending',
            priority: priority,
            createdAt: Date.now(),
        };

        this.taskQueue.push(newTask);
        this.taskQueue.sort((a, b) => a.priority - b.priority || a.createdAt - b.createdAt);
        
        console.log(`[TaskManager] New task added to queue: ${type} (ID: ${newTask.taskId})`);
        this.tick();
        return newTask.taskId;
    }
    
    public stopCurrentTask(): void {
        this.behaviorEngine.stopCurrentBehavior();
    }

    private tick(): void {
        if (this.isEngineBusy || this.taskQueue.length === 0) {
            return;
        }

        this.isEngineBusy = true;
        const nextTask = this.taskQueue.shift()!;
        nextTask.status = 'running';
        
        console.log(`[TaskManager] Sending task to BehaviorEngine: ${nextTask.type} (ID: ${nextTask.taskId})`);
        const success = this.behaviorEngine.executeTask(nextTask);
        if (!success) {
            // もしBehaviorEngineがタスクの開始自体に失敗したら、すぐに次のtickを試みる
            this.isEngineBusy = false;
            this.tick();
        }
    }

    public getStatus() {
        return {
            isEngineBusy: this.isEngineBusy,
            activeTask: this.behaviorEngine.getActiveTask(),
            queue: this.taskQueue,
        };
    }
}
