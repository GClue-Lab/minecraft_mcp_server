// src/types/mineflayer-extensions.d.ts v1.2

import { EventEmitter } from 'events';
import { Block as PrismarineBlock } from 'prismarine-block';
import { Entity as PrismarineEntity } from 'prismarine-entity';
import { IndexedData } from 'minecraft-data'; 

declare module 'mineflayer' {
    interface Bot {
        pathfinder: import('mineflayer-pathfinder').Pathfinder & EventEmitter;
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

        goal_reached: () => void;
        goal_cant_be_reached: () => void;
        goal_timeout: () => void;
    }
}

// mineflayer-pathfinder の型定義を拡張
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

    // Movements インターフェースを拡張し、足りないプロパティを追加
    interface Movements {
        // --- ここに追加 ---
        canDig: boolean;
        canOpenDoors: boolean;
        canBreakDoors: boolean;
        allowFreecrafting: boolean;
        allowSprinting: boolean;
        allowDiagonal: boolean;
        maxDropDown: number;
        allowParkour: boolean;
        scafoldingBlocks: number[];
        waterCost: number;
        lavaCost: number;
        // --- ここまで ---
        // その他、もし後で必要になったプロパティがあればここに追加
    }
}
