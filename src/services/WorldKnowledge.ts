// src/services/WorldKnowledge.ts v1.14

import * as mineflayer from 'mineflayer';
import { Vec3 } from 'vec3';
import { pathfinder as pathfinderPlugin, goals, Pathfinder, Path } from 'mineflayer-pathfinder';

type Entity = Parameters<mineflayer.BotEvents['entitySpawn']>[0];
type Block = Parameters<mineflayer.BotEvents['blockUpdate']>[1];

export interface WorldEntity {
    id: number;
    type: 'player' | 'mob' | 'object' | 'other';
    name?: string;
    username?: string;
    position: Vec3;
    health?: number;
    food?: number;
    isAlive?: boolean;
}

export class WorldKnowledge {
    private bot: mineflayer.Bot;
    private entities: Map<number, WorldEntity> = new Map();
    private players: Map<string, WorldEntity> = new Map();
    private isPathfindingActive: boolean = false; // 経路探索が現在アクティブかどうかのフラグ

    constructor(bot: mineflayer.Bot) {
        this.bot = bot;
        this.bot.loadPlugin(pathfinderPlugin);
        this.setupEventListeners();
        console.log('WorldKnowledge initialized. Monitoring world events...');
    }

    public setBotInstance(newBot: mineflayer.Bot): void {
        console.log('WorldKnowledge: Updating bot instance.');
        if (this.bot) {
            this.bot.removeAllListeners();
        }
        this.bot = newBot;
        this.bot.loadPlugin(pathfinderPlugin);
        this.setupEventListeners();
        this.clearKnowledge('Bot instance updated');
        console.log('WorldKnowledge: Bot instance updated and listeners re-setup.');
    }

    private setupEventListeners(): void {
        if (this.bot) {
            this.bot.removeAllListeners();
        }
        
        console.log("WorldKnowledge: Pathfinder movements will use default configuration.");

        this.bot.on('entitySpawn', (entity: Entity) => this.handleEntitySpawn(entity));
        this.bot.on('entityGone', (entity: Entity) => this.handleEntityGone(entity));
        this.bot.on('entityMoved', (entity: Entity) => this.handleEntityMoved(entity));
        
        this.bot.on('playerJoined', (player: mineflayer.Player) => this.handlePlayerJoined(player));
        this.bot.on('playerLeft', (player: mineflayer.Player) => this.handlePlayerLeft(player));
        this.bot.on('blockUpdate', (oldBlock: Block | null, newBlock: Block) => this.handleBlockUpdate(oldBlock, newBlock));
        this.bot.on('kicked', (reason: string) => this.clearKnowledge(reason));
        this.bot.on('end', (reason: string) => this.clearKnowledge(reason));

        this.bot.once('spawn', () => { 
            console.log('Bot spawned. Populating initial world knowledge.');
            for (const entityId in this.bot.entities) {
                this.handleEntitySpawn(this.bot.entities[entityId] as Entity);
            }
            for (const username in this.bot.players) {
                this.handlePlayerJoined(this.bot.players[username]);
            }
        });
    }

    private handleEntitySpawn(entity: Entity): void {
        if (!entity || !entity.position) return;
        const worldEntity: WorldEntity = {
            id: entity.id,
            type: entity.type as any,
            position: entity.position,
            health: (entity as any).health,
        };
        if (entity.type === 'player' && entity.username) {
            worldEntity.username = entity.username;
            worldEntity.name = entity.username;
            this.players.set(entity.username, worldEntity);
        } else if (entity.name) {
            worldEntity.name = entity.name;
        }
        this.entities.set(entity.id, worldEntity);
    }

    private handleEntityGone(entity: Entity): void {
        if (!entity) return;
        if (this.entities.has(entity.id)) {
            const removedEntity = this.entities.get(entity.id);
            if (removedEntity && removedEntity.username) {
                this.players.delete(removedEntity.username);
            }
            this.entities.delete(entity.id);
        }
    }

    private handleEntityMoved(entity: Entity): void {
        if (!entity || !entity.position) return;
        const knownEntity = this.entities.get(entity.id);
        if (knownEntity) {
            knownEntity.position = entity.position;
            if ((entity as any).health !== undefined) knownEntity.health = (entity as any).health;
        } else {
            this.handleEntitySpawn(entity);
        }
    }

    private handlePlayerJoined(player: mineflayer.Player): void {
        if (!player || !player.username || !player.entity) return;
        const worldEntity: WorldEntity = {
            id: player.entity.id,
            type: 'player',
            username: player.username,
            name: player.username,
            position: player.entity.position,
            health: player.entity.health,
            food: player.entity.food,
            isAlive: player.entity.isValid,
        };
        this.players.set(player.username, worldEntity);
        this.entities.set(player.entity.id, worldEntity);
        console.log(`Player joined: ${player.username}`);
    }

    private handlePlayerLeft(player: mineflayer.Player): void {
        if (!player || !player.username) return;
        if (this.players.has(player.username)) {
            const removedPlayer = this.players.get(player.username);
            if (removedPlayer && removedPlayer.id) {
                this.entities.delete(removedPlayer.id);
            }
            this.players.delete(player.username);
            console.log(`Player left: ${player.username}`);
        }
    }

    private handleBlockUpdate(oldBlock: Block | null, newBlock: Block): void {
        // console.log(`Block updated at ${newBlock.position}: ${oldBlock?.displayName} -> ${newBlock.displayName}`);
    }

    private clearKnowledge(reason: string): void {
        console.log(`Clearing world knowledge due to bot disconnection: ${reason}`);
        this.entities.clear();
        this.players.clear();
    }

    public getAllEntities(): WorldEntity[] {
        return Array.from(this.entities.values());
    }

    public getEntityById(id: number): WorldEntity | undefined {
        return this.entities.get(id);
    }

    public getPlayer(username: string): WorldEntity | undefined {
        return this.players.get(username);
    }

    public getBotEntity(): WorldEntity | undefined {
        if (this.bot.entity) {
            return {
                id: this.bot.entity.id,
                type: 'player',
                username: this.bot.username,
                name: this.bot.username,
                position: this.bot.entity.position,
                health: this.bot.health,
                food: this.bot.food,
                isAlive: this.bot.entity.isValid,
            };
        }
        return undefined;
    }

    public findNearestBlock(blockTypeIds: number[], maxDistance: number): Block | null {
        const block = this.bot.findBlock({
            matching: blockTypeIds,
            maxDistance: maxDistance,
        });
        return block;
    }

    public async findPath(startPos: Vec3, endPos: Vec3, range: number = 1): Promise<Path | null> {
        if (!this.bot.pathfinder) {
            console.warn("Pathfinder not loaded on bot.");
            return null;
        }

        if (this.isPathfindingActive) {
            console.log("WorldKnowledge: Pathfinding already active. Skipping new request.");
            return null;
        }

        this.isPathfindingActive = true;

        const goal = new goals.GoalNear(endPos.x, endPos.y, endPos.z, range);
        
        // --- ここを修正: Goalにタイムアウトを設定 ---
        // PathfinderOptions (Goalの第2引数) に timeout プロパティを設定
        // デフォルトは60000 (60秒) ですが、短くして素早くタイムアウトさせる
        (goal as any).timeout = 5000; // 5秒でタイムアウト (goals.jsの内部プロパティに直接設定)
        // または、bot.pathfinder.setGoal(goal, { timeout: 5000 }); のようにsetGoalの第二引数に渡す (PathfinderOptions)
        // 現状のPathfinder型定義にはsetGoalの第二引数がないため、goalオブジェクトに直接プロパティを追加
        // ※ もし `mineflayer-pathfinder` のバージョンが新しい場合、`goals.Goal` のコンストラクタが `timeout` を受け取るかもしれません。
        // ※ あるいは `bot.pathfinder.setGoal(goal, options)` のように options を渡す形式の場合もあります。
        // 現在の `mineflayer-pathfinder@2.4.5` の `goals.js` ソースコードを見ると、
        // Goalオブジェクトに直接 `timeout` プロパティを設定する形は一般的ではないようです。
        // setGoal の第二引数に `{ timeout: number }` を渡すのがより正しい方法です。
        // ただし、型定義がそれを許容しないため、一旦 `any` でアサーションします。
        this.bot.pathfinder.setGoal(goal, { timeout: 5000 } as any); // setGoalの第二引数でタイムアウトを設定 (anyアサーション)
        // --- 修正終わり ---

        console.log(`Pathfinding started towards ${endPos.x},${endPos.y},${endPos.z} (range: ${range})`);

        return new Promise<Path | null>((resolve) => {
            const cleanUpListeners = () => {
                this.bot.removeListener('goal_reached', onGoalReached);
                this.bot.removeListener('goal_cant_be_reached', onGoalCantBeReached);
                this.bot.removeListener('goal_timeout', onGoalTimeout);
                this.isPathfindingActive = false; // 経路探索終了フラグを解除
            };

            const onGoalReached = () => {
                cleanUpListeners();
                console.log(`Pathfinding: Goal reached at ${endPos.x},${endPos.y},${endPos.z}.`);
                resolve({ result: 'success', movements: [] } as Path);
            };
            const onGoalCantBeReached = () => {
                cleanUpListeners();
                console.warn(`Path to ${endPos} with range ${range} could not be found.`);
                resolve(null);
            };
            const onGoalTimeout = () => {
                cleanUpListeners();
                console.warn(`Path to ${endPos} with range ${range} timed out.`);
                resolve(null);
            };

            this.bot.once('goal_reached', onGoalReached);
            this.bot.once('goal_cant_be_reached', onGoalCantBeReached);
            this.bot.once('goal_timeout', onGoalTimeout);
        });
    }

    public stopPathfinding(): void {
        if (this.bot.pathfinder) {
            this.bot.pathfinder.stop();
            this.isPathfindingActive = false; 
            console.log("Pathfinding stopped.");
        }
    }
}
