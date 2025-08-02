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
const MODE_PRIORITY_ORDER: string[] = ['MINING', 'FOLLOW', 'GENERAL']; // ★戦闘は別途処理するため、ここからは外す

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
            // プランナーが即時生成したタスク(戦闘など)でなければ、完了時にキューから削除
            if (!finishedTask.taskId.startsWith('planner-') && reason === 'Completed successfully') {
                this.taskManager.removeTask(finishedTask.taskId);
            }
            this.mainLoop();
        });

        this.mainLoopInterval = setInterval(() => this.mainLoop(), 500);
        console.log('Planner initialized. Bot brain is now active.');
    }

    /**
     * メインの思考ループ。
     */
    private mainLoop(): void {
        // ★★★★★★★★★★★★★★★★★★★★★★★★★★★★★★★★★★★★★★★★
        // ★ ステップ1: 最優先事項である「戦闘」をチェック ★
        // ★★★★★★★★★★★★★★★★★★★★★★★★★★★★★★★★★★★★★★★★
        if (this.modeManager.isCombatMode()) {
            const nearestHostile = this.findNearestHostileMob(10);
            if (nearestHostile) {
                const combatTask = this.createAction('combat', { targetEntityId: nearestHostile.id });
                const currentTask = this.behaviorEngine.getActiveTask();

                // 既に同じ敵と戦闘中なら、何もしないで継続
                if (currentTask && currentTask.type === 'combat' && currentTask.arguments.targetEntityId === nearestHostile.id) {
                    return;
                }

                // 何か他の作業中、またはアイドル状態なら、即座に中断して戦闘を開始
                if (currentTask) {
                    this.behaviorEngine.stopCurrentBehavior({ reason: 'interrupt' });
                }
                this.startTask(combatTask);
                return; // 戦闘が最優先なので、ここで思考を終了
            }
        }
        
        // ★★★★★★★★★★★★★★★★★★★★★★★★★★★★★★★★★★★★★★★★
        // ★ ステップ2: 戦闘がない場合、通常のタスク処理を実行 ★
        // ★★★★★★★★★★★★★★★★★★★★★★★★★★★★★★★★★★★★★★★★
        const currentTask = this.behaviorEngine.getActiveTask();
        const nextTaskInQueue = this.findNextTaskInQueue();

        if (currentTask) {
            // --- ケース1: ボットが何かタスクを実行中の場合 ---
            if (!this.isTaskStillValid(currentTask)) {
                this.behaviorEngine.stopCurrentBehavior({ reason: 'cancel' });
                return;
            }
            if (nextTaskInQueue && nextTaskInQueue.priority < currentTask.priority) {
                this.behaviorEngine.stopCurrentBehavior({ reason: 'interrupt' });
                this.startTask(nextTaskInQueue);
                return;
            }
        } else {
            // --- ケース2: ボットがアイドル状態の場合 ---
            if (nextTaskInQueue) {
                this.startTask(nextTaskInQueue);
            }
        }
    }
    
    private startTask(task: Task): void {
        // キューにあるタスクの場合のみステータスを更新
        if (!task.taskId.startsWith('planner-')) {
            this.taskManager.setTaskStatus(task.taskId, 'running');
        }
        this.behaviorEngine.executeTask(task);
    }

    private findNextTaskInQueue(): Task | null {
        for (const mode of MODE_PRIORITY_ORDER) {
            if (mode === 'MINING' && this.modeManager.isMiningMode()) {
                const task = this.taskManager.findNextPendingMiningTask();
                if (task) return task;
            }
            if (mode === 'FOLLOW' && this.modeManager.isFollowMode() && this.modeManager.getFollowTarget()) {
                // フォローは即時実行タスクとして生成
                return this.createAction('follow', { targetPlayer: this.modeManager.getFollowTarget() });
            }
            if (mode === 'GENERAL') {
                const task = this.taskManager.findNextPendingGeneralTask();
                if (task) return task;
            }
        }
        return null;
    }
    
    private isTaskStillValid(task: Task): boolean {
        switch (task.type) {
            case 'mine':
                return this.modeManager.isMiningMode();
            case 'follow':
                return this.modeManager.isFollowMode();
            default:
                return true;
        }
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
