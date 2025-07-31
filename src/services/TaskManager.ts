// src/services/TaskManager.ts (修正版)

import { Task } from '../types/mcp';
import { BehaviorEngine } from './BehaviorEngine';
import { randomUUID } from 'crypto';

/**
 * AIからのタスクを管理し、BehaviorEngineに実行を指示する司令塔。
 */
export class TaskManager {
    private taskQueue: Task[] = [];
    private behaviorEngine: BehaviorEngine;
    private activeTask: Task | null = null;

    constructor(behaviorEngine: BehaviorEngine) {
        this.behaviorEngine = behaviorEngine;
        console.log('TaskManager initialized.');
        // TODO: タスク完了イベントをBehaviorEngineから受け取るリスナーを設定
    }

    /**
     * 新しいタスクをキューに追加します。
     * @param type タスクの種類
     * @param args タスクの引数
     * @param priority 優先度
     * @returns 生成されたタスクのID
     */
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
        
        console.log(`[TaskManager] New task added: ${type} (ID: ${newTask.taskId})`);
        this.tick();
        return newTask.taskId;
    }

    /**
     * 指定されたIDのタスクをキャンセルします。
     * @param taskId キャンセルするタスクのID
     */
    public cancelTask(taskId: string): boolean {
        if (this.activeTask && this.activeTask.taskId === taskId) {
            return this.cancelActiveTask();
        }

        const taskIndex = this.taskQueue.findIndex(t => t.taskId === taskId);
        if (taskIndex > -1) {
            const cancelledTask = this.taskQueue.splice(taskIndex, 1)[0];
            cancelledTask.status = 'cancelled';
            console.log(`[TaskManager] Task cancelled from queue: ${cancelledTask.taskId}`);
            return true;
        }

        console.warn(`[TaskManager] Task not found for cancellation: ${taskId}`);
        return false;
    }

    /**
     * 現在実行中のタスクをキャンセルします。
     * @returns キャンセルに成功したかどうか
     */
    public cancelActiveTask(): boolean {
        if (this.activeTask) {
            console.log(`[TaskManager] Active task cancelled by request: ${this.activeTask.taskId}`);
            this.behaviorEngine.stopCurrentBehavior();
            this.activeTask.status = 'cancelled';
            this.activeTask = null;
            this.tick(); // 次のタスクを実行試行
            return true;
        }
        console.log(`[TaskManager] No active task to cancel.`);
        return false; // 実行中のタスクがなかった
    }
    
    /**
     * タスクキューの状態をチェックし、必要であれば次のタスクを実行します。
     */
    private tick(): void {
        if (this.activeTask || this.taskQueue.length === 0) {
            return;
        }

        this.activeTask = this.taskQueue.shift()!;
        this.activeTask.status = 'running';

        console.log(`[TaskManager] Executing next task: ${this.activeTask.type} (ID: ${this.activeTask.taskId})`);

        // TODO: BehaviorEngineにタスクの実行を指示
        // this.behaviorEngine.executeTask(this.activeTask);
    }

    public getTaskQueueStatus() {
        return {
            activeTask: this.activeTask,
            queue: this.taskQueue
        };
    }
}
