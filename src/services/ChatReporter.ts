// src/services/ChatReporter.ts (修正後)

import * as mineflayer from 'mineflayer';
import { BotManager } from './BotManager';
import { Task } from '../types/mcp';

/**
 * ボットの状況をゲーム内チャットに報告する責務を持つクラス。
 */
export class ChatReporter {
    private bot: mineflayer.Bot | null = null;

    constructor(botManager: BotManager) {
        botManager.getBotInstanceEventEmitter().on('spawn', (bot: mineflayer.Bot) => {
            this.bot = bot;
            this.setupHealthListener();
        });
    }

    private chat(message: string): void {
        if (this.bot) {
            this.bot.chat(message);
        }
    }

    // ★★★★★★★★★★ ここにメソッドを追加 ★★★★★★★★★★
    /**
     * エラーメッセージをチャットに報告する
     * @param errorMessage 報告するエラーの内容
     */
    public reportError(errorMessage: string): void {
        this.chat(`[ERROR] ${errorMessage}`);
    }
    // ★★★★★★★★★★★★★★★★★★★★★★★★★★★★★★

    public reportTaskStart(task: Task): void {
        let detail = '';
        if (task.type === 'mine') {
            detail = `(${task.arguments.blockName} x${task.arguments.quantity})`;
        } else if (task.type === 'follow') {
            detail = `(Target: ${task.arguments.targetPlayer})`;
        }
        this.chat(`Task Start: ${task.type} ${detail}`);
    }

    public reportTaskEnd(task: Task, result: string): void {
        this.chat(`Task End: ${task.type}. Result: ${result}`);
    }

    public reportModeChange(modeName: 'Combat' | 'Follow' | 'Mining', status: boolean, target?: string | null): void {
        const statusText = status ? 'ON' : 'OFF';
        let detail = '';
        if (modeName === 'Follow' && status && target) {
            detail = ` (Target: ${target})`;
        }
        this.chat(`Mode Change: ${modeName} is now ${statusText}${detail}.`);
    }

    public reportHealthWarning(health: number, food: number): void {
        if (health < 10) {
            this.chat(`[WARNING] Health is low! (${health}/20)`);
        }
        if (food < 10) {
            this.chat(`[WARNING] I'm hungry! (${food}/20)`);
        }
    }

    private setupHealthListener(): void {
        if (this.bot) {
            this.bot.on('health', () => {
                if(this.bot) {
                    this.reportHealthWarning(this.bot.health, this.bot.food);
                }
            });
        }
    }
}
