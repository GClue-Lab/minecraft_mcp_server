// src/services/Planner.ts (修正後)

import { BehaviorEngine } from './BehaviorEngine';
import { TaskManager } from './TaskManager';
import { ModeManager } from './ModeManager';
import { WorldKnowledge } from './WorldKnowledge';
import { StatusManager } from './StatusManager';
import { Task } from '../types/mcp';
import { WorldEntity } from './WorldKnowledge';
import { ChatReporter } from './ChatReporter';

const ACTION_PRIORITIES: { [key in Task['type']]: number } = {
    'combat': 0, 'mine': 10, 'dropItems': 12, 'goto': 8, 'follow': 20, 'patrol': 15,
};
const MODE_PRIORITY_ORDER: string[] = ['COMBAT', 'MINING', 'FOLLOW', 'GENERAL'];

export class Planner {
    // ★ 修正: 不足していたプロパティをすべて定義
    private behaviorEngine: BehaviorEngine;
    private taskManager: TaskManager;
    private modeManager: ModeManager;
    private worldKnowledge: WorldKnowledge;
    private statusManager: StatusManager;
    private chatReporter: ChatReporter;
    private mainLoopInterval: NodeJS.Timeout;

    // ★ 修正: 不足していたコンストラクタを再実装
    constructor(
        behaviorEngine: BehaviorEngine,
        taskManager: TaskManager,
        modeManager: ModeManager,
        worldKnowledge: WorldKnowledge,
        statusManager: StatusManager,
        chatReporter: ChatReporter
    ) {
        this.behaviorEngine = behaviorEngine;
        this.taskManager = taskManager;
        this.modeManager = modeManager;
        this.worldKnowledge = worldKnowledge;
        this.statusManager = statusManager;
        this.chatReporter = chatReporter;

        this.behaviorEngine.on('taskFinished', (finishedTask: Task, reason: string) => {
            if (reason === 'Completed successfully') {
                this.taskManager.removeTask(finishedTask.taskId);
            }
            this.mainLoop();
        });
        
        this.mainLoopInterval = setInterval(() => this.mainLoop(), 500);
        console.log('Planner initialized. Bot brain is now active.');
    }

    private mainLoop(): void {
        const currentTask = this.behaviorEngine.getActiveTask();
        if (currentTask) {
            const highPriorityAction = this.decideInterruptAction();
            if (highPriorityAction) {
                this.behaviorEngine.stopCurrentBehavior({ reason: 'interrupt' });
                this.startTask(highPriorityAction);
            }
            return;
        }

        const nextTask = this.findNextTask();
        if (nextTask) {
            this.startTask(nextTask);
        }
    }

    private startTask(task: Task): void {
        this.taskManager.setTaskStatus(task.taskId, 'running');
        this.behaviorEngine.executeTask(task);
    }

    private decideInterruptAction(): Task | null {
        if (this.modeManager.isCombatMode()) {
            const nearestHostile = this.findNearestHostileMob(10);
            if (nearestHostile) {
                return this.createAction('combat', { targetEntityId: nearestHostile.id });
            }
        }
        return null;
    }

    private findNextTask(): Task | null {
        for (const mode of MODE_PRIORITY_ORDER) {
            let task: Task | null = null;
            switch (mode) {
                case 'COMBAT':
                    task = this.decideInterruptAction();
                    break;
                case 'MINING':
                    if (this.modeManager.isMiningMode()) {
                        task = this.taskManager.findNextPendingMiningTask();
                    }
                    break;
                case 'FOLLOW':
                    // To be implemented
                    break;
                case 'GENERAL':
                    task = this.taskManager.findNextPendingGeneralTask();
                    break;
            }
            if (task) return task;
        }
        return null;
    }

    private findNearestHostileMob(range: number): WorldEntity | null {
        const botEntity = this.worldKnowledge.getBotEntity();
        if (!botEntity) return null;
        const hostileMobNames = ['zombie', 'skeleton', 'spider', 'creeper'];
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

    private createAction(type: Task['type'], args: any): Task {
        return {
            taskId: `planner-${type}-${Date.now()}`,
            type: type,
            arguments: args,
            status: 'running',
            priority: ACTION_PRIORITIES[type] ?? 100,
            createdAt: Date.now(),
        };
    }
}
