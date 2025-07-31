// src/services/StatusManager.ts (新規作成)

import * as mineflayer from 'mineflayer';
import { Vec3 } from 'vec3';
import { BotStatus } from '../types/mcp';
import { WorldKnowledge } from './WorldKnowledge';
import { TaskManager } from './TaskManager';

/**
 * ボットのあらゆる状態を一元的に集約・管理するクラス。
 */
export class StatusManager {
    private bot: mineflayer.Bot;
    private worldKnowledge: WorldKnowledge;
    private taskManager: TaskManager;
    private homePosition: Vec3 | null = null;

    constructor(bot: mineflayer.Bot, worldKnowledge: WorldKnowledge, taskManager: TaskManager) {
        this.bot = bot;
        this.worldKnowledge = worldKnowledge;
        this.taskManager = taskManager;
    }

    public setHome(position: Vec3): void {
        this.homePosition = position;
        console.log(`[StatusManager] Home position set to: ${this.homePosition}`);
    }

    public getHome(): Vec3 | null {
        return this.homePosition;
    }

    /**
     * ボットの現在の全ステータスを収集して返す
     */
    public getFullStatus(): BotStatus {
        const activeTaskInfo = this.taskManager.getStatus().activeTask;

        return {
            health: this.bot.health,
            hunger: this.bot.food,
            position: this.bot.entity.position,
            homePosition: this.homePosition,
            equipment: this.getFormattedEquipment(),
            inventory: this.bot.inventory.items().map(item => ({ name: item.name, count: item.count, type: item.type })),
            nearbyEntities: this.worldKnowledge.getAllEntities()
                .filter(e => e.id !== this.bot.entity.id && e.isValid)
                .map(e => ({
                    name: e.name || 'Unknown',
                    type: e.type,
                    distance: parseFloat(e.position.distanceTo(this.bot.entity.position).toFixed(2))
                }))
                .sort((a, b) => a.distance - b.distance)
                .slice(0, 10), // 上位10件に絞る
            currentTask: activeTaskInfo ? {
                taskId: activeTaskInfo.taskId,
                type: activeTaskInfo.type,
                detail: JSON.stringify(activeTaskInfo.arguments)
            } : null
        };
    }

    private getFormattedEquipment(): { [key: string]: string | null } {
        const equipment: { [key: string]: string | null } = {
            hand: null, head: null, torso: null, legs: null, feet: null
        };
        // Mineflayer 4.xでは非同期APIに変更
        // Promise.all([
        //     this.bot.equipments(),
        // ]).then(([equipped]) => {
        //     if (equipped) {
        //         equipment.hand = equipped.hand?.name || null;
        //         // ...
        //     }
        // });
        // 現時点では簡易的に同期APIを使用
        const handItem = this.bot.heldItem;
        if (handItem) {
            equipment.hand = handItem.name;
        }
        return equipment;
    }
}
