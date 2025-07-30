// src/services/CommandHandler.ts (最終完成版)

import * as mineflayer from 'mineflayer';
import { McpCommand } from '../types/mcp';
import { BotManager } from './BotManager';
import { WorldKnowledge, WorldEntity } from './WorldKnowledge';
import { BehaviorEngine } from './BehaviorEngine';
import { MineBlockOptions } from '../behaviors/mineBlock';

export class CommandHandler {
    private botManager: BotManager;
    private worldKnowledge: WorldKnowledge | null = null;
    private behaviorEngine: BehaviorEngine | null = null;

    constructor(botManager: BotManager, worldKnowledge: WorldKnowledge | null, behaviorEngine: BehaviorEngine | null) {
        this.botManager = botManager;
        this.worldKnowledge = worldKnowledge;
        this.behaviorEngine = behaviorEngine;
    }

    public isReady(): boolean {
        return !!this.worldKnowledge && !!this.behaviorEngine;
    }

    public getWorldKnowledge(): WorldKnowledge | null { return this.worldKnowledge; }
    public getBehaviorEngine(): BehaviorEngine | null { return this.behaviorEngine; }
    public setWorldKnowledge(wk: WorldKnowledge): void { this.worldKnowledge = wk; }
    public setBehaviorEngine(be: BehaviorEngine): void { this.behaviorEngine = be; }

    public async handleCommand(command: McpCommand): Promise<any> {
        const bot = this.botManager.getBot();
        if (!bot || !this.isReady() || !this.behaviorEngine || !this.worldKnowledge) {
            throw new Error("Bot is not fully ready or connected.");
        }
        
        switch (command.type) {
            case 'setMiningMode':
                if (command.mode === 'on') {
                    const options: MineBlockOptions = { blockName: command.blockName, quantity: command.quantity };
                    const followTarget = this.behaviorEngine.getFollowTargetPlayer();
                    let onCompleteAction;
                    if (followTarget) {
                        onCompleteAction = { behavior: 'followPlayer' as const, options: { targetPlayer: followTarget } };
                    }
                    this.behaviorEngine.setMiningMode(true, options, onCompleteAction);
                    return `Started mining ${command.quantity} of ${command.blockName}.`;
                } else {
                    this.behaviorEngine.setMiningMode(false);
                    return "Mining mode turned off.";
                }

            case 'setFollowMode':
                if (command.mode === 'on') {
                    if (!command.targetPlayer) throw new Error("targetPlayer is required to start following.");
                    if (!this.worldKnowledge.findPlayer(command.targetPlayer)) {
                        throw new Error(`Player '${command.targetPlayer}' not found in the server.`);
                    }
                    this.behaviorEngine.setFollowMode(true, command.targetPlayer);
                    return `Now following player ${command.targetPlayer}.`;
                } else {
                    this.behaviorEngine.setFollowMode(false, null);
                    return "Follow mode turned off.";
                }

            case 'setCombatMode':
                this.behaviorEngine.setCombatMode(command.mode === 'on');
                return `Combat mode has been set to ${command.mode}.`;

            case 'getStatus':
                const status = {
                    position: bot.entity.position,
                    health: bot.health,
                    food: bot.food,
                    behavior: this.behaviorEngine.getCurrentBehavior()
                };
                return { message: "Current bot status.", details: status };

            case 'stop':
                this.behaviorEngine.stopCurrentBehavior();
                return "All current actions have been stopped.";
                
            default:
                // McpCommand型に含まれないコマンドはここでエラーになる
                throw new Error(`Unknown command type received.`);
        }
    }
}
