// src/types/mineflayer-extensions.d.ts v1.5 (Pathfinder関連の型定義を完全に削除)

import { EventEmitter } from 'events';
import { Block as PrismarineBlock } from 'prismarine-block';
import { Entity as PrismarineEntity } from 'prismarine-entity';
import { IndexedData } from 'minecraft-data'; 
import * as mineflayer from 'mineflayer';

declare module 'mineflayer' {
    interface Bot {
        // pathfinderプロパティはもはやBotに追加されないため、ここから削除
        // pathfinder: import('mineflayer-pathfinder').Pathfinder & EventEmitter;
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

        // mineflayer-pathfinder 関連イベントはもはやBotEventsに含まれないため削除
        // goal_reached: () => void;
        // goal_cant_be_reached: () => void;
        // goal_timeout: () => void;
    }
}

// mineflayer-pathfinder モジュール全体の型定義を削除（使用しないため）
// declare module 'mineflayer-pathfinder' { ... } // <<<< このブロック全体を削除
