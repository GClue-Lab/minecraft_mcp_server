// src/services/Planner.ts (根本的な欠陥を修正した最終版)

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
    private behaviorEngine: BehaviorEngine;
    private taskManager: TaskManager;
    private modeManager: ModeManager;
    private worldKnowledge: WorldKnowledge;
    private statusManager: StatusManager;
    private chatReporter: ChatReporter;
    private mainLoopInterval: NodeJS.Timeout;

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
            // タスク完了・中断後、即座に次の判断へ
            this.mainLoop();
        });

        this.mainLoopInterval = setInterval(() => this.mainLoop(), 500);
        console.log('Planner initialized. Bot brain is now active.');
    }

    /**
     * メインの思考ループ。
     * 「理想の行動」と「現在の行動」を比較し、状態を遷移させる。
     */
    private mainLoop(): void {
        const idealTask = this.findIdealTask();
        const currentTask = this.behaviorEngine.getActiveTask();

        if (currentTask) {
            // --- ケース1: ボットが何かタスクを実行中の場合 ---
            if (!idealTask) {
                // やるべき事がなくなった場合（例：採掘モードOFF）、現在のタスクを停止
                this.behaviorEngine.stopCurrentBehavior({ reason: 'cancel' });
            } else if (idealTask.taskId !== currentTask.taskId) {
                // より優先度の高いタスクが見つかった場合、現在のタスクを中断して新しいタスクを開始
                this.chatReporter.reportError(`[DEBUG] Planner: Interrupting ${currentTask.type} for ${idealTask.type}.`);
                this.behaviorEngine.stopCurrentBehavior({ reason: 'interrupt' });
                this.startTask(idealTask);
            }
            // idealTaskとcurrentTaskが同じなら何もしない（継続）

        } else {
            // --- ケース2: ボットがアイドル状態の場合 ---
            if (idealTask) {
                // やるべき事が見つかったので、タスクを開始
                this.startTask(idealTask);
            }
        }
    }
    
    /**
     * 新しいタスクを開始させるためのヘルパーメソッド
     */
    private startTask(task: Task): void {
        // タスクのステータスを「実行中」に更新してから実行を命令する
        this.taskManager.setTaskStatus(task.taskId, 'running');
        this.behaviorEngine.executeTask(task);
    }

    /**
     * 現在のモードとタスクキューに基づき、今やるべき最も優先度の高い「理想のタスク」を1つだけ見つける。
     * @returns 理想のタスク、またはnull
     */
    private findIdealTask(): Task | null {
        for (const mode of MODE_PRIORITY_ORDER) {
            let task: Task | null = null;
            switch (mode) {
                case 'COMBAT':
                    if (this.modeManager.isCombatMode()) {
                        const nearestHostile = this.findNearestHostileMob(10);
                        if (nearestHostile) {
                            // 戦闘タスクはキューに入れない一時的なタスクとして生成
                            task = this.createAction('combat', { targetEntityId: nearestHostile.id });
                        }
                    }
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
            // いずれかのモードでタスクが見つかったら、それが最優先なので、すぐに返す
            if (task) return task;
        }
        // ループをすべて回っても何も見つからなかった
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
            status: 'running', // このタスクは即時実行される前提
            priority: ACTION_PRIORITIES[type] ?? 100,
            createdAt: Date.now(),
        };
    }
}
