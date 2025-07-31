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
        this.bot.clearControlStates(); // 停止時に移動をキャンセル
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

        console.log(`[DropItems] Arrived at destination. Dropping all items.`);
        try {
            // インベントリ内のすべてのアイテムをドロップする
            for (const item of this.bot.inventory.items()) {
                if (!this.isActive) break; // ドロップ中に停止された場合
                await this.bot.tossStack(item);
                console.log(`[DropItems] Dropped ${item.count} of ${item.name}`);
                await new Promise(resolve => setTimeout(resolve, 100)); // 連続ドロップのための短い待機
            }
        } catch (err: any) {
            console.error(`[DropItems] Failed to drop items: ${err.message}`);
        }

        console.log(`[DropItems] Finished dropping items.`);
        this.isActive = false; // 完了
    }
}
