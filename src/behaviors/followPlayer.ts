// src/behaviors/followPlayer.ts

import * as mineflayer from 'mineflayer';
import { WorldKnowledge } from '../services/WorldKnowledge';
import { goals } from 'mineflayer-pathfinder';
import { Vec3 } from 'vec3';

/**
 * プレイヤー追従行動のオプションインターフェース
 */
export interface FollowPlayerOptions {
    targetPlayer: string; // 追従するプレイヤー名
    distanceThreshold?: number; // プレイヤーに近づく目標距離 (デフォルト: 2ブロック)
    recheckInterval?: number; // 追従ロジックを再確認する間隔 (ミリ秒、デフォルト: 500ms)
}

/**
 * プレイヤー追従行動を管理するクラス
 */
export class FollowPlayerBehavior {
    private bot: mineflayer.Bot;
    private worldKnowledge: WorldKnowledge;
    private options: FollowPlayerOptions;
    private intervalId: NodeJS.Timeout | null = null;
    private isActive: boolean = false;

    constructor(bot: mineflayer.Bot, worldKnowledge: WorldKnowledge, options: FollowPlayerOptions) {
        this.bot = bot;
        this.worldKnowledge = worldKnowledge;
        this.options = {
            distanceThreshold: 2, // デフォルト値
            recheckInterval: 500, // デフォルト値
            ...options,
        };
        console.log(`FollowPlayerBehavior initialized for target: ${this.options.targetPlayer}`);
    }

    /**
     * 追従行動を開始します。
     * @returns 成功した場合true、失敗した場合false
     */
    public start(): boolean {
        if (this.isActive) {
            console.warn('FollowPlayerBehavior is already active.');
            return false;
        }

        const targetPlayer = this.worldKnowledge.getPlayer(this.options.targetPlayer);
        if (!targetPlayer) {
            console.error(`FollowPlayerBehavior: Target player "${this.options.targetPlayer}" not found. Cannot start.`);
            return false;
        }

        this.isActive = true;
        console.log(`Starting FollowPlayerBehavior for ${this.options.targetPlayer}...`);
        
        // 定期的に追従ロジックを実行
        this.intervalId = setInterval(() => this.executeFollowLogic(), this.options.recheckInterval);

        // 初回実行
        this.executeFollowLogic();

        return true;
    }

    /**
     * 追従行動を停止します。
     */
    public stop(): void {
        if (!this.isActive) {
            console.warn('FollowPlayerBehavior is not active. Cannot stop.');
            return;
        }

        console.log(`Stopping FollowPlayerBehavior for ${this.options.targetPlayer}.`);
        this.isActive = false;
        if (this.intervalId) {
            clearInterval(this.intervalId);
            this.intervalId = null;
        }
        this.worldKnowledge.stopPathfinding(); // 経路探索も停止
        this.bot.clearControlStates(); // ボットの制御状態をリセット
    }

    /**
     * 行動が現在アクティブかどうかを返します。
     */
    public isRunning(): boolean {
        return this.isActive;
    }

    /**
     * プレイヤー追従のメインロジック。定期的に呼び出されます。
     */
    private async executeFollowLogic(): Promise<void> {
        if (!this.isActive) return;

        const targetPlayer = this.worldKnowledge.getPlayer(this.options.targetPlayer);
        const botEntity = this.worldKnowledge.getBotEntity();

        if (!targetPlayer || !targetPlayer.position || !botEntity || !botEntity.position) {
            console.warn(`FollowPlayerBehavior: Target player "${this.options.targetPlayer}" or bot not found. Stopping.`);
            this.stop(); // ターゲットが見つからない場合は停止
            return;
        }

        const distance = botEntity.position.distanceTo(targetPlayer.position);

        if (distance <= this.options.distanceThreshold!) {
            // 十分近い場合、移動を停止し、プレイヤーの方を向く
            this.worldKnowledge.stopPathfinding();
            this.bot.clearControlStates();
            this.bot.lookAt(targetPlayer.position.offset(0, targetPlayer.health ? targetPlayer.health / 2 : 1.6, 0), true);
            // console.log(`Bot is close to ${this.options.targetPlayer}. Staying put.`);
        } else {
            // 遠い場合、経路を計算して移動
            const goal = new goals.GoalNear(
                targetPlayer.position.x,
                targetPlayer.position.y,
                targetPlayer.position.z,
                this.options.distanceThreshold! // 目標距離
            );
            
            // Pathfinderに新しい目標を設定 (既に移動中ならキャンセルして再計算)
            // findPathがPromiseを返すので、awaitを使って完了を待つことができますが、
            // ここでは定期実行なので、単純にsetGoalを呼び出すだけで良い場合が多いです。
            // BehaviorEngineのループでパスの進捗を監視する方が適切です。
            this.bot.pathfinder.setGoal(goal);
            // console.log(`Bot pathfinding to ${this.options.targetPlayer} at ${targetPlayer.position}, distance: ${distance.toFixed(2)}`);
        }

        // ここに、追従中に他の行動（例: 敵との遭遇）を判断するロジックを追加できる
        // if (this.worldKnowledge.findNearestEnemy(botEntity.position, 10)) {
        //     this.behaviorEngine.startBehavior('combat', { target: enemyEntity });
        //     this.stop(); // 戦闘に切り替えるため、追従を停止
        // }
    }
}
