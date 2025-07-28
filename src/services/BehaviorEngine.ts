// src/services/BehaviorEngine.ts v1.24 (修正版)

import * as mineflayer from 'mineflayer';
import { WorldKnowledge, WorldEntity } from './WorldKnowledge';
import { FollowPlayerBehavior, FollowPlayerOptions } from '../behaviors/followPlayer';
import { MineBlockBehavior, MineBlockOptions } from '../behaviors/mineBlock';
import { CombatBehavior, CombatOptions } from '../behaviors/combat';
import { Vec3 } from 'vec3';
import { BotManager } from './BotManager';
import { CurrentBehavior, BehaviorName } from '../types/mcp'; 

let BEHAVIOR_PRIORITIES: { [key in BehaviorName]: number } = {
    'combat': 0,
    'followPlayer': 10,
    'mineBlock': 20,
    'idle': 100,
};

interface BehaviorInstance {
    // ここを修正: Promise<boolean> を削除し、booleanのみを返すように型を統一
    start(): boolean;
    stop(): void;
    isRunning(): boolean;
    pause(): void;
    resume(): void;
    canBeInterruptedBy(higherPriorityBehavior: BehaviorName): boolean;
    getOptions(): any;
}

export class BehaviorEngine {
    private bot: mineflayer.Bot;
    private worldKnowledge: WorldKnowledge;
    private botManager: BotManager;
    private activeBehaviorInstances: { [key in BehaviorName]?: BehaviorInstance } = {};
    private currentBehaviorName: BehaviorName | null = null;
    private behaviorStack: BehaviorName[] = [];

    private interruptMonitorInterval: NodeJS.Timeout | null = null;
    private readonly MONITOR_INTERVAL_MS = 500;
    private combatModeEnabled: boolean = false;
    private followModeEnabled: boolean = false;
    private followTargetPlayer: string | null = null;

    constructor(bot: mineflayer.Bot, worldKnowledge: WorldKnowledge, botManager: BotManager) {
        this.bot = bot;
        this.worldKnowledge = worldKnowledge;
        this.botManager = botManager;
        console.log('BehaviorEngine initialized.');
        this.setupBotEvents(botManager);
        this.startInterruptMonitor();
    }

    public setBotInstance(newBot: mineflayer.Bot): void {
        this.bot = newBot;
        console.log('BehaviorEngine: Bot instance updated.');
    }

    public setupBotEvents(botManager: BotManager): void {
        botManager.getBotInstanceEventEmitter().on('death', () => {
            console.warn('BehaviorEngine: Bot died! Stopping current behavior and clearing stack.');
            this.stopCurrentBehavior();
            this.behaviorStack = [];
        });

        botManager.getBotInstanceEventEmitter().on('respawn', () => {
            console.log('BehaviorEngine: Bot respawned! Starting idle behavior.');
            this.startBehavior('idle');
        });

        this.bot.on('health', () => {
            if (this.bot.health && this.bot.health < 20) {
                this.tryInterruptForCombat(true);
            }
        });
    }

    private startInterruptMonitor(): void {
        if (this.interruptMonitorInterval) {
            clearInterval(this.interruptMonitorInterval);
        }
        console.log(`BehaviorEngine: Starting interrupt monitor (interval: ${this.MONITOR_INTERVAL_MS}ms).`);
        this.interruptMonitorInterval = setInterval(() => {
            if (this.combatModeEnabled) {
                this.tryInterruptForCombat(false);
            }
            if (this.followModeEnabled && this.followTargetPlayer && this.currentBehaviorName !== 'followPlayer' && this.currentBehaviorName !== 'combat') {
                this.tryStartFollowBehavior();
            }
        }, this.MONITOR_INTERVAL_MS);
    }

    public setCombatMode(enabled: boolean): void {
        this.combatModeEnabled = enabled;
        console.log(`BehaviorEngine: Combat Mode set to ${enabled ? 'ON' : 'OFF'}.`);
        if (enabled && this.currentBehaviorName !== 'combat') {
            this.tryInterruptForCombat(false);
        } else if (!enabled && this.currentBehaviorName === 'combat') {
            console.log('BehaviorEngine: Combat Mode OFF. Stopping current combat behavior.');
            this.stopCurrentBehavior();
            this.resumePreviousBehavior();
        }
    }

    public setFollowMode(enabled: boolean, targetPlayer: string | null = null): void {
        this.followModeEnabled = enabled;
        this.followTargetPlayer = targetPlayer;
        console.log(`BehaviorEngine: Follow Mode set to ${enabled ? 'ON' : 'OFF'}. Target: ${targetPlayer || 'N/A'}`);
        
        if (enabled && targetPlayer) {
            this.tryStartFollowBehavior();
        } else if (!enabled && this.currentBehaviorName === 'followPlayer') {
            console.log(`BehaviorEngine: Follow Mode OFF. Stopping current follow behavior.`);
            this.stopCurrentBehavior();
            this.resumePreviousBehavior();
        } else if (!enabled) {
            this.followTargetPlayer = null;
        }
    }

    public setBehaviorPriority(behaviorName: BehaviorName, priority: number): void {
        if (BEHAVIOR_PRIORITIES[behaviorName] !== undefined) {
            BEHAVIOR_PRIORITIES[behaviorName] = priority;
            console.log(`BehaviorEngine: Priority for ${behaviorName} set to ${priority}.`);
        } else {
            console.warn(`BehaviorEngine: Cannot set priority for unknown behavior: ${behaviorName}.`);
        }
    }

    private tryStartFollowBehavior(): void {
        if (!this.followModeEnabled || !this.followTargetPlayer) {
            return;
        }
        const followPriority = BEHAVIOR_PRIORITIES.followPlayer;
        const currentPriority = this.currentBehaviorName ? BEHAVIOR_PRIORITIES[this.currentBehaviorName] : BEHAVIOR_PRIORITIES.idle;
        if (currentPriority > followPriority && this.currentBehaviorName !== 'combat') {
             this.startBehavior('followPlayer', { targetPlayer: this.followTargetPlayer });
        }
    }

    private tryInterruptForCombat(forceInterrupt: boolean): void {
        if (!this.combatModeEnabled || (this.currentBehaviorName === 'combat' && !forceInterrupt)) {
            return;
        }
        const hostileMob = this.findNearestHostileMob(forceInterrupt ? 64 : 64);
        if (hostileMob) {
            const combatPriority = BEHAVIOR_PRIORITIES.combat;
            const currentPriority = this.currentBehaviorName ? BEHAVIOR_PRIORITIES[this.currentBehaviorName] : BEHAVIOR_PRIORITIES.idle;
            if (currentPriority > combatPriority || forceInterrupt) {
                console.log(`BehaviorEngine: Initiating combat for ${hostileMob.name}.`);
                this.startBehavior('combat', { 
                    targetMobName: hostileMob.name,
                    stopAfterKill: true
                });
            }
        }
    }

    private findNearestHostileMob(detectionRange: number): WorldEntity | undefined {
        const botEntity = this.worldKnowledge.getBotEntity();
        if (!botEntity) return undefined;

        const hostileMobNames = ['zombie', 'skeleton', 'spider', 'creeper', 'enderman', 'husk', 'stray', 'cave_spider', 'zombified_piglin', 'drowned', 'witch', 'guardian', 'elder_guardian', 'shulker', 'blaze', 'ghast', 'magma_cube', 'slime', 'phantom', 'wither_skeleton', 'piglin', 'piglin_brute', 'zoglin', 'vex', 'vindicator', 'evoker', 'ravager', 'pillager'];
        
        return this.worldKnowledge.getAllEntities().find(e => {
            if (!e.isValid) return false;
            if (e.type === 'player') return false;
            const isHostile = (e.type === 'mob' || e.type === 'hostile') && e.name && hostileMobNames.includes(e.name);
            if (!isHostile) return false;
            const distance = botEntity.position.distanceTo(e.position);
            return distance <= detectionRange;
        });
    }

    public getCurrentBehavior(): CurrentBehavior | null {
        if (this.currentBehaviorName && this.activeBehaviorInstances[this.currentBehaviorName]?.isRunning()) {
            const instance = this.activeBehaviorInstances[this.currentBehaviorName];
            if (!instance) return null;
            const options = instance.getOptions();
            let targetInfo: any;
            if (this.currentBehaviorName === 'followPlayer') targetInfo = options.targetPlayer;
            else if (this.currentBehaviorName === 'mineBlock') targetInfo = options.blockName || options.blockId;
            else if (this.currentBehaviorName === 'combat') targetInfo = options.targetMobName;
            return { name: this.currentBehaviorName, isActive: true, target: targetInfo };
        }
        return null;
    }

    public async startBehavior(behaviorName: BehaviorName, options?: any): Promise<boolean> {
        const newBehaviorPriority = BEHAVIOR_PRIORITIES[behaviorName];
        const currentBehaviorPriority = this.currentBehaviorName ? BEHAVIOR_PRIORITIES[this.currentBehaviorName] : BEHAVIOR_PRIORITIES.idle;

        if (this.currentBehaviorName && newBehaviorPriority < currentBehaviorPriority) {
            console.log(`Interrupting '${this.currentBehaviorName}' for '${behaviorName}'.`);
            this.activeBehaviorInstances[this.currentBehaviorName]?.pause();
            this.behaviorStack.push(this.currentBehaviorName);
        } else if (this.currentBehaviorName && newBehaviorPriority >= currentBehaviorPriority && behaviorName !== this.currentBehaviorName) {
            console.warn(`Cannot start '${behaviorName}', current behavior '${this.currentBehaviorName}' has higher/equal priority.`);
            return false;
        } else if (this.currentBehaviorName === behaviorName && this.activeBehaviorInstances[behaviorName]?.isRunning()) {
            return true;
        }

        if (this.currentBehaviorName && this.currentBehaviorName !== behaviorName) {
             this.stopCurrentBehavior();
        }

        console.log(`Starting behavior: ${behaviorName}`);
        this.currentBehaviorName = behaviorName;

        let behaviorStarted: boolean = false;
        let behaviorInstance: BehaviorInstance | undefined;

        switch (behaviorName) {
            case 'followPlayer':
                behaviorInstance = new FollowPlayerBehavior(this.bot, this.worldKnowledge, options as FollowPlayerOptions);
                behaviorStarted = behaviorInstance.start();
                break;
            case 'mineBlock':
                behaviorInstance = new MineBlockBehavior(this.bot, this.worldKnowledge, options as MineBlockOptions);
                behaviorStarted = behaviorInstance.start();
                break;
            case 'combat':
                behaviorInstance = new CombatBehavior(this.bot, this.worldKnowledge, options as CombatOptions);
                behaviorStarted = behaviorInstance.start();
                if (behaviorStarted) {
                    this.monitorBehaviorCompletion(behaviorInstance, behaviorName);
                }
                break;
            case 'idle':
                this.bot.clearControlStates();
                behaviorStarted = true;
                break;
            default:
                console.error(`Unknown behavior: ${behaviorName}`);
        }

        if (behaviorStarted && behaviorInstance) {
            this.activeBehaviorInstances[behaviorName] = behaviorInstance;
        } else if (behaviorStarted === false) {
            this.currentBehaviorName = null;
        }
        return behaviorStarted;
    }

    private monitorBehaviorCompletion(behaviorInstance: BehaviorInstance, behaviorName: BehaviorName): void {
        const checkCompletion = setInterval(() => {
            if (!behaviorInstance.isRunning()) {
                clearInterval(checkCompletion);
                console.log(`BehaviorEngine: '${behaviorName}' behavior completed or stopped.`);
                if (this.currentBehaviorName === behaviorName) {
                    this.currentBehaviorName = null;
                    if (this.combatModeEnabled && behaviorName === 'combat') {
                         this.tryInterruptForCombat(false);
                    } else {
                        this.resumePreviousBehavior();
                    }
                }
            }
        }, this.MONITOR_INTERVAL_MS);
    }

    private resumePreviousBehavior(): void {
        const previousBehaviorName = this.behaviorStack.pop();
        if (previousBehaviorName) {
            const previousInstance = this.activeBehaviorInstances[previousBehaviorName];
            if (previousInstance) {
                console.log(`Resuming previous behavior '${previousBehaviorName}'.`);
                this.currentBehaviorName = previousBehaviorName;
                previousInstance.resume();
                this.monitorBehaviorCompletion(previousInstance, previousBehaviorName);
            } else {
                this.startBehavior('idle');
            }
        } else {
            console.log('Behavior stack empty. Starting idle.');
            this.startBehavior('idle');
        }
    }

    public stopCurrentBehavior(): void {
        if (!this.currentBehaviorName) {
            return;
        }
        console.log(`Stopping current behavior: ${this.currentBehaviorName}`);
        const activeInstance = this.activeBehaviorInstances[this.currentBehaviorName];
        if (activeInstance) {
            activeInstance.stop();
        }
        this.currentBehaviorName = null;
        this.bot.clearControlStates();
    }
}
