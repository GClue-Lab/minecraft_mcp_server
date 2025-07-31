// src/types/mcp.d.ts

import { Vec3 } from 'vec3';

// 既存の型定義
export type BehaviorName = 'combat' | 'followPlayer' | 'mineBlock' | 'idle';

export interface CurrentBehavior {
    name: BehaviorName;
    isActive: boolean;
    target?: any;
}

export interface McpCommand {
    type: 'setMiningMode' | 'setFollowMode' | 'setCombatMode' | 'getStatus' | 'stop';
    id: number;
    mode?: 'on' | 'off';
    blockName?: string;
    quantity?: number;
    targetPlayer?: string;
}

// ===== ここから追加 =====

/**
 * タスクキューで管理される個々のタスクの型定義
 */
export interface Task {
    taskId: string; // UUIDなどで一意に識別
    type: 'mine' | 'follow' | 'combat' | 'goto' | 'dropItems' | 'patrol';
    status: 'pending' | 'running' | 'completed' | 'failed' | 'cancelled';
    arguments: any; // 例: { blockName: 'stone', quantity: 10 }
    priority: number;
    createdAt: number;
    result?: any; // タスク完了時の結果
}

/**
 * StatusManagerが管理するボットの包括的な状態
 */
export interface BotStatus {
    health: number;
    hunger: number;
    position: Vec3;
    homePosition: Vec3 | null;
    equipment: {
        hand: string | null;
        head: string | null;
        torso: string | null;
        legs: string | null;
        feet: string | null;
    };
    inventory: { name: string, count: number, type: string }[];
    nearbyEntities: { name: string, type: string, distance: number }[];
    nearbyResources: { name: string, distance: number, positions: Vec3[] }[];
    currentTask: { taskId: string, type: string, detail: string } | null;
}
