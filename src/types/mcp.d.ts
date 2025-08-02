// src/types/mcp.d.ts (修正後)

import { Vec3 } from 'vec3';

export type BehaviorName = 'combat' | 'followPlayer' | 'mineBlock' | 'idle';

export interface CurrentBehavior {
    name: BehaviorName;
    isActive: boolean;
    target?: any;
}

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
    arguments: any; // progressを含むためanyのままにするか、より厳密な型を定義
    priority: number;
    createdAt: number;
    result?: any;
    queueType?: 'mining' | 'general'; // ★ 修正: キューの種類を保持
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
    modes: {
        combatMode: boolean;
        followMode: boolean;
        followTarget: string | null;
        miningMode: boolean;
    };
}
