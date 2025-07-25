// src/services/BehaviorEngine.ts (修正版 - 死亡/リスポーン時の行動停止)

import * as mineflayer from 'mineflayer';
import { WorldKnowledge, WorldEntity } from './WorldKnowledge';
import { FollowPlayerBehavior, FollowPlayerOptions } from '../behaviors/followPlayer';
import { MineBlockBehavior, MineBlockOptions } from '../behaviors/mineBlock';
import { Vec3 } from 'vec3';
import { BotManager } from './BotManager'; // BotManagerをインポート

// 行動の種類を定義
export type BehaviorName = 'followPlayer' | 'idle' | 'combat' | 'mineBlock';

/**
 * すべての行動クラスが実装すべき共通インターフェース
 * これにより、BehaviorEngineは型安全に行動を管理できる
 */
interface BehaviorInstance {
    start(): Promise<boolean> | boolean; // startメソッドはPromiseを返す可能性も考慮
    stop(): void;
    isRunning(): boolean;
}

/**
 * 現在実行中の行動の状態
 */
export interface CurrentBehavior {
    name: BehaviorName;
    target?: string | number | Vec3; // ターゲット（プレイヤー名、エンティティID、座標など）
    isActive: boolean;
    // 必要に応じて、行動固有のパラメータを追加
}

/**
 * ボットの高レベルな行動を管理するクラス
 */
export class BehaviorEngine {
    private bot: mineflayer.Bot;
    private worldKnowledge: WorldKnowledge;
    private activeBehaviorInstances: { [key in BehaviorName]?: BehaviorInstance } = {};
    private currentBehaviorName: BehaviorName | null = null; // 現在アクティブな行動の名前

    constructor(bot: mineflayer.Bot, worldKnowledge: WorldKnowledge) {
        this.bot = bot;
        this.worldKnowledge = worldKnowledge;
        console.log('BehaviorEngine initialized.');
    }

    /**
     * BotManagerからのイベントを購読するためのメソッド
     * main.ts からボットインスタンスが生成された後に呼び出されることを想定
     */
    public setupBotEvents(botManager: BotManager): void {
        botManager.getBotInstanceEventEmitter().on('death', () => {
            console.warn('BehaviorEngine: Bot died! Stopping current behavior.');
            this.stopCurrentBehavior(); // 死亡時に現在の行動を強制停止
            // LLMへの通知など、追加の死亡時処理をここに記述
        });

        botManager.getBotInstanceEventEmitter().on('respawn', () => {
            console.log('BehaviorEngine: Bot respawned! Setting to idle behavior.');
            this.startBehavior('idle'); // リスポーン後にアイドル行動を開始
            // 必要に応じて、以前の行動を再開するかどうかを判断するロジックを記述
        });
    }


    /**
     * 現在実行中の行動の名前と状態を取得します。
     */
    public getCurrentBehavior(): CurrentBehavior | null {
        if (this.currentBehaviorName && this.activeBehaviorInstances[this.currentBehaviorName]?.isRunning()) {
            return {
                name: this.currentBehaviorName,
                isActive: true,
            };
        }
        return null;
    }

    /**
     * 特定の行動を開始します。
     * @param behaviorName 開始する行動の名前
     * @param options 行動に渡すオプション
     * @returns 行動が正常に開始されたかどうか
     */
    public async startBehavior(behaviorName: BehaviorName, options?: any): Promise<boolean> {
        // 現在の行動を停止
        this.stopCurrentBehavior();

        console.log(`Starting behavior: ${behaviorName} with options:`, options);
        this.currentBehaviorName = behaviorName; // 新しい行動を設定

        let behaviorStarted = false;
        let behaviorInstance: BehaviorInstance | undefined;

        switch (behaviorName) {
            case 'followPlayer':
                if (options && typeof options.targetPlayer === 'string') {
                    behaviorInstance = new FollowPlayerBehavior(this.bot, this.worldKnowledge, options as FollowPlayerOptions);
                    behaviorStarted = await Promise.resolve(behaviorInstance.start());
                } else {
                    console.error('FollowPlayer behavior requires a targetPlayer option (string).');
                }
                break;
            case 'mineBlock':
                if ((options && (options.blockId || options.blockName))) {
                    behaviorInstance = new MineBlockBehavior(this.bot, this.worldKnowledge, options as MineBlockOptions);
                    behaviorStarted = await Promise.resolve(behaviorInstance.start());
                } else {
                    console.error('MineBlock behavior requires either blockId or blockName option.');
                }
                break;
            case 'idle':
                console.log('Bot is now idle.');
                this.bot.clearControlStates();
                this.worldKnowledge.stopPathfinding();
                behaviorStarted = true;
                break;
            case 'combat':
                console.warn('Combat behavior not yet fully implemented.');
                behaviorStarted = false; // 仮
                break;
            default:
                console.error(`Unknown behavior: ${behaviorName}`);
                break;
        }

        if (behaviorStarted && behaviorInstance) {
            this.activeBehaviorInstances[behaviorName] = behaviorInstance;
        } else {
            this.currentBehaviorName = null; // 開始失敗時は現在の行動をリセット
            return false;
        }
        return behaviorStarted;
    }

    /**
     * 現在実行中の行動を停止します。
     */
    public stopCurrentBehavior(): void {
        if (!this.currentBehaviorName) {
            console.log('No active behavior to stop.');
            return;
        }

        console.log(`Stopping current behavior: ${this.currentBehaviorName}`);

        const activeInstance = this.activeBehaviorInstances[this.currentBehaviorName];
        if (activeInstance) {
            activeInstance.stop(); // 行動インスタンスの停止メソッドを呼び出す
            delete this.activeBehaviorInstances[this.currentBehaviorName]; // インスタンスを削除
        }

        this.currentBehaviorName = null;
        this.bot.clearControlStates();
        this.worldKnowledge.stopPathfinding();
    }
}
