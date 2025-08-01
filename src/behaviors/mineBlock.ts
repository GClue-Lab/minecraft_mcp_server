// src/behaviors/mineBlock.ts (Pathfinder使用版)

import * as mineflayer from 'mineflayer';
import { WorldKnowledge } from '../services/WorldKnowledge';
import { Block } from 'prismarine-block';
import { Item } from 'prismarine-item';
import { goals } from 'mineflayer-pathfinder'; // PathfinderのGoalをインポート

export interface MineBlockOptions {
    blockId?: number | null;
    blockName?: string | null;
    quantity?: number;
    maxDistance?: number;
}

export class MineBlockBehavior {
    private bot: mineflayer.Bot;
    private worldKnowledge: WorldKnowledge;
    private options: Required<Omit<MineBlockOptions, 'blockId' | 'blockName'> & { blockId: number | null, blockName: string | null }>;
    private isActive: boolean = false;
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
    }

    public start(): boolean {
        if (this.isActive) return false;
        this.isActive = true;
        this.executeMineLogic();
        return true;
    }

    public stop(): void {
        if (!this.isActive) return;
        this.isActive = false;
        // @ts-ignore
        this.bot.pathfinder.stop(); // Pathfinderの移動をキャンセル
        this.bot.clearControlStates();
    }

    public isRunning(): boolean {
        return this.isActive;
    }

    public getOptions(): MineBlockOptions {
        return this.options;
    }

    private async executeMineLogic(): Promise<void> {
        while (this.isActive && this.minedCount < this.options.quantity) {
            const blockIdsToFind = this.getBlockIdsToFind();
            if (!blockIdsToFind) break;

            const targetBlock = this.worldKnowledge.findNearestBlock(blockIdsToFind, this.options.maxDistance);
            
            if (targetBlock) {
                // ★ここから修正: 原始的な移動をPathfinderに置き換え
                console.log(`[MineBlock] Target block found at ${targetBlock.position}. Moving...`);
                
                if (!this.bot.canDigBlock(targetBlock)) {
                    console.error(`[MineBlock] Cannot dig this block: ${targetBlock.name}. Finding another one.`);
                    await new Promise(resolve => setTimeout(resolve, 1000)); // 少し待って再検索
                    continue;
                }

                try {
                    // ブロックから4ブロック以内の地点をゴールに設定
                    const goal = new goals.GoalNear(targetBlock.position.x, targetBlock.position.y, targetBlock.position.z, 4);
                    // @ts-ignore
                    await this.bot.pathfinder.goto(goal);
                } catch (err: any) {
                    console.error(`[MineBlock] Pathfinder could not find a path: ${err.message}. Finding another block.`);
                    await new Promise(resolve => setTimeout(resolve, 2000));
                    continue;
                }
                // ★ここまで修正

                const bestTool = this.getBestToolFor(targetBlock);
                if (bestTool) {
                    await this.bot.equip(bestTool, 'hand');
                }
                
                try {
                    console.log(`[MineBlock] In range. Digging ${targetBlock.displayName}...`);
                    await this.bot.dig(targetBlock);
                    this.minedCount++;
                    console.log(`[MineBlock] Mined count: ${this.minedCount}/${this.options.quantity}`);
                } catch (err: any) {
                    console.error(`[MineBlock] Failed to dig: ${err.message}`);
                    await new Promise(resolve => setTimeout(resolve, 1000));
                }

            } else {
                console.log(`[MineBlock] No '${this.options.blockName}' found. Waiting...`);
                await new Promise(resolve => setTimeout(resolve, 2000));
            }
        }
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
