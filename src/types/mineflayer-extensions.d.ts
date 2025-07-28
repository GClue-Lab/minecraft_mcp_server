// src/types/mineflayer-extensions.d.ts v1.4 (pathfinderイベント削除)

import { EventEmitter } from 'events';
import { Block as PrismarineBlock } from 'prismarine-block';
import { Entity as PrismarineEntity } from 'prismarine-entity';
import { IndexedData } from 'minecraft-data';
import * as mineflayer from 'mineflayer';

declare module 'mineflayer' {
    interface Bot {
        // pathfinderプロパティはもはやBotに追加されないため、ここから削除
        // pathfinder: import('mineflayer-pathfinder').Pathfinder & EventEmitter; // <<< 削除
        entity: PrismarineEntity;
        entities: { [id: number]: PrismarineEntity };
        registry: IndexedData;
    }

    interface BotEvents {
        entitySpawn: (entity: PrismarineEntity) => void;
        entityGone: (entity: PrismarineEntity) => void;
        entityMoved: (entity: PrismarineEntity) => void;
        blockUpdate: (oldBlock: PrismarineBlock | null, newBlock: PrismarineBlock) => void;
        playerJoined: (player: mineflayer.Player) => void;
        playerLeft: (player: mineflayer.Player) => void;

        // --- mineflayer-pathfinder 関連イベントの削除 ---
        // goal_reached: () => void; // <<< 削除
        // goal_cant_be_reached: () => void; // <<< 削除
        // goal_timeout: () => void; // <<< 削除
        // --- End mineflayer-pathfinder 関連イベント ---
    }
}

// mineflayer-pathfinder の型定義拡張全体を削除（Pathfinderを使用しないため）
// declare module 'mineflayer-pathfinder' { ... } // <<< 削除
