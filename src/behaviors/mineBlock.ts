import * as mineflayer from 'mineflayer';
import { WorldKnowledge } from '../services/WorldKnowledge';
import { ChatReporter } from '../services/ChatReporter';
import { Block } from 'prismarine-block';
import { Item } from 'prismarine-item';
import { goals, Movements } from 'mineflayer-pathfinder';
import { Task } from '../types/mcp';

// 内部的な状態を管理するための型
type InternalState = 'STARTING' | 'MOVING' | 'ARRIVED' | 'DIGGING' | 'DONE';

export class MineBlockBehavior {
    private bot: mineflayer.Bot;
    private worldKnowledge: WorldKnowledge;
    private chatReporter: ChatReporter;
    private task: Task;

    private isActive: boolean = false;
    private updateInterval: NodeJS.Timeout | null = null;
    private internalState: InternalState = 'STARTING';
    private targetBlock: Block | null = null;
    private hasStartedDigging: boolean = false;
    private readonly MAX_REACHABLE_DISTANCE = 4.0;
    
    constructor(bot: mineflayer.Bot, worldKnowledge: WorldKnowledge, chatReporter: ChatReporter, task: Task) {
        this.bot = bot;
        this.worldKnowledge = worldKnowledge;
        this.chatReporter = chatReporter;
        this.task = task;
        this.task.arguments.quantity = this.task.arguments.quantity ?? 1;
        this.task.arguments.maxDistance = this.task.arguments.maxDistance ?? 32;
    }

    private get pathfinder() {
        return (this.bot as any).pathfinder; // 型は any でOK
    }

    public start(): boolean {
        if (this.isActive) return false;
        const pathfinder = this.pathfinder;
        const ready = pathfinder && typeof pathfinder.setGoal === 'function';
        if (!ready) {
            console.log(`[MineBlock] not ready: pathfinder=${!!pathfinder}, moves=${!!pathfinder?.movements}, bot=${this.bot.username}`);
            return false;
        }

        // 移動アルゴリズムを明示的に設定
        const defaultMove = new Movements(this.bot);
        pathfinder.setMovements(defaultMove);

        this.isActive = true;
        this.internalState = 'STARTING';
        this.updateInterval = setInterval(() => this.update(), 250);
        return true;
    }

    public stop(): void {
        if (!this.isActive) return;
        this.isActive = false;
        if (this.updateInterval) {
            clearInterval(this.updateInterval);
            this.updateInterval = null;
        }
        const pathfinder = this.pathfinder;
        if (pathfinder?.setGoal) pathfinder.setGoal(null);
        this.bot.stopDigging();
        this.bot.clearControlStates();
    }

    public isRunning(): boolean {
        return this.isActive;
    }

    // --- メインの判断ループ（`executeNextStep`の代わり） ---
    private update(): void {
        if (!this.isActive) return;

        if (this.task.arguments.quantity <= 0) {
            this.internalState = 'DONE';
        }
        
        switch (this.internalState) {
            case 'STARTING':
                this.handleStartingState();
                break;
            case 'MOVING':
                this.handleMovingState();
                break;
            case 'ARRIVED':
                this.handleArrivedState();
                break;
            case 'DIGGING':
                // 採掘中は .then/.catch が状態を遷移させるので、ここでは何もしない
                break;
            case 'DONE':
                this.chatReporter.reportError('Task completed successfully.');
                this.stop();
                break;
        }
    }

    private handleStartingState(): void {
        if (!this.bot.entity) {
            this.chatReporter.reportError('Bot entity not ready, waiting...');
            return;
        }

        const blockName = this.task.arguments.blockName;
        const blockId = this.bot.registry.blocksByName[blockName]?.id;
        if (!blockId) {
            this.chatReporter.reportError(`Unknown block name: ${blockName}`);
            this.internalState = 'DONE';
            return;
        }

        this.targetBlock = this.worldKnowledge.findNearestBlock([blockId], this.task.arguments.maxDistance);

        if (!this.targetBlock) {
            this.chatReporter.reportError(`Could not find any more ${blockName}.`);
            this.internalState = 'DONE';
            return;
        }

        const distance = this.bot.entity.position.distanceTo(this.targetBlock.position.offset(0.5, 0.5, 0.5));
        console.log(`[mineBlock] : Distance is ${distance}. MAX_REACHABLE_DISTANCE is ${this.MAX_REACHABLE_DISTANCE}`);

        if (distance > this.MAX_REACHABLE_DISTANCE) {
            this.moveToTarget(this.targetBlock);
        } else {
            this.startDigging(this.targetBlock);
        }
    }

    private handleArrivedState(): void {
        if (!this.bot.entity || !this.targetBlock) {
            this.internalState = 'STARTING';
            return;
        }

        const distance = this.bot.entity.position.distanceTo(this.targetBlock.position.offset(0.5, 0.5, 0.5));
        if (distance <= this.MAX_REACHABLE_DISTANCE) {
            this.startDigging(this.targetBlock);
        } else {
            this.chatReporter.reportError(`No longer close to block (${distance.toFixed(2)}). Restarting pathfinding.`);
            this.internalState = 'STARTING';
        }
    }

    private handleMovingState(): void {
        const pf = this.pathfinder;
        if (!pf || !this.targetBlock || !this.bot.entity) return;

        const distance = this.bot.entity.position.distanceTo(this.targetBlock.position.offset(0.5, 0.5, 0.5));
        if (distance <= this.MAX_REACHABLE_DISTANCE) {
            this.chatReporter.reportError(`Reached target block. Transitioning to ARRIVED. Distance=${distance.toFixed(2)}`);
            this.internalState = 'ARRIVED';
            return;
        }

        // 移動停止していて、かつ到達していない＝失敗とみなす
        if (!pf.isMoving()) {
            this.chatReporter.reportError(`Movement stopped prematurely. Still far (${distance.toFixed(2)}). Retrying...`);
            this.internalState = 'STARTING';
        }
    }

    // --- 行動関数 ---
    private moveToTarget(targetBlock: Block): void {
        console.log(`[mineBlock] : MoveToTarget()`);
        this.internalState = 'MOVING';
        const goal = new goals.GoalNear(targetBlock.position.x, targetBlock.position.y, targetBlock.position.z, 1);
        // 2引数目 true で“アクティブに追従（動的に再探索）”させたい場合は true に
        this.pathfinder.setGoal(goal, true);
    }

    private async startDigging(targetBlock: Block): Promise<void> {
       console.log(`[mineBlock] : StartDigging()`);
       this.internalState = 'DIGGING';
       // 採掘を一度だけ開始するためのフラグ
        if (this.hasStartedDigging) return;
        this.hasStartedDigging = true;

        await this.equipBestTool(targetBlock);
        
        this.bot.dig(targetBlock)
            .then(() => {
                if (!this.isActive) return;
                this.task.arguments.quantity--;
                this.chatReporter.reportError(`Successfully mined. Remaining: ${this.task.arguments.quantity}`);
                this.hasStartedDigging = false;
                this.internalState = 'STARTING'; // 次のブロックを探しに行く
            })
            .catch((err) => {
                if (!this.isActive) return;
                this.chatReporter.reportError(`Digging failed: ${err.message}. Retrying...`);
                this.hasStartedDigging = false;
                setTimeout(() => {
                    if(this.isActive) this.internalState = 'STARTING'; // 1秒後に再試行
                }, 1000);
            });
    }

    // --- 道具の選択ロジック (変更なし) ---
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
        if (blockName.includes('log') || blockName.includes('planks') || blockName.includes('wood')) { toolType = '_axe'; }
        else if (blockName.includes('stone') || blockName.includes('ore') || blockName.includes('cobble')) { toolType = '_pickaxe'; }
        else if (blockName.includes('dirt') || blockName.includes('sand') || blockName.includes('gravel')) { toolType = '_shovel'; }
        else { return null; }

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
