// src/services/CommandHandler.ts (最終修正版)

import { BotManager } from './BotManager';
import { WorldKnowledge } from './WorldKnowledge';
import { BehaviorEngine } from './BehaviorEngine';
import { TaskManager } from './TaskManager';

/**
 * AIからのツール呼び出し(Tool Call)を受け取り、
 * 適切なマネージャークラスに処理を振り分ける。
 */
export class CommandHandler {
    private botManager: BotManager;
    private worldKnowledge: WorldKnowledge | null = null;
    private behaviorEngine: BehaviorEngine | null = null;
    private taskManager: TaskManager | null = null;

    // コンストラクタを簡略化。初期段階ではTaskManagerは未設定。
    constructor(botManager: BotManager, taskManager: TaskManager | null) {
        this.botManager = botManager;
        this.taskManager = taskManager;
    }

    /**
     * ボットのspawn後に、依存する全てのインスタンスを設定する。
     * @param worldKnowledge
     * @param behaviorEngine
     * @param taskManager
     */
    public setDependencies(
        worldKnowledge: WorldKnowledge,
        behaviorEngine: BehaviorEngine,
        taskManager: TaskManager
    ): void {
        this.worldKnowledge = worldKnowledge;
        this.behaviorEngine = behaviorEngine;
        this.taskManager = taskManager;
        console.log('CommandHandler dependencies have been set.');
    }

    /**
     * ボットがコマンドを処理できる状態かを確認する。
     * @returns 準備ができていればtrue
     */
    public isReady(): boolean {
        return !!this.worldKnowledge && !!this.behaviorEngine && !!this.taskManager;
    }

    // デバッグや他のクラスからの参照用にゲッターを用意
    public getWorldKnowledge(): WorldKnowledge | null { return this.worldKnowledge; }
    public getBehaviorEngine(): BehaviorEngine | null { return this.behaviorEngine; }

    /**
     * AIからのツール呼び出しを処理するメインメソッド。
     * @param toolName 呼び出されたツール名
     * @param args ツールに渡された引数
     * @returns 処理結果
     */
    public async handleToolCall(toolName: string, args: any): Promise<any> {
        if (!this.isReady() || !this.taskManager) {
            throw new Error("Bot is not fully ready or connected.");
        }
        
        switch (toolName) {
            case 'add_task':
                if (!args.taskType || !args.arguments) {
                    throw new Error("add_task requires 'taskType' and 'arguments'.");
                }
                const taskId = this.taskManager.addTask(args.taskType, args.arguments, args.priority);
                return `Task ${args.taskType} added to queue with ID: ${taskId}`;

            case 'cancel_task':
                if (!args.taskId) {
                    throw new Error("cancel_task requires 'taskId'.");
                }
                const success = this.taskManager.cancelTask(args.taskId);
                return success ? `Task ${args.taskId} cancelled.` : `Task ${args.taskId} not found or could not be cancelled.`;

            // mcpApi.tsからの古い 'stop' コマンドを処理するための内部的なケース
            case 'stop_current_task':
                const stopped = this.taskManager.cancelActiveTask();
                return stopped ? "Current task has been stopped." : "There was no active task to stop.";

            case 'get_task_queue':
                return this.taskManager.getTaskQueueStatus();
            
            case 'get_full_status':
                // TODO: StatusManagerを実装後に、そこから情報を取得する
                const bot = this.botManager.getBot();
                if (!bot) return { message: "Bot not available."};
                return {
                    message: "Current bot status (minimal). Full status requires StatusManager.",
                    position: bot.entity.position,
                    health: bot.health,
                    food: bot.food,
                    active_task: this.taskManager.getTaskQueueStatus().activeTask
                };

            default:
                throw new Error(`Unknown tool name received: ${toolName}`);
        }
    }
}
