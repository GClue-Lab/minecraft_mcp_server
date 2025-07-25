// src/services/BehaviorEngine.ts (修正版)

import * as mineflayer from 'mineflayer';
import { WorldKnowledge, WorldEntity } from './WorldKnowledge';
import { FollowPlayerBehavior, FollowPlayerOptions } from '../behaviors/followPlayer'; // 追加
import { Vec3 } from 'vec3';

// 行動の種類を定義
export type BehaviorName = 'followPlayer' | 'idle' | 'combat'; // 必要に応じて追加

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
    private activeBehavior: { [key in BehaviorName]?: FollowPlayerBehavior /* | OtherBehaviorClasses */ } = {}; // アクティブな行動インスタンスを保持
    private currentBehaviorName: BehaviorName | null = null; // 現在アクティブな行動の名前

    constructor(bot: mineflayer.Bot, worldKnowledge: WorldKnowledge) {
        this.bot = bot;
        this.worldKnowledge = worldKnowledge;
        console.log('BehaviorEngine initialized.');
    }

    /**
     * 現在実行中の行動の名前と状態を取得します。
     */
    public getCurrentBehavior(): CurrentBehavior | null {
        if (this.currentBehaviorName && this.activeBehavior[this.currentBehaviorName]?.isRunning()) {
            // ここで、実行中の行動の具体的なオプションなども含めると、より詳細な状態を返せる
            return {
                name: this.currentBehaviorName,
                isActive: true,
                // ... (optionsをBehaviorBaseのような共通インターフェースで持つ場合に追加)
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
    public startBehavior(behaviorName: BehaviorName, options?: any): boolean {
        // 現在の行動を停止
        this.stopCurrentBehavior();

        console.log(`Starting behavior: ${behaviorName} with options:`, options);
        this.currentBehaviorName = behaviorName; // 新しい行動を設定

        let behaviorStarted = false;

        switch (behaviorName) {
            case 'followPlayer':
                // FollowPlayerBehaviorのインスタンスを作成し、開始
                if (options && typeof options.targetPlayer === 'string') {
                    const followBehavior = new FollowPlayerBehavior(this.bot, this.worldKnowledge, options as FollowPlayerOptions);
                    behaviorStarted = followBehavior.start();
                    if (behaviorStarted) {
                        this.activeBehavior.followPlayer = followBehavior;
                    }
                } else {
                    console.error('FollowPlayer behavior requires a targetPlayer option (string).');
                }
                break;
            case 'idle':
                // アイドル行動はシンプルにここで直接制御（または専用のIdleBehaviorクラスを作成）
                console.log('Bot is now idle.');
                this.bot.clearControlStates();
                this.worldKnowledge.stopPathfinding();
                behaviorStarted = true;
                break;
            case 'combat':
                console.warn('Combat behavior not yet fully implemented.');
                // ここでCombatBehaviorのインスタンスを作成し、開始
                behaviorStarted = false; // 仮
                break;
            default:
                console.error(`Unknown behavior: ${behaviorName}`);
                break;
        }

        if (!behaviorStarted) {
            this.currentBehaviorName = null; // 開始失敗時は現在の行動をリセット
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

        // 各行動のstopメソッドを呼び出す
        switch (this.currentBehaviorName) {
            case 'followPlayer':
                this.activeBehavior.followPlayer?.stop();
                break;
            case 'idle':
                // アイドル行動の停止ロジック（もしあれば）
                break;
            case 'combat':
                // 戦闘行動の停止ロジック
                break;
        }

        this.currentBehaviorName = null;
        this.bot.clearControlStates();
        this.worldKnowledge.stopPathfinding();
    }

    // 他のBehaviorEngineのヘルパーメソッドは必要に応じて追加
}
