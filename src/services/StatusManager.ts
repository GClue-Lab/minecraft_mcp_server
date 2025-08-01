// src/services/StatusManager.ts (Planner対応版)

import * as mineflayer from 'mineflayer';
import { Vec3 } from 'vec3';
import { BotStatus } from '../types/mcp';
import { WorldKnowledge } from './WorldKnowledge';
import { TaskManager } from './TaskManager';
import { ModeManager } from './ModeManager';
import { BehaviorEngine } from './BehaviorEngine'; // BehaviorEngineをインポート

export class StatusManager {
    private bot: mineflayer.Bot;
    private worldKnowledge: WorldKnowledge;
    private taskManager: TaskManager;
    private modeManager: ModeManager;
    private behaviorEngine: BehaviorEngine; // BehaviorEngineへの参照を追加
    private homePosition: Vec3 | null = null;

    constructor(
        bot: mineflayer.Bot, 
        worldKnowledge: WorldKnowledge, 
        taskManager: TaskManager, 
        modeManager: ModeManager,
        behaviorEngine: BehaviorEngine // コンストラクタで受け取る
    ) {
        this.bot = bot;
        this.worldKnowledge = worldKnowledge;
        this.taskManager = taskManager;
        this.modeManager = modeManager;
        this.behaviorEngine = behaviorEngine; // 参照を保持
    }

    public setHome(position: Vec3): void { this.homePosition = position; }
    public getHome(): Vec3 | null { return this.homePosition; }

    public getFullStatus(): BotStatus {
        // ★ここを修正: activeTaskをBehaviorEngineから取得
        const activeTaskInfo = this.behaviorEngine.getActiveTask();
        const modeStatus = this.modeManager.getStatus();

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
            modes: modeStatus
        };
    }

    private getFormattedEquipment(): { [key: string]: string | null } {
        const equipment: { [key: string]: string | null } = { hand: null, head: null, torso: null, legs: null, feet: null };
        const handItem = this.bot.heldItem;
        if (handItem) equipment.hand = handItem.name;
        return equipment;
    }
}
