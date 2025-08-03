// src/services/BotManager.ts (修正後)

//import * as mineflayer from 'mineflayer';
import { EventEmitter } from 'events';
//import * as pf from 'mineflayer-pathfinder';
import mineflayer from 'mineflayer';
import { pathfinder, Movements } from 'mineflayer-pathfinder';

// 1) 参照しているパスを確認
console.log('[RESOLVE] mineflayer:', require.resolve('mineflayer'));
console.log('[RESOLVE] pathfinder:', require.resolve('mineflayer-pathfinder'));
console.log('[BotManager] typeof pathfinder:', typeof pathfinder);

// 2) エクスポート内容を確認（CJS / ESM 両方）
try {
  const cjs = require('mineflayer-pathfinder');
  console.log('[EXPORTS CJS] keys:', Object.keys(cjs));
} catch (e) {
  console.log('[EXPORTS CJS] failed:', e);
}

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
                version: '1.21.4',
            });


            try {
                this.bot.loadPlugin(pathfinder);
                console.log('[BotManager] loadPlugin(pathfinder) called');
            } catch (e) {
                console.error('[BotManager] loadPlugin threw:', e);
            }

            console.log('[BotManager] after  load pathfinder:', !!(this.bot as any).pathfinder);

            this.bot.loadPlugin(pathfinder);
            console.log('[BotManager] pathfinder plugin loaded?', !!(this.bot as any).pathfinder);

            // B) まだ false なら、直接呼ぶ
            if (!(this.bot as any).pathfinder) {
                try {
                    (pathfinder as any)(this.bot); // 直接呼び出し
                    console.log('[direct call] pathfinder:', !!(this.bot as any).pathfinder);
                } catch (e) {
                    console.error('[direct call] error:', e);
                }
            }

            process.nextTick(() => {
                console.log('[BotManager] after  load (nextTick):', !!(this.bot as any).pathfinder);
            });

            this.setupBotListeners();

            await new Promise<void>((resolve, reject) => {
                if (!this.bot) return reject(new Error("Bot not initialized"));

                this.bot.once('spawn', () => {
                    const defaultMove = new Movements(this.bot as mineflayer.Bot);
                    (this.bot as any).pathfinder.setMovements(defaultMove);
                    console.log('[BotManager] movements set?', !!(this.bot as any).pathfinder?.movements);

                    this.setStatus('connected');
                    this.botInstanceEventEmitter.emit('pathfinder-ready', this.bot);
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
            }
        });

        // ★★★★★★★★★★★★★★★★★★★★★★★★★★★★★★★★★★★★★★★★
        // ★ 修正: 'death'イベントを捕捉し、リスポーン処理を呼び出す ★
        // ★★★★★★★★★★★★★★★★★★★★★★★★★★★★★★★★★★★★★★★★
        this.bot.on('death', () => {
            this.botInstanceEventEmitter.emit('death');
            console.log(`${this.username} has died. Respawning in 5 seconds...`);
            setTimeout(() => {
                if (this.bot) {
                    this.bot.respawn();
                }
            }, 5000); // 5秒待ってからリスポーン
        });
        
        this.bot.on('respawn', () => {
            console.log(`${this.username} has respawned.`);
            // リスポーン後、再度'spawn'イベントが発火するので、
            // Botの準備が整ったことをシステムに通知する処理は'spawn'リスナーに集約される
            this.botInstanceEventEmitter.emit('respawn');
        });
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
