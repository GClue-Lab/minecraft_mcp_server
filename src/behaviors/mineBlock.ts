// src/behaviors/mineBlock.ts (素手での採掘対応版)

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
    private readonly REACHABLE_DISTANCE = 4.0;
    private currentTargetBlock: Block | null = null;

    constructor(bot: mineflayer.Bot, worldKnowledge: WorldKnowledge, chatReporter: ChatReporter, options: MineBlockOptions) {
        this.bot = bot;
        this.worldKnowledge = worldKnowledge;
        this.chatReporter = chatReporter;
        this.options = {
            quantity: options.quantity ?? 1,
            maxDistance: options.maxDistance ?? 32,
            blockName: options.blockName ?? null,
        };
        this.onDiggingCompleted = this.onDiggingCompleted.bind(this);
        this.onDiggingAborted = this.onDiggingAborted.bind(this);
    }

    public start(): boolean {
        if (this.isActive) return false;
        this.isActive = true;
        this.executeNextStep();
        return true;
    }

    public stop(): void {
        if (!this.isActive) return;
        this.isActive = false;
        this.removeListeners();
        this.bot.stopDigging();
        this.bot.clearControlStates();
    }

    public isRunning(): boolean {
        return this.isActive;
    }

    public getOptions(): MineBlockOptions {
        return this.options;
    }

    private async executeNextStep(): Promise<void> {
        if (!this.isActive || this.minedCount >= this.options.quantity) {
            this.stop();
            return;
        }

        const blockId = this.options.blockName ? this.bot.registry.blocksByName[this.options.blockName]?.id : null;
        if (!blockId) {
            console.error(`[MineBlock] Unknown block name: ${this.options.blockName}`);
            this.stop();
            return;
        }

        const targetBlock = this.worldKnowledge.findNearestBlock([blockId], this.options.maxDistance);
        
        if (!targetBlock) {
            this.chatReporter.reportError(`Could not find any more ${this.options.blockName}. Stopping task.`);
            this.stop();
            return;
        }

        this.currentTargetBlock = targetBlock;
        const botPos = this.bot.entity.position;
        const targetPos = targetBlock.position;
        const distance = botPos.distanceTo(targetPos);
        const isTargetAtFeet = targetPos.equals(botPos.floored());

        if (isTargetAtFeet) {
            const safeSpot = this.findSafeAdjacentSpot();
            if (safeSpot) {
                await this.moveToSafeSpot(safeSpot);
                this.executeNextStep();
                return;
            }
        } else if (distance > this.REACHABLE_DISTANCE) {
            await this.moveToTarget(targetBlock);
            this.executeNextStep();
            return;
        }
        
        await this.startDigging(targetBlock);
    }

    /**
     * 採掘を開始し、イベントリスナーをセットする
     * @param targetBlock 採掘対象のブロック
     */
    private async startDigging(targetBlock: Block): Promise<void> {
        this.bot.clearControlStates();
        const bestTool = this.getBestToolFor(targetBlock);

        // ★★★★★★★★★★ ここからロジックを修正 ★★★★★★★★★★
        if (bestTool) {
            // 最適なツールがあれば装備する
            await this.bot.equip(bestTool, 'hand');
            this.chatReporter.reportError(`Equipped ${bestTool.name}.`);
        } else {
            // 最適なツールがなければ、現在手に持っているアイテムをしまう（素手にする）
            const heldItem = this.bot.heldItem;
            if (heldItem) {
                await this.bot.unequip('hand');
                this.chatReporter.reportError(`No tool found. Using bare hands.`);
            }
        }
        // ★★★★★★★★★★★★★★★★★★★★★★★★★★★★★★★★★

        this.addListeners();
        this.chatReporter.reportError(`Starting to dig ${this.options.blockName} at ${targetBlock.position}.`);
        this.bot.dig(targetBlock);
    }

    private onDiggingCompleted(block: Block): void {
        if (this.currentTargetBlock && this.currentTargetBlock.position.equals(block.position)) {
            this.minedCount++;
            this.removeListeners();
            setTimeout(() => this.executeNextStep(), 100);
        }
    }

    private onDiggingAborted(block: Block): void {
        if (this.currentTargetBlock && this.currentTargetBlock.position.equals(block.position)) {
            this.removeListeners();
            this.chatReporter.reportError("Digging was aborted. Retrying...");
            setTimeout(() => this.executeNextStep(), 1000);
        }
    }

    private addListeners(): void {
        this.bot.on('diggingCompleted', this.onDiggingCompleted);
        this.bot.on('diggingAborted', this.onDiggingAborted);
    }

    private removeListeners(): void {
        this.bot.removeListener('diggingCompleted', this.onDiggingCompleted);
        this.bot.removeListener('diggingAborted', this.onDiggingAborted);
    }

    private async moveToTarget(targetBlock: Block): Promise<void> {
        this.bot.lookAt(targetBlock.position, true);
        this.bot.setControlState('forward', true);
        const distance = this.bot.entity.position.distanceTo(targetBlock.position);
        this.bot.setControlState('sprint', distance > 6);
        this.bot.setControlState('jump', this.bot.entity.onGround && targetBlock.position.y > this.bot.entity.position.y);
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
            // ★修正: 特定のツールがないブロックでも、nullを返さずに処理を続行させる
            // この場合、ツール検索は行われず、結果的に素手で掘ることになる
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
