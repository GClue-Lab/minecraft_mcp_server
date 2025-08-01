// src/services/Planner.ts (デッドロック修正版)

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
    
    // ★修正1: mainLoopIntervalをidleCheckIntervalに改名し、null許容にする
    private idleCheckInterval: NodeJS.Timeout | null = null;

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

        // ★修正2: イベントハンドラのロジックを更新
        // タスクが完了したら、即座に次の行動を評価し、その後アイドル状態の監視を再開する
        this.behaviorEngine.on('taskFinished', () => {
            console.log('[Planner] Task finished. Re-evaluating next action immediately.');
            this.mainLoop();
            this.startIdleCheck();
        });

        // 最初にアイドル状態の監視を開始する
        this.startIdleCheck();
        console.log('Planner initialized. Bot brain is now active.');
    }

    /**
     * ★修正3: アイドル時の思考ループを開始するメソッド
     */
    private startIdleCheck(): void {
        // すでに実行中なら何もしない
        if (this.idleCheckInterval) return;
        
        console.log('[Planner] Starting idle check loop.');
        this.idleCheckInterval = setInterval(() => {
            // ボットが何もしていない（タスクがない）場合のみ、思考ループを実行
            if (!this.behaviorEngine.getActiveTask()) {
                this.mainLoop();
            }
        }, 1000); // 処理の衝突を避けるため、間隔を1秒に延長
    }

    /**
     * ★修正4: アイドル時の思考ループを停止するメソッド
     */
    private stopIdleCheck(): void {
        if (this.idleCheckInterval) {
            console.log('[Planner] Stopping idle check loop.');
            clearInterval(this.idleCheckInterval);
            this.idleCheckInterval = null;
        }
    }

    /**
     * ★修正5: メインの思考ロジックを更新
     */
    private mainLoop(): void {
        // ボットが現在何かしている場合は、新たな思考を開始しない
        // (ただし、割り込みは除く)
        const currentTask = this.behaviorEngine.getActiveTask();
        if (currentTask) {
             const decidedAction = this.decideNextAction();
             // 割り込み判定: より優先度の高い行動があれば現在のタスクを中断
             if (decidedAction && decidedAction.priority < currentTask.priority) {
                 console.log(`[Planner] INTERRUPT! New action '${decidedAction.type}' has higher priority.`);
                 this.stopIdleCheck(); // 割り込み時もループを止める（taskFinishedで再開されるため）
                 this.behaviorEngine.stopCurrentBehavior();
             }
             return;
        }

        // --- ボットがアイドル状態の場合の処理 ---
        const decidedAction = this.decideNextAction();

        if (!decidedAction) {
            return; // 何もすることがない
        }

        let taskToExecute: Task | null = null;
        if (this.taskManager.peekNextMiningTask()?.taskId === decidedAction.taskId) {
            taskToExecute = this.taskManager.getNextMiningTask();
        } else if (this.taskManager.peekNextGeneralTask()?.taskId === decidedAction.taskId) {
            taskToExecute = this.taskManager.getNextGeneralTask();
        } else {
            taskToExecute = decidedAction;
        }
        
        if (taskToExecute) {
            const started = this.behaviorEngine.executeTask(taskToExecute);
            // ★最重要★: タスクが開始されたら、アイドルチェックを停止する
            if (started) {
                this.stopIdleCheck();
            }
        }
    }

    private decideNextAction(): Task | null {
        // (この関数の内容は変更なし)
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
