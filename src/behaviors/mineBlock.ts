// src/behaviors/mineBlock.ts v1.15 (完全版)

import * as mineflayer from 'mineflayer';
import { WorldKnowledge } from '../services/WorldKnowledge';
import { Block } from 'prismarine-block';
import { Item } from 'prismarine-item';
import { BehaviorName } from '../types/mcp';

export interface MineBlockOptions {
    blockId?: number | null;
    blockName?: string | null;
    quantity?: number;
    maxDistance?: number;
}

type InternalMineBlockOptions = {
    blockId: number | null;
    blockName: string | null;
    quantity: number;
    maxDistance: number;
}

export class MineBlockBehavior {
    private bot: mineflayer.Bot;
    private worldKnowledge: WorldKnowledge;
    private options: InternalMineBlockOptions;
    private isActive: boolean = false;
    private isPaused: boolean = false;
    private minedCount: number = 0;

    constructor(bot: mineflayer.Bot, worldKnowledge: WorldKnowledge, options: MineBlockOptions) {
        this.bot = bot;
        this.worldKnowledge = worldKnowledge;

        this.options = {
            quantity: options.quantity ?? 1,
            maxDistance: options.maxDistance ?? 32,
            blockId: options.blockId ?? null,
            blockName: options.blockName ?? null,
        };

        if (this.options.blockId === null && this.options.blockName === null) {
            throw new Error('MineBlockBehavior requires either blockId or blockName option.');
        }

        console.log(`[MineBlock] Initialized for target: ${this.options.blockName || `ID:${this.options.blockId}`} (quantity: ${this.options.quantity})`);
    }

    public start(): boolean {
        if (this.isActive) {
            console.warn('[MineBlock] Behavior is already active.');
            return false;
        }
        this.isActive = true;
        this.isPaused = false;
        this.minedCount = 0;
        console.log(`[MineBlock] Starting for ${this.options.blockName || `ID:${this.options.blockId}`}...`);
        this.executeMineLogic();
        return true;
    }

    public stop(): void {
        if (!this.isActive) return;
        console.log(`[MineBlock] Stopping behavior.`);
        this.isActive = false;
        this.isPaused = false;
        this.bot.clearControlStates();
    }

    public isRunning(): boolean {
        return this.isActive && !this.isPaused;
    }

    public pause(): void {
        if (!this.isActive || this.isPaused) return;
        console.log(`[MineBlock] Pausing.`);
        this.isPaused = true;
        this.bot.clearControlStates();
    }

    public resume(): void {
        if (!this.isActive || !this.isPaused) return;
        console.log(`[MineBlock] Resuming.`);
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
            maxDistance: this.options.maxDistance,
        };
    }

    private async executeMineLogic(): Promise<void> {
        while (this.isActive && !this.isPaused && this.minedCount < this.options.quantity) {
            const blockIdsToFind = this.getBlockIdsToFind();
            if (!blockIdsToFind) break;

            const targetBlock = this.worldKnowledge.findNearestBlock(blockIdsToFind, this.options.maxDistance);
            
            if (targetBlock) {
                if (this.bot.entity.position.distanceTo(targetBlock.position) > 3.5) {
                    this.bot.lookAt(targetBlock.position.offset(0.5, 0.5, 0.5), true);
                    this.bot.setControlState('forward', true);
                    await new Promise(resolve => setTimeout(resolve, 200));
                    continue;
                }
                this.bot.clearControlStates();
                
                const bestTool = this.getBestToolFor(targetBlock);
                if (bestTool) {
                    await this.bot.equip(bestTool, 'hand');
                }
                
                try {
                    console.log(`[MineBlock] Digging ${targetBlock.displayName}...`);
                    const diggingTimeout = 15000;
                    const timeoutPromise = new Promise((_, reject) => 
                        setTimeout(() => reject(new Error('Digging timed out')), diggingTimeout)
                    );
                    
                    await Promise.race([this.bot.dig(targetBlock), timeoutPromise]);
                    
                    this.minedCount++;
                    console.log(`[MineBlock] Mined count: ${this.minedCount}/${this.options.quantity}`);
                } catch (err: any) {
                    console.error(`[MineBlock] Failed to dig: ${err.message}`);
                    await new Promise(resolve => setTimeout(resolve, 1000));
                }

            } else {
                console.log(`[MineBlock] No '${this.options.blockName}' found within ${this.options.maxDistance} blocks. Waiting...`);
                await new Promise(resolve => setTimeout(resolve, 3000));
            }

            if (!this.isActive) break;
        }
        console.log('[MineBlock] Mining task loop finished.');
        this.stop();
    }
    
    private getBlockIdsToFind(): number[] | null {
        if (this.options.blockId) return [this.options.blockId];
        if (this.options.blockName) {
            const block = this.bot.registry.blocksByName[this.options.blockName];
            return block ? [block.id] : null;
        }
        return null;
    }

    private getBestToolFor(block: Block): Item | null {
        const blockName = block.name;
        let toolType = '';

        if (blockName.includes('log') || blockName.includes('planks') || blockName.includes('wood')) {
            toolType = '_axe';
        } else if (blockName.includes('stone') || blockName.includes('ore') || blockName.includes('cobble')) {
            toolType = '_pickaxe';
        } else if (blockName.includes('dirt') || blockName.includes('sand') || blockName.includes('gravel')) {
            toolType = '_shovel';
        } else {
            return null;
        }

        const tools = this.bot.inventory.items().filter(item => item.name.endsWith(toolType));
        if (tools.length === 0) {
            console.log(`[MineBlock] No tool matching *${toolType} found in inventory.`);
            return null;
        }

        const priority = ["netherite", "diamond", "iron", "stone", "wooden", "golden"];
        tools.sort((a, b) => {
            const matA = priority.findIndex(p => a.name.startsWith(p));
            const matB = priority.findIndex(p => b.name.startsWith(p));
            return (matA === -1 ? 99 : matA) - (matB === -1 ? 99 : matB);
        });
        
        console.log(`[MineBlock] Found best tool: ${tools[0].displayName}`);
        return tools[0];
    }
}
