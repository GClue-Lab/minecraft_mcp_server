// src/services/Planner.ts (ロジック修正版)

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

export class Planner {
    private behaviorEngine: BehaviorEngine;
    private taskManager: TaskManager;
    private modeManager: ModeManager;
    private worldKnowledge: WorldKnowledge;
    private statusManager: StatusManager;
    private mainLoopInterval: NodeJS.Timeout;
    private chatReporter: ChatReporter;

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

        this.behaviorEngine.on('taskFinished', () => this.mainLoop());
        
        // 元のシンプルなsetIntervalに戻す
        this.mainLoopInterval = setInterval(() => {
            this.mainLoop();
        }, 500);

        console.log('Planner initialized. Bot brain is now active.');
    }

    private mainLoop(): void {
        const currentTask = this.behaviorEngine.getActiveTask();
        const decidedAction = this.decideNextAction();

        if (currentTask) {
            // --- ケース1: ボットが何かタスクを実行中の場合 ---

            // ★★★★★★★★★★ ここからが修正点 ★★★★★★★★★★
            // タスクがキューから来たものか、モードによって生成されたものかを判断
            const isFromQueue = currentTask.type === 'mine' || currentTask.type === 'dropItems';

            if (isFromQueue) {
                // タスクがキューから来た場合、高優先度の割り込みがない限り継続する
                if (decidedAction && decidedAction.priority < currentTask.priority) {
                    this.behaviorEngine.stopCurrentBehavior();
                }
            } else {
                // タスクがモードによるものの場合（follow, combatなど）、
                // 続ける理由がなくなったか、高優先度の割り込みがあれば停止する
                if (!decidedAction || (decidedAction.priority < currentTask.priority)) {
                    this.behaviorEngine.stopCurrentBehavior();
                }
            }
            // ★★★★★★★★★★★★★★★★★★★★★★★★★★★★★★★

        } else {
            // --- ケース2: ボットがアイドル状態の場合 ---
            if (decidedAction) {
                let taskToExecute: Task | null = null;
                if (this.taskManager.peekNextMiningTask()?.taskId === decidedAction.taskId) {
                    taskToExecute = this.taskManager.getNextMiningTask();
                } else if (this.taskManager.peekNextGeneralTask()?.taskId === decidedAction.taskId) {
                    taskToExecute = this.taskManager.getNextGeneralTask();
                } else {
                    taskToExecute = decidedAction;
                }
                
                if (taskToExecute) {
                    this.behaviorEngine.executeTask(taskToExecute);
                }
            }
        }
    }

    private decideNextAction(): Task | null {
        if (this.modeManager.isCombatMode()) {
            const nearestHostile = this.findNearestHostileMob(10);
            if (nearestHostile) {
                return this.createAction('combat', { targetEntityId: nearestHostile.id, attackRange: 4 });
            }
        }

        if (this.modeManager.isMiningMode()) {
            const miningTask = this.taskManager.peekNextMiningTask();
            if (miningTask) {
                return miningTask;
            }
        }

        if (this.modeManager.isFollowMode() && this.modeManager.getFollowTarget()) {
            return this.createAction('follow', { targetPlayer: this.modeManager.getFollowTarget() });
        }
        
        const generalTask = this.taskManager.peekNextGeneralTask();
        if (generalTask) {
            return generalTask;
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
            createdAt: Date.now()
        };
    }
}
