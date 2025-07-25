// src/services/CommandHandler.ts (修正版)

import { BotManager, BotStatus } from './BotManager';
import { WorldKnowledge, WorldEntity } from './WorldKnowledge';
import { BehaviorEngine, BehaviorName } from './BehaviorEngine';
import {
    McpCommand,
    McpResponse,
    SuccessMcpResponse,
    ErrorMcpResponse,
    FollowPlayerCommand,
    SendMessageCommand,
    GetStatusCommand,
    BaseMcpCommand // 追加
} from '../types/mcp';
import * as mineflayer from 'mineflayer';
import { Vec3 } from 'vec3'; // Vec3はここからインポート

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
        console.log(`Handling command: ${command.type} (ID: ${command.id || 'N/A'})`);

        const bot = this.botManager.getBot();
        if (!bot || this.botManager.getStatus() !== 'connected') {
            return this.createErrorResponse(
                command.id,
                `Bot is not connected. Current status: ${this.botManager.getStatus()}. Some commands require a connected bot.`
            );
        }

        if (!this.worldKnowledge || !this.behaviorEngine) {
            return this.createErrorResponse(
                command.id,
                `Core services (WorldKnowledge/BehaviorEngine) not yet initialized. Please wait for bot connection.`
            );
        }

        try {
            switch (command.type) {
                case 'followPlayer':
                    return await this.handleFollowPlayer(bot, command as FollowPlayerCommand);
                case 'sendMessage':
                    return await this.handleSendMessage(bot, command as SendMessageCommand);
                case 'getStatus':
                    return this.handleGetStatus(bot, command as GetStatusCommand);
                default:
                    // 'command' が McpCommand のどの型にもマッチしなかった場合、型が 'never' になるため、
                    // BaseMcpCommand に型アサーションして id と type にアクセスできるようにする
                    const unknownCommand = command as BaseMcpCommand;
                    return this.createErrorResponse(unknownCommand.id, `Unknown command type: ${unknownCommand.type}`);
            }
        } catch (error: any) {
            console.error(`Error processing command ${command.type} (ID: ${command.id || 'N/A'}):`, error);
            return this.createErrorResponse(command.id, `Failed to execute command: ${error.message || 'Unknown error'}`, error);
        }
    }

    private async handleFollowPlayer(bot: mineflayer.Bot, command: FollowPlayerCommand): Promise<McpResponse> {
        const { targetPlayer } = command;

        if (!this.worldKnowledge || !this.behaviorEngine) {
             return this.createErrorResponse(command.id, `Internal error: WorldKnowledge or BehaviorEngine not available.`);
        }

        const playerEntity = this.worldKnowledge.getPlayer(targetPlayer);
        if (!playerEntity) {
            return this.createErrorResponse(command.id, `Player "${targetPlayer}" not found in current world knowledge.`);
        }

        const started = this.behaviorEngine.startBehavior('followPlayer', { targetPlayer: targetPlayer });

        if (started) {
            return this.createSuccessResponse(command.id, `Attempting to follow player: ${targetPlayer}`);
        } else {
            return this.createErrorResponse(command.id, `Failed to start followPlayer behavior for ${targetPlayer}.`);
        }
    }

    private async handleSendMessage(bot: mineflayer.Bot, command: SendMessageCommand): Promise<McpResponse> {
        const { message } = command;
        if (!message || message.trim() === '') {
            return this.createErrorResponse(command.id, 'Message cannot be empty.');
        }

        console.log(`[CHAT] Sending message: ${message}`);
        bot.chat(message);

        return this.createSuccessResponse(command.id, `Message sent: "${message}"`);
    }

    private handleGetStatus(bot: mineflayer.Bot, command: GetStatusCommand): McpResponse {
        if (!this.worldKnowledge || !this.behaviorEngine) {
            return this.createErrorResponse(command.id, `Internal error: WorldKnowledge or BehaviorEngine not available for status.`);
        }

        const botEntity = this.worldKnowledge.getBotEntity();
        const status: {
            botStatus: BotStatus;
            botHealth: number | null;
            botFood: number | null;
            botPosition: Vec3 | null; // mineflayer.Vec3 から Vec3 に変更
            currentBehavior: BehaviorName | null;
            nearbyPlayers: WorldEntity[];
            nearbyHostileMobs: WorldEntity[];
        } = {
            botStatus: this.botManager.getStatus(),
            botHealth: bot.health !== undefined ? bot.health : null,
            botFood: bot.food !== undefined ? bot.food : null,
            botPosition: botEntity ? botEntity.position : null,
            currentBehavior: this.behaviorEngine.getCurrentBehavior()?.name || null,
            nearbyPlayers: this.worldKnowledge.getAllEntities().filter(e => e.type === 'player' && e.id !== bot.entity.id && bot.entity.position.distanceTo(e.position) < 50),
            nearbyHostileMobs: this.worldKnowledge.getAllEntities().filter(e => (e.type === 'mob' || e.type === 'object') && e.name && !['cow', 'pig', 'sheep', 'chicken'].includes(e.name.toLowerCase()) && bot.entity.position.distanceTo(e.position) < 50),
        };
        console.log('[STATUS] Bot status requested.');
        return this.createSuccessResponse(command.id, 'Current bot status.', status);
    }

    private createSuccessResponse(commandId: string | undefined, message: string, data?: any): SuccessMcpResponse {
        return {
            status: 'success',
            commandId: commandId,
            message: message,
            data: data
        };
    }

    private createErrorResponse(commandId: string | undefined, message: string, details?: any): ErrorMcpResponse {
        return {
            status: 'error',
            commandId: commandId,
            message: message,
            details: details instanceof Error ? details.message : details
        };
    }
}
