// src/services/Planner.ts (モード優先指向・修正版)

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

// ★★★★★★★★★★ ここからが新しい設計 ★★★★★★★★★★
// 思考の優先順位を定義。この配列の順番を変更するだけで、ボットの行動優先度を安全に変更できる。
type ModeType = 'COMBAT' | 'MINING' | 'FOLLOW' | 'GENERAL';
const MODE_PRIORITY_ORDER: ModeType[] = [
    'COMBAT',
    'MINING',
    'FOLLOW',
    'GENERAL'
];
// ★★★★★★★★★★★★★★★★★★★★★★★★★★★★★★★

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
            if (!idealAction || idealAction.type !== currentTask.type) {
                this.behaviorEngine.stopCurrentBehavior();
            }

        } else {
            // --- ケース2: ボットがアイドル状態の場合 ---
            if (idealAction) {
                let taskToExecute: Task | null = null;
                if (idealAction.taskId.startsWith('planner-')) {
                    taskToExecute = idealAction;
                } else {
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
        // ★★★★★★★★★★ ここからが新しい設計 ★★★★★★★★★★
        // 定義された優先順位リストを順番にチェックする
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

            // もし、いずれかのモードでやるべきタスクが見つかったら、
            // それが最優先事項なので、すぐに思考を終了してそのタスクを返す。
            if (task) {
                return task;
            }
        }
        // ★★★★★★★★★★★★★★★★★★★★★★★★★★★★★★★

        // すべてのモードをチェックしても、やるべきことは何もなかった
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
