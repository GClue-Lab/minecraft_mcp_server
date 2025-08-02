// src/services/Planner.ts (中断・再開対応版)

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

type ModeType = 'COMBAT' | 'MINING' | 'FOLLOW' | 'GENERAL';
const MODE_PRIORITY_ORDER: ModeType[] = [
    'COMBAT',
    'MINING',
    'FOLLOW',
    'GENERAL'
];

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
        
        this.mainLoopInterval = setInterval(() => {
            this.mainLoop();
        }, 500);

        console.log('Planner initialized. Bot brain is now active.');
    }

    /**
     * メインの思考ループ。
     * 「理想の行動」と「現在の行動」を比較し、状態を遷移させる。
     */
    private mainLoop(): void {
        const idealAction = this.decideNextAction();
        const currentTask = this.behaviorEngine.getActiveTask();

        if (currentTask) {
            // --- ケース1: ボットが何かタスクを実行中の場合 ---
            // 理想の行動があり、かつ現在の行動とタイプが異なる場合（＝より優先度の高いタスクが見つかった場合）
            if (idealAction && idealAction.type !== currentTask.type) {
                // 「中断」扱いで現在のタスクを停止させる。
                this.behaviorEngine.stopCurrentBehavior({ reason: 'interrupt' });
            }

        } else {
            // --- ケース2: ボットがアイドル状態の場合 ---
            if (idealAction) {
                let taskToExecute: Task | null = null;
                // プランナーが生成したタスクか、タスクマネージャーのタスクかを確認
                if (idealAction.taskId.startsWith('planner-')) {
                    taskToExecute = idealAction;
                } else {
                    // タスクIDで比較して、正しいキューからタスクを取得する
                    if (this.taskManager.peekNextMiningTask()?.taskId === idealAction.taskId) {
                        taskToExecute = this.taskManager.getNextMiningTask();
                    } else if (this.taskManager.peekNextGeneralTask()?.taskId === idealAction.taskId) {
                        taskToExecute = this.taskManager.getNextGeneralTask();
                    }
                }
                
                if (taskToExecute) {
                    this.behaviorEngine.executeTask(taskToExecute);
                }
            }
        }
    }

    /**
     * モードの優先順位に従って、今やるべき最も理想的な行動を一つだけ決定する。
     * @returns 実行すべきTaskオブジェクト、またはnull
     */
    private decideNextAction(): Task | null {
        for (const mode of MODE_PRIORITY_ORDER) {
            let task: Task | null = null;

            switch (mode) {
                case 'COMBAT':
                    if (this.modeManager.isCombatMode()) {
                        const nearestHostile = this.findNearestHostileMob(10);
                        if (nearestHostile) {
                            task = this.createAction('combat', { targetEntityId: nearestHostile.id, attackRange: 4 });
                        }
                    }
                    break;
                
                case 'MINING':
                    // 実行中のmineタスクがあれば、それを最優先で継続する
                    const currentTask = this.behaviorEngine.getActiveTask();
                    if (currentTask && currentTask.type === 'mine') {
                        return currentTask;
                    }
                    // 実行中のタスクがない場合のみ、キューから新しいタスクを探す
                    if (this.modeManager.isMiningMode()) {
                        task = this.taskManager.peekNextMiningTask();
                    }
                    break;

                case 'FOLLOW':
                    if (this.modeManager.isFollowMode() && this.modeManager.getFollowTarget()) {
                        task = this.createAction('follow', { targetPlayer: this.modeManager.getFollowTarget() });
                    }
                    break;
                
                case 'GENERAL':
                    task = this.taskManager.peekNextGeneralTask();
                    break;
            }

            if (task) {
                return task;
            }
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
