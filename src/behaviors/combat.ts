// src/behaviors/combat.ts (シンプル版)

import * as mineflayer from 'mineflayer';
import { WorldKnowledge, WorldEntity } from '../services/WorldKnowledge';
import { Entity } from 'prismarine-entity';

export interface CombatOptions {
    targetEntityId: number; // ターゲットを名前ではなくEntity IDで指定
    attackRange?: number;
}

export class CombatBehavior {
    private bot: mineflayer.Bot;
    private worldKnowledge: WorldKnowledge;
    private options: Required<CombatOptions>;
    private isActive: boolean = false;

    constructor(bot: mineflayer.Bot, worldKnowledge: WorldKnowledge, options: CombatOptions) {
        this.bot = bot;
        this.worldKnowledge = worldKnowledge;
        
        if (!options.targetEntityId) {
            throw new Error('CombatBehavior requires a targetEntityId.');
        }

        this.options = {
            targetEntityId: options.targetEntityId,
            attackRange: options.attackRange ?? 4,
        };
    }

    public start(): boolean {
        if (this.isActive) return false;
        const target = this.worldKnowledge.getEntityById(this.options.targetEntityId);
        if (!target || !target.isValid) {
            console.warn(`[CombatBehavior] Target entity ${this.options.targetEntityId} not found or invalid. Cannot start.`);
            return false;
        }
        
        this.isActive = true;
        console.log(`[CombatBehavior] Starting combat against entity ID: ${this.options.targetEntityId}`);
        this.executeCombatLogic();
        return true;
    }

    public stop(): void {
        if (!this.isActive) return;
        this.isActive = false;
        this.bot.clearControlStates();
    }

    public isRunning(): boolean {
        return this.isActive;
    }

    public getOptions(): CombatOptions {
        return this.options;
    }

    private async executeCombatLogic(): Promise<void> {
        while (this.isActive) {
            const target = this.worldKnowledge.getEntityById(this.options.targetEntityId);

            // ターゲットが無効になったら行動を終了
            if (!target || !target.isValid) {
                console.log(`[CombatBehavior] Target ${this.options.targetEntityId} is no longer valid. Stopping.`);
                break;
            }

            const distance = this.bot.entity.position.distanceTo(target.position);

            this.bot.lookAt(target.position.offset(0, 1.6, 0), true);

            if (distance > this.options.attackRange) {
                this.bot.setControlState('forward', true);
            } else {
                this.bot.clearControlStates();
                const entityToAttack = this.bot.entities[target.id];
                if (entityToAttack) {
                    this.bot.attack(entityToAttack);
                }
            }
            await new Promise(resolve => setTimeout(resolve, 200));
        }
        this.stop();
    }
}
