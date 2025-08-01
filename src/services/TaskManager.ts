// src/services/TaskManager.ts (シンプル版・修正済)

import { Task } from '../types/mcp';
import { randomUUID } from 'crypto';

const TASK_PRIORITIES: { [key in Task['type']]: number } = {
    'combat': 0, 'mine': 10, 'dropItems': 12, 'goto': 8, 'follow': 20, 'patrol': 15,
};

export class TaskManager {
    private taskQueue: Task[] = [];

    constructor() {
        console.log('TaskManager (Simple) initialized.');
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
        
        this.taskQueue.push(newTask);
        this.taskQueue.sort((a, b) => a.priority - b.priority || a.createdAt - b.createdAt);
        return newTask.taskId;
    }

    public getNextTask(): Task | null {
        return this.taskQueue.length > 0 ? this.taskQueue.shift()! : null;
    }

    public peekNextTask(): Task | null {
        return this.taskQueue.length > 0 ? this.taskQueue[0] : null;
    }

    public getStatus() {
        // ★ここを修正: Planner/StatusManagerがactiveTaskを必要としないため、キューのみ返す
        return {
            taskQueue: this.taskQueue.map(t => ({ id: t.taskId, type: t.type, priority: t.priority })),
        };
    }
}
