// src/behaviors/mineBlock.ts v1.9 (修正版)

import * as mineflayer from 'mineflayer';
import { WorldKnowledge } from '../services/WorldKnowledge';
import { Vec3 } from 'vec3';
import { Block } from 'prismarine-block';
import { BehaviorName } from '../types/mcp';

/**
 * ブロック採掘行動のオプションインターフェース
 */
export interface MineBlockOptions {
    blockId?: number | null;
    blockName?: string | null;
    quantity?: number;
    maxDistance?: number;
}

/**
 * ブロック採掘行動を管理するクラス
 */
export class MineBlockBehavior {
    private bot: mineflayer.Bot;
    private worldKnowledge: WorldKnowledge;
    private options: {
        blockId: number | undefined;
        blockName: string | undefined;
        quantity: number;
        maxDistance: number;
    };
    private isActive: boolean = false;
    private isPaused: boolean = false;
    private currentTargetBlock: Block | null = null;
    private minedCount: number = 0;

    constructor(bot: mineflayer.Bot, worldKnowledge: WorldKnowledge, options: MineBlockOptions) {
        this.bot = bot;
        this.worldKnowledge = worldKnowledge;
        
        this.options = {
            quantity: options.quantity ?? 1,
            maxDistance: options.maxDistance ?? 32,
            blockId: options.blockId ?? undefined,
            blockName: options.blockName ?? undefined,
        };

        if (this.options.blockId === undefined && this.options.blockName === undefined) {
            throw new Error('MineBlockBehavior requires either blockId or blockName option.');
        }
        console.log(`MineBlockBehavior initialized for target: ${this.options.blockName || this.options.blockId} (quantity: ${this.options.quantity})`);
    }

    public start(): boolean {
        if (this.isActive) {
            console.warn('MineBlockBehavior is already active.');
            return false;
        }

        this.isActive = true;
        this.isPaused = false;
        this.minedCount = 0;
        console.log(`Starting MineBlockBehavior for ${this.options.blockName || this.options.blockId}...`);

        this.executeMineLogic(); // awaitせず、バックグラウンドで実行
        return true; // 即座にtrueを返す
    }

    public stop(): void {
        if (!this.isActive) {
            return;
        }
        console.log(`Stopping MineBlockBehavior.`);
        this.isActive = false;
        this.isPaused = false;
        this.bot.clearControlStates();
        this.currentTargetBlock = null;
    }

    public isRunning(): boolean {
        return this.isActive && !this.isPaused;
    }

    public pause(): void {
        if (!this.isActive || this.isPaused) return;
        console.log(`MineBlockBehavior: Pausing.`);
        this.isPaused = true;
        this.bot.clearControlStates();
    }

    public resume(): void {
        if (!this.isActive || !this.isPaused) return;
        console.log(`MineBlockBehavior: Resuming.`);
        this.isPaused = false;
        this.executeMineLogic();
    }

    public canBeInterruptedBy(higherPriorityBehavior: BehaviorName): boolean {
        return higherPriorityBehavior === 'combat';
    }

    public getOptions(): MineBlockOptions {
        return {
            blockId: this.options.blockId,
            blockName: this.options.blockName,
            quantity: this.options.quantity,
            maxDistance: this.options.maxDistance
        };
    }

    private async executeMineLogic(): Promise<void> {
        while (this.isActive && !this.isPaused && this.minedCount < this.options.quantity!) {
            console.log(`MineBlockBehavior: Looking for target block. Mined: ${this.minedCount}/${this.options.quantity}`);
            
            const blockIdsToFind = this.getBlockIdsToFind();
            if (!blockIdsToFind) {
                break;
            }

            const targetBlock = this.worldKnowledge.findNearestBlock(blockIdsToFind, this.options.maxDistance!);
            if (!targetBlock) {
                console.warn(`MineBlockBehavior: No target block found. Stopping.`);
                break;
            }

            this.currentTargetBlock = targetBlock;
            const distanceToBlock = this.bot.entity.position.distanceTo(targetBlock.position);

            if (distanceToBlock > 3) {
                this.bot.lookAt(targetBlock.position.offset(0.5, 0.5, 0.5), true);
                this.bot.setControlState('forward', true);
                await new Promise(resolve => setTimeout(resolve, 200));
                if (!this.isActive) break;
                continue;
            } else {
                this.bot.clearControlStates();
                this.bot.lookAt(targetBlock.position.offset(0.5, 0.5, 0.5), true);
            }
            
            if (!this.bot.canDigBlock(targetBlock)) {
                await new Promise(resolve => setTimeout(resolve, 500));
                if (!this.isActive) break;
                continue;
            }

            try {
                await this.bot.dig(targetBlock);
                this.minedCount++;
                console.log(`MineBlockBehavior: Successfully mined. Mined: ${this.minedCount}/${this.options.quantity}`);
                await new Promise(resolve => setTimeout(resolve, 500));
                if (!this.isActive) break;
            } catch (err: any) {
                console.error(`MineBlockBehavior: Failed to dig block: ${err.message}`);
                await new Promise(resolve => setTimeout(resolve, 1000));
                if (!this.isActive) break;
            }
        }

        if (this.isActive) {
             console.log(`MineBlockBehavior: Finished or stopped mining.`);
        }
        this.stop();
    }
    
    private getBlockIdsToFind(): number[] | null {
        if (typeof this.options.blockId === 'number') {
            return [this.options.blockId];
        }
        if (typeof this.options.blockName === 'string') {
            const blockByName = (this.bot.registry.blocksByName as any)[this.options.blockName];
            if (blockByName) {
                return [blockByName.id];
            } else {
                console.error(`Block with name "${this.options.blockName}" not found.`);
                return null;
            }
        }
        return null;
    }
}
