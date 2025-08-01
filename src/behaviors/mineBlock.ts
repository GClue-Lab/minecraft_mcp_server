// src/behaviors/mineBlock.ts (ロジック改善版)

import * as mineflayer from 'mineflayer';
import { WorldKnowledge } from '../services/WorldKnowledge';
import { ChatReporter } from '../services/ChatReporter';
import { Block } from 'prismarine-block';
import { Item } from 'prismarine-item';

export interface MineBlockOptions {
    blockName?: string | null;
    quantity?: number;
    maxDistance?: number;
}

export class MineBlockBehavior {
    private bot: mineflayer.Bot;
    private worldKnowledge: WorldKnowledge;
    private chatReporter: ChatReporter;
    private options: Required<Omit<MineBlockOptions, 'blockName'> & { blockName: string | null }>;
    private isActive: boolean = false;
    private minedCount: number = 0;

    constructor(bot: mineflayer.Bot, worldKnowledge: WorldKnowledge, chatReporter: ChatReporter, options: MineBlockOptions) {
        this.bot = bot;
        this.worldKnowledge = worldKnowledge;
        this.chatReporter = chatReporter;
        this.options = {
            quantity: options.quantity ?? 1,
            maxDistance: options.maxDistance ?? 32,
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
            const blockId = this.options.blockName ? this.bot.registry.blocksByName[this.options.blockName]?.id : null;
            if (!blockId) {
                console.error(`[MineBlock] Unknown block name: ${this.options.blockName}`);
                break;
            }

            const targetBlock = this.worldKnowledge.findNearestBlock([blockId], this.options.maxDistance);
            
            if (targetBlock) {
                const distance = this.bot.entity.position.distanceTo(targetBlock.position.offset(0.5, 0.5, 0.5));

                // ★ここから修正: 距離に応じた判断を追加
                // 近すぎる場合（真上や真横にいる場合）、少し後ろに下がる
                if (distance < 1.5) {
                    this.bot.setControlState('back', true);
                    await new Promise(resolve => setTimeout(resolve, 300));
                    this.bot.setControlState('back', false);
                    continue; // 再度位置を評価
                }

                // 遠すぎる場合は、近づく
                if (distance > 4) {
                    this.bot.lookAt(targetBlock.position, true);
                    this.bot.setControlState('forward', true);
                    this.bot.setControlState('sprint', distance > 6);
                    this.bot.setControlState('jump', this.bot.entity.onGround && targetBlock.position.y > this.bot.entity.position.y);
                    await new Promise(resolve => setTimeout(resolve, 200));
                    continue;
                }
                // ★ここまで修正

                // 採掘に適した距離に入ったら、移動を停止
                this.bot.clearControlStates();

                const bestTool = this.getBestToolFor(targetBlock);
                if (bestTool) await this.bot.equip(bestTool, 'hand');
                
                try {
                    await this.bot.dig(targetBlock);
                    this.minedCount++;
                } catch (err: any) {
                    const errorMessage = `Digging failed: ${err.message}`;
                    this.chatReporter.reportError(errorMessage); // チャットに報告
                    await new Promise(resolve => setTimeout(resolve, 1000));
                }
            } else {
                await new Promise(resolve => setTimeout(resolve, 2000));
            }
        }
        this.stop();
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
        if (tools.length === 0) return null;

        const priority = ["netherite", "diamond", "iron", "stone", "wooden", "golden"];
        tools.sort((a, b) => {
            const matA = priority.findIndex(p => a.name.startsWith(p));
            const matB = priority.findIndex(p => b.name.startsWith(p));
            return (matA === -1 ? 99 : matA) - (matB === -1 ? 99 : matB);
        });
        
        return tools[0];
    }
}
