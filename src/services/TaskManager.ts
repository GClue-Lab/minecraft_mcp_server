// src/services/TaskManager.ts (修正版)

import { Task } from '../types/mcp';
import { BehaviorEngine } from './BehaviorEngine';
import { ModeManager } from './ModeManager';
import { BotManager } from './BotManager';
import { WorldKnowledge } from './WorldKnowledge';
import { WorldEntity } from '../services/WorldKnowledge';
import { randomUUID } from 'crypto';

const TASK_PRIORITIES: { [key in Task['type']]: number } = {
    'combat': 0, 'mine': 10, 'dropItems': 12, 'goto': 8, 'follow': 20, 'patrol': 15,
};

export class TaskManager {
    private taskQueue: Task[] = [];
    private behaviorEngine: BehaviorEngine;
    private modeManager: ModeManager;
    private botManager: BotManager;
    private worldKnowledge: WorldKnowledge;
    private activeTask: Task | null = null;
    private mainLoopInterval: NodeJS.Timeout;

    constructor(behaviorEngine: BehaviorEngine, modeManager: ModeManager, botManager: BotManager, worldKnowledge: WorldKnowledge) {
        this.behaviorEngine = behaviorEngine;
        this.modeManager = modeManager;
        this.botManager = botManager;
        this.worldKnowledge = worldKnowledge;
        console.log('TaskManager (Dynamic) initialized.');

        this.behaviorEngine.on('taskCompleted', (task: Task | null) => this.onTaskFinished(task));
        this.behaviorEngine.on('taskFailed', (task: Task | null) => this.onTaskFinished(task));
        
        const eventEmitter = this.botManager.getBotInstanceEventEmitter();
        eventEmitter.on('death', () => this.handleBotDeath());
        eventEmitter.on('respawn', () => this.handleBotRespawn());

        this.mainLoopInterval = setInterval(() => this.mainLoop(), 500);
    }
    
    private mainLoop(): void {
        this.generateDynamicTasks();
        if (!this.activeTask) {
            this.startNextTask();
        }
    }

    private generateDynamicTasks(): void {
        if (this.modeManager.isCombatMode()) {
            const nearestHostile = this.findNearestHostileMob(10);
            const existingCombatTask = this.taskQueue.find(t => t.type === 'combat') || (this.activeTask?.type === 'combat' ? this.activeTask : null);

            if (nearestHostile) {
                const targetId = nearestHostile.id;
                if (existingCombatTask && existingCombatTask.arguments.targetEntityId === targetId) return;
                if (existingCombatTask) this.cancelTask(existingCombatTask.taskId);
                this.addTask('combat', { targetEntityId: targetId, attackRange: 4 }, 0);
            } else {
                if (existingCombatTask) this.cancelTask(existingCombatTask.taskId);
            }
        }
    }

    private startNextTask(): void {
        if (this.taskQueue.length > 0) {
            this.activeTask = this.taskQueue.shift()!;
            this.activeTask.status = 'running';
            this.behaviorEngine.executeTask(this.activeTask);
            return;
        }
        this.startDefaultBehavior();
    }
    
    private onTaskFinished(task: Task | null): void {
        if (task && this.activeTask && task.taskId === this.activeTask.taskId) {
            this.activeTask = null;
        }
    }

    private handleBotDeath(): void {
        this.behaviorEngine.stopCurrentBehavior();
        this.activeTask = null;
        this.taskQueue = [];
    }

    private handleBotRespawn(): void {
        // メインループが自動で再評価を行う
    }

    public addTask(type: Task['type'], args: any, priority?: number): string {
        const newTask: Task = {
            taskId: randomUUID(), type, arguments: args, status: 'pending',
            priority: priority ?? TASK_PRIORITIES[type] ?? 99, createdAt: Date.now(),
        };
        
        if (this.activeTask && newTask.priority < this.activeTask.priority) {
            if (!this.activeTask.taskId.startsWith('default-')) {
                this.taskQueue.unshift(this.activeTask);
            }
            this.behaviorEngine.stopCurrentBehavior();
        }
        
        this.taskQueue.push(newTask);
        this.taskQueue.sort((a, b) => a.priority - b.priority || a.createdAt - b.createdAt);
        return newTask.taskId;
    }

    public cancelTask(taskId: string): void {
        if (this.activeTask && this.activeTask.taskId === taskId) {
            this.behaviorEngine.stopCurrentBehavior();
        } else {
            this.taskQueue = this.taskQueue.filter(t => t.taskId !== taskId);
        }
    }

    // ===== ★ここからが不足していたメソッド★ =====

    /**
     * デフォルト行動（追従など）を開始する
     */
    public startDefaultBehavior(): void {
        if (this.activeTask) return;

        if (this.modeManager.isFollowMode() && this.modeManager.getFollowTarget()) {
            this.activeTask = this.createDefaultTask('follow', { targetPlayer: this.modeManager.getFollowTarget() });
            this.behaviorEngine.executeTask(this.activeTask);
        }
    }

    /**
     * 現在実行中のタスクを停止する
     */
    public stopCurrentTask(): void {
        if (this.activeTask) {
            this.cancelTask(this.activeTask.taskId);
        }
    }

    /**
     * 現在のタスクが指定されたタイプの場合のみ停止する
     */
    public stopCurrentTaskIfItIs(type: Task['type']): void {
        if (this.activeTask && this.activeTask.type === type) {
            this.stopCurrentTask();
        }
    }
    
    // ===== ★ここまでが不足していたメソッド★ =====

    private findNearestHostileMob(range: number): WorldEntity | null {
        const botEntity = this.worldKnowledge.getBotEntity();
        if (!botEntity) return null;
        const hostileMobNames = ['zombie', 'skeleton', 'spider', 'creeper', 'enderman', 'witch'];
        
        let closestMob: WorldEntity | null = null;
        let closestDistance = Infinity;

        for (const entity of this.worldKnowledge.getAllEntities()) {
            if (entity.type === 'hostile' || (entity.name && hostileMobNames.includes(entity.name))) {
                const distance = entity.position.distanceTo(botEntity.position);
                if (distance <= range && distance < closestDistance) {
                    closestDistance = distance;
                    closestMob = entity;
                }
            }
        }
        return closestMob;
    }

    private createDefaultTask(type: Task['type'], args: any): Task {
        return {
            taskId: `default-${type}`, type, arguments: args, status: 'running',
            priority: TASK_PRIORITIES[type], createdAt: Date.now()
        };
    }
    
    public getStatus() {
        return {
            activeTask: this.activeTask,
            taskQueue: this.taskQueue.map(t => ({ id: t.taskId, type: t.type, priority: t.priority })),
        };
    }
}
