// src/services/Planner.ts (集中モード実装版)

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

        // タスク完了時、または中断時に即座に次の行動を評価する
        this.behaviorEngine.on('taskFinished', () => this.mainLoop());
        // 500msごとにメインループを実行する
        this.mainLoopInterval = setInterval(() => this.mainLoop(), 500);
        console.log('Planner initialized. Bot brain is now active.');
    }

    /**
     * メインの思考ループ。ボットの現在の状態に応じて行動を決定・実行する。
     */
    private mainLoop(): void {
        const currentTask = this.behaviorEngine.getActiveTask();

        // ★★★★★★★★★★ ここからが新しいロジック ★★★★★★★★★★

        // 【集中モード】現在、採掘タスクを実行中の場合
        if (currentTask && currentTask.type === 'mine') {
            // 採掘中は、戦闘による割り込みのみをチェックする
            const interruptAction = this.checkForCombatInterrupt();
            if (interruptAction) {
                console.log(`[Planner] CONCENTRATION INTERRUPT! Combat action has higher priority.`);
                this.behaviorEngine.stopCurrentBehavior();
            }
            // 割り込みがなければ、何もしない。採掘を継続させる。
            return;
        }

        // 【通常モード】アイドル状態、または採掘以外のタスクを実行中の場合
        const decidedAction = this.decideNextAction();

        // --- ケース1: 何もすべきことがない ---
        if (!decidedAction) {
            // もし何か実行中なら（例：追従）、それを止める
            if (currentTask) {
                this.behaviorEngine.stopCurrentBehavior();
            }
            return;
        }

        // --- ケース2: アイドル状態なので、新しいタスクを開始する ---
        if (!currentTask) {
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
            return;
        }

        // --- ケース3: 実行中のタスクがあり、割り込みを判断する ---
        if (decidedAction.priority < currentTask.priority) {
            console.log(`[Planner] INTERRUPT! New action '${decidedAction.type}' has higher priority.`);
            this.behaviorEngine.stopCurrentBehavior();
        }
    }
    
    /**
     * 【集中モード用】戦闘による割り込みが発生したかどうかだけをチェックする軽量な思考関数
     * @returns 実行すべき戦闘タスク、またはnull
     */
    private checkForCombatInterrupt(): Task | null {
        if (this.modeManager.isCombatMode()) {
            const nearestHostile = this.findNearestHostileMob(10);
            if (nearestHostile) {
                return this.createAction('combat', { targetEntityId: nearestHostile.id, attackRange: 4 });
            }
        }
        return null;
    }

    /**
     * 【通常モード用】すべての情報を基に、次に取るべき行動を判断する完全な思考関数
     * @returns 実行すべきTaskオブジェクト、またはnull
     */
    private decideNextAction(): Task | null {
        // 優先度1: 戦闘
        const combatAction = this.checkForCombatInterrupt();
        if (combatAction) return combatAction;

        // 優先度2: 採掘
        if (this.modeManager.isMiningMode()) {
            const miningTask = this.taskManager.peekNextMiningTask();
            if (miningTask) {
                return miningTask;
            }
        }

        // 優先度3: 追従
        if (this.modeManager.isFollowMode() && this.modeManager.getFollowTarget()) {
            return this.createAction('follow', { targetPlayer: this.modeManager.getFollowTarget() });
        }
        
        // 優先度4: 一般タスク
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
