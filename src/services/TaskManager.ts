// src/services/TaskManager.ts (中断・再開対応版)

import { Task } from '../types/mcp';
import { randomUUID } from 'crypto';
import { ChatReporter } from './ChatReporter';

const TASK_PRIORITIES: { [key in Task['type']]: number } = {
    'combat': 0, 'mine': 10, 'dropItems': 12, 'goto': 8, 'follow': 20, 'patrol': 15,
};

class TaskQueue {
    private tasks: Task[] = [];
    private chatReporter: ChatReporter | null = null;
    private queueName: string;

    constructor(queueName: string, chatReporter?: ChatReporter) {
        this.queueName = queueName;
        this.chatReporter = chatReporter || null;
    }

    public add(task: Task): void {
        this.chatReporter?.reportError(`[DEBUG] TaskQueue (${this.queueName}): Adding task '${task.type}'.`);
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

    /**
     * 中断されたタスクをキューの先頭に戻す
     * @param task 復帰させるタスク
     */
    public requeue(task: Task): void {
        this.chatReporter?.reportError(`[DEBUG] TaskQueue (${this.queueName}): Re-queuing interrupted task '${task.type}'.`);
        this.tasks.unshift(task); // pushの代わりにunshiftで先頭に追加
    }
}

export class TaskManager {
    private miningQueue: TaskQueue;
    private generalQueue: TaskQueue;
    private chatReporter: ChatReporter;

    constructor(chatReporter: ChatReporter) {
        this.chatReporter = chatReporter;
        this.miningQueue = new TaskQueue('Mining', this.chatReporter);
        this.generalQueue = new TaskQueue('General', this.chatReporter);
        console.log('TaskManager (Multi-Queue) initialized.');
    }

    private createTask(type: Task['type'], args: any, priority: number | undefined, queueType: 'mining' | 'general'): Task {
        return {
            taskId: randomUUID(),
            type: type,
            arguments: args,
            status: 'pending',
            priority: priority ?? TASK_PRIORITIES[type] ?? 99,
            createdAt: Date.now(),
            queueType: queueType, // ★キューの種類をタスク自身が保持する
        };
    }

    public addMiningTask(type: Task['type'], args: any, priority?: number): string {
        const newTask = this.createTask(type, args, priority, 'mining');
        this.miningQueue.add(newTask);
        return newTask.taskId;
    }
    public peekNextMiningTask(): Task | null { return this.miningQueue.peek(); }
    public getNextMiningTask(): Task | null { return this.miningQueue.getNext(); }
    public clearMiningTasks(): void { this.miningQueue.clear(); }
    public requeueMiningTask(task: Task): void { this.miningQueue.requeue(task); }

    public addGeneralTask(type: Task['type'], args: any, priority?: number): string {
        const newTask = this.createTask(type, args, priority, 'general');
        this.generalQueue.add(newTask);
        return newTask.taskId;
    }
    public peekNextGeneralTask(): Task | null { return this.generalQueue.peek(); }
    public getNextGeneralTask(): Task | null { return this.generalQueue.getNext(); }
    public clearGeneralTasks(): void { this.generalQueue.clear(); }
    public requeueGeneralTask(task: Task): void { this.generalQueue.requeue(task); }


    public getStatus() {
        const format = (t: Task) => ({ id: t.taskId, type: t.type, priority: t.priority });
        return {
            miningQueue: this.miningQueue.getTasks().map(format),
            generalQueue: this.generalQueue.getTasks().map(format),
        };
    }
}
