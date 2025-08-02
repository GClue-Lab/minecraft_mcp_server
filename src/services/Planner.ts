// src/services/Planner.ts (最終修正版)

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

    private mainLoop(): void {
        const idealAction = this.decideNextAction();
        const currentTask = this.behaviorEngine.getActiveTask();

        if (currentTask) {
            if (idealAction && idealAction.type !== currentTask.type) {
                this.behaviorEngine.stopCurrentBehavior({ reason: 'interrupt' });
            }
        } else { // ボットがアイドル状態の場合
            if (idealAction) {
                let taskToExecute: Task | null = idealAction;

                // ★ 修正: プランナー起因のタスクでなければ、必ずキューから取り出す
                if (!taskToExecute.taskId.startsWith('planner-')) {
                    // idealActionはpeekの結果なので、対応するキューからタスクを正式に取り出す(getNext)
                    if (taskToExecute.queueType === 'mining') {
                        taskToExecute = this.taskManager.getNextMiningTask();
                    } else if (taskToExecute.queueType === 'general') {
                        taskToExecute = this.taskManager.getNextGeneralTask();
                    } else {
                        // キュータイプが不明なタスクは実行しない
                        taskToExecute = null; 
                    }
                }
                
                if (taskToExecute) {
                    // タスクIDが一致することを確認（念のため）
                    if (taskToExecute.taskId === idealAction.taskId) {
                        this.behaviorEngine.executeTask(taskToExecute);
                    } else {
                        // PeekしたタスクとGetしたタスクが異なる場合。非同期処理などで起こりうる。
                        // この場合は何もしないで次のループで再評価する。
                        this.chatReporter.reportError(`[DEBUG] Planner: Task mismatch detected. Re-evaluating next cycle.`);
                    }
                }
            }
        }
    }

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
                    const currentTask = this.behaviorEngine.getActiveTask();
                    if (currentTask && currentTask.type === 'mine') {
                        return currentTask;
                    }
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
