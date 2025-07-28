// src/services/CommandHandler.ts v1.4

import * as mineflayer from 'mineflayer';
// import { Vec3 } from 'vec3'; // <<<< 削除 (Vec3はもはや不要なため)

import {
    McpCommand,
    McpResponse,
    SuccessMcpResponse,
    ErrorMcpResponse,
    FollowPlayerCommand,
    SendMessageCommand,
    GetStatusCommand,
    MineBlockCommand,
    AttackMobCommand,
    StopCommand,
    ConnectCommand,
    SetCombatModeCommand,
    TeleportCommand,
    BaseMcpCommand
} from '../types/mcp';

import { BotManager, BotStatus } from './BotManager';
import { WorldKnowledge, WorldEntity } from './WorldKnowledge';
import { BehaviorEngine, BehaviorName, CurrentBehavior } from './BehaviorEngine';

import { FollowPlayerOptions } from '../behaviors/followPlayer';
import { MineBlockOptions } from '../behaviors/mineBlock';
import { CombatOptions } from '../behaviors/combat';


export class CommandHandler {
    private botManager: BotManager;
    private worldKnowledge: WorldKnowledge | null = null;
    private behaviorEngine: BehaviorEngine | null = null;

    constructor(botManager: BotManager, worldKnowledge: WorldKnowledge | null, behaviorEngine: BehaviorEngine | null) {
        this.botManager = botManager;
        this.worldKnowledge = worldKnowledge;
        this.behaviorEngine = behaviorEngine;
        console.log('CommandHandler initialized.');
    }

    public setWorldKnowledge(wk: WorldKnowledge): void {
        this.worldKnowledge = wk;
    }

    public setBehaviorEngine(be: BehaviorEngine): void {
        this.behaviorEngine = be;
    }

    public async handleCommand(command: McpCommand): Promise<McpResponse> {
        console.log(`Handling command: ${command.type} (ID: ${command.id})`);

        if (command.type === 'connect') {
            try {
                await this.botManager.connect();
                return this.createSuccessResponse(command.id, 'Bot connection initiated. Please wait for spawn.');
            } catch (error: any) {
                return this.createErrorResponse(command.id, `Failed to connect bot: ${error.message || 'Unknown error'}`);
            }
        }

        if (command.type === 'setCombatMode') {
            return this.handleSetCombatMode(command as SetCombatModeCommand);
        }

        if (command.type === 'teleport') {
            return await this.handleTeleport(command as TeleportCommand);
        }

        const bot = this.botManager.getBot();
        if (!bot) {
            return this.createErrorResponse(
                command.id,
                `Bot is not connected. Current status: ${this.botManager.getStatus()}. Please use 'connect' command first or wait for automatic connection.`
            );
        }

        if (!this.worldKnowledge || !this.behaviorEngine) {
            if (['followPlayer', 'mineBlock', 'attackMob', 'stop', 'sendMessage'].includes(command.type)) {
                return this.createErrorResponse(
                    command.id,
                    `Core services (WorldKnowledge/BehaviorEngine) not yet initialized. Please wait for bot connection.`
                );
            }
        }

        try {
            switch (command.type) {
                case 'sendMessage':
                    return await this.handleSendMessage(bot, command as SendMessageCommand);
                case 'getStatus':
                    return this.handleGetStatus(bot, command as GetStatusCommand);
                case 'followPlayer':
                    return await this.handleFollowPlayer(command as FollowPlayerCommand);
                case 'mineBlock':
                    return await this.handleMineBlock(command as MineBlockCommand);
                case 'attackMob':
                    return await this.handleAttackMob(command as AttackMobCommand);
                case 'stop':
                    return this.handleStop(command as StopCommand);
                default:
                    const unknownCommand = command as BaseMcpCommand;
                    return this.createErrorResponse(unknownCommand.id, `Unknown command type: ${unknownCommand.type}`);
            }
        } catch (error: any) {
            console.error(`Error processing command ${command.type} (ID: ${command.id}):`, error);
            return this.createErrorResponse(command.id, `Failed to execute command: ${error.message || 'Unknown error'}`, error);
        }
    }

    private handleGetStatus(bot: mineflayer.Bot | null, command: GetStatusCommand): McpResponse {
        const botStatus = this.botManager.getStatus();
        const botPosition = bot ? bot.entity.position : null;
        const currentBehavior = this.behaviorEngine?.getCurrentBehavior();

        const status: {
            botStatus: BotStatus;
            botHealth: number | null;
            botFood: number | null;
            botPosition: {x: number, y: number, z: number} | null;
            currentBehavior: CurrentBehavior | null | undefined;
            nearbyPlayers: WorldEntity[];
            nearbyHostileMobs: WorldEntity[];
        } = {
            botStatus: botStatus,
            botHealth: bot?.health !== undefined ? bot.health : null,
            botFood: bot?.food !== undefined ? bot.food : null,
            botPosition: botPosition,
            currentBehavior: currentBehavior,
            nearbyPlayers: this.worldKnowledge ? this.worldKnowledge.getAllEntities().filter(e => e.type === 'player' && e.id !== bot?.entity.id && (bot?.entity.position.distanceTo(e.position) || 0) < 50) : [],
            nearbyHostileMobs: this.worldKnowledge ? this.worldKnowledge.getAllEntities().filter(e => (e.type === 'mob') && e.name && !['cow', 'pig', 'sheep', 'chicken'].includes(e.name.toLowerCase()) && (bot?.entity.position.distanceTo(e.position) || 0) < 50) : [],
        };
        console.log('[STATUS] Bot status requested.');
        return this.createSuccessResponse(command.id, 'Current bot status.', status);
    }

    private async handleFollowPlayer(command: FollowPlayerCommand): Promise<McpResponse> {
        if (!this.behaviorEngine) throw new Error("BehaviorEngine not initialized.");
        const options: FollowPlayerOptions = {
            targetPlayer: command.targetPlayer,
            distanceThreshold: command.distanceThreshold !== undefined ? command.distanceThreshold : undefined,
            recheckInterval: command.recheckInterval !== undefined ? command.recheckInterval : undefined,
            // maxPathfindingAttempts はもはや不要なので削除
            // maxFallbackPathfindingRange はもはや不要なので削除
        };
        const started = await this.behaviorEngine.startBehavior('followPlayer', options);
        if (started) {
            return this.createSuccessResponse(command.id, `Attempting to follow player: ${command.targetPlayer}.`);
        } else {
            return this.createErrorResponse(command.id, `Failed to start following player: ${command.targetPlayer}.`);
        }
    }

    private async handleSendMessage(bot: mineflayer.Bot, command: SendMessageCommand): Promise<McpResponse> {
        const { message } = command;
        if (!message || message.trim() === '') {
            return this.createErrorResponse(command.id, 'Message cannot be empty.');
        }

        console.log(`[CHAT] Sending message: "${message}"`);
        bot.chat(message);

        return this.createSuccessResponse(command.id, `Message sent: "${message}"`);
    }

    private async handleMineBlock(command: MineBlockCommand): Promise<McpResponse> {
        if (!this.behaviorEngine) throw new Error("BehaviorEngine not initialized.");
        const options: MineBlockOptions = {
            blockId: command.blockId !== undefined ? command.blockId : undefined,
            blockName: command.blockName !== undefined ? command.blockName : undefined,
            quantity: command.quantity !== undefined ? command.quantity : undefined,
            maxDistance: command.maxDistance !== undefined ? command.maxDistance : undefined,
        };
        const started = await this.behaviorEngine.startBehavior('mineBlock', options);
        if (started) {
            const targetInfo = options.blockName ? options.blockName : (options.blockId ? `ID:${options.blockId}` : 'unknown block');
            return this.createSuccessResponse(command.id, `Attempting to mine ${options.quantity || 1} of ${targetInfo}.`);
        } else {
            const targetInfo = options.blockName ? options.blockName : (options.blockId ? `ID:${options.blockId}` : 'unknown block');
            return this.createErrorResponse(command.id, `Failed to start mining ${targetInfo}.`);
        }
    }

    private async handleAttackMob(command: AttackMobCommand): Promise<McpResponse> {
        if (!this.behaviorEngine) throw new Error("BehaviorEngine not initialized.");
        const options: CombatOptions = {
            targetMobName: command.targetMobName,
            maxCombatDistance: command.maxCombatDistance !== undefined ? command.maxCombatDistance : undefined,
            attackRange: command.attackRange !== undefined ? command.attackRange : undefined,
            stopAfterKill: command.stopAfterKill !== undefined ? command.stopAfterKill : undefined,
            // maxAttempts はもはや不要なので削除
        };
        const started = await this.behaviorEngine.startBehavior('combat', options);
        if (started) {
            return this.createSuccessResponse(command.id, `Attempting to attack mob: ${options.targetMobName}.`);
        } else {
            return this.createErrorResponse(command.id, `Failed to start attacking mob: ${options.targetMobName}.`);
        }
    }

    private handleSetCombatMode(command: SetCombatModeCommand): McpResponse {
        if (!this.behaviorEngine) {
            return this.createErrorResponse(command.id, `BehaviorEngine not initialized. Cannot set combat mode.`);
        }
        this.behaviorEngine.setCombatMode(command.mode === 'on');
        return this.createSuccessResponse(command.id, `Combat Mode set to ${command.mode.toUpperCase()}.`);
    }

    private handleStop(command: StopCommand): McpResponse {
        if (!this.behaviorEngine) throw new Error("BehaviorEngine not initialized.");
        this.behaviorEngine.stopCurrentBehavior();
        return this.createSuccessResponse(command.id, 'Current behavior stopped.');
    }

    private async handleTeleport(command: TeleportCommand): Promise<McpResponse> {
        const bot = this.botManager.getBot();
        if (!bot) {
            return this.createErrorResponse(command.id, "Bot not connected for teleportation.");
        }
        try {
            const { x, y, z } = command;
            bot.chat(`/tp ${bot.username} ${x} ${y} ${z}`);
            await new Promise(resolve => setTimeout(resolve, 500));
            return this.createSuccessResponse(command.id, `Teleported bot to ${x}, ${y}, ${z}.`);
        } catch (error: any) {
            return this.createErrorResponse(command.id, `Failed to teleport bot: ${error.message || 'Unknown error'}`);
        }
    }

    private createSuccessResponse(commandId: string | undefined, message: string, data?: any): SuccessMcpResponse {
        return { status: 'success', commandId, message, data };
    }

    private createErrorResponse(commandId: string | undefined, message: string, details?: any): ErrorMcpResponse {
        return { status: 'error', commandId, message, details: details instanceof Error ? details.message : details };
    }
}
