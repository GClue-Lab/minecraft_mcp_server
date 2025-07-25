// src/behaviors/followPlayer.ts (修正版 - ターゲット認識ログ強化)

import * as mineflayer from 'mineflayer';
import { WorldKnowledge } from '../services/WorldKnowledge';
import { goals } from 'mineflayer-pathfinder';
import { Vec3 } from 'vec3';
import { BehaviorName } from '../services/BehaviorEngine';

/**
 * プレイヤー追従行動のオプションインターフェース
 */
export interface FollowPlayerOptions {
    targetPlayer: string;
    distanceThreshold?: number;
    recheckInterval?: number;
}

/**
 * プレイヤー追従行動を管理するクラス
 */
export class FollowPlayerBehavior {
    private bot: mineflayer.Bot;
    private worldKnowledge: WorldKnowledge;
    private options: Required<FollowPlayerOptions>;
    private intervalId: NodeJS.Timeout | null = null;
    private isActive: boolean = false;
    private isPaused: boolean = false;

    constructor(bot: mineflayer.Bot, worldKnowledge: WorldKnowledge, options: FollowPlayerOptions) {
        this.bot = bot;
        this.worldKnowledge = worldKnowledge;
        
        this.options = {
            targetPlayer: options.targetPlayer,
            distanceThreshold: options.distanceThreshold ?? 2,
            recheckInterval: options.recheckInterval ?? 500,
        };

        console.log(`FollowPlayerBehavior initialized for target: ${this.options.targetPlayer} (Distance: ${this.options.distanceThreshold}, Interval: ${this.options.recheckInterval})`);
    }

    public start(): boolean {
        if (this.isActive) {
            console.warn('FollowPlayerBehavior is already active.');
            return false;
        }

        // ここではターゲットの存在チェックをしない。executeFollowLogicで行う。
        // そうしないと、プレイヤーがまだログインしていない場合に start() が失敗してしまう。
        this.isActive = true;
        this.isPaused = false;
        console.log(`Starting FollowPlayerBehavior for ${this.options.targetPlayer}...`);
        
        this.intervalId = setInterval(() => this.executeFollowLogic(), this.options.recheckInterval);
        this.executeFollowLogic(); // 初回実行

        return true;
    }

    public stop(): void {
        if (!this.isActive) {
            console.warn('FollowPlayerBehavior is not active. Cannot stop.');
            return;
        }

        console.log(`Stopping FollowPlayerBehavior for ${this.options.targetPlayer}.`);
        this.isActive = false;
        this.isPaused = false;
        if (this.intervalId) {
            clearInterval(this.intervalId);
            this.intervalId = null;
        }
        this.worldKnowledge.stopPathfinding();
        this.bot.clearControlStates();
    }

    public isRunning(): boolean {
        return this.isActive && !this.isPaused;
    }

    public pause(): void {
        if (!this.isActive || this.isPaused) return;
        console.log(`FollowPlayerBehavior: Pausing for ${this.options.targetPlayer}.`);
        this.isPaused = true;
        if (this.intervalId) {
            clearInterval(this.intervalId);
            this.intervalId = null;
        }
        this.worldKnowledge.stopPathfinding();
        this.bot.clearControlStates();
    }

    public resume(): void {
        if (!this.isActive || !this.isPaused) return;
        console.log(`FollowPlayerBehavior: Resuming for ${this.options.targetPlayer}.`);
        this.isPaused = false;
        this.intervalId = setInterval(() => this.executeFollowLogic(), this.options.recheckInterval);
        this.executeFollowLogic();
    }

    public canBeInterruptedBy(higherPriorityBehavior: BehaviorName): boolean {
        return higherPriorityBehavior === 'combat';
    }

    public getOptions(): FollowPlayerOptions {
        return this.options;
    }

    private async executeFollowLogic(): Promise<void> {
        if (!this.isActive || this.isPaused) return;

        const targetPlayer = this.worldKnowledge.getPlayer(this.options.targetPlayer);
        const botEntity = this.worldKnowledge.getBotEntity();

        if (!botEntity || !botEntity.position) {
            console.warn(`FollowPlayerBehavior: Bot entity information not available. Stopping.`);
            this.stop();
            return;
        }

        if (!targetPlayer || !targetPlayer.position) {
            console.log(`FollowPlayerBehavior: Target player "${this.options.targetPlayer}" not found in world knowledge or has no position. Waiting for player to appear.`);
            // プレイヤーが見つからない場合、ストップせずに待機を続ける
            // 一定回数待機しても見つからない場合は停止するロジックも追加可能
            return; 
        }

        const distance = botEntity.position.distanceTo(targetPlayer.position);

        if (distance <= this.options.distanceThreshold) {
            console.log(`FollowPlayerBehavior: Bot is close enough to ${this.options.targetPlayer} (${distance.toFixed(2)} blocks). Staying put.`);
            this.worldKnowledge.stopPathfinding();
            this.bot.clearControlStates();
            this.bot.lookAt(targetPlayer.position.offset(0, targetPlayer.health ? targetPlayer.health / 2 : 1.6, 0), true);
        } else {
            console.log(`FollowPlayerBehavior: Moving towards ${this.options.targetPlayer} at ${targetPlayer.position} (Distance: ${distance.toFixed(2)}).`);
            const goal = new goals.GoalNear(
                targetPlayer.position.x,
                targetPlayer.position.y,
                targetPlayer.position.z,
                this.options.distanceThreshold
            );
            this.bot.pathfinder.setGoal(goal);
        }
    }
}
