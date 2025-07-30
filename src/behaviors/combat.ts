// src/behaviors/combat.ts v1.9 (修正版)

import * as mineflayer from 'mineflayer';
import { WorldKnowledge } from '../services/WorldKnowledge';
import { Vec3 } from 'vec3';
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

    public start(): boolean {
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

        this.executeCombatLogic(); // awaitせず、バックグラウンドで実行開始
        return true; // 即座にtrueを返す
    }

    public stop(): void {
        console.log(`[CombatBehavior.stop] Stopping behavior. isActive: ${this.isActive}`);
        if (!this.isActive) {
            return; // 既に停止している場合は何もしない
        }

        console.log(`Stopping CombatBehavior.`);
        this.isActive = false;
        this.isPaused = false;
        this.bot.clearControlStates();
        this.currentTargetEntityId = null;
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

    private async executeCombatLogic(): Promise<void> {
        console.log(`[CombatBehavior.executeCombatLogic] Entering loop. Active: ${this.isActive}, Paused: ${this.isPaused}. Attempts: ${this.currentAttempts}`);
        
        while (this.isActive && !this.isPaused) {
            if (this.options.maxAttempts > 0 && this.currentAttempts >= this.options.maxAttempts) {
                console.log(`[CombatBehavior.executeCombatLogic] Max attempts (${this.options.maxAttempts}) reached. No target found. Stopping.`);
                break;
            }

            const now = Date.now();
            const shouldRecheckTarget = (now - this.lastTargetRecheckTime) > this.options.recheckTargetInterval;
            let targetMob = this.currentTargetEntityId ? this.worldKnowledge.getEntityById(this.currentTargetEntityId) : null;
            
            if (!targetMob || !targetMob.isValid || shouldRecheckTarget) {
                targetMob = this.findNearestHostileMob();
                this.lastTargetRecheckTime = now;

                if (targetMob) {
                    this.currentTargetEntityId = targetMob.id;
                    this.currentAttempts = 0;
                    console.log(`[CombatBehavior.executeCombatLogic] Confirmed new target ${targetMob.name} at ${targetMob.position} (ID: ${targetMob.id}).`);
                } else {
                    this.currentTargetEntityId = null;
                    console.log(`[CombatBehavior.executeCombatLogic] No active target mob found. Waiting...`);
                    this.currentAttempts++;
                    await new Promise(resolve => setTimeout(resolve, 2000));
                    if (!this.isActive) break;
                    continue;
                }
            }

            if (!this.currentTargetEntityId) continue;
            targetMob = this.worldKnowledge.getEntityById(this.currentTargetEntityId!);
            if (!targetMob || !targetMob.isValid || !this.bot.entity || !this.bot.entity.position || this.bot.entity.position.distanceTo(targetMob.position) > this.options.maxCombatDistance) {
                this.currentTargetEntityId = null;
                continue;
            }

            const targetPos = targetMob.position.offset(0, 1.6, 0);
            const distance = this.bot.entity.position.distanceTo(targetPos);

            if (distance > this.options.attackRange) {
                this.bot.lookAt(targetPos, true);
                this.bot.setControlState('forward', true);
                this.bot.setControlState('jump', this.bot.entity.onGround && targetPos.y > this.bot.entity.position.y + 0.5);
                await new Promise(resolve => setTimeout(resolve, 200));
                if (!this.isActive) break;
                continue;
            } else {
                this.bot.clearControlStates();
                this.bot.lookAt(targetPos, true);
            }

            try {
                const entityToAttack = this.bot.entities[this.currentTargetEntityId!];
                if(entityToAttack) {
                    this.bot.attack(entityToAttack);
                }
                await new Promise(resolve => setTimeout(resolve, 500));
                if (!this.isActive) break;
            } catch (err: any) {
                console.error(`[CombatBehavior.executeCombatLogic] Failed to attack mob ${targetMob.name}: ${err.message}`);
                this.currentTargetEntityId = null;
                await new Promise(resolve => setTimeout(resolve, 1000));
                if (!this.isActive) break;
                continue;
            }

            const finalTargetCheck = this.worldKnowledge.getEntityById(this.currentTargetEntityId!);
            if (!finalTargetCheck || !finalTargetCheck.isValid) {
                if (this.options.stopAfterKill) {
                    break; 
                } else {
                    this.currentTargetEntityId = null;
                    this.currentAttempts = 0;
                }
            }
        }

        console.log(`[CombatBehavior.executeCombatLogic] Combat loop exited.`);
        this.stop();
    }

    private findNearestHostileMob(): import('../services/WorldKnowledge').WorldEntity | undefined {
        const hostileMobNames = ['zombie', 'skeleton', 'spider', 'creeper', 'enderman', 'husk', 'stray', 'cave_spider', 'zombified_piglin', 'drowned', 'witch', 'guardian', 'elder_guardian', 'shulker', 'blaze', 'ghast', 'magma_cube', 'slime', 'phantom', 'wither_skeleton', 'piglin', 'piglin_brute', 'zoglin', 'vex', 'vindicator', 'evoker', 'ravager', 'illusions_illager', 'pillager'];
        return this.worldKnowledge.getAllEntities().find(e => {
            const isHostile = (e.type === 'mob' || e.type === 'hostile') && e.name && hostileMobNames.includes(e.name);
            if (!isHostile || !e.isValid) return false;
            if (e.name === this.bot.username || e.name === 'naisy714') return false;
            const distance = this.bot.entity.position.distanceTo(e.position);
            return distance <= this.options.maxCombatDistance;
        });
    }
}
