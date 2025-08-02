// src/behaviors/mineBlock.ts (新設計・タスクオブジェクト参照版)

import * as mineflayer from 'mineflayer';
import { WorldKnowledge } from '../services/WorldKnowledge';
import { ChatReporter } from '../services/ChatReporter';
import { Block } from 'prismarine-block';
import { Item } from 'prismarine-item';
import { goals } from 'mineflayer-pathfinder'; // ★ インポートを追加
import { Task } from '../types/mcp'; // ★Task型をインポート

// ★★★★★★★★★★★★★★★★★★★★★★★★★★★★★★★★★★★★★★★★
// ★ 移動ロジック切り替えフラグ ★
// true: mineflayer-pathfinderを使用 / false: 自作の簡易移動を使用
const USE_PATHFINDER = true; 
// ★★★★★★★★★★★★★★★★★★★★★★★★★★★★★★★★★★★★★★★★

export class MineBlockBehavior {
    private bot: mineflayer.Bot;
    private worldKnowledge: WorldKnowledge;
    private chatReporter: ChatReporter;
    private task: Task; // ★オプションの代わりに、タスクオブジェクト全体を保持する
    private isActive: boolean = false;
    private readonly MAX_REACHABLE_DISTANCE = 4.0;
    private readonly MIN_REACHABLE_DISTANCE = 1.5; // ★ 修正: 最適な距離の下限を定義

    constructor(bot: mineflayer.Bot, worldKnowledge: WorldKnowledge, chatReporter: ChatReporter, task: Task) {
        this.bot = bot;
        this.worldKnowledge = worldKnowledge;
        this.chatReporter = chatReporter;
        this.task = task; // ★渡されたタスクを保持
        
        // 引数のデフォルト値を設定
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
        (this.bot as any).pathfinder.stop(); // pathfinderの移動も停止
        this.bot.stopDigging();
        this.bot.clearControlStates();
    }

    public isRunning(): boolean {
        return this.isActive;
    }

    private async executeNextStep(): Promise<void> {
        // ★ 修正: タスクオブジェクトの残り数量を確認
        if (!this.isActive || this.task.arguments.quantity <= 0) {
            this.isActive = false; // 完了したら非アクティブ化
            return;
        }
        
        const blockName = this.task.arguments.blockName;
        const blockId = blockName ? this.bot.registry.blocksByName[blockName]?.id : null;

        if (!blockId) {
            this.chatReporter.reportError(`Unknown block name: ${blockName}`);
            this.isActive = false;
            return;
        }

        const targetBlock = this.worldKnowledge.findNearestBlock([blockId], this.task.arguments.maxDistance);
        
        if (!targetBlock) {
            this.chatReporter.reportError(`Could not find any more ${blockName}. Stopping task.`);
            this.isActive = false;
            return;
        }

        const distance = this.bot.entity.position.distanceTo(targetBlock.position.offset(0.5, 0.5, 0.5));
        // ケース1：ブロックから遠すぎる場合
        if (distance > this.MAX_REACHABLE_DISTANCE) {
            USE_PATHFINDER ? await this.moveToTargetWithPF(targetBlock) : await this.moveToTarget(targetBlock);
            this.executeNextStep(); // 移動後に再評価
            return;
        }

        // ケース2：ブロックに近すぎる（真上や隣にいる）場合
        if (distance < this.MIN_REACHABLE_DISTANCE) {
            USE_PATHFINDER ? await this.backUpWithPF(targetBlock) : await this.backUp();
            this.executeNextStep(); // 後退後に再評価
            return;
        }

        // ケース3：最適な距離にいる場合
        this.startDigging(targetBlock);
    }

    private async startDigging(targetBlock: Block): Promise<void> {
        await this.equipBestTool(targetBlock);
        
        this.bot.dig(targetBlock)
            .then(() => {
                if (!this.isActive) return;

                // ★ 修正: タスクオブジェクトの数量を直接減らす
                this.task.arguments.quantity--;

                this.chatReporter.reportError(`Successfully mined. Remaining: ${this.task.arguments.quantity}`);
                
                // 次のブロックを探しに行く
                this.executeNextStep();
            })
            .catch((err) => {
                if (!this.isActive) return; // 意図的に停止された場合はエラー報告しない
                this.chatReporter.reportError(`Digging failed or was interrupted: ${err.message}. Retrying...`);
                // 1秒待ってから再試行
                setTimeout(() => this.executeNextStep(), 1000);
            });
    }

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


    // ★★★★★★★★★★★★★★★★★★★★★★★★★★★★★★★★★★★★★★★★
    // ★ Pathfinderを使用した移動メソッドを新規追加 ★
    // ★★★★★★★★★★★★★★★★★★★★★★★★★★★★★★★★★★★★★★★★
    private async moveToTargetWithPF(targetBlock: Block): Promise<void> {
        const goal = new goals.GoalNear(targetBlock.position.x, targetBlock.position.y, targetBlock.position.z, 2);
        try {
            await (this.bot as any).pathfinder.goto(goal);
        } catch (e: any) {
            this.chatReporter.reportError(`[Pathfinder] Could not reach target: ${e.message}`);
        }
    }

    private async backUpWithPF(targetBlock: Block): Promise<void> {
        // 現在地からブロックとは逆方向のベクトルを計算
        const backVector = this.bot.entity.position.minus(targetBlock.position).normalize().scale(2);
        const goalPosition = this.bot.entity.position.plus(backVector);
        const goal = new goals.GoalBlock(goalPosition.x, goalPosition.y, goalPosition.z);
         try {
            await (this.bot as any).pathfinder.goto(goal);
        } catch (e: any) {
            this.chatReporter.reportError(`[Pathfinder] Could not back up: ${e.message}`);
        }
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
