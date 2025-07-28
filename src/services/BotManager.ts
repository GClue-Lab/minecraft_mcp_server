// src/services/BotManager.ts v1.2

import * as mineflayer from 'mineflayer';
import { EventEmitter } from 'events';

/**
 * ボットの現在の状態を表す型
 */
export type BotStatus = 'disconnected' | 'connecting' | 'connected' | 'reconnecting' | 'error';

/**
 * Mineflayerボットのライフサイクルを管理するクラス
 */
export class BotManager {
    private bot: mineflayer.Bot | null = null;
    private status: BotStatus = 'disconnected';
    private reconnectTimeout: NodeJS.Timeout | null = null;
    private readonly RECONNECT_DELAY_MS = 5000; // 5秒後に再接続を試みる
    private botInstanceEventEmitter: EventEmitter; // 追加: ボットインスタンスのイベントを通知

    constructor(
        private username: string,
        private host: string,
        private port: number
    ) {
        this.botInstanceEventEmitter = new EventEmitter(); // 初期化
        console.log(`BotManager initialized for ${username}@${host}:${port}`);
    }

    /**
     * ボットの現在の状態を取得します。
     * @returns ボットの状態
     */
    public getStatus(): BotStatus {
        return this.status;
    }

    /**
     * Mineflayerボットのインスタンスを取得します。
     * @returns Mineflayer Botインスタンス、またはnull
     */
    public getBot(): mineflayer.Bot | null {
        return this.bot;
    }

    /**
     * ボットインスタンスに関するイベントを購読するためのEventEmitterを取得します。
     * 'spawn' イベントでボットインスタンスを渡します。
     */
    public getBotInstanceEventEmitter(): EventEmitter {
        return this.botInstanceEventEmitter;
    }

    /**
     * Minecraftサーバーにボットを接続します。
     */
    public async connect(): Promise<void> {
        if (this.status === 'connecting' || this.status === 'connected') {
            console.warn('Bot is already connecting or connected. Skipping new connection attempt.');
            return;
        }

        this.setStatus('connecting');
        console.log(`Attempting to connect bot ${this.username} to ${this.host}:${this.port}...`);

        try {
            this.bot = mineflayer.createBot({
                host: this.host,
                port: this.port,
                username: this.username,
                // version: '1.18.2' // 特定のバージョンを指定する場合
            });

            this.setupBotListeners();

            await new Promise<void>((resolve, reject) => {
                if (!this.bot) return reject(new Error("Bot not initialized"));
                this.bot.once('spawn', () => {
                    this.setStatus('connected');
                    console.log(`Bot ${this.username} connected and spawned!`);
                    this.botInstanceEventEmitter.emit('spawn', this.bot); // 'spawn'イベントを発行
                    resolve();
                });
                this.bot.once('error', (err) => {
                    console.error(`Connection error during initial connect: ${err.message}`);
                    this.setStatus('error');
                    this.cleanupBot(); // エラー時はボットをクリーンアップ
                    reject(err);
                });
                this.bot.once('end', (reason) => {
                    console.warn(`Connection ended during initial connect: ${reason}`);
                    this.setStatus('disconnected');
                    this.cleanupBot(); // 終了時はボットをクリーンアップ
                    reject(new Error(`Connection ended: ${reason}`));
                });
            });

        } catch (error) {
            console.error(`Failed to create bot instance: ${error}`);
            this.setStatus('error');
            this.scheduleReconnect(); // インスタンス作成失敗時も再接続を試みる
            throw error;
        }
    }

    /**
     * ボットを切断します。
     */
    public disconnect(): void {
        if (this.bot && this.status === 'connected') {
            console.log(`Disconnecting bot ${this.username}...`);
            this.bot.end('Manual disconnect');
            this.cleanupBot();
            this.setStatus('disconnected');
        } else {
            console.log('Bot is not connected or already disconnected.');
        }
    }

    /**
     * ボットのイベントリスナーを設定します。
     * これにより、通信遮断やエラーを検出し、自動再接続を試みます。
     */
    private setupBotListeners(): void {
        if (!this.bot) return;

        this.bot.on('end', (reason) => {
            console.warn(`Bot disconnected! Reason: ${reason}`);
            this.setStatus('disconnected');
            this.cleanupBot(); // 'end' イベントで必ずクリーンアップ
            this.scheduleReconnect();
        });

        this.bot.on('kicked', (reason) => {
            console.error(`Bot kicked from server! Reason: ${reason}`);
            // 'kicked'は'end'も発火するので、重複した再接続スケジューリングを防ぐため、
            // 'end'イベントのハンドラに任せるか、ここで明示的に再接続を防ぐ
            // 今回は'end'ハンドラに任せる
        });

        this.bot.on('error', (err) => {
            console.error(`Bot error: ${err.message}`);
            this.setStatus('error');
            this.bot?.end('Error occurred'); // 強制的に切断し、endイベントをトリガー
        });

        this.bot.on('spawn', () => {
            if (this.status !== 'connected') {
                this.setStatus('connected');
                console.log(`Bot ${this.username} re-spawned and reconnected!`);
                if (this.reconnectTimeout) {
                    clearTimeout(this.reconnectTimeout);
                    this.reconnectTimeout = null;
                }
                this.botInstanceEventEmitter.emit('spawn', this.bot);
            }
        });

        // --- ボットの死亡/リスポーンイベントを追加 ---
        this.bot.on('death', () => {
            console.log('Bot died!');
            this.botInstanceEventEmitter.emit('death'); // 死亡イベントを通知
        });

        this.bot.on('respawn', () => {
            console.log('Bot respawned!');
            this.botInstanceEventEmitter.emit('respawn'); // リスポーンイベントを通知
        });
        // --- End ボットの死亡/リスポーンイベント ---

        // --- ここを修正: mineflayer-pathfinder 関連イベントリスナーを削除 ---
        // Pathfinderを使用しないため、これらのイベントは発火しない
        // this.bot.once('goal_reached', onGoalReached);
        // this.bot.once('goal_cant_be_reached', onGoalCantBeReached);
        // this.bot.once('goal_timeout', onGoalTimeout);
        // --- 修正終わり ---
    }

    private cleanupBot(): void {
        if (this.bot) {
            this.bot.removeAllListeners();
            this.bot = null; // ボットインスタンスをnullにする
        }
        if (this.reconnectTimeout) {
            clearTimeout(this.reconnectTimeout);
            this.reconnectTimeout = null;
        }
    }

    private scheduleReconnect(): void {
        if (this.reconnectTimeout) {
            console.warn('Reconnect already scheduled.');
            return;
        }

        console.log(`Scheduling reconnect in ${this.RECONNECT_DELAY_MS / 1000} seconds...`);
        this.setStatus('reconnecting');
        this.reconnectTimeout = setTimeout(async () => {
            console.log('Attempting to reconnect...');
            try {
                await this.connect();
            } catch (error) {
                console.error(`Reconnect failed: ${error}`);
                this.scheduleReconnect();
            }
        }, this.RECONNECT_DELAY_MS);
    }

    private setStatus(newStatus: BotStatus): void {
        if (this.status !== newStatus) {
            console.log(`Bot Status changed: ${this.status} -> ${newStatus}`);
            this.status = newStatus;
        }
    }
}
