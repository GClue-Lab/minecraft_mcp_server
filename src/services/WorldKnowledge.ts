// src/services/WorldKnowledge.ts v1.28

import * as mineflayer from 'mineflayer';
import { Vec3 } from 'vec3';
// ここを修正: Entity と Block をそれぞれのパッケージからインポートします
import { Entity } from 'prismarine-entity'; 
import { Block } from 'prismarine-block';

export interface WorldEntity {
    id: number;
    type: 'player' | 'mob' | 'object' | 'projectile' | 'vehicle' | 'hanging' | 'orb' | 'xp_orb' | 'egg' | 'item' | 'falling_block' | 'painting' | 'armor_stand' | 'leash_knot' | 'fishing_bobber' | 'lightning' | 'area_effect_cloud' | 'ender_crystal' | 'wither_skull' | 'fireball' | 'shulker_bullet' | 'boat' | 'minecart' | 'tnt' | 'ender_pearl' | 'eye_of_ender' | 'firework_rocket' | 'experience_orb' | 'item_frame' | 'end_crystal' | 'evoker_fangs' | 'spectral_arrow' | 'dragon_fireball' | 'trident' | 'arrow' | 'llama_spit' | 'fishing_hook' | 'block_display' | 'item_display' | 'text_display' | 'interaction' | 'carrot_on_a_stick' | 'warped_fungus_on_a_stick' | 'hostile' | 'passive' | 'ambient' | 'other';
    name?: string;
    username?: string;
    position: Vec3;
    health?: number;
    food?: number;
    isAlive?: boolean;
    isValid: boolean;
}

export class WorldKnowledge {
    private bot: mineflayer.Bot;
    private entities: Map<number, WorldEntity> = new Map();
    private players: Map<string, WorldEntity> = new Map();

    constructor(bot: mineflayer.Bot) {
        this.bot = bot;
        this.setupEventListeners();
        console.log('WorldKnowledge initialized. Monitoring world events...');
    }

    public setBotInstance(newBot: mineflayer.Bot): void {
        console.log('WorldKnowledge: Updating bot instance.');
        if (this.bot) {
            this.bot.removeAllListeners();
        }
        this.bot = newBot;
        this.setupEventListeners();
        this.clearKnowledge('Bot instance updated');
        console.log('WorldKnowledge: Bot instance updated and listeners re-setup.');
    }

    public isPathfindingInProgress(): boolean {
        return false;
    }

    private setupEventListeners(): void {
        if (this.bot) {
            this.bot.removeAllListeners();
        }
        
        console.log("WorldKnowledge: Initializing core event listeners.");

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
            isAlive: (entity as any).isAlive, 
            isValid: entity.isValid,
        };
        if (entity.type === 'player' && entity.username) {
            worldEntity.username = entity.username;
            worldEntity.name = entity.username;
            this.players.set(entity.username, worldEntity);
        } else if (entity.name) {
            worldEntity.name = entity.name;
        }
        console.log(`[WorldKnowledge] Entity Spawned: ID:${entity.id}, Type:${worldEntity.type}, Name:${entity.name || 'N/A'}, Pos:(${entity.position.x.toFixed(2)},${entity.position.y.toFixed(2)},${entity.position.z.toFixed(2)}), Valid:${entity.isValid}`);
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
            console.log(`[WorldKnowledge] Entity Gone: ID:${entity.id}, Type:${removedEntity?.type}, Name:${removedEntity?.name || 'N/A'}, Valid:${removedEntity?.isValid}`);
        }
    }

    private handleEntityMoved(entity: Entity): void {
        if (!entity || !entity.position) return;
        const knownEntity = this.entities.get(entity.id);
        if (knownEntity) {
            knownEntity.position = entity.position;
            if ((entity as any).health !== undefined) knownEntity.health = (entity as any).health;
            knownEntity.isValid = entity.isValid;
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
            isValid: player.entity.isValid,
        };
        this.players.set(player.username, worldEntity);
        this.entities.set(player.entity.id, worldEntity);
        console.log(`[WorldKnowledge] Player Joined: ${player.username}, Valid:${player.entity.isValid}`);
    }

    private handlePlayerLeft(player: mineflayer.Player): void {
        if (!player || !player.username) return;
        if (this.players.has(player.username)) {
            const removedPlayer = this.players.get(player.username);
            if (removedPlayer && removedPlayer.id) {
                this.entities.delete(removedPlayer.id);
            }
            this.players.delete(player.username);
            console.log(`[WorldKnowledge] Player Left: ${player.username}`);
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
        const allEntities = Array.from(this.entities.values());
        return allEntities;
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
                isValid: this.bot.entity.isValid,
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

    public findPlayer(username: string): WorldEntity | undefined {
        if (!username) return undefined;
        return this.getAllEntities().find(e => e.type === 'player' && e.name === username);
    }
}
