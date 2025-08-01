// src/types/mcp.d.ts (修正後)

import { Vec3 } from 'vec3';

export type BehaviorName = 'combat' | 'followPlayer' | 'mineBlock' | 'idle';

export interface CurrentBehavior {
    name: BehaviorName;
    isActive: boolean;
    target?: any;
}

// McpCommandのtypeにsetMiningModeを追加し、その内容を更新
export interface McpCommand {
    type: 'setMiningMode' | 'setFollowMode' | 'setCombatMode' | 'getStatus' | 'stop' | 'setHome';
    id: number;
    mode?: 'on' | 'off';
    blockName?: string;
    quantity?: number;
    targetPlayer?: string;
    position?: { x: number, y: number, z: number };
}

export interface Task {
    taskId: string;
    type: 'mine' | 'follow' | 'combat' | 'goto' | 'dropItems' | 'patrol';
    status: 'pending' | 'running' | 'completed' | 'failed' | 'cancelled';
    arguments: any;
    priority: number;
    createdAt: number;
    result?: any;
}

/**
 * StatusManagerが管理するボットの包括的な状態
 */
export interface BotStatus {
    health: number;
    hunger: number;
    position: Vec3;
    homePosition: Vec3 | null;
    equipment: { [key: string]: string | null };
    inventory: { name: string, count: number, type: number }[];
    nearbyEntities: { name: string, type: string, distance: number }[];
    currentTask: { taskId: string, type: string, detail: string } | null;
    // ★ここを修正: miningModeを追加
    modes: {
        combatMode: boolean;
        followMode: boolean;
        followTarget: string | null;
        miningMode: boolean;
    };
}
