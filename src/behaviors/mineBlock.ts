import * as mineflayer from 'mineflayer';
import { WorldKnowledge } from '../services/WorldKnowledge';
import { ChatReporter } from '../services/ChatReporter';
import { Block } from 'prismarine-block';
import { Item } from 'prismarine-item';
import { goals } from 'mineflayer-pathfinder';
import { Task } from '../types/mcp';

// 移動ロジック切り替えフラグ
const USE_PATHFINDER = true; 

export class MineBlockBehavior {
    private bot: mineflayer.Bot;
    private worldKnowledge: WorldKnowledge;
    private chatReporter: ChatReporter;
    private task: Task;
    private isActive: boolean = false;
    private readonly MAX_REACHABLE_DISTANCE = 4.0;

    constructor(bot: mineflayer.Bot, worldKnowledge: WorldKnowledge, chatReporter: ChatReporter, task: Task) {
        this.bot = bot;
        this.worldKnowledge = worldKnowledge;
        this.chatReporter = chatReporter;
        this.task = task;
        
        this.task.arguments.quantity = this.task.arguments.quantity ?? 1;
        this.task.arguments.maxDistance = this.task.arguments.maxDistance ?? 32;
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

        // ★★★ Pathfinderをより確実に停止させるための修正 ★★★
        (this.bot as any).pathfinder.stop();
        (this.bot as any).pathfinder.setGoal(null); // ゴールを明示的にnullに設定して、完全にリセットする

        this.bot.stopDigging();
        this.bot.clearControlStates();
    }

    public isRunning(): boolean {
        return this.isActive;
    }

    private async executeNextStep(): Promise<void> {
        try {
            if (!this.isActive || this.task.arguments.quantity <= 0) {
                this.isActive = false;
                return;
            }

            const blockName = this.task.arguments.blockName;
            const blockId = blockName ? this.bot.registry.blocksByName[blockName]?.id : null;

            if (!blockId) {
                this.chatReporter.reportError(`Unknown block name: ${blockName}`);
                this.isActive = false;
                return;
            }

            console.log(`[DEBUG] MineBlock: Attempting to find nearest '${blockName}'...`);
            const targetBlock = this.worldKnowledge.findNearestBlock([blockId], this.task.arguments.maxDistance);
            console.log(`[DEBUG] MineBlock: Found nearest block at ${targetBlock?.position || 'null'}.`);
    
            if (!targetBlock) {
                this.chatReporter.reportError(`Could not find any more ${blockName}. Stopping task.`);
                this.isActive = false;
                return;
            }

            if (!this.bot.entity) {
                console.log(`[DEBUG] Bot entity not available yet. Retrying in 1 second...``);
                setTimeout(() => this.executeNextStep(), 1000); // 1秒後にもう一度試す
                return;
            }

            const distance = this.bot.entity.position.distanceTo(targetBlock.position.offset(0.5, 0.5, 0.5));

            if (distance > this.MAX_REACHABLE_DISTANCE) {
                USE_PATHFINDER ? await this.moveToTargetWithPF(targetBlock) : await this.moveToTarget(targetBlock);
                this.executeNextStep();
                return;
            }

            this.startDigging(targetBlock);
        } catch (e: any) {
            this.chatReporter.reportError(`[FATAL] An error occurred in executeNextStep: ${e.message}`);
            this.chatReporter.reportError(e.stack); // より詳細なエラー情報を表示
            this.isActive = false; // エラーが発生したら行動を停止
        }
    }

    private async startDigging(targetBlock: Block): Promise<void> {
        await this.equipBestTool(targetBlock);
        
        this.bot.dig(targetBlock)
            .then(() => {
                if (!this.isActive) return;
                this.task.arguments.quantity--;
                this.chatReporter.reportError(`Successfully mined. Remaining: ${this.task.arguments.quantity}`);
                this.executeNextStep();
            })
            .catch((err) => {
                if (!this.isActive) return;
                this.chatReporter.reportError(`Digging failed or was interrupted: ${err.message}. Retrying...`);
                setTimeout(() => this.executeNextStep(), 1000);
            });
    }

    // ========== Pathfinderを使用しない簡易移動 ==========
    private async moveToTarget(targetBlock: Block): Promise<void> {
        this.bot.lookAt(targetBlock.position.offset(0.5, 0.5, 0.5), true);
        this.bot.setControlState('forward', true);
        await new Promise(resolve => setTimeout(resolve, 200));
        this.bot.clearControlStates();
    }
    
    private async backUp(): Promise<void> {
        this.bot.setControlState('back', true);
        await new Promise(resolve => setTimeout(resolve, 100));
        this.bot.clearControlStates();
    }

    // ========== Pathfinderを使用した移動 ==========
    private async moveToTargetWithPF(targetBlock: Block): Promise<void> {
        // ★★★ ゴールの種類を、ブロックへの隣接を目的とする GoalGetToBlock に変更 ★★★
        const goal = new goals.GoalGetToBlock(targetBlock.position.x, targetBlock.position.y, targetBlock.position.z);
        try {
            await (this.bot as any).pathfinder.goto(goal);
        } catch (e: any) {
            this.chatReporter.reportError(`[Pathfinder] Could not reach target: ${e.message}`);
        } finally {
            // ★★★ 移動後に操作状態をクリアして、フリーズを防止 ★★★
            this.bot.clearControlStates();
        }
    }

    private async backUpWithPF(targetBlock: Block): Promise<void> {
        // ★★★「あのブロックから離れたい」という柔軟なゴールに変更 ★★★
        const goalToInvert = new goals.GoalBlock(targetBlock.position.x, targetBlock.position.y, targetBlock.position.z);
        const goal = new goals.GoalInvert(goalToInvert);
        try {
            await (this.bot as any).pathfinder.goto(goal);
        } catch (e: any) {
            this.chatReporter.reportError(`[Pathfinder] Could not back up: ${e.message}`);
        } finally {
            // ★★★ 移動後に操作状態をクリアして、フリーズを防止 ★★★
            this.bot.clearControlStates();
        }
    }

    // ========== 道具の選択ロジック ==========
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
