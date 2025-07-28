// src/behaviors/mineBlock.ts v1.4 (基本移動ロジック)

import * as mineflayer from 'mineflayer';
import { WorldKnowledge } from '../services/WorldKnowledge';
// goals と Path は mineflayer-pathfinder から来るので削除
// import { goals } from 'mineflayer-pathfinder';
// import { Path } from 'mineflayer-pathfinder';
import { Vec3 } from 'vec3'; // Vec3 は引き続き必要
import { Block } from 'prismarine-block';
import { BehaviorName } from '../services/BehaviorEngine';

type MineflayerRegistryBlockInfo = any; 

/**
 * ブロック採掘行動のオプションインターフェース
 */
export interface MineBlockOptions {
    blockId?: number | null;
    blockName?: string | null;
    quantity?: number;
    maxDistance?: number;
    // maxPathfindingAttempts?: number; // <<<< 削除済み
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

    public async start(): Promise<boolean> {
        if (this.isActive) {
            console.warn('MineBlockBehavior is already active.');
            return false;
        }

        this.isActive = true;
        this.isPaused = false;
        this.minedCount = 0;
        console.log(`Starting MineBlockBehavior for ${this.options.blockName || this.options.blockId}...`);

        return this.executeMineLogic();
    }

    public stop(): void {
        if (!this.isActive) {
            console.warn('MineBlockBehavior is not active. Cannot stop.');
            return;
        }

        console.log(`Stopping MineBlockBehavior.`);
        this.isActive = false;
        this.isPaused = false;
        this.bot.clearControlStates(); // ボットの制御状態をリセット
        // this.worldKnowledge.stopPathfinding(); // <<<< 削除済み
        this.currentTargetBlock = null;
    }

    public isRunning(): boolean {
        return this.isActive && !this.isPaused;
    }

    public pause(): void {
        if (!this.isActive || this.isPaused) return;
        console.log(`MineBlockBehavior: Pausing.`);
        this.isPaused = true;
        // this.worldKnowledge.stopPathfinding(); // <<<< 削除済み
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

    private async executeMineLogic(): Promise<boolean> {
        while (this.isActive && !this.isPaused && this.minedCount < this.options.quantity!) {
            console.log(`MineBlockBehavior: Looking for target block. Mined: ${this.minedCount}/${this.options.quantity}`);
            
            let blockIdsToFind: number[] = [];
            if (typeof this.options.blockId === 'number') {
                blockIdsToFind.push(this.options.blockId);
            } else if (typeof this.options.blockName === 'string') {
                const blockByName = (Object.values(this.bot.registry.blocks) as any[]).find(
                    (b: any) => b.name === this.options.blockName
                );
                
                if (blockByName) {
                    blockIdsToFind = blockByName.variations ? blockByName.variations.map((v: any) => v.id) : [blockByName.id];
                } else {
                    console.error(`MineBlockBehavior: Block with name "${this.options.blockName}" not found in registry.`);
                    this.stop();
                    return false;
                }
            } else {
                this.stop();
                return false;
            }

            const targetBlock = this.worldKnowledge.findNearestBlock(blockIdsToFind, this.options.maxDistance!);

            if (!targetBlock) {
                console.warn(`MineBlockBehavior: No target block (${this.options.blockName || this.options.blockId}) found within ${this.options.maxDistance} blocks. Stopping.`);
                this.stop();
                return false;
            }

            this.currentTargetBlock = targetBlock;
            console.log(`MineBlockBehavior: Found target block ${targetBlock.displayName} at ${targetBlock.position}`);

            const botPosition = this.bot.entity.position;
            const targetPos = targetBlock.position;

            const distanceToBlock = botPosition.distanceTo(targetPos);

            // --- ここを修正: Pathfinderを使わない基本移動ロジック ---
            if (distanceToBlock > 1.5) { // 採掘できる距離まで近づく
                console.log(`MineBlockBehavior: Moving towards block ${targetBlock.displayName} at ${targetPos}. Distance: ${distanceToBlock.toFixed(2)}.`);
                this.bot.lookAt(targetPos.offset(0.5, 0.5, 0.5), true); // ブロックの中心を向く
                this.bot.setControlState('forward', true); // 前に進む
                // 必要であれば簡易的なジャンプロジックを追加
                this.bot.setControlState('jump', this.bot.entity.onGround && targetPos.y > botPosition.y + 0.5);
                await new Promise(resolve => setTimeout(resolve, 200)); // 少しだけ移動する時間を与える
                continue; // 移動後、次のループで再度距離を確認
            } else {
                this.bot.clearControlStates(); // 採掘範囲内なら移動を停止
                this.bot.lookAt(targetPos.offset(0.5, 0.5, 0.5), true); // 採掘前にブロックの中心を向く
            }
            // --- 修正終わり ---
            
            if (!this.bot.canDigBlock(targetBlock)) {
                console.warn(`MineBlockBehavior: Cannot dig block ${targetBlock.displayName} at ${targetBlock.position}. Skipping.`);
                this.currentTargetBlock = null; 
                await new Promise(resolve => setTimeout(resolve, 500));
                continue;
            }

            try {
                console.log(`MineBlockBehavior: Digging ${targetBlock.displayName} at ${targetBlock.position}...`);
                await this.bot.dig(targetBlock);
                this.minedCount++;
                console.log(`MineBlockBehavior: Successfully mined ${targetBlock.displayName}. Mined: ${this.minedCount}/${this.options.quantity}`);
                await new Promise(resolve => setTimeout(resolve, 500));
            } catch (err: any) {
                console.error(`MineBlockBehavior: Failed to dig block ${targetBlock.displayName}: ${err.message}`);
                this.currentTargetBlock = null;
                await new Promise(resolve => setTimeout(resolve, 1000));
            }
        }

        if (this.isActive && this.minedCount >= this.options.quantity!) {
            console.log(`MineBlockBehavior: Finished mining ${this.options.quantity} of ${this.options.blockName || this.options.blockId}.`);
        } else if (this.isActive) {
            console.log(`MineBlockBehavior: Mining stopped early.`);
        }
        
        this.stop();
        return true;
    }
}
