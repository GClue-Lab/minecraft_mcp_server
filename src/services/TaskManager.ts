// src/services/TaskManager.ts (修正版)

import { Task } from '../types/mcp';
import { BehaviorEngine } from './BehaviorEngine';
import { ModeManager } from './ModeManager';
import { BotManager } from './BotManager';
import { WorldKnowledge } from './WorldKnowledge';
import { ChatReporter } from './ChatReporter';
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
    private chatReporter: ChatReporter;
    private activeTask: Task | null = null;
    private mainLoopInterval: NodeJS.Timeout;

    constructor(
        behaviorEngine: BehaviorEngine, 
        modeManager: ModeManager, 
        botManager: BotManager, 
        worldKnowledge: WorldKnowledge,
        chatReporter: ChatReporter
    ) {
        this.behaviorEngine = behaviorEngine;
        this.modeManager = modeManager;
        this.botManager = botManager;
        this.worldKnowledge = worldKnowledge;
        this.chatReporter = chatReporter;
        console.log('TaskManager (Chatty & Dynamic) initialized.');

        this.behaviorEngine.on('taskCompleted', (task: Task | null, result: any) => this.onTaskFinished(task, result || 'Success'));
        this.behaviorEngine.on('taskFailed', (task: Task | null, reason: any) => this.onTaskFinished(task, reason || 'Failed'));
        
        const eventEmitter = this.botManager.getBotInstanceEventEmitter();
        eventEmitter.on('death', () => this.handleBotDeath());
        eventEmitter.on('respawn', () => this.handleBotRespawn());

        this.mainLoopInterval = setInterval(() => this.mainLoop(), 500);
    }
    
    private mainLoop(): void {
        this.generateDynamicTasks();
        if (!this.activeTask) {
            this.tick();
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

    private tick(): void {
        if (this.activeTask) return;

        let nextTask: Task | null = null;
        if (this.taskQueue.length > 0) {
            nextTask = this.taskQueue.shift()!;
        } else if (this.modeManager.isFollowMode() && this.modeManager.getFollowTarget()) {
            nextTask = this.createDefaultTask('follow', { targetPlayer: this.modeManager.getFollowTarget() });
        }

        if (nextTask) {
            this.activeTask = nextTask;
            this.activeTask.status = 'running';
            this.chatReporter.reportTaskStart(this.activeTask);
            this.behaviorEngine.executeTask(this.activeTask);
        }
    }
    
    private onTaskFinished(task: Task | null, result: string): void {
        if (task && this.activeTask && task.taskId === this.activeTask.taskId) {
            this.chatReporter.reportTaskEnd(task, result);
            this.activeTask = null;
            this.tick();
        }
    }

    private handleBotDeath(): void {
        this.behaviorEngine.stopCurrentBehavior();
        this.activeTask = null;
        this.taskQueue = [];
    }

    private handleBotRespawn(): void {
        this.tick();
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
        this.tick();
        return newTask.taskId;
    }

    public cancelTask(taskId: string): void {
        if (this.activeTask && this.activeTask.taskId === taskId) {
            this.behaviorEngine.stopCurrentBehavior();
        } else {
            this.taskQueue = this.taskQueue.filter(t => t.taskId !== taskId);
        }
    }

    public stopCurrentTask(): void {
        if (this.activeTask) {
            this.cancelTask(this.activeTask.taskId);
        }
    }

    public stopCurrentTaskIfItIs(type: Task['type']): void {
        if (this.activeTask && this.activeTask.type === type) {
            this.stopCurrentTask();
        }
    }
    
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
