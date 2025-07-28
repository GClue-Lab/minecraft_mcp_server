// src/behaviors/combat.ts v1.3 (基本移動ロジックとクールダウン修正)

import * as mineflayer from 'mineflayer';
import { WorldKnowledge } from '../services/WorldKnowledge';
// goals と Path は mineflayer-pathfinder から来るので削除
// import { goals } from 'mineflayer-pathfinder';
// import { Path } from 'mineflayer-pathfinder';
import { Vec3 } from 'vec3'; // Vec3 は引き続き必要
import { BehaviorName } from '../services/BehaviorEngine';

/**
 * 戦闘行動のオプションインターフェース
 */
export interface CombatOptions {
    targetMobName?: string;
    maxCombatDistance?: number;
    attackRange?: number;
    stopAfterKill?: boolean;
    // maxAttempts?: number; // <<<< 削除済み
}

/**
 * 敵対モブと戦闘する行動を管理するクラス
 */
export class CombatBehavior {
    private bot: mineflayer.Bot;
    private worldKnowledge: WorldKnowledge;
    private options: Required<CombatOptions>;
    private isActive: boolean = false;
    private isPaused: boolean = false;
    private currentTargetEntityId: number | null = null;
    // private currentAttempts: number = 0; // <<<< 削除済み

    constructor(bot: mineflayer.Bot, worldKnowledge: WorldKnowledge, options: CombatOptions) {
        this.bot = bot;
        this.worldKnowledge = worldKnowledge;
        
        this.options = {
            targetMobName: options.targetMobName || 'zombie',
            maxCombatDistance: options.maxCombatDistance ?? 64,
            attackRange: options.attackRange ?? 3,
            stopAfterKill: options.stopAfterKill ?? true,
            // maxAttempts: options.maxAttempts ?? 0, // <<<< 削除済み
        };

        console.log(`CombatBehavior initialized for target: ${this.options.targetMobName} (Max Distance: ${this.options.maxCombatDistance})`);
    }

    public async start(): Promise<boolean> {
        if (this.isActive) {
            console.warn('CombatBehavior is already active.');
            return false;
        }

        this.isActive = true;
        this.isPaused = false;
        this.currentTargetEntityId = null;
        // this.currentAttempts = 0; // <<<< 削除済み
        console.log(`Starting CombatBehavior for ${this.options.targetMobName}...`);

        return this.executeCombatLogic(); // 初回実行と継続ロジック
    }

    public stop(): void {
        if (!this.isActive) {
            console.warn('CombatBehavior is not active. Cannot stop.');
            return;
        }

        console.log(`Stopping CombatBehavior.`);
        this.isActive = false;
        this.isPaused = false;
        this.bot.clearControlStates(); // ボットの制御状態をリセット
        // this.worldKnowledge.stopPathfinding(); // <<<< 削除済み
        this.currentTargetEntityId = null;
    }

    public isRunning(): boolean {
        return this.isActive && !this.isPaused;
    }

    public pause(): void {
        if (!this.isActive || this.isPaused) return;
        console.log(`CombatBehavior: Pausing.`);
        this.isPaused = true;
        // this.worldKnowledge.stopPathfinding(); // <<<< 削除済み
        this.bot.clearControlStates();
    }

    public resume(): void {
        if (!this.isActive || !this.isPaused) return;
        console.log(`CombatBehavior: Resuming.`);
        this.isPaused = false;
        this.executeCombatLogic(); // 停止した地点から再開を試みる
    }

    public canBeInterruptedBy(higherPriorityBehavior: BehaviorName): boolean {
        return false; // 戦闘行動は基本的に最高優先度なので、他の行動では中断されない
    }

    public getOptions(): CombatOptions {
        return this.options;
    }

    /**
     * 戦闘のメインロジック。
     */
    private async executeCombatLogic(): Promise<boolean> {
        while (this.isActive && !this.isPaused) {
            console.log(`CombatBehavior: Looking for target mob: ${this.options.targetMobName} within ${this.options.maxCombatDistance} blocks.`);

            // 最寄りのターゲットモブを見つける
            const targetMob = this.worldKnowledge.getAllEntities().find(entity =>
                entity.type === 'mob' &&
                entity.name === this.options.targetMobName &&
                (entity as any).isAlive && // MineflayerのEntityはisValidプロパティを持つが、isAliveは保証されないのでanyで
                this.bot.entity.position.distanceTo(entity.position) <= this.options.maxCombatDistance
            );

            if (!targetMob) {
                console.log(`CombatBehavior: No target mob (${this.options.targetMobName}) found within ${this.options.maxCombatDistance} blocks. Waiting...`);
                // this.currentAttempts++; // <<<< 削除済み
                await new Promise(resolve => setTimeout(resolve, 2000));
                continue;
            }

            this.currentTargetEntityId = targetMob.id;
            console.log(`CombatBehavior: Found target ${targetMob.name} at ${targetMob.position} (ID: ${targetMob.id})`);
            // this.currentAttempts = 0; // <<<< 削除済み

            const botPosition = this.bot.entity.position;
            const targetPos = targetMob.position.offset(0, (targetMob as any).height || 1.6, 0); // ターゲットのY座標を調整

            const distance = botPosition.distanceTo(targetPos); // ターゲットY座標調整後の距離

            if (distance > this.options.attackRange) {
                console.log(`CombatBehavior: Moving towards ${targetMob.name} at ${targetPos}. Distance: ${distance.toFixed(2)}.`);
                this.bot.lookAt(targetPos, true); // ターゲットの方向を向く
                this.bot.setControlState('forward', true); // 前に進む
                // 簡易的なジャンプロジック (段差を越えるため)
                this.bot.setControlState('jump', this.bot.entity.onGround && targetPos.y > botPosition.y + 0.5); 
                await new Promise(resolve => setTimeout(resolve, 200)); // 少しだけ移動する時間を与える
                continue;
            } else {
                this.bot.clearControlStates(); // 攻撃範囲内なら移動を停止
                this.bot.lookAt(targetPos, true); // 攻撃前に方向を向く
            }

            const currentTarget = this.bot.entities[this.currentTargetEntityId!];
            if (!currentTarget || !(currentTarget as any).isValid || currentTarget.position.distanceTo(this.bot.entity.position) > this.options.attackRange) {
                console.log(`CombatBehavior: Target ${targetMob.name} moved out of range or disappeared. Re-evaluating.`);
                this.currentTargetEntityId = null;
                // this.currentAttempts++; // <<<< 削除済み
                continue;
            }

            // 攻撃
            try {
                console.log(`CombatBehavior: Attacking ${currentTarget.name} (ID: ${currentTarget.id})...`);
                this.bot.attack(currentTarget);
                // ここを修正: this.bot.attackDelay の代わりに固定のクールダウン時間
                await new Promise(resolve => setTimeout(resolve, 500)); // 攻撃クールダウンを考慮 (例: 500ms)
            } catch (err: any) {
                console.error(`CombatBehavior: Failed to attack mob ${currentTarget.name}: ${err.message}`);
                this.currentTargetEntityId = null;
                // this.currentAttempts++; // <<<< 削除済み
                await new Promise(resolve => setTimeout(resolve, 1000));
                continue;
            }

            // ターゲットが倒されたか確認
            const finalTargetCheck = this.bot.entities[this.currentTargetEntityId!];
            if (!finalTargetCheck || !(finalTargetCheck as any).isValid) {
                console.log(`CombatBehavior: Target ${targetMob.name} defeated or disappeared.`);
                if (this.options.stopAfterKill) {
                    this.stop();
                    return true; // 1体倒したら終了
                } else {
                    this.currentTargetEntityId = null; // 次のターゲットを探す
                    // this.currentAttempts = 0; // <<<< 削除済み
                    await new Promise(resolve => setTimeout(resolve, 500));
                }
            }
        }

        console.log(`CombatBehavior: Combat stopped.`);
        this.stop();
        return true;
    }
}
