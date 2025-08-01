// src/behaviors/mineBlock.ts (精密採掘・報告強化版)

import * as mineflayer from 'mineflayer';
import { WorldKnowledge } from '../services/WorldKnowledge';
import { ChatReporter } from '../services/ChatReporter';
import { Block } from 'prismarine-block';
import { Item } from 'prismarine-item';
import { Vec3 } from 'vec3';

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
    private readonly REACHABLE_DISTANCE = 4.0; // ボットが移動せずに掘れる最大距離

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
            
            if (!targetBlock) {
                this.chatReporter.reportError(`Could not find any more ${this.options.blockName}. Stopping task.`);
                await new Promise(resolve => setTimeout(resolve, 2000));
                break;
            }

            const botPos = this.bot.entity.position;
            const targetPos = targetBlock.position;
            const distance = botPos.distanceTo(targetPos);

            // ターゲットが足元にあるか判定
            const isTargetAtFeet = targetPos.equals(botPos.floored());

            // --- 行動決定ロジック ---
            if (isTargetAtFeet) {
                // 1. ターゲットが足元にある場合
                const safeSpot = this.findSafeAdjacentSpot();
                if (safeSpot) {
                    this.chatReporter.reportError("Target is at my feet. Moving to a safe spot first.");
                    await this.moveToSafeSpot(safeSpot);
                    this.chatReporter.reportError("Finished positioning.");
                    continue; // 移動後、次のループで状況を再評価
                }
                // 安全な場所がなければ、そのまま掘るフェーズへ
            } else if (distance > this.REACHABLE_DISTANCE) {
                // 2. ターゲットが採掘可能距離より遠い場合
                this.chatReporter.reportError(`Target is too far (${distance.toFixed(2)}m). Moving to ${targetPos}.`);
                await this.moveToTarget(targetBlock);
                this.chatReporter.reportError("Finished moving.");
                continue; // 移動後、次のループで状況を再評価
            }
            
            // 3. ターゲットが採掘可能距離にある場合（または足元で安全な場所がない場合）
            this.bot.clearControlStates();
            const bestTool = this.getBestToolFor(targetBlock);
            if (bestTool) await this.bot.equip(bestTool, 'hand');
            
            try {
                this.chatReporter.reportError(`Starting to dig ${this.options.blockName} at ${targetPos}.`);
                await this.bot.dig(targetBlock);
                this.minedCount++;
            } catch (err: any) {
                const errorMessage = `Digging failed: ${err.message}`;
                this.chatReporter.reportError(errorMessage);
                await new Promise(resolve => setTimeout(resolve, 1000));
            }
        }
        this.stop();
    }

    /**
     * ターゲットブロックに近づくための汎用的な移動処理
     * @param targetBlock 移動先のブロック
     */
    private async moveToTarget(targetBlock: Block): Promise<void> {
        this.bot.lookAt(targetBlock.position, true);
        this.bot.setControlState('forward', true);
        
        const distance = this.bot.entity.position.distanceTo(targetBlock.position);
        this.bot.setControlState('sprint', distance > 6);
        this.bot.setControlState('jump', this.bot.entity.onGround && targetBlock.position.y > this.bot.entity.position.y);
        
        // 200msだけ移動して、次のループで再評価
        await new Promise(resolve => setTimeout(resolve, 200));
    }

    private findSafeAdjacentSpot(): Vec3 | null {
        const botPos = this.bot.entity.position.floored();
        const directions = [
            new Vec3(1, 0, 0),
            new Vec3(-1, 0, 0),
            new Vec3(0, 0, 1),
            new Vec3(0, 0, -1)
        ];

        for (const dir of directions) {
            const spot = botPos.plus(dir);
            const groundBlock = this.bot.blockAt(spot.offset(0, -1, 0));
            const footBlock = this.bot.blockAt(spot);
            const headBlock = this.bot.blockAt(spot.offset(0, 1, 0));

            const isSafe = 
                groundBlock && groundBlock.boundingBox === 'block' &&
                footBlock && footBlock.boundingBox === 'empty' &&
                headBlock && headBlock.boundingBox === 'empty';

            if (isSafe) {
                return spot;
            }
        }
        return null;
    }

    private async moveToSafeSpot(destination: Vec3): Promise<void> {
        this.bot.lookAt(destination.offset(0.5, 0, 0.5), true);
        this.bot.setControlState('forward', true);
        await new Promise(resolve => setTimeout(resolve, 400));
        this.bot.clearControlStates();
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
