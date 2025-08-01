// src/services/Planner.ts (修正後・マルチキュー対応版)

import { BehaviorEngine } from './BehaviorEngine';
import { TaskManager } from './TaskManager';
import { ModeManager } from './ModeManager';
import { WorldKnowledge } from './WorldKnowledge';
import { StatusManager } from './StatusManager';
import { Task } from '../types/mcp';
import { WorldEntity } from './WorldKnowledge';

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

    constructor(
        behaviorEngine: BehaviorEngine,
        taskManager: TaskManager,
        modeManager: ModeManager,
        worldKnowledge: WorldKnowledge,
        statusManager: StatusManager
    ) {
        this.behaviorEngine = behaviorEngine;
        this.taskManager = taskManager;
        this.modeManager = modeManager;
        this.worldKnowledge = worldKnowledge;
        this.statusManager = statusManager;

        this.behaviorEngine.on('taskFinished', () => this.mainLoop());
        this.mainLoopInterval = setInterval(() => this.mainLoop(), 500);
        console.log('Planner initialized. Bot brain is now active.');
    }

    private mainLoop(): void {
        const currentTask = this.behaviorEngine.getActiveTask();
        const decidedAction = this.decideNextAction();

        if (!decidedAction) {
            if (currentTask) {
                this.behaviorEngine.stopCurrentBehavior();
            }
            return;
        }

        if (!currentTask) {
            // ★ここから修正: 複数のキューからタスクを取り出すロジック
            let taskToExecute: Task | null = null;
            if (this.taskManager.peekNextMiningTask()?.taskId === decidedAction.taskId) {
                taskToExecute = this.taskManager.getNextMiningTask();
            } else if (this.taskManager.peekNextGeneralTask()?.taskId === decidedAction.taskId) {
                taskToExecute = this.taskManager.getNextGeneralTask();
            } else {
                taskToExecute = decidedAction; // Plannerが動的に生成したタスク
            }
            
            if (taskToExecute) {
                this.behaviorEngine.executeTask(taskToExecute);
            }
            // ★ここまで修正
            return;
        }

        if (decidedAction.priority < currentTask.priority) {
            console.log(`[Planner] INTERRUPT! New action '${decidedAction.type}' has higher priority.`);
            this.behaviorEngine.stopCurrentBehavior();
        }
    }

    // ★ここから修正: 意思決定の優先順位を全面的に更新
    private decideNextAction(): Task | null {
        // 優先度1: 戦闘モードONで敵がいるか？
        if (this.modeManager.isCombatMode()) {
            const nearestHostile = this.findNearestHostileMob(10);
            if (nearestHostile) {
                return this.createAction('combat', { targetEntityId: nearestHostile.id, attackRange: 4 });
            }
        }

        // 優先度2: 採掘モードONで採掘タスクがあるか？
        if (this.modeManager.isMiningMode()) {
            const miningTask = this.taskManager.peekNextMiningTask();
            if (miningTask) {
                return miningTask;
            }
        }

        // 優先度3: 追従モードがONか？
        if (this.modeManager.isFollowMode() && this.modeManager.getFollowTarget()) {
            return this.createAction('follow', { targetPlayer: this.modeManager.getFollowTarget() });
        }
        
        // 優先度4: 一般タスクは残っているか？
        const generalTask = this.taskManager.peekNextGeneralTask();
        if (generalTask) {
            return generalTask;
        }

        // 優先度5: 何もすることがない
        return null;
    }
    // ★ここまで修正

    private findNearestHostileMob(range: number): WorldEntity | null {
        // (この関数の内容は変更なし)
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
        // (この関数の内容は変更なし)
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
