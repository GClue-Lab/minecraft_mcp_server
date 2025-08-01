// src/services/TaskManager.ts (修正後・マルチキュー版)

import { Task } from '../types/mcp';
import { randomUUID } from 'crypto';

const TASK_PRIORITIES: { [key in Task['type']]: number } = {
    'combat': 0, 'mine': 10, 'dropItems': 12, 'goto': 8, 'follow': 20, 'patrol': 15,
};

/**
 * 優先度付きタスクキューを管理するシンプルなクラス
 */
class TaskQueue {
    private tasks: Task[] = [];

    public add(task: Task): void {
        this.tasks.push(task);
        this.tasks.sort((a, b) => a.priority - b.priority || a.createdAt - b.createdAt);
    }

    public peek(): Task | null {
        return this.tasks.length > 0 ? this.tasks[0] : null;
    }

    public getNext(): Task | null {
        return this.tasks.length > 0 ? this.tasks.shift()! : null;
    }

    public clear(): void {
        this.tasks = [];
    }

    public getTasks(): readonly Task[] {
        return this.tasks;
    }

    public isEmpty(): boolean {
        return this.tasks.length === 0;
    }
}

/**
 * 目的別のタスクキューを管理するマネージャークラス
 */
export class TaskManager {
    private miningQueue: TaskQueue = new TaskQueue();
    private generalQueue: TaskQueue = new TaskQueue();

    constructor() {
        console.log('TaskManager (Multi-Queue) initialized.');
    }

    private createTask(type: Task['type'], args: any, priority?: number): Task {
        return {
            taskId: randomUUID(),
            type: type,
            arguments: args,
            status: 'pending',
            priority: priority ?? TASK_PRIORITIES[type] ?? 99,
            createdAt: Date.now(),
        };
    }

    // --- Mining Task Methods ---
    public addMiningTask(type: Task['type'], args: any, priority?: number): string {
        const newTask = this.createTask(type, args, priority);
        this.miningQueue.add(newTask);
        return newTask.taskId;
    }
    public peekNextMiningTask(): Task | null { return this.miningQueue.peek(); }
    public getNextMiningTask(): Task | null { return this.miningQueue.getNext(); }
    public clearMiningTasks(): void { this.miningQueue.clear(); }

    // --- General Task Methods ---
    public addGeneralTask(type: Task['type'], args: any, priority?: number): string {
        const newTask = this.createTask(type, args, priority);
        this.generalQueue.add(newTask);
        return newTask.taskId;
    }
    public peekNextGeneralTask(): Task | null { return this.generalQueue.peek(); }
    public getNextGeneralTask(): Task | null { return this.generalQueue.getNext(); }
    public clearGeneralTasks(): void { this.generalQueue.clear(); }


    // --- Status Reporting ---
    public getStatus() {
        const format = (t: Task) => ({ id: t.taskId, type: t.type, priority: t.priority });
        return {
            miningQueue: this.miningQueue.getTasks().map(format),
            generalQueue: this.generalQueue.getTasks().map(format),
        };
    }
}
