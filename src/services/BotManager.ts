// src/services/BotManager.ts (Pathfinder削除版)

import * as mineflayer from 'mineflayer';
import { EventEmitter } from 'events';
// pathfinderのインポートを削除

export type BotStatus = 'disconnected' | 'connecting' | 'connected' | 'reconnecting' | 'error';

export class BotManager {
    private bot: mineflayer.Bot | null = null;
    private status: BotStatus = 'disconnected';
    private reconnectTimeout: NodeJS.Timeout | null = null;
    private readonly RECONNECT_DELAY_MS = 5000;
    private botInstanceEventEmitter: EventEmitter;

    constructor(
        private username: string,
        private host: string,
        private port: number
    ) {
        this.botInstanceEventEmitter = new EventEmitter();
    }

    public getStatus(): BotStatus { return this.status; }
    public getBot(): mineflayer.Bot | null { return this.bot; }
    public getBotInstanceEventEmitter(): EventEmitter { return this.botInstanceEventEmitter; }

    public async connect(): Promise<void> {
        if (this.status === 'connecting' || this.status === 'connected') return;
        this.setStatus('connecting');

        try {
            this.bot = mineflayer.createBot({
                host: this.host,
                port: this.port,
                username: this.username,
            });

            // ★ここを修正: Pathfinderプラグインの読み込みをすべて削除
            // this.bot.loadPlugin(pathfinder); 

            this.setupBotListeners();

            await new Promise<void>((resolve, reject) => {
                if (!this.bot) return reject(new Error("Bot not initialized"));

                this.bot.once('spawn', () => {
                    // ★ここを修正: Pathfinderの移動設定もすべて削除
                    this.setStatus('connected');
                    this.botInstanceEventEmitter.emit('spawn', this.bot);
                    resolve();
                });

                this.bot.once('error', (err) => { this.setStatus('error'); this.cleanupBot(); reject(err); });
                this.bot.once('end', (reason) => { this.setStatus('disconnected'); this.cleanupBot(); reject(new Error(`Connection ended: ${reason}`)); });
            });

        } catch (error) {
            this.setStatus('error');
            this.scheduleReconnect();
            throw error;
        }
    }

    public disconnect(): void {
        if (this.bot && this.status === 'connected') {
            this.bot.end('Manual disconnect');
            this.cleanupBot();
            this.setStatus('disconnected');
        }
    }

    private setupBotListeners(): void {
        if (!this.bot) return;
        this.bot.on('end', (reason) => { this.setStatus('disconnected'); this.cleanupBot(); this.scheduleReconnect(); });
        this.bot.on('kicked', (reason) => { console.error(`Bot kicked: ${reason}`); });
        this.bot.on('error', (err) => { this.setStatus('error'); this.bot?.end('Error occurred'); });
        this.bot.on('spawn', () => {
            if (this.status !== 'connected') {
                this.setStatus('connected');
                if (this.reconnectTimeout) { clearTimeout(this.reconnectTimeout); this.reconnectTimeout = null; }
                this.botInstanceEventEmitter.emit('spawn', this.bot);
            }
        });
        this.bot.on('death', () => { this.botInstanceEventEmitter.emit('death'); });
        this.bot.on('respawn', () => { this.botInstanceEventEmitter.emit('respawn'); });
    }

    private cleanupBot(): void {
        if (this.bot) { this.bot.removeAllListeners(); this.bot = null; }
        if (this.reconnectTimeout) { clearTimeout(this.reconnectTimeout); this.reconnectTimeout = null; }
    }

    private scheduleReconnect(): void {
        if (this.reconnectTimeout) return;
        this.setStatus('reconnecting');
        this.reconnectTimeout = setTimeout(async () => {
            try { await this.connect(); } catch (error) { this.scheduleReconnect(); }
        }, this.RECONNECT_DELAY_MS);
    }

    private setStatus(newStatus: BotStatus): void {
        if (this.status !== newStatus) { this.status = newStatus; }
    }
}
