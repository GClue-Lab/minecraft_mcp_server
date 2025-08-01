// src/behaviors/combat.ts (直接制御版)

import * as mineflayer from 'mineflayer';
import { WorldKnowledge } from '../services/WorldKnowledge';

export interface CombatOptions {
    targetEntityId: number;
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
        this.options = {
            targetEntityId: options.targetEntityId,
            attackRange: options.attackRange ?? 4,
        };
    }

    public start(): boolean {
        if (this.isActive) return false;
        const target = this.worldKnowledge.getEntityById(this.options.targetEntityId);
        if (!target || !target.isValid) return false;
        
        this.isActive = true;
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
            if (!target || !target.isValid) break;

            const distance = this.bot.entity.position.distanceTo(target.position);
            this.bot.lookAt(target.position.offset(0, 1.6, 0), true);

            if (distance > this.options.attackRange) {
                // ★ここを修正: 移動ロジックを統一
                this.bot.setControlState('forward', true);
                this.bot.setControlState('sprint', distance > 5);
                const targetIsHigher = target.position.y > this.bot.entity.position.y + 0.5;
                this.bot.setControlState('jump', this.bot.entity.onGround && targetIsHigher);
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
