// src/services/TaskManager.ts (新設計・状態管理対応版)

import { Task } from '../types/mcp';
import { randomUUID } from 'crypto';
import { ChatReporter } from './ChatReporter';

const TASK_PRIORITIES: { [key in Task['type']]: number } = {
    'combat': 0, 'mine': 10, 'dropItems': 12, 'goto': 8, 'follow': 20, 'patrol': 15,
};

class TaskQueue {
    private tasks: Task[] = [];
    public add(task: Task): void {
        this.tasks.push(task);
        this.tasks.sort((a, b) => a.priority - b.priority || a.createdAt - b.createdAt);
    }
    public findNextPendingTask = (): Task | null => this.tasks.find(t => t.status === 'pending') || null;
    public getTask = (taskId: string): Task | undefined => this.tasks.find(t => t.taskId === taskId);
    public updateTask(taskId: string, updates: Partial<Omit<Task, 'taskId'>>): boolean {
        const task = this.getTask(taskId);
        if (task) {
            Object.assign(task, updates);
            return true;
        }
        return false;
    }
    public removeTask = (taskId: string): boolean => {
        const index = this.tasks.findIndex(t => t.taskId === taskId);
        if (index > -1) {
            this.tasks.splice(index, 1);
            return true;
        }
        return false;
    }
    public clear = (): void => { this.tasks = []; }
    public getTasks = (): readonly Task[] => this.tasks;
}

export class TaskManager {
    private miningQueue: TaskQueue;
    private generalQueue: TaskQueue;
    private chatReporter: ChatReporter;

    constructor(chatReporter: ChatReporter) {
        this.chatReporter = chatReporter;
        this.miningQueue = new TaskQueue();
        this.generalQueue = new TaskQueue();
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

    // ★ 修正: addMiningTaskのシグネチャを変更
    public addMiningTask(args: any, priority?: number): string {
        const newTask = this.createTask('mine', args, priority);
        console.log(`[DEBUG] TaskManager: Task added to mining queue. ID: ${newTask.taskId}, Name: ${newTask.arguments.blockName}`);
        this.miningQueue.add(newTask);
        return newTask.taskId;
    }
    public addGeneralTask(type: Task['type'], args: any, priority?: number): string {
        const newTask = this.createTask(type, args, priority);
        this.generalQueue.add(newTask);
        return newTask.taskId;
    }
    
    // ★ 修正: メソッド名を変更
    public findNextPendingMiningTask = (): Task | null => this.miningQueue.findNextPendingTask();
    public findNextPendingGeneralTask = (): Task | null => this.generalQueue.findNextPendingTask();
    
    public getTask = (taskId: string): Task | undefined => this.miningQueue.getTask(taskId) || this.generalQueue.getTask(taskId);
    
    public setTaskStatus(taskId: string, status: Task['status']): boolean {
        this.chatReporter.reportError(`[DEBUG] Setting task ${taskId} status to ${status}`);
        return this.miningQueue.updateTask(taskId, { status }) || this.generalQueue.updateTask(taskId, { status });
    }
    public updateTaskArguments(taskId: string, newArguments: any): boolean {
        this.chatReporter.reportError(`[DEBUG] Updating task ${taskId} arguments.`);
        return this.miningQueue.updateTask(taskId, { arguments: newArguments }) || this.generalQueue.updateTask(taskId, { arguments: newArguments });
    }
    public removeTask = (taskId: string): boolean => this.miningQueue.removeTask(taskId) || this.generalQueue.removeTask(taskId);
    
    // ★ 修正: clearMiningTasksメソッドを再実装
    public clearMiningTasks = (): void => {
        this.chatReporter.reportError(`[DEBUG] Clearing all mining tasks.`);
        this.miningQueue.clear();
    }
}
