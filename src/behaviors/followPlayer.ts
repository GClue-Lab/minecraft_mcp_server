// src/behaviors/followPlayer.ts (Pathfinder使用版)

import * as mineflayer from 'mineflayer';
import { WorldKnowledge } from '../services/WorldKnowledge';
import { goals } from 'mineflayer-pathfinder';

export interface FollowPlayerOptions {
    targetPlayer: string;
    followRadius?: number;
}

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

    public start(): boolean {
        if (this.isActive) return false;

        const targetPlayerEntity = this.worldKnowledge.getPlayer(this.options.targetPlayer);
        if (!targetPlayerEntity || !targetPlayerEntity.isValid) {
            console.warn(`[FollowPlayer] Target player "${this.options.targetPlayer}" not found or invalid. Cannot start.`);
            return false;
        }
        
        this.isActive = true;
        console.log(`[FollowPlayer] Starting to follow ${this.options.targetPlayer}.`);

        // @ts-ignore - bot.entitiesにアクセスするために型を無視
        const targetEntity = this.bot.entities[targetPlayerEntity.id];
        if (!targetEntity) {
            console.warn(`[FollowPlayer] Could not find Mineflayer entity for ${this.options.targetPlayer}.`);
            this.isActive = false;
            return false;
        }

        // Pathfinderに追跡目標を設定
        const goal = new goals.GoalFollow(targetEntity, this.options.followRadius);
        // @ts-ignore
        this.bot.pathfinder.setGoal(goal, true); // trueで動く目標を追いかけ続ける

        return true;
    }

    public stop(): void {
        if (!this.isActive) return;
        this.isActive = false;
        // @ts-ignore
        this.bot.pathfinder.stop(); // Pathfinderの目標をクリア
        console.log(`[FollowPlayer] Stopped following.`);
    }

    public isRunning(): boolean {
        // Pathfinderがアクティブかどうかで判断
        // @ts-ignore
        return this.isActive && this.bot.pathfinder.isMoving();
    }

    public getOptions(): FollowPlayerOptions {
        return this.options;
    }
}
