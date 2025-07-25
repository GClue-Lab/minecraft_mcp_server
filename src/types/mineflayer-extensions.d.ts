// src/types/mineflayer-extensions.d.ts (最終最終版 - pathfinderイベントをBotEventsに追加)

import { EventEmitter } from 'events';
import { Block as PrismarineBlock } from 'prismarine-block';
import { Entity as PrismarineEntity } from 'prismarine-entity';
import { IndexedData } from 'minecraft-data'; // minecraft-data がインストールされている前提

declare module 'mineflayer' {
    interface Bot {
        pathfinder: import('mineflayer-pathfinder').Pathfinder & EventEmitter;
        entity: PrismarineEntity;
        entities: { [id: number]: PrismarineEntity };
        registry: IndexedData; // minecraft-data がインストールされている前提
    }

    // BotEvents に mineflayer-pathfinder 関連イベントを追加
    interface BotEvents {
        entitySpawn: (entity: PrismarineEntity) => void;
        entityGone: (entity: PrismarineEntity) => void;
        entityMoved: (entity: PrismarineEntity) => void;
        blockUpdate: (oldBlock: PrismarineBlock | null, newBlock: PrismarineBlock) => void;
        playerJoined: (player: mineflayer.Player) => void;
        playerLeft: (player: mineflayer.Player) => void;

        // --- mineflayer-pathfinder 関連イベントの追加 ---
        goal_reached: () => void;
        goal_cant_be_reached: () => void;
        goal_timeout: () => void;
        // --- End mineflayer-pathfinder 関連イベント ---
    }
}

// mineflayer-pathfinder の型定義は変更なし
declare module 'mineflayer-pathfinder' {
    interface Pathfinder extends EventEmitter {
        getPathTo(
            movements: import('mineflayer-pathfinder').Movements,
            goal: import('mineflayer-pathfinder').goals.Goal,
            timeout?: number
        ): Path;
    }
    interface Path {
        result: string;
        movements: Array<any>;
    }
}
