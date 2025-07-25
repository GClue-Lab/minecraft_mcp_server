// src/services/WorldKnowledge.ts (修正版 - setBotInstanceを追加)

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

    constructor(bot: mineflayer.Bot) {
        this.bot = bot;
        this.bot.loadPlugin(pathfinderPlugin);
        this.setupEventListeners();
        console.log('WorldKnowledge initialized. Monitoring world events...');
    }

    // 新規追加: ボットインスタンスを更新するメソッド
    public setBotInstance(newBot: mineflayer.Bot): void {
        // 古いリスナーを削除
        if (this.bot) {
            this.bot.removeAllListeners();
        }
        this.bot = newBot;
        this.bot.loadPlugin(pathfinderPlugin); // 新しいボットにもプラグインをロード
        this.setupEventListeners(); // 新しいボットでリスナーを再設定
        this.clearKnowledge('Bot instance updated'); // 知識をクリア
        console.log('WorldKnowledge: Bot instance updated and listeners re-setup.');
    }

    private setupEventListeners(): void {
        // イベントリスナーを登録する前に、既存のリスナーを全て削除 (念のため再確認)
        // constructorやsetBotInstanceから呼ばれる際、常にクリーンな状態にする
        if (this.bot) {
            // bot.removeAllListeners() は全てのイベントリスナーを削除するため、
            // setupEventListenersが呼ばれるたびに過去のリスナーが削除される。
            // しかし、これが重複している原因ではない場合がある。
            // もしBotManagerが既に一部リスナーを登録している場合、
            // ここで削除してしまうとBotManagerの機能が損なわれる可能性がある。
            // ここでの this.bot.removeAllListeners(); は setBotInstance() に任せる
            // setupEventListeners() を呼ぶ前に bot にリスナーがないことを前提とする
            // または、BotManagerのイベント購読はremoveAllListenersの影響を受けないように設計する
            // 現在のBotManagerのリスナーはbotインスタンスを生成する際に once で登録されるため、
            // ここで removeAllListeners を呼んでも問題ない。
            this.bot.removeAllListeners(); // 既存の全てのリスナーを削除して重複登録を防ぐ
        }
        
        this.bot.on('entitySpawn', (entity: Entity) => this.handleEntitySpawn(entity));
        this.bot.on('entityGone', (entity: Entity) => this.handleEntityGone(entity));
        this.bot.on('entityMoved', (entity: Entity) => this.handleEntityMoved(entity));
        
        this.bot.on('playerJoined', (player: mineflayer.Player) => this.handlePlayerJoined(player));
        this.bot.on('playerLeft', (player: mineflayer.Player) => this.handlePlayerLeft(player));
        this.bot.on('blockUpdate', (oldBlock: Block | null, newBlock: Block) => this.handleBlockUpdate(oldBlock, newBlock));
        this.bot.on('kicked', (reason: string) => this.clearKnowledge(reason));
        this.bot.on('end', (reason: string) => this.clearKnowledge(reason));

        // once は一度発火すると自動的に削除されるため、重複登録の心配はない
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

        const goal = new goals.GoalNear(endPos.x, endPos.y, endPos.z, range);
        this.bot.pathfinder.setGoal(goal);

        console.log(`Pathfinding started towards ${endPos.x},${endPos.y},${endPos.z} (range: ${range})`);

        return new Promise<Path | null>((resolve) => {
            const cleanUpListeners = () => {
                this.bot.removeListener('goal_reached', onGoalReached);
                this.bot.removeListener('goal_cant_be_reached', onGoalCantBeReached);
                this.bot.removeListener('goal_timeout', onGoalTimeout);
            };

            const onGoalReached = () => {
                cleanUpListeners();
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
            console.log("Pathfinding stopped.");
        }
    }
}
