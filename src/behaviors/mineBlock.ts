// src/behaviors/mineBlock.ts (賢い採掘ロジック版)

import * as mineflayer from 'mineflayer';
import { WorldKnowledge } from '../services/WorldKnowledge';
import { ChatReporter } from '../services/ChatReporter';
import { Block } from 'prismarine-block';
import { Item } from 'prismarine-item';
import { Vec3 } from 'vec3'; // Vec3をインポート

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

    // ★★★★★★★★★★ ここからロジックを全面的に修正 ★★★★★★★★★★
    private async executeMineLogic(): Promise<void> {
        while (this.isActive && this.minedCount < this.options.quantity) {
            const blockId = this.options.blockName ? this.bot.registry.blocksByName[this.options.blockName]?.id : null;
            if (!blockId) {
                console.error(`[MineBlock] Unknown block name: ${this.options.blockName}`);
                break;
            }

            const targetBlock = this.worldKnowledge.findNearestBlock([blockId], this.options.maxDistance);
            
            if (targetBlock) {
                const botPos = this.bot.entity.position;
                // ターゲットが足元にあるかどうかを判定
                const isTargetAtFeet = targetBlock.position.equals(botPos.floored());

                if (isTargetAtFeet) {
                    // 足元を掘る場合、まず安全な隣接マスを探す
                    const safeSpot = this.findSafeAdjacentSpot();
                    if (safeSpot) {
                        // 安全なマスがあれば、そこへ移動する
                        await this.moveToSafeSpot(safeSpot);
                        // 移動後は状況が変わるため、次のループで再評価する
                        continue;
                    }
                    // 安全なマスがなければ、そのまま足元を掘る処理に進む
                }

                // ターゲットへの距離を計算
                const distance = this.bot.entity.position.distanceTo(targetBlock.position.offset(0.5, 0.5, 0.5));

                // 遠すぎる場合は、近づく
                if (distance > 4) {
                    this.bot.lookAt(targetBlock.position, true);
                    this.bot.setControlState('forward', true);
                    this.bot.setControlState('sprint', distance > 6);
                    this.bot.setControlState('jump', this.bot.entity.onGround && targetBlock.position.y > this.bot.entity.position.y);
                    await new Promise(resolve => setTimeout(resolve, 200));
                    continue; // 再度位置を評価
                }
                
                // 近すぎる場合（真横など）、少し後ろに下がる
                if (distance < 1.5 && !isTargetAtFeet) {
                    this.bot.setControlState('back', true);
                    await new Promise(resolve => setTimeout(resolve, 300));
                    this.bot.setControlState('back', false);
                    continue; // 再度位置を評価
                }

                // 採掘に適した距離に入ったら、移動を停止
                this.bot.clearControlStates();

                const bestTool = this.getBestToolFor(targetBlock);
                if (bestTool) await this.bot.equip(bestTool, 'hand');
                
                try {
                    await this.bot.dig(targetBlock);
                    this.minedCount++;
                } catch (err: any) {
                    const errorMessage = `Digging failed: ${err.message}`;
                    this.chatReporter.reportError(errorMessage);
                    await new Promise(resolve => setTimeout(resolve, 1000));
                }
            } else {
                this.chatReporter.reportError(`Could not find any more ${this.options.blockName}.`);
                await new Promise(resolve => setTimeout(resolve, 2000));
                break; // 見つからなければループを抜ける
            }
        }
        this.stop();
    }

    /**
     * ボットの周囲4方向で、安全に移動できる隣接マスを探す
     * @returns 安全なマスの座標(Vec3)、またはnull
     */
    private findSafeAdjacentSpot(): Vec3 | null {
        const botPos = this.bot.entity.position.floored();
        const directions = [
            new Vec3(1, 0, 0),  // East
            new Vec3(-1, 0, 0), // West
            new Vec3(0, 0, 1),  // South
            new Vec3(0, 0, -1)  // North
        ];

        for (const dir of directions) {
            const spot = botPos.plus(dir);
            const groundBlock = this.bot.blockAt(spot.offset(0, -1, 0));
            const footBlock = this.bot.blockAt(spot);
            const headBlock = this.bot.blockAt(spot.offset(0, 1, 0));

            // 条件: 足場が固く、足元と頭上が空間であること
            const isSafe = 
                groundBlock && groundBlock.boundingBox === 'block' &&
                footBlock && footBlock.boundingBox === 'empty' &&
                headBlock && headBlock.boundingBox === 'empty';

            if (isSafe) {
                return spot; // 安全な場所が見つかった
            }
        }

        return null; // 安全な場所が見つからなかった
    }

    /**
     * 指定された隣接マスへ正確に移動する
     * @param destination 移動先の座標
     */
    private async moveToSafeSpot(destination: Vec3): Promise<void> {
        // 中央を向くように0.5オフセットを追加
        this.bot.lookAt(destination.offset(0.5, 0, 0.5), true);
        
        // 短い間だけ前進して移動
        this.bot.setControlState('forward', true);
        await new Promise(resolve => setTimeout(resolve, 400)); // 0.4秒ほど移動
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
