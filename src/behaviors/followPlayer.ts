// src/behaviors/followPlayer.ts (Pathfinder使用版・完全版)

import * as mineflayer from 'mineflayer';
import { WorldKnowledge } from '../services/WorldKnowledge';
import { goals } from 'mineflayer-pathfinder';

export interface FollowPlayerOptions {
    targetPlayer: string;
    followRadius?: number;
}

/**
 * Pathfinderを使用して、指定されたプレイヤーを追跡する行動を管理するクラス。
 */
export class FollowPlayerBehavior {
    private bot: mineflayer.Bot;
    private worldKnowledge: WorldKnowledge;
    private options: Required<FollowPlayerOptions>;
    private isActive: boolean = false;

    constructor(bot: mineflayer.Bot, worldKnowledge: WorldKnowledge, options: FollowPlayerOptions) {
        this.bot = bot;
        this.worldKnowledge = worldKnowledge;
        
        this.options = {
            targetPlayer: options.targetPlayer,
            followRadius: options.followRadius ?? 3, // この距離を保って追従する
        };
    }

    /**
     * 追従行動を開始する。
     * @returns 行動の開始に成功したか
     */
    public start(): boolean {
        if (this.isActive) return false;

        const targetPlayerEntity = this.worldKnowledge.getPlayer(this.options.targetPlayer);
        if (!targetPlayerEntity || !targetPlayerEntity.isValid) {
            console.warn(`[FollowPlayer] Target player "${this.options.targetPlayer}" not found or invalid. Cannot start.`);
            return false;
        }
        
        this.isActive = true;
        console.log(`[FollowPlayer] Starting to follow ${this.options.targetPlayer}.`);

        // WorldKnowledgeから得た情報をもとに、mineflayerのエンティティオブジェクトを取得
        const targetEntity = this.bot.entities[targetPlayerEntity.id];
        if (!targetEntity) {
            console.warn(`[FollowPlayer] Could not find Mineflayer entity for ${this.options.targetPlayer}.`);
            this.isActive = false;
            return false;
        }

        // Pathfinderに追跡目標（GoalFollow）を設定
        const goal = new goals.GoalFollow(targetEntity, this.options.followRadius);
        this.bot.pathfinder.setGoal(goal, true); // 'true'を設定することで、動き続ける目標を追いかけ続ける

        return true;
    }

    /**
     * 追従行動を停止する。
     */
    public stop(): void {
        if (!this.isActive) return;
        this.isActive = false;
        // Pathfinderの現在の目標をクリアし、移動を停止させる
        this.bot.pathfinder.stop();
        console.log(`[FollowPlayer] Stopped following.`);
    }

    /**
     * 行動が現在実行中かどうかを返す。
     * Pathfinderが移動中かどうかで判断する。
     */
    public isRunning(): boolean {
        return this.isActive && this.bot.pathfinder.isMoving();
    }

    /**
     * 現在の行動オプションを返す。
     */
    public getOptions(): FollowPlayerOptions {
        return {
            targetPlayer: this.options.targetPlayer,
            followRadius: this.options.followRadius,
        };
    }
}
