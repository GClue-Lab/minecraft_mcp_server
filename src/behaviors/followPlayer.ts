// src/behaviors/followPlayer.ts v1.5

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
    maxPathfindingAttempts?: number;
    maxFallbackPathfindingRange?: number;
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
    private currentPathfindingAttempts: number = 0;
    private isTryingFallbackPath: boolean = false;
    private isMoving: boolean = false;

    constructor(bot: mineflayer.Bot, worldKnowledge: WorldKnowledge, options: FollowPlayerOptions) {
        this.bot = bot;
        this.worldKnowledge = worldKnowledge;
        
        this.options = {
            targetPlayer: options.targetPlayer,
            distanceThreshold: options.distanceThreshold ?? 2,
            recheckInterval: options.recheckInterval ?? 500,
            maxPathfindingAttempts: options.maxPathfindingAttempts ?? 20,
            maxFallbackPathfindingRange: options.maxFallbackPathfindingRange ?? 64,
        };

        console.log(`FollowPlayerBehavior initialized for target: ${this.options.targetPlayer} (Distance: ${this.options.distanceThreshold}, Interval: ${this.options.recheckInterval}, Max Path Attempts: ${this.options.maxPathfindingAttempts}, Fallback Range: ${this.options.maxFallbackPathfindingRange})`);
    }

    public start(): boolean {
        if (this.isActive) {
            console.warn('FollowPlayerBehavior is already active.');
            return false;
        }

        this.isActive = true;
        this.isPaused = false;
        this.currentPathfindingAttempts = 0;
        this.isTryingFallbackPath = false;
        this.isMoving = false;
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
        this.currentPathfindingAttempts = 0;
        this.isTryingFallbackPath = false;
        this.isMoving = false;
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
        this.isMoving = false;
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
        if (!this.isActive || this.isPaused || this.isMoving) {
            return;
        }

        const targetPlayer = this.worldKnowledge.getPlayer(this.options.targetPlayer);
        const botEntity = this.worldKnowledge.getBotEntity();

        if (!botEntity || !botEntity.position) {
            console.warn(`FollowPlayerBehavior: Bot entity information not available. Stopping.`);
            this.stop();
            return;
        }

        if (!targetPlayer || !targetPlayer.position) {
            console.log(`FollowPlayerBehavior: Target player "${this.options.targetPlayer}" not found in world knowledge or has no position. Waiting for player to appear.`);
            this.currentPathfindingAttempts = 0;
            this.isTryingFallbackPath = false;
            return; 
        }

        const distance = botEntity.position.distanceTo(targetPlayer.position);

        if (distance <= this.options.distanceThreshold) {
            console.log(`FollowPlayerBehavior: Bot is close enough to ${this.options.targetPlayer} (${distance.toFixed(2)} blocks). Staying put.`);
            this.worldKnowledge.stopPathfinding();
            this.bot.clearControlStates();
            this.bot.lookAt(targetPlayer.position.offset(0, targetPlayer.health ? targetPlayer.health / 2 : 1.6, 0), true);
            this.currentPathfindingAttempts = 0;
            this.isTryingFallbackPath = false;
        } else {
            // 経路探索試行回数チェック
            if (this.options.maxPathfindingAttempts > 0 && this.currentPathfindingAttempts >= this.options.maxPathfindingAttempts) {
                if (!this.isTryingFallbackPath) {
                    console.warn(`FollowPlayerBehavior: Max normal pathfinding attempts (${this.options.maxPathfindingAttempts}) reached. Trying broader fallback path (Range: ${this.options.maxFallbackPathfindingRange}).`);
                    this.isTryingFallbackPath = true;
                    this.currentPathfindingAttempts = 0;
                } else {
                    console.warn(`FollowPlayerBehavior: Max fallback pathfinding attempts (${this.options.maxPathfindingAttempts}) reached. Could not reach ${this.options.targetPlayer}. Stopping.`);
                    this.stop();
                    return;
                }
            }
            
            // --- ここを修正: Pathfinderに渡す最終的な目標座標をログ出力 ---
            const goalRange = this.isTryingFallbackPath ? this.options.maxFallbackPathfindingRange : this.options.distanceThreshold;
            const targetX = targetPlayer.position.x;
            const targetY = targetPlayer.position.y;
            const targetZ = targetPlayer.position.z;

            console.log(`FollowPlayerBehavior: Attempting path to PLAYER at (${targetX.toFixed(2)}, ${targetY.toFixed(2)}, ${targetZ.toFixed(2)}) with range ${goalRange.toFixed(2)}. Current bot pos: (${botEntity.position.x.toFixed(2)}, ${botEntity.position.y.toFixed(2)}, ${botEntity.position.z.toFixed(2)})`);
            // --- 修正終わり ---

            this.isMoving = true;
            const pathResult = await this.worldKnowledge.findPath(botEntity.position, targetPlayer.position, goalRange);
            this.isMoving = false;

            if (!pathResult) {
                console.warn(`FollowPlayerBehavior: Could not find path to ${this.options.targetPlayer}. Incrementing attempt count.`);
                this.currentPathfindingAttempts++; 
                await new Promise(resolve => setTimeout(resolve, this.options.recheckInterval)); 
                return; 
            }
            console.log(`FollowPlayerBehavior: Path found. Bot is attempting to move.`);
            this.currentPathfindingAttempts = 0;
            this.isTryingFallbackPath = false;
        }
    }
}
