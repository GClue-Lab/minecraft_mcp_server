// src/behaviors/combat.ts v1.8

import * as mineflayer from 'mineflayer';
import { WorldKnowledge } from '../services/WorldKnowledge';
import { Vec3 } from 'vec3';
// ここを修正: BehaviorName のインポート元を '../types/mcp' に変更
import { BehaviorName } from '../types/mcp'; 

/**
 * 戦闘行動のオプションインターフェース
 */
export interface CombatOptions {
    targetMobName?: string;
    maxCombatDistance?: number;
    attackRange?: number;
    stopAfterKill?: boolean;
    maxAttempts?: number;
    recheckTargetInterval?: number;
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
    private currentAttempts: number = 0;
    private lastTargetRecheckTime: number = 0;

    constructor(bot: mineflayer.Bot, worldKnowledge: WorldKnowledge, options: CombatOptions) {
        this.bot = bot;
        this.worldKnowledge = worldKnowledge;
        
        this.options = {
            targetMobName: options.targetMobName || 'zombie',
            maxCombatDistance: options.maxCombatDistance ?? 64,
            attackRange: options.attackRange ?? 3,
            stopAfterKill: options.stopAfterKill ?? true,
            maxAttempts: options.maxAttempts ?? 10,
            recheckTargetInterval: options.recheckTargetInterval ?? 1000,
        };

        console.log(`CombatBehavior initialized for target: ${this.options.targetMobName} (Max Distance: ${this.options.maxCombatDistance}, Max Attempts: ${this.options.maxAttempts === 0 ? 'Infinite' : this.options.maxAttempts}, Recheck Interval: ${this.options.recheckTargetInterval})`);
    }

    public async start(): Promise<boolean> {
        console.log(`[CombatBehavior.start] Attempting to start. isActive: ${this.isActive}`);
        if (this.isActive) {
            console.warn('CombatBehavior is already active.');
            return false;
        }

        this.isActive = true;
        this.isPaused = false;
        this.currentTargetEntityId = null;
        this.currentAttempts = 0;
        this.lastTargetRecheckTime = Date.now();
        console.log(`Starting CombatBehavior for ${this.options.targetMobName}...`);

        return this.executeCombatLogic();
    }

    public stop(): void {
        console.log(`[CombatBehavior.stop] Stopping behavior. isActive: ${this.isActive}`);
        if (!this.isActive) {
            console.warn('CombatBehavior is not active. Cannot stop.');
            return;
        }

        console.log(`Stopping CombatBehavior.`);
        this.isActive = false;
        this.isPaused = false;
        this.bot.clearControlStates();
        this.currentTargetEntityId = null;
        this.currentAttempts = 0;
        this.lastTargetRecheckTime = 0;
    }

    public isRunning(): boolean {
        return this.isActive && !this.isPaused;
    }

    public pause(): void {
        console.log(`[CombatBehavior.pause] Pausing behavior. isActive: ${this.isActive}, isPaused: ${this.isPaused}`);
        if (!this.isActive || this.isPaused) return;
        console.log(`CombatBehavior: Pausing.`);
        this.isPaused = true;
        this.bot.clearControlStates();
    }

    public resume(): void {
        console.log(`[CombatBehavior.resume] Resuming behavior. isActive: ${this.isActive}, isPaused: ${this.isPaused}`);
        if (!this.isActive || !this.isPaused) return;
        console.log(`CombatBehavior: Resuming.`);
        this.isPaused = false;
        this.executeCombatLogic();
    }

    public canBeInterruptedBy(higherPriorityBehavior: BehaviorName): boolean {
        return false;
    }

    public getOptions(): CombatOptions {
        return this.options;
    }

    /**
     * 戦闘のメインロジック。
     */
    private async executeCombatLogic(): Promise<boolean> {
        console.log(`[CombatBehavior.executeCombatLogic] Entering loop. Active: ${this.isActive}, Paused: ${this.isPaused}. Attempts: ${this.currentAttempts}`);
        while (this.isActive && !this.isPaused) {
            // 試行回数の上限チェック (敵が見つからない場合)
            if (this.options.maxAttempts > 0 && this.currentAttempts >= this.options.maxAttempts) {
                console.log(`[CombatBehavior.executeCombatLogic] Max attempts (${this.options.maxAttempts}) reached. No target found. Stopping.`);
                this.stop();
                return false;
            }

            // ターゲットの再評価が必要か判断
            const now = Date.now();
            const shouldRecheckTarget = (now - this.lastTargetRecheckTime) > this.options.recheckTargetInterval;
            let targetMob = this.currentTargetEntityId ? this.worldKnowledge.getEntityById(this.currentTargetEntityId) : null;
            
            if (!targetMob || !targetMob.isValid || shouldRecheckTarget) {
                console.log(`[CombatBehavior.executeCombatLogic] Rechecking for nearest target mob: ${this.options.targetMobName} within ${this.options.maxCombatDistance} blocks. (Attempt ${this.currentAttempts + 1}/${this.options.maxAttempts === 0 ? 'Infinite' : this.options.maxAttempts})`);
                this.lastTargetRecheckTime = now; // 再評価時間を更新

                targetMob = this.worldKnowledge.getAllEntities().find(e => {
                    const isValidEntity = e.isValid;
                    if (!isValidEntity) return false;

                    if (e.type === 'player' && (e.name === this.bot.username || e.name === 'naisy714')) return false;

                    const hostileMobNames = ['zombie', 'skeleton', 'spider', 'creeper', 'enderman', 'husk', 'stray', 'cave_spider', 'zombified_piglin', 'drowned', 'witch', 'guardian', 'elder_guardian', 'shulker', 'blaze', 'ghast', 'magma_cube', 'slime', 'phantom', 'wither_skeleton', 'piglin', 'piglin_brute', 'zoglin', 'vex', 'vindicator', 'evoker', 'ravager', 'illusions_illager', 'pillager'];
                    const isMobType = e.type === 'mob' || e.type === 'hostile'; 
                    const isNamedHostile = e.name && hostileMobNames.includes(e.name);
                    const isHostile = isMobType && isNamedHostile;

                    if (!isHostile) return false;

                    const distance = this.bot.entity.position.distanceTo(e.position);
                    const isInRange = distance <= this.options.maxCombatDistance;
                    
                    console.log(`[CombatBehavior.executeCombatLogic] Potential mob check: ${e.name} (ID: ${e.id}) at (${e.position.x.toFixed(2)},${e.position.y.toFixed(2)},${e.position.z.toFixed(2)}) (Dist: ${distance.toFixed(2)}, Valid: ${isValidEntity}, InRange: ${isInRange}).`);

                    return isHostile && isInRange;
                });

                if (targetMob) {
                    this.currentTargetEntityId = targetMob.id;
                    this.currentAttempts = 0;
                    console.log(`[CombatBehavior.executeCombatLogic] Confirmed new target ${targetMob.name} at ${targetMob.position} (ID: ${targetMob.id}).`);
                } else {
                    this.currentTargetEntityId = null;
                    console.log(`[CombatBehavior.executeCombatLogic] No active target mob (${this.options.targetMobName}) found. Incrementing attempts. Waiting...`);
                    this.currentAttempts++;
                    await new Promise(resolve => setTimeout(resolve, 2000));
                    continue;
                }
            }

            if (!this.currentTargetEntityId) {
                console.warn('[CombatBehavior.executeCombatLogic] No currentTargetEntityId, but loop continued. Re-evaluating.');
                continue; 
            }
            targetMob = this.worldKnowledge.getEntityById(this.currentTargetEntityId!);

            if (!targetMob || !targetMob.isValid || this.bot.entity.position.distanceTo(targetMob.position) > this.options.maxCombatDistance) {
                console.log(`[CombatBehavior.executeCombatLogic] Current target ${targetMob?.name || 'N/A'} (ID: ${this.currentTargetEntityId}) moved out of range or disappeared/invalidated. Re-evaluating.`);
                this.currentTargetEntityId = null;
                this.currentAttempts++;
                continue;
            }

            const botPosition = this.bot.entity.position;
            const targetPos = targetMob.position.offset(0, (targetMob as any).height || 1.6, 0);

            const distance = botPosition.distanceTo(targetPos);

            if (distance > this.options.attackRange) {
                console.log(`[CombatBehavior.executeCombatLogic] Moving towards target. Current distance: ${distance.toFixed(2)}.`);
                this.bot.lookAt(targetPos, true);
                this.bot.setControlState('forward', true);
                this.bot.setControlState('jump', this.bot.entity.onGround && targetPos.y > botPosition.y + 0.5);
                await new Promise(resolve => setTimeout(resolve, 200));
                continue;
            } else {
                console.log(`[CombatBehavior.executeCombatLogic] Target within attack range. Distance: ${distance.toFixed(2)}.`);
                this.bot.clearControlStates();
                this.bot.lookAt(targetPos, true);
            }

            // 攻撃
            try {
                console.log(`[CombatBehavior.executeCombatLogic] Attacking ${targetMob.name} (ID: ${targetMob.id})...`);
                this.bot.attack(this.bot.entities[this.currentTargetEntityId!]);
                await new Promise(resolve => setTimeout(resolve, 500));
            } catch (err: any) {
                console.error(`[CombatBehavior.executeCombatLogic] Failed to attack mob ${targetMob.name}: ${err.message}`);
                this.currentTargetEntityId = null;
                this.currentAttempts++;
                await new Promise(resolve => setTimeout(resolve, 1000));
                continue;
            }

            // ターゲットが倒されたか確認
            const finalTargetCheck = this.worldKnowledge.getEntityById(this.currentTargetEntityId!);
            if (!finalTargetCheck || !finalTargetCheck.isValid) {
                console.log(`[CombatBehavior.executeCombatLogic] Target ${targetMob.name} defeated or disappeared.`);
                if (this.options.stopAfterKill) {
                    this.stop();
                    return true;
                } else {
                    this.currentTargetEntityId = null;
                    this.currentAttempts = 0;
                    await new Promise(resolve => setTimeout(resolve, 500));
                    continue;
                }
            }
        }

        console.log(`[CombatBehavior.executeCombatLogic] Combat loop exited. IsActive: ${this.isActive}, IsPaused: ${this.isPaused}.`);
        this.stop();
        return true;
    }
}
