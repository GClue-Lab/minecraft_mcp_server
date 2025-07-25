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
    MineBlockCommand, // 追加
    BaseMcpCommand
} from '../types/mcp';
import * as mineflayer from 'mineflayer';
import { Vec3 } from 'vec3';

/**
 * LLMからのMCPコマンドを処理し、Mineflayerボットの動作に変換するクラス
 */
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

    /**
     * MCPコマンドを処理します。
     * @param command LLMから受け取ったMCPコマンド
     * @returns 処理結果を示すMcpResponse
     */
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
                case 'mineBlock': // 新しいコマンドの処理を追加
                    return await this.handleMineBlock(bot, command as MineBlockCommand);
                default:
                    const unknownCommand = command as BaseMcpCommand;
                    return this.createErrorResponse(unknownCommand.id, `Unknown command type: ${unknownCommand.type}`);
            }
        } catch (error: any) {
            console.error(`Error processing command ${command.type} (ID: ${command.id || 'N/A'}):`, error);
            return this.createErrorResponse(command.id, `Failed to execute command: ${error.message || 'Unknown error'}`, error);
        }
    }

    /**
     * 'followPlayer' コマンドを処理します。
     * BehaviorEngineに処理を委譲します。
     */
    private async handleFollowPlayer(bot: mineflayer.Bot, command: FollowPlayerCommand): Promise<McpResponse> {
        const { targetPlayer } = command;

        if (!this.worldKnowledge || !this.behaviorEngine) {
             return this.createErrorResponse(command.id, `Internal error: WorldKnowledge or BehaviorEngine not available.`);
        }

        const playerEntity = this.worldKnowledge.getPlayer(targetPlayer);
        if (!playerEntity) {
            return this.createErrorResponse(command.id, `Player "${targetPlayer}" not found in current world knowledge.`);
        }

        const started = await this.behaviorEngine.startBehavior('followPlayer', { targetPlayer: targetPlayer });

        if (started) {
            return this.createSuccessResponse(command.id, `Attempting to follow player: ${targetPlayer}`);
        } else {
            return this.createErrorResponse(command.id, `Failed to start followPlayer behavior for ${targetPlayer}.`);
        }
    }

    /**
     * 'sendMessage' コマンドを処理します。
     */
    private async handleSendMessage(bot: mineflayer.Bot, command: SendMessageCommand): Promise<McpResponse> {
        const { message } = command;
        if (!message || message.trim() === '') {
            return this.createErrorResponse(command.id, 'Message cannot be empty.');
        }

        console.log(`[CHAT] Sending message: ${message}`);
        bot.chat(message);

        return this.createSuccessResponse(command.id, `Message sent: "${message}"`);
    }

    /**
     * 'mineBlock' コマンドを処理します (新規追加)。
     * BehaviorEngineに処理を委譲します。
     */
    private async handleMineBlock(bot: mineflayer.Bot, command: MineBlockCommand): Promise<McpResponse> {
        const { blockId, blockName, quantity, maxDistance } = command;

        if (!this.worldKnowledge || !this.behaviorEngine) {
            return this.createErrorResponse(command.id, `Internal error: WorldKnowledge or BehaviorEngine not available.`);
        }

        if (!blockId && !blockName) {
            return this.createErrorResponse(command.id, 'MineBlock command requires either blockId or blockName.');
        }

        const started = await this.behaviorEngine.startBehavior('mineBlock', { blockId, blockName, quantity, maxDistance });

        if (started) {
            const targetInfo = blockName ? blockName : (blockId ? `ID:${blockId}` : 'unknown block');
            return this.createSuccessResponse(command.id, `Attempting to mine ${quantity || 1} of ${targetInfo}.`);
        } else {
            return this.createErrorResponse(command.id, `Failed to start mineBlock behavior.`);
        }
    }


    /**
     * 'getStatus' コマンドを処理します。
     */
    private handleGetStatus(bot: mineflayer.Bot, command: GetStatusCommand): McpResponse {
        if (!this.worldKnowledge || !this.behaviorEngine) {
            return this.createErrorResponse(command.id, `Internal error: WorldKnowledge or BehaviorEngine not available for status.`);
        }

        const botEntity = this.worldKnowledge.getBotEntity();
        const status: {
            botStatus: BotStatus;
            botHealth: number | null;
            botFood: number | null;
            botPosition: Vec3 | null;
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

    /**
     * 成功応答オブジェクトを生成します。
     */
    private createSuccessResponse(commandId: string | undefined, message: string, data?: any): SuccessMcpResponse {
        return {
            status: 'success',
            commandId: commandId,
            message: message,
            data: data
        };
    }

    /**
     * エラー応答オブジェクトを生成します。
     */
    private createErrorResponse(commandId: string | undefined, message: string, details?: any): ErrorMcpResponse {
        return {
            status: 'error',
            commandId: commandId,
            message: message,
            details: details instanceof Error ? details.message : details
        };
    }
}
