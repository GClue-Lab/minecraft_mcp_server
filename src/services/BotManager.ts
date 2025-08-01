// src/services/BotManager.ts (Pathfinder修正版)

import * as mineflayer from 'mineflayer';
import { EventEmitter } from 'events';
import { pathfinder, Movements } from 'mineflayer-pathfinder';

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
        console.log(`BotManager initialized for ${username}@${host}:${port}`);
    }

    public getStatus(): BotStatus {
        return this.status;
    }

    public getBot(): mineflayer.Bot | null {
        return this.bot;
    }

    public getBotInstanceEventEmitter(): EventEmitter {
        return this.botInstanceEventEmitter;
    }

    public async connect(): Promise<void> {
        if (this.status === 'connecting' || this.status === 'connected') {
            console.warn('Bot is already connecting or connected.');
            return;
        }

        this.setStatus('connecting');
        console.log(`Attempting to connect bot ${this.username} to ${this.host}:${this.port}...`);

        try {
            this.bot = mineflayer.createBot({
                host: this.host,
                port: this.port,
                username: this.username,
            });

            this.bot.loadPlugin(pathfinder);

            this.setupBotListeners();

            await new Promise<void>((resolve, reject) => {
                if (!this.bot) return reject(new Error("Bot not initialized"));

                this.bot.once('spawn', () => {
                    // ★ここを修正: Movementsのコンストラクタ引数をbotのみにする
                    // @ts-ignore
                    const defaultMove = new Movements(this.bot);
                    // @ts-ignore
                    this.bot.pathfinder.setMovements(defaultMove);

                    this.setStatus('connected');
                    console.log(`Bot ${this.username} connected and spawned!`);
                    this.botInstanceEventEmitter.emit('spawn', this.bot);
                    resolve();
                });

                this.bot.once('error', (err) => {
                    this.setStatus('error');
                    this.cleanupBot();
                    reject(err);
                });
                this.bot.once('end', (reason) => {
                    this.setStatus('disconnected');
                    this.cleanupBot();
                    reject(new Error(`Connection ended: ${reason}`));
                });
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

        this.bot.on('end', (reason) => {
            console.warn(`Bot disconnected! Reason: ${reason}`);
            this.setStatus('disconnected');
            this.cleanupBot();
            this.scheduleReconnect();
        });

        this.bot.on('kicked', (reason) => {
            console.error(`Bot kicked from server! Reason: ${reason}`);
        });

        this.bot.on('error', (err) => {
            console.error(`Bot error: ${err.message}`);
            this.setStatus('error');
            this.bot?.end('Error occurred');
        });

        this.bot.on('spawn', () => {
            if (this.status !== 'connected') {
                this.setStatus('connected');
                if (this.reconnectTimeout) {
                    clearTimeout(this.reconnectTimeout);
                    this.reconnectTimeout = null;
                }
                this.botInstanceEventEmitter.emit('spawn', this.bot);
            }
        });

        this.bot.on('death', () => {
            this.botInstanceEventEmitter.emit('death');
        });

        this.bot.on('respawn', () => {
            this.botInstanceEventEmitter.emit('respawn');
        });
    }

    private cleanupBot(): void {
        if (this.bot) {
            this.bot.removeAllListeners();
            this.bot = null;
        }
        if (this.reconnectTimeout) {
            clearTimeout(this.reconnectTimeout);
            this.reconnectTimeout = null;
        }
    }

    private scheduleReconnect(): void {
        if (this.reconnectTimeout) {
            return;
        }
        this.setStatus('reconnecting');
        this.reconnectTimeout = setTimeout(async () => {
            try {
                await this.connect();
            } catch (error) {
                this.scheduleReconnect();
            }
        }, this.RECONNECT_DELAY_MS);
    }

    private setStatus(newStatus: BotStatus): void {
        if (this.status !== newStatus) {
            this.status = newStatus;
        }
    }
}
