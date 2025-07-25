// src/services/BehaviorEngine.ts

import * as mineflayer from 'mineflayer';
import { WorldKnowledge, WorldEntity } from './WorldKnowledge';
import { goals } from 'mineflayer-pathfinder';
import { Vec3 } from 'vec3'; // Mineflayerで使われるベクトル型

// 行動の種類を定義（'followPlayer'など）
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
    private currentBehavior: CurrentBehavior | null = null;
    private behaviorInterval: NodeJS.Timeout | null = null; // 行動を継続するためのインターバル

    constructor(bot: mineflayer.Bot, worldKnowledge: WorldKnowledge) {
        this.bot = bot;
        this.worldKnowledge = worldKnowledge;
        console.log('BehaviorEngine initialized.');
    }

    /**
     * 現在実行中の行動を取得します。
     */
    public getCurrentBehavior(): CurrentBehavior | null {
        return this.currentBehavior;
    }

    /**
     * 特定の行動を開始します。
     * @param behaviorName 開始する行動の名前
     * @param options 行動に渡すオプション（ターゲットなど）
     * @returns 行動が正常に開始されたかどうか
     */
    public startBehavior(behaviorName: BehaviorName, options?: { targetPlayer?: string; targetEntityId?: number; targetPos?: Vec3 }): boolean {
        // 現在の行動を停止
        this.stopCurrentBehavior();

        console.log(`Starting behavior: ${behaviorName} with options:`, options);
        this.currentBehavior = { name: behaviorName, isActive: true };

        switch (behaviorName) {
            case 'followPlayer':
                if (options?.targetPlayer) {
                    this.currentBehavior.target = options.targetPlayer;
                    this.startFollowPlayer(options.targetPlayer);
                } else {
                    console.error('FollowPlayer behavior requires a targetPlayer option.');
                    this.currentBehavior = null;
                    return false;
                }
                break;
            case 'idle':
                this.startIdleBehavior();
                break;
            case 'combat':
                // 戦闘ロジックを開始（ターゲットが必要ならオプションで渡す）
                console.warn('Combat behavior not yet fully implemented.');
                break;
            default:
                console.error(`Unknown behavior: ${behaviorName}`);
                this.currentBehavior = null;
                return false;
        }
        return true;
    }

    /**
     * 現在実行中の行動を停止します。
     */
    public stopCurrentBehavior(): void {
        if (!this.currentBehavior || !this.currentBehavior.isActive) {
            console.log('No active behavior to stop.');
            return;
        }

        console.log(`Stopping behavior: ${this.currentBehavior.name}`);
        // 経路探索を停止
        this.worldKnowledge.stopPathfinding();
        // ボットの制御状態をリセット
        this.bot.clearControlStates();

        if (this.behaviorInterval) {
            clearInterval(this.behaviorInterval);
            this.behaviorInterval = null;
        }

        this.currentBehavior = null;
    }

    /**
     * 'followPlayer' 行動の具体的な実装
     * @param targetPlayerName 追従するプレイヤーの名前
     */
    private startFollowPlayer(targetPlayerName: string): void {
        const bot = this.bot;
        const worldKnowledge = this.worldKnowledge;
        const self = this; // BehaviorEngineインスタンスへの参照

        // 追従ロジックを定期的に実行
        this.behaviorInterval = setInterval(async () => {
            if (!self.currentBehavior || self.currentBehavior.name !== 'followPlayer' || !self.currentBehavior.isActive) {
                // インターバルが停止されたか、行動が変わった場合は終了
                clearInterval(self.behaviorInterval!);
                self.behaviorInterval = null;
                return;
            }

            const targetPlayer = worldKnowledge.getPlayer(targetPlayerName);

            if (!targetPlayer || !targetPlayer.position) {
                console.warn(`Target player ${targetPlayerName} not found or has no position. Stopping follow.`);
                self.stopCurrentBehavior();
                return;
            }

            const botPosition = bot.entity.position;
            const distance = botPosition.distanceTo(targetPlayer.position);

            if (distance < 3) { // プレイヤーに十分近い場合
                bot.clearControlStates();
                bot.pathfinder.stop(); // 経路探索を停止
                // console.log(`Bot is close to ${targetPlayerName}. Staying put.`);
                // プレイヤーの方向を向く
                bot.lookAt(targetPlayer.position.offset(0, targetPlayer.health ? targetPlayer.health/2 : 1.6, 0), true);
            } else {
                // プレイヤーが遠い場合、経路を計算して移動
                // GoalNear を使用して目標地点を設定
                const goal = new goals.GoalNear(targetPlayer.position.x, targetPlayer.position.y, targetPlayer.position.z, 2); // 2ブロック以内を目標とする
                bot.pathfinder.setGoal(goal);
                // console.log(`Bot pathfinding to ${targetPlayerName} at ${targetPlayer.position}, distance: ${distance.toFixed(2)}`);
            }
            // 戦闘の判断など、他の行動への切り替えロジックもここに組み込める
            // 例: 近くに敵性Mobがいたら戦闘行動に切り替える
            // if (worldKnowledge.findNearestEnemy(bot.entity.position, 10)) {
            //     self.startBehavior('combat');
            // }

        }, 500); // 0.5秒ごとに追従ロジックを実行
    }

    /**
     * 'idle' 行動の具体的な実装（何もしない、またはランダムな動き）
     */
    private startIdleBehavior(): void {
        console.log('Bot is now idle.');
        this.bot.clearControlStates();
        this.worldKnowledge.stopPathfinding();

        // 開発用のダミー: 一定時間ごとにランダムなチャットをするなど
        // this.behaviorInterval = setInterval(() => {
        //     const messages = ["I'm just chilling.", "What's up?", "Zzz..."];
        //     const randomMessage = messages[Math.floor(Math.random() * messages.length)];
        //     this.bot.chat(randomMessage);
        // }, 30000); // 30秒ごと
    }

    // 他の行動（combat, mineなど）のメソッドをここに追加
    // 例:
    // private startCombatBehavior(targetEntity: WorldEntity): void {
    //     // 戦闘ロジック
    // }
}
