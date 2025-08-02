// src/behaviors/mineBlock.ts (Promise形式・最終修正版)

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
        this.executeNextStep();
        return true;
    }

    public stop(): void {
        if (!this.isActive) return;
        this.isActive = false;
        // 採掘中にstop()が呼ばれると、bot.dig()のPromiseがrejectされ、.catch()が呼ばれる
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
        // タスクが非アクティブになったか、目標数を達成したら終了
        if (!this.isActive || this.minedCount >= this.options.quantity) {
            this.isActive = false; // 確実に終了させる
            return;
        }
        
        const blockId = this.options.blockName ? this.bot.registry.blocksByName[this.options.blockName]?.id : null;
        if (!blockId) {
            this.chatReporter.reportError(`Unknown block name: ${this.options.blockName}`);
            this.isActive = false;
            return;
        }

        const targetBlock = this.worldKnowledge.findNearestBlock([blockId], this.options.maxDistance);
        
        if (!targetBlock) {
            this.chatReporter.reportError(`Could not find any more ${this.options.blockName}. Stopping task.`);
            this.isActive = false;
            return;
        }

        const distance = this.bot.entity.position.distanceTo(targetBlock.position);

        if (distance > this.REACHABLE_DISTANCE) {
            await this.moveToTarget(targetBlock);
            // 移動後、再度次のステップを評価する
            this.executeNextStep();
            return;
        }
        
        // 採掘可能な位置にいれば、採掘を開始
        this.startDigging(targetBlock);
    }

    private async startDigging(targetBlock: Block): Promise<void> {
        await this.equipBestTool(targetBlock);
        this.chatReporter.reportError(`Starting to dig ${this.options.blockName} at ${targetBlock.position}.`);
        
        // ★★★★★★★★★★ ここをあなたのテストコードに基づき、全面的に修正 ★★★★★★★★★★
        this.bot.dig(targetBlock)
            .then(() => {
                // 採掘が完了したときの処理
                if (!this.isActive) return; // 既に停止命令が出ていれば何もしない

                this.minedCount++;
                this.chatReporter.reportError(`Successfully mined ${this.minedCount}/${this.options.quantity} of ${this.options.blockName}.`);
                
                // 次のブロックを探しに行く
                this.executeNextStep();
            })
            .catch((err) => {
                // 採掘が失敗、または中断されたときの処理
                if (!this.isActive) return; // 意図的に停止された場合はエラー報告しない

                this.chatReporter.reportError(`Digging failed or was interrupted: ${err.message}. Retrying...`);
                // 1秒待ってから再試行
                setTimeout(() => this.executeNextStep(), 1000);
            });
        // ★★★★★★★★★★★★★★★★★★★★★★★★★★★★★★★★★★★★★★★★★★★★★★★
    }

    private async moveToTarget(targetBlock: Block): Promise<void> {
        this.bot.lookAt(targetBlock.position.offset(0.5, 0.5, 0.5), true);
        this.bot.setControlState('forward', true);
        await new Promise(resolve => setTimeout(resolve, 200));
        this.bot.clearControlStates();
    }
    
    private async equipBestTool(block: Block): Promise<void> {
        const bestTool = this.getBestToolFor(block);
        if (bestTool) {
            await this.bot.equip(bestTool, 'hand');
        } else if (this.bot.heldItem) {
            await this.bot.unequip('hand');
        }
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
