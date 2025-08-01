// src/behaviors/followPlayer.ts (直接制御版)

import * as mineflayer from 'mineflayer';
import { WorldKnowledge } from '../services/WorldKnowledge';

export interface FollowPlayerOptions {
    targetPlayer: string;
    distanceThreshold?: number;
}

export class FollowPlayerBehavior {
    private bot: mineflayer.Bot;
    private worldKnowledge: WorldKnowledge;
    private options: Required<FollowPlayerOptions>;
    private isActive: boolean = false;
    private intervalId: NodeJS.Timeout | null = null;

    constructor(bot: mineflayer.Bot, worldKnowledge: WorldKnowledge, options: FollowPlayerOptions) {
        this.bot = bot;
        this.worldKnowledge = worldKnowledge;
        
        this.options = {
            targetPlayer: options.targetPlayer,
            distanceThreshold: options.distanceThreshold ?? 3,
        };
    }

    public start(): boolean {
        if (this.isActive) return false;
        
        const target = this.worldKnowledge.getPlayer(this.options.targetPlayer);
        if (!target) {
            console.warn(`[FollowPlayer] Target ${this.options.targetPlayer} not found.`);
            return false;
        }

        this.isActive = true;
        this.intervalId = setInterval(() => this.followLogic(), 500); // 0.5秒ごとに位置を再評価
        return true;
    }

    public stop(): void {
        if (!this.isActive) return;
        this.isActive = false;
        if (this.intervalId) {
            clearInterval(this.intervalId);
            this.intervalId = null;
        }
        this.bot.clearControlStates();
    }

    public isRunning(): boolean {
        return this.isActive;
    }

    public getOptions(): FollowPlayerOptions {
        return this.options;
    }

    private followLogic(): void {
        if (!this.isActive) return;

        const target = this.worldKnowledge.getPlayer(this.options.targetPlayer);
        if (!target || !target.isValid) {
            console.log(`[FollowPlayer] Target lost. Stopping.`);
            this.stop();
            return;
        }

        const distance = this.bot.entity.position.distanceTo(target.position);
        this.bot.lookAt(target.position.offset(0, 1.6, 0), true);

        if (distance > this.options.distanceThreshold) {
            this.bot.setControlState('forward', true);
            this.bot.setControlState('sprint', distance > 5); // 5ブロック以上離れていたらダッシュ
            
            const botPos = this.bot.entity.position;
            const targetIsHigher = target.position.y > botPos.y + 0.5;
            this.bot.setControlState('jump', this.bot.entity.onGround && targetIsHigher);
        } else {
            this.bot.clearControlStates(); // 近づいたら停止
        }
    }
}
