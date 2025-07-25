// src/behaviors/mineBlock.ts (最終修正版 - registryアクセスでanyを使用)

import * as mineflayer from 'mineflayer';
import { WorldKnowledge } from '../services/WorldKnowledge';
import { goals } from 'mineflayer-pathfinder';
import { Vec3 } from 'vec3';
import { Block } from 'prismarine-block'; // Blockクラスを直接インポート（これが問題ない前提）

// mineflayer.Bot.registry.blocks の要素の型は直接定義せず、anyで扱う
// type MineflayerRegistryBlockInfo = mineflayer.BlockType; // 削除またはコメントアウト

/**
 * ブロック採掘行動のオプションインターフェース
 */
export interface MineBlockOptions {
    blockId?: number;
    blockName?: string;
    quantity?: number;
    maxDistance?: number;
}

/**
 * ブロック採掘行動を管理するクラス
 */
export class MineBlockBehavior {
    private bot: mineflayer.Bot;
    private worldKnowledge: WorldKnowledge;
    private options: MineBlockOptions;
    private isActive: boolean = false;
    private currentTargetBlock: Block | null = null;
    private minedCount: number = 0;

    constructor(bot: mineflayer.Bot, worldKnowledge: WorldKnowledge, options: MineBlockOptions) {
        this.bot = bot;
        this.worldKnowledge = worldKnowledge;
        this.options = {
            quantity: 1,
            maxDistance: 32,
            ...options,
        };

        if (!this.options.blockId && !this.options.blockName) {
            throw new Error('MineBlockBehavior requires either blockId or blockName option.');
        }
        console.log(`MineBlockBehavior initialized for target: ${this.options.blockName || this.options.blockId} (quantity: ${this.options.quantity})`);
    }

    /**
     * 採掘行動を開始します。
     * @returns 成功した場合true、失敗した場合false
     */
    public async start(): Promise<boolean> {
        if (this.isActive) {
            console.warn('MineBlockBehavior is already active.');
            return false;
        }

        this.isActive = true;
        this.minedCount = 0; // 採掘数をリセット
        console.log(`Starting MineBlockBehavior for ${this.options.blockName || this.options.blockId}...`);

        return this.executeMineLogic(); // 初回実行と継続ロジック
    }

    /**
     * 採掘行動を停止します。
     */
    public stop(): void {
        if (!this.isActive) {
            console.warn('MineBlockBehavior is not active. Cannot stop.');
            return;
        }

        console.log(`Stopping MineBlockBehavior.`);
        this.isActive = false;
        this.bot.clearControlStates(); // ボットの制御状態をリセット
        this.worldKnowledge.stopPathfinding(); // 経路探索も停止
        this.currentTargetBlock = null;
    }

    /**
     * 行動が現在アクティブかどうかを返します。
     */
    public isRunning(): boolean {
        return this.isActive;
    }

    /**
     * ブロック採掘のメインロジック。
     */
    private async executeMineLogic(): Promise<boolean> {
        while (this.isActive && this.minedCount < this.options.quantity!) {
            console.log(`MineBlockBehavior: Looking for target block. Mined: ${this.minedCount}/${this.options.quantity}`);
            
            let blockIdsToFind: number[] = [];
            if (this.options.blockId) {
                blockIdsToFind.push(this.options.blockId);
            } else if (this.options.blockName) {
                // registry.blocks の値は any 型として扱う
                // これにより、TypeScriptの型チェックを回避し、ランタイムの動作に任せる
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
            }

            // 最寄りのターゲットブロックを見つける
            const targetBlock = this.worldKnowledge.findNearestBlock(blockIdsToFind, this.options.maxDistance!);

            if (!targetBlock) {
                console.warn(`MineBlockBehavior: No target block (${this.options.blockName || this.options.blockId}) found within ${this.options.maxDistance} blocks.`);
                this.stop(); // 見つからない場合は停止
                return false;
            }

            this.currentTargetBlock = targetBlock;
            console.log(`MineBlockBehavior: Found target block ${targetBlock.displayName} at ${targetBlock.position}`);

            const botPosition = this.bot.entity.position;
            const targetPos = targetBlock.position;

            // ブロックに到達するための経路を見つける
            const pathResult = await this.worldKnowledge.findPath(botPosition, targetPos, 1);

            if (!pathResult) {
                console.warn(`MineBlockBehavior: Could not find path to block ${targetBlock.displayName}. Retrying...`);
                await new Promise(resolve => setTimeout(resolve, 1000));
                continue;
            }
            
            // 採掘できる状態にあるか確認
            if (!this.bot.canDigBlock(targetBlock)) {
                console.warn(`MineBlockBehavior: Cannot dig block ${targetBlock.displayName} at ${targetBlock.position}. Skipping.`);
                this.currentTargetBlock = null; 
                await new Promise(resolve => setTimeout(resolve, 500));
                continue;
            }

            // 採掘する
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
