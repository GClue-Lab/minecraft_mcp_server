// src/services/Planner.ts (思考ロジック修正版)

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

/**
 * ボットの最高意思決定機関（脳）。
 * すべての情報を監視し、「今、何をすべきか」を常に判断し、命令する。
 */
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

        // BehaviorEngineが暇になったら、即座に行動を再評価する
        this.behaviorEngine.on('taskFinished', () => this.mainLoop());
        this.mainLoopInterval = setInterval(() => this.mainLoop(), 500);
        console.log('Planner initialized. Bot brain is now active.');
    }

    /**
     * 500msごとに実行されるメインループ（思考サイクル）
     */
    private mainLoop(): void {
        const currentTask = this.behaviorEngine.getActiveTask();
        const decidedAction = this.decideNextAction();

        // ケース1: 何もすべきことがない場合。もし何かしていれば停止させる。
        if (!decidedAction) {
            if (currentTask) {
                this.behaviorEngine.stopCurrentBehavior();
            }
            return;
        }

        // ケース2: 何もしていない場合。決定した行動を開始する。
        if (!currentTask) {
            // ★ここからが重要な修正★
            // 決定した行動がユーザー指示タスクの場合、ここで初めてキューから取り出す
            if (this.taskManager.peekNextTask()?.taskId === decidedAction.taskId) {
                const taskToExecute = this.taskManager.getNextTask();
                if (taskToExecute) {
                    this.behaviorEngine.executeTask(taskToExecute);
                }
            } else {
                // Plannerが動的に生成したタスク（戦闘や追従）を実行
                this.behaviorEngine.executeTask(decidedAction);
            }
            return;
        }

        // ケース3: 何か実行中の場合。より優先度の高い行動があれば割り込む。
        if (decidedAction.priority < currentTask.priority) {
            console.log(`[Planner] INTERRUPT! New action '${decidedAction.type}' has higher priority.`);
            this.behaviorEngine.stopCurrentBehavior();
            // stop完了後に 'taskFinished' イベントが発火し、再度mainLoopが呼ばれるので、
            // ここでは新しいタスクを開始しない。次のループで自動的に開始される。
        }
    }

    /**
     * すべての情報を基に、次に取るべき行動を【判断するだけ】の純粋な関数。
     * 状態の変更（キューからの削除など）は一切行わない。
     * @returns 実行すべきTaskオブジェクト、またはnull
     */
    private decideNextAction(): Task | null {
        // 優先度1: 戦闘モードONで敵がいるか？
        if (this.modeManager.isCombatMode()) {
            const nearestHostile = this.findNearestHostileMob(10);
            if (nearestHostile) {
                return this.createAction('combat', { targetEntityId: nearestHostile.id, attackRange: 4 });
            }
        }

        // 優先度2: ユーザー指示タスクは残っているか？
        const userTask = this.taskManager.peekNextTask(); // ★修正点: peekで覗くだけ
        if (userTask) {
            return userTask; // ★修正点: 取り出さずに、そのまま返す
        }

        // 優先度3: 追従モードがONか？
        if (this.modeManager.isFollowMode() && this.modeManager.getFollowTarget()) {
            return this.createAction('follow', { targetPlayer: this.modeManager.getFollowTarget() });
        }

        // 優先度4: 何もすることがない
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
