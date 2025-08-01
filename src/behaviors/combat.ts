// src/behaviors/combat.ts (Pathfinder使用版)

import * as mineflayer from 'mineflayer';
import { WorldKnowledge } from '../services/WorldKnowledge';
import { goals } from 'mineflayer-pathfinder';

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
        // @ts-ignore
        this.bot.pathfinder.stop();
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

            if (!target || !target.isValid) {
                console.log(`[CombatBehavior] Target ${this.options.targetEntityId} is no longer valid. Stopping.`);
                break;
            }

            const distance = this.bot.entity.position.distanceTo(target.position);

            // 攻撃範囲外なら、Pathfinderで近づく
            if (distance > this.options.attackRange) {
                // @ts-ignore
                if (this.bot.pathfinder.isMoving()) {
                    // 移動中なら何もしない
                } else {
                    const goal = new goals.GoalNear(target.position.x, target.position.y, target.position.z, this.options.attackRange);
                    try {
                        // @ts-ignore
                        await this.bot.pathfinder.goto(goal);
                    } catch(e) {
                        // パスが見つからない場合はループを継続
                    }
                }
            } else { // 攻撃範囲内なら、移動を停止して攻撃
                // @ts-ignore
                this.bot.pathfinder.stop();
                this.bot.lookAt(target.position.offset(0, 1.6, 0), true);
                
                // @ts-ignore
                const entityToAttack = this.bot.entities[target.id];
                // ★ここを修正: canSee()メソッドは存在しないため削除
                if (entityToAttack) {
                    this.bot.attack(entityToAttack);
                }
            }
            await new Promise(resolve => setTimeout(resolve, 200));
        }
        this.stop();
    }
}
