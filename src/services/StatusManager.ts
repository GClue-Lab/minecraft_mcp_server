// src/services/StatusManager.ts (最新版フルコード)

import * as mineflayer from 'mineflayer';
import { Vec3 } from 'vec3';
import { BotStatus } from '../types/mcp';
import { WorldKnowledge } from './WorldKnowledge';
import { TaskManager } from './TaskManager';
import { ModeManager } from './ModeManager';

/**
 * ボットのあらゆる状態を一元的に集約・管理するクラス。
 * 正確な状況報告の唯一の情報源となる。
 */
export class StatusManager {
    private bot: mineflayer.Bot;
    private worldKnowledge: WorldKnowledge;
    private taskManager: TaskManager;
    private modeManager: ModeManager;
    private homePosition: Vec3 | null = null;

    constructor(bot: mineflayer.Bot, worldKnowledge: WorldKnowledge, taskManager: TaskManager, modeManager: ModeManager) {
        this.bot = bot;
        this.worldKnowledge = worldKnowledge;
        this.taskManager = taskManager;
        this.modeManager = modeManager;
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
        const modeStatus = this.modeManager.getStatus(); // ModeManagerから最新情報を取得

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
                .slice(0, 10),
            currentTask: activeTaskInfo ? {
                taskId: activeTaskInfo.taskId,
                type: activeTaskInfo.type,
                detail: JSON.stringify(activeTaskInfo.arguments)
            } : null,
            // ModeManagerから取得したモード情報をステータスに含める
            modes: modeStatus
        };
    }

    private getFormattedEquipment(): { [key: string]: string | null } {
        const equipment: { [key: string]: string | null } = {
            hand: null, head: null, torso: null, legs: null, feet: null
        };
        const handItem = this.bot.heldItem;
        if (handItem) {
            equipment.hand = handItem.name;
        }
        // 他の部位の装備取得は、必要に応じて追加
        return equipment;
    }
}
