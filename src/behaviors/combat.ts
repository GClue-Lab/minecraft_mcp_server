// src/behaviors/combat.ts (修正版 - pause/resume/canInterrupt/getOptions)

import * as mineflayer from 'mineflayer';
import { WorldKnowledge } from '../services/WorldKnowledge';
import { goals } from 'mineflayer-pathfinder';
import { Vec3 } from 'vec3';
import { BehaviorName } from '../services/BehaviorEngine'; // BehaviorNameをインポート

export interface CombatOptions {
    targetMobName?: string;
    maxCombatDistance?: number;
    attackRange?: number;
    stopAfterKill?: boolean;
    maxAttempts?: number;
}

export class CombatBehavior {
    private bot: mineflayer.Bot;
    private worldKnowledge: WorldKnowledge;
    private options: Required<CombatOptions>;
    private isActive: boolean = false;
    private isPaused: boolean = false; // 一時停止フラグ
    private currentTargetEntityId: number | null = null;
    private currentAttempts: number = 0;

    constructor(bot: mineflayer.Bot, worldKnowledge: WorldKnowledge, options: CombatOptions) {
        this.bot = bot;
        this.worldKnowledge = worldKnowledge;
        
        this.options = {
            targetMobName: options.targetMobName || 'zombie',
            maxCombatDistance: options.maxCombatDistance ?? 64,
            attackRange: options.attackRange ?? 3,
            stopAfterKill: options.stopAfterKill ?? true,
            maxAttempts: options.maxAttempts ?? 0,
        };

        if (!this.options.targetMobName) {
            throw new Error('CombatBehavior requires a targetMobName option.');
        }
        console.log(`CombatBehavior initialized for target: ${this.options.targetMobName} (Max Distance: ${this.options.maxCombatDistance}, Max Attempts: ${this.options.maxAttempts === 0 ? 'Infinite' : this.options.maxAttempts})`);
    }

    public async start(): Promise<boolean> {
        if (this.isActive) {
            console.warn('CombatBehavior is already active.');
            return false;
        }

        this.isActive = true;
        this.isPaused = false; // 開始時にポーズ解除
        this.currentTargetEntityId = null;
        this.currentAttempts = 0;
        console.log(`Starting CombatBehavior for ${this.options.targetMobName}...`);

        return this.executeCombatLogic();
    }

    public stop(): void {
        if (!this.isActive) {
            console.warn('CombatBehavior is not active. Cannot stop.');
            return;
        }

        console.log(`Stopping CombatBehavior.`);
        this.isActive = false;
        this.isPaused = false; // 停止時はポーズも解除
        this.bot.clearControlStates();
        this.worldKnowledge.stopPathfinding();
        this.currentTargetEntityId = null;
    }

    public isRunning(): boolean {
        return this.isActive && !this.isPaused;
    }

    // --- 新規追加: BehaviorInstance インターフェースのメソッド ---
    public pause(): void {
        if (!this.isActive || this.isPaused) return;
        console.log(`CombatBehavior: Pausing.`);
        this.isPaused = true;
        this.worldKnowledge.stopPathfinding();
        this.bot.clearControlStates();
        // 必要であれば、現在の戦闘状態（ターゲットなど）を保存
    }

    public resume(): void {
        if (!this.isActive || !this.isPaused) return;
        console.log(`CombatBehavior: Resuming.`);
        this.isPaused = false;
        // ロジックを再開
        this.executeCombatLogic(); // 停止した地点から再開を試みる
    }

    public canBeInterruptedBy(higherPriorityBehavior: BehaviorName): boolean {
        // 戦闘行動は基本的に最高優先度なので、他の行動では中断されない
        // ただし、もし緊急脱出などの超高優先度行動があればここで定義
        return false;
    }

    public getOptions(): CombatOptions {
        return this.options;
    }
    // --- End 新規追加 ---

    private async executeCombatLogic(): Promise<boolean> {
        while (this.isActive && !this.isPaused) { // ポーズ中はロジックを実行しない
            if (this.options.maxAttempts > 0 && this.currentAttempts >= this.options.maxAttempts) {
                console.log(`CombatBehavior: Max attempts (${this.options.maxAttempts}) reached. No target found. Stopping.`);
                this.stop();
                return false;
            }

            console.log(`CombatBehavior: Looking for target mob: ${this.options.targetMobName} within ${this.options.maxCombatDistance} blocks. (Attempt ${this.currentAttempts + 1}/${this.options.maxAttempts === 0 ? 'Infinite' : this.options.maxAttempts})`);

            const targetMob = this.worldKnowledge.getAllEntities().find(entity =>
                entity.type === 'mob' &&
                entity.name === this.options.targetMobName &&
                entity.isAlive &&
                this.bot.entity.position.distanceTo(entity.position) <= this.options.maxCombatDistance
            );

            if (!targetMob) {
                console.log(`CombatBehavior: No target mob (${this.options.targetMobName}) found within ${this.options.maxCombatDistance} blocks. Waiting...`);
                this.currentAttempts++;
                await new Promise(resolve => setTimeout(resolve, 2000));
                continue;
            }

            this.currentTargetEntityId = targetMob.id;
            console.log(`CombatBehavior: Found target ${targetMob.name} at ${targetMob.position} (ID: ${targetMob.id})`);
            this.currentAttempts = 0; // ターゲットを見つけたら試行回数をリセット

            const botPosition = this.bot.entity.position;
            const targetPos = targetMob.position;

            const pathResult = await this.worldKnowledge.findPath(botPosition, targetPos, this.options.attackRange);

            if (!pathResult) {
                console.warn(`CombatBehavior: Could not find path to mob ${targetMob.name}. Retrying...`);
                this.currentAttempts++;
                await new Promise(resolve => setTimeout(resolve, 1000));
                continue;
            }

            const currentTarget = this.bot.entities[this.currentTargetEntityId!];
            if (!currentTarget || !currentTarget.isValid || currentTarget.position.distanceTo(this.bot.entity.position) > this.options.attackRange) {
                console.log(`CombatBehavior: Target ${targetMob.name} moved out of range or disappeared. Re-evaluating.`);
                this.currentTargetEntityId = null;
                this.currentAttempts++;
                continue;
            }

            try {
                console.log(`CombatBehavior: Attacking ${currentTarget.name} (ID: ${currentTarget.id})...`);
                this.bot.attack(currentTarget);
                await new Promise(resolve => setTimeout(resolve, 500));
            } catch (err: any) {
                console.error(`CombatBehavior: Failed to attack mob ${currentTarget.name}: ${err.message}`);
                this.currentTargetEntityId = null;
                this.currentAttempts++;
                await new Promise(resolve => setTimeout(resolve, 1000));
                continue;
            }

            const finalTargetCheck = this.bot.entities[this.currentTargetEntityId!];
            if (!finalTargetCheck || !finalTargetCheck.isValid) {
                console.log(`CombatBehavior: Target ${targetMob.name} defeated or disappeared.`);
                if (this.options.stopAfterKill) {
                    this.stop();
                    return true;
                } else {
                    this.currentTargetEntityId = null;
                    this.currentAttempts = 0;
                    await new Promise(resolve => setTimeout(resolve, 500));
                }
            }
        }

        console.log(`CombatBehavior: Combat stopped.`);
        this.stop();
        return true;
    }
}
