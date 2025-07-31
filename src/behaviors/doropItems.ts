// src/behaviors/dropItems.ts (新規作成)

import * as mineflayer from 'mineflayer';
import { Vec3 } from 'vec3';

export interface DropItemsOptions {
    position: Vec3;
    itemsToDrop?: { name: string, quantity?: number }[];
}

export class DropItemsBehavior {
    private bot: mineflayer.Bot;
    private options: Required<DropItemsOptions>;
    private isActive: boolean = false;

    constructor(bot: mineflayer.Bot, options: DropItemsOptions) {
        this.bot = bot;
        this.options = {
            position: options.position,
            itemsToDrop: options.itemsToDrop || []
        };
    }

    public start(): boolean {
        if (this.isActive) return false;
        this.isActive = true;
        this.executeDropLogic();
        return true;
    }

    public stop(): void {
        this.isActive = false;
    }

    public isRunning(): boolean {
        return this.isActive;
    }
    
    public getOptions(): DropItemsOptions {
        return this.options;
    }

    private async executeDropLogic(): Promise<void> {
        console.log(`[DropItems] Moving to ${this.options.position} to drop items.`);
        
        // TODO: ここにPathfinderなどを使った移動ロジックを実装する
        // 現時点では簡易的な移動
        this.bot.lookAt(this.options.position, true);
        
        // 目的地に近づくまで待つ (簡易版)
        while(this.isActive && this.bot.entity.position.distanceTo(this.options.position) > 2) {
            this.bot.setControlState('forward', true);
            await new Promise(resolve => setTimeout(resolve, 200));
        }
        this.bot.clearControlStates();

        if (!this.isActive) return;

        console.log(`[DropItems] Arrived at destination. Dropping items.`);
        try {
            const itemsToDrop = this.bot.inventory.items();
            for (const item of itemsToDrop) {
                // 石炭と原木以外はドロップしない（例）
                if (item.name.includes('coal') || item.name.includes('log')) {
                    await this.bot.tossStack(item);
                    console.log(`[DropItems] Dropped ${item.count} of ${item.name}`);
                }
            }
        } catch (err: any) {
            console.error(`[DropItems] Failed to drop items: ${err.message}`);
        }

        console.log(`[DropItems] Finished dropping items.`);
        this.isActive = false; // 完了
    }
}
