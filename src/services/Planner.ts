import { BehaviorEngine } from './BehaviorEngine';
import { TaskManager } from './TaskManager';
import { ModeManager } from './ModeManager';
import { WorldKnowledge } from './WorldKnowledge';
import { StatusManager } from './StatusManager';
import { Task } from '../types/mcp';
import { WorldEntity } from './WorldKnowledge';
import { ChatReporter } from './ChatReporter';

// ボットが即時生成するタスクの優先度
const ACTION_PRIORITIES: { [key in Task['type']]: number } = {
    'combat': 0, 'mine': 10, 'dropItems': 12, 'goto': 8, 'follow': 20, 'patrol': 15,
};

// モードの優先順位
const MODE_PRIORITY_ORDER: string[] = ['MINING', 'FOLLOW', 'GENERAL'];

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
            // 正常完了したタスクで、プランナーが即時生成したものでなければキューから削除
            if (!finishedTask.taskId.startsWith('planner-') && reason === 'Completed successfully') {
                this.taskManager.removeTask(finishedTask.taskId);
            }
            // 完了・中断を問わず、即座に次の行動を評価する
            this.mainLoop();
        });

        this.mainLoopInterval = setInterval(() => this.mainLoop(), 500);
        console.log('Planner (Stateful Model) initialized. Bot brain is now active.');
    }

    /**
     * メインの思考ループ。
     * 「理想の行動」と「現在の行動」を比較し、状態を遷移させる。
     */
    private mainLoop(): void {
        const idealAction = this.determineIdealAction();
        const currentAction = this.behaviorEngine.getActiveTask();

        if (currentAction) {
            // --- ケースA: ボットが何かを実行中の場合 ---
            // 理想の行動がない、または理想と現在の行動が異なるなら、現在のタスクを中断する。
            if (!idealAction || idealAction.taskId !== currentAction.taskId) {
                this.behaviorEngine.stopCurrentBehavior({ reason: 'interrupt' });
            }
            // (理想と現在が同じなら何もしないで継続)

        } else {
            // --- ケースB: ボットがアイドル状態の場合 ---
            // 実行すべき理想の行動があれば、それを開始する
            if (idealAction) {
                this.startTask(idealAction);
            }
        }
    }

    /**
     * 現在の状況から、実行すべき最も優先度の高い「理想の行動」を一つだけ決定する。
     * @returns 実行すべきTaskオブジェクト、またはnull
     */
    private determineIdealAction(): Task | null {
        const currentAction = this.behaviorEngine.getActiveTask();
        console.log(`[DEBUG] Planner: Determining ideal action. Current task is: ${currentAction?.type || 'none'}`);

        // 最優先事項：戦闘
        if (this.modeManager.isCombatMode()) {
            const nearestHostile = this.findNearestHostileMob(10);
            if (nearestHostile) {
                if (currentAction && currentAction.type === 'combat' && currentAction.arguments.targetEntityId === nearestHostile.id) {
                    return currentAction;
                }
                return this.createAction('combat', { targetEntityId: nearestHostile.id });
            }
        }

        // 割り込みがないかチェック
        const highPriorityPendingTask = this.findHighPriorityPendingTask(currentAction ? currentAction.priority : 999);
        if (highPriorityPendingTask) {
            return highPriorityPendingTask;
        }
        
        // 割り込みがなく、現在のタスクがまだ有効なら、現在のタスクを続けるのが理想
        if (currentAction && this.isTaskStillValid(currentAction)) {
            return currentAction;
        }

        // アイドル状態、または現在のタスクが無効になった場合、次にやるべき未着手タスクを探す
        for (const mode of MODE_PRIORITY_ORDER) {
            if (mode === 'MINING' && this.modeManager.isMiningMode()) {
                const task = this.taskManager.findNextPendingMiningTask();
                if (task) return task;
            }
            if (mode === 'FOLLOW' && this.modeManager.isFollowMode() && this.modeManager.getFollowTarget()) {
                return this.createAction('follow', { targetPlayer: this.modeManager.getFollowTarget() });
            }
            if (mode === 'GENERAL') {
                const task = this.taskManager.findNextPendingGeneralTask();
                if (task) return task;
            }
        }

        return null; // 何もすることがない
    }

    private startTask(task: Task): void {
        if (!task.taskId.startsWith('planner-')) {
            this.taskManager.setTaskStatus(task.taskId, 'running');
        }
        this.behaviorEngine.executeTask(task);
    }

    // ========== ヘルパーメソッド群 ==========

    private findHighPriorityPendingTask(currentPriority: number): Task | null {
        const nextMiningTask = this.taskManager.findNextPendingMiningTask();
        if (nextMiningTask && nextMiningTask.priority < currentPriority) {
            return nextMiningTask;
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
