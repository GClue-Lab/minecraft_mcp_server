// src/behaviors/followPlayer.ts v1.14

import * as mineflayer from 'mineflayer';
import { WorldKnowledge } from '../services/WorldKnowledge';
// ここを修正: BehaviorName のインポート元を '../types/mcp' に変更
import { Vec3 } from 'vec3';
import { BehaviorName } from '../types/mcp'; 

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
    // private currentPathfindingAttempts: number = 0; // <<<< 削除済み
    // private isTryingFallbackPath: boolean = false; // <<<< 削除済み
    private isMoving: boolean = false; // ボットが現在移動中かどうかのフラグ

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
        console.log(`[FollowPlayerBehavior.start] Attempting to start. isActive: ${this.isActive}`);
        if (this.isActive) {
            console.warn('FollowPlayerBehavior is already active.');
            return false;
        }

        this.isActive = true;
        this.isPaused = false;
        // this.currentPathfindingAttempts = 0; // <<<< 削除済み
        // this.isTryingFallbackPath = false; // <<<< 削除済み
        this.isMoving = false; // 開始時にリセット
        console.log(`Starting FollowPlayerBehavior for ${this.options.targetPlayer}...`);
        
        this.intervalId = setInterval(() => this.executeFollowLogic(), this.options.recheckInterval);
        this.executeFollowLogic(); // 初回実行

        return true;
    }

    public stop(): void {
        console.log(`[FollowPlayerBehavior.stop] Stopping behavior. isActive: ${this.isActive}`);
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
        // this.worldKnowledge.stopPathfinding(); // <<<< 削除 (Pathfinder使わないため)
        this.bot.clearControlStates(); // 移動制御をクリアして停止
        // this.currentPathfindingAttempts = 0; // <<<< 削除済み
        // this.isTryingFallbackPath = false; // <<<< 削除済み
        this.isMoving = false; // <<<< 削除
    }

    public isRunning(): boolean {
        return this.isActive && !this.isPaused;
    }

    public pause(): void {
        console.log(`[FollowPlayerBehavior.pause] Pausing behavior. isActive: ${this.isActive}, isPaused: ${this.isPaused}`);
        if (!this.isActive || this.isPaused) return;
        console.log(`FollowPlayerBehavior: Pausing for ${this.options.targetPlayer}.`);
        this.isPaused = true;
        if (this.intervalId) {
            clearInterval(this.intervalId);
            this.intervalId = null;
        }
        // this.worldKnowledge.stopPathfinding(); // <<<< 削除
        this.bot.clearControlStates();
        this.isMoving = false; // ポーズ時に移動停止
    }

    public resume(): void {
        console.log(`[FollowPlayerBehavior.resume] Resuming for ${this.options.targetPlayer}.`);
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
        // ここを修正: isPathfindingInProgress() の呼び出しを削除
        console.log(`[FollowPlayerBehavior.executeFollowLogic] Entering loop. Active: ${this.isActive}, Paused: ${this.isPaused}, Moving: ${this.isMoving}. Attempts: 0.`); 
        if (!this.isActive || this.isPaused || this.isMoving) { // isPathfindingInProgress() のチェックを削除
            console.log(`[FollowPlayerBehavior.executeFollowLogic] Skipping. Current state: Active=${this.isActive}, Paused=${this.isPaused}, Moving=${this.isMoving}.`);
            return;
        }

        const targetPlayer = this.worldKnowledge.getPlayer(this.options.targetPlayer);
        const botEntity = this.worldKnowledge.getBotEntity();

        if (!botEntity || !botEntity.position || !this.bot.entity || ! this.bot.entity.position) {
            console.warn(`[FollowPlayerBehavior.executeFollowLogic] Bot entity information not available. Stopping.`);
            this.stop();
            return;
        }

        if (!targetPlayer || !targetPlayer.position) {
            console.log(`[FollowPlayerBehavior.executeFollowLogic] Target player "${this.options.targetPlayer}" not found or no position. Waiting.`);
            return; 
        }

        const distance = botEntity.position.distanceTo(targetPlayer.position);

        if (distance <= this.options.distanceThreshold) {
            console.log(`[FollowPlayerBehavior.executeFollowLogic] Bot is close enough to ${this.options.targetPlayer} (${distance.toFixed(2)} blocks). Staying put.`);
            try {
                this.bot.clearControlStates(); // 移動制御をクリアして停止
                this.bot.lookAt(targetPlayer.position.offset(0, targetPlayer.health ? targetPlayer.health / 2 : 1.6, 0), true); // プレイヤーの方向を向く
            } catch (err) {
                console.warn(`[FollowPlayerBehavior] Failed to lookAt: ${err}`);
            }
        } else {
            console.log(`[FollowPlayerBehavior.executeFollowLogic] Moving towards ${this.options.targetPlayer} at (${targetPlayer.position.x.toFixed(2)}, ${targetPlayer.position.y.toFixed(2)}, ${targetPlayer.position.z.toFixed(2)}) (Distance: ${distance.toFixed(2)}).`);
            try {
                this.bot.lookAt(targetPlayer.position.offset(0, targetPlayer.health ? targetPlayer.health / 2 : 1.6, 0), true); // プレイヤーの方向を向く
                this.bot.setControlState('forward', true); // 前に進む
                this.bot.setControlState('jump', this.bot.entity.onGround && distance > 3 && targetPlayer.position.y > botEntity.position.y + 0.5); // プレイヤーより高ければジャンプを試みる簡易ロジック
                console.log(`[FollowPlayerBehavior.executeFollowLogic] Bot is attempting to move with basic controls.`);
            } catch (err) {
                console.warn(`[FollowPlayerBehavior] Failed to lookAt: ${err}`);
            }
        }
    }
}
