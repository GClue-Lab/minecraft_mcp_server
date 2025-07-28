// src/services/BehaviorEngine.ts v1.35 (完全版)

import * as mineflayer from 'mineflayer';
import { WorldKnowledge, WorldEntity } from './WorldKnowledge';
import { FollowPlayerBehavior, FollowPlayerOptions } from '../behaviors/followPlayer';
import { MineBlockBehavior, MineBlockOptions } from '../behaviors/mineBlock';
import { CombatBehavior, CombatOptions } from '../behaviors/combat';
import { BotManager } from './BotManager';
import { CurrentBehavior, BehaviorName } from '../types/mcp';

let BEHAVIOR_PRIORITIES: { [key in BehaviorName]: number } = {
    'combat': 0,
    'mineBlock': 5,
    'followPlayer': 10,
    'idle': 100,
};

interface BehaviorInstance {
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
    private onCompleteActions: Map<BehaviorInstance, { behavior: BehaviorName, options?: any }> = new Map();
    private interruptMonitorInterval: NodeJS.Timeout | null = null;
    private readonly MONITOR_INTERVAL_MS = 500;
    private combatModeEnabled: boolean = false;
    private miningModeEnabled: boolean = false;
    private followModeEnabled: boolean = false;
    private followTargetPlayer: string | null = null;
    private defaultCombatOptions: CombatOptions = { maxCombatDistance: 10, attackRange: 4 };
    private miningOptions: MineBlockOptions = {};

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

    /**
     * setMiningModeメソッド (新規追加)
     */
    public setMiningMode(enabled: boolean, options?: MineBlockOptions, onComplete?: { behavior: BehaviorName, options?: any }): void {
        this.miningModeEnabled = enabled;

        if (enabled && options && (options.blockName || options.blockId)) {
            this.miningOptions = options;
            console.log(`[BehaviorEngine] Mining Mode ON. Target: ${options.blockName || `ID:${options.blockId}`}`);
            this.startBehavior('mineBlock', this.miningOptions, onComplete);
        } else {
            console.log(`[BehaviorEngine] Mining Mode OFF.`);
            if (this.currentBehaviorName === 'mineBlock') {
                this.stopCurrentBehavior();
            }
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

    public setCombatOptions(options: CombatOptions): void {
        this.defaultCombatOptions = { ...this.defaultCombatOptions, ...options };
        console.log('BehaviorEngine: Default combat options updated.', this.defaultCombatOptions);
    }

    public getFollowTargetPlayer(): string | null {
        return this.followTargetPlayer;
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
        const detectionRange = this.defaultCombatOptions.maxCombatDistance ?? 64;
        const hostileMob = this.findNearestHostileMob(detectionRange);

        if (hostileMob) {
            const combatPriority = BEHAVIOR_PRIORITIES.combat;
            const currentPriority = this.currentBehaviorName ? BEHAVIOR_PRIORITIES[this.currentBehaviorName] : BEHAVIOR_PRIORITIES.idle;

            if (currentPriority > combatPriority || forceInterrupt) {
                console.log(`BehaviorEngine: Initiating combat for ${hostileMob.name}.`);
                const combatOptions: CombatOptions = {
                    ...this.defaultCombatOptions,
                    targetMobName: hostileMob.name,
                    stopAfterKill: true
                };
                this.startBehavior('combat', combatOptions);
            }
        }
    }

    private findNearestHostileMob(detectionRange: number): WorldEntity | undefined {
        const botEntity = this.worldKnowledge.getBotEntity();
        if (!botEntity) return undefined;

        const hostileMobNames = ['zombie', 'skeleton', 'spider', 'creeper', 'enderman', 'husk', 'stray', 'cave_spider', 'zombified_piglin', 'drowned', 'witch', 'guardian', 'elder_guardian', 'shulker', 'blaze', 'ghast', 'magma_cube', 'slime', 'phantom', 'wither_skeleton', 'piglin', 'piglin_brute', 'zoglin', 'vex', 'vindicator', 'evoker', 'ravager', 'pillager'];
        
        let closestMob: WorldEntity | null = null;
        let closestDistance = Infinity;

        for (const e of this.worldKnowledge.getAllEntities()) {
            if (!e.isValid || e.type === 'player') continue;
            const isHostile = (e.type === 'mob' || e.type === 'hostile') && e.name && hostileMobNames.includes(e.name);
            if (!isHostile) continue;
            
            const distance = botEntity.position.distanceTo(e.position);
            if (distance <= detectionRange && distance < closestDistance) {
                closestDistance = distance;
                closestMob = e;
            }
        }
        return closestMob || undefined;
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

    public async startBehavior(
        behaviorName: BehaviorName, 
        options?: any, 
        onComplete?: { behavior: BehaviorName, options?: any }
    ): Promise<boolean> {
        
        const oldBehaviorName = this.currentBehaviorName;
        const oldBehaviorInstance = oldBehaviorName ? this.activeBehaviorInstances[oldBehaviorName] : undefined;

        if (oldBehaviorName && oldBehaviorInstance?.isRunning()) {
            const newPriority = BEHAVIOR_PRIORITIES[behaviorName];
            const currentPriority = BEHAVIOR_PRIORITIES[oldBehaviorName];

            if (oldBehaviorName === behaviorName) {
                console.log(`[BehaviorEngine] OVERRIDE: Stopping '${oldBehaviorName}' to start a new task.`);
                this.stopCurrentBehavior(oldBehaviorInstance);
                await new Promise(resolve => setImmediate(resolve));
            } else if (newPriority < currentPriority) {
                console.log(`[BehaviorEngine] INTERRUPT: Pausing '${oldBehaviorName}' for '${behaviorName}'.`);
                oldBehaviorInstance.pause();
                this.behaviorStack.push(oldBehaviorName);
            } else {
                console.warn(`[BehaviorEngine] REJECT: New task '${behaviorName}' does not have priority over '${oldBehaviorName}'.`);
                return false;
            }
        }

        console.log(`[BehaviorEngine] Starting new behavior: '${behaviorName}'`);
        this.currentBehaviorName = behaviorName;

        let newBehaviorInstance: BehaviorInstance | undefined;
        let behaviorStarted: boolean = false;
        
        switch (behaviorName) {
            case 'followPlayer':
                newBehaviorInstance = new FollowPlayerBehavior(this.bot, this.worldKnowledge, options as FollowPlayerOptions);
                break;
            case 'mineBlock':
                newBehaviorInstance = new MineBlockBehavior(this.bot, this.worldKnowledge, options as MineBlockOptions);
                break;
            case 'combat':
                newBehaviorInstance = new CombatBehavior(this.bot, this.worldKnowledge, options as CombatOptions);
                break;
            case 'idle':
                this.bot.clearControlStates();
                behaviorStarted = true;
                break;
        }

        if (newBehaviorInstance) {
            behaviorStarted = newBehaviorInstance.start();
            if(behaviorStarted) {
                this.activeBehaviorInstances[behaviorName] = newBehaviorInstance;
                if (onComplete) {
                    this.onCompleteActions.set(newBehaviorInstance, onComplete);
                }
                this.monitorBehaviorCompletion(newBehaviorInstance, behaviorName);
            }
        }
        
        if (!behaviorStarted) {
            // もし開始に失敗したら、スタックから前の行動を再開しようと試みる
            const lastBehavior = this.behaviorStack[this.behaviorStack.length - 1];
            if (lastBehavior) {
                this.resumePreviousBehavior();
            } else {
                this.currentBehaviorName = null;
            }
        }
        return behaviorStarted;
    }

    private monitorBehaviorCompletion(instance: BehaviorInstance, name: BehaviorName): void {
        const check = setInterval(() => {
            if (!instance.isRunning()) {
                clearInterval(check);
                console.log(`[BehaviorEngine] Monitor: An instance of '${name}' has completed or stopped.`);
                
                if (this.activeBehaviorInstances[name] === instance) {
                    console.log(`[BehaviorEngine] Monitor: The stopped instance was the active one. Cleaning up state.`);
                    const onCompleteAction = this.onCompleteActions.get(instance);
                    this.onCompleteActions.delete(instance);
                    
                    if (this.currentBehaviorName === name) {
                        this.currentBehaviorName = null;
                        if (onCompleteAction) {
                            this.startBehavior(onCompleteAction.behavior, onCompleteAction.options);
                        } else {
                            this.resumePreviousBehavior();
                        }
                    }
                } else {
                    console.log(`[BehaviorEngine] Monitor: The stopped instance was an old/overridden one. Ignoring.`);
                }
            }
        }, this.MONITOR_INTERVAL_MS);
    }

    private resumePreviousBehavior(): void {
        const prevName = this.behaviorStack.pop();
        if (prevName) {
            const prevInstance = this.activeBehaviorInstances[prevName];
            if (prevInstance) {
                console.log(`[BehaviorEngine] Resuming previous behavior '${prevName}'.`);
                this.currentBehaviorName = prevName;
                prevInstance.resume();
                this.monitorBehaviorCompletion(prevInstance, prevName);
            } else {
                this.startBehavior('idle');
            }
        } else {
            if (this.combatModeEnabled) {
                this.tryInterruptForCombat(false);
            } else {
                this.startBehavior('idle');
            }
        }
    }

    public stopCurrentBehavior(instanceToStop?: BehaviorInstance): void {
        const instance = instanceToStop || (this.currentBehaviorName ? this.activeBehaviorInstances[this.currentBehaviorName] : undefined);
        
        if (instance) {
            console.log(`[BehaviorEngine] Calling .stop() on an active instance.`);
            instance.stop();
            this.onCompleteActions.delete(instance);
        }

        if (!instanceToStop) {
            this.currentBehaviorName = null;
            this.bot.clearControlStates();
        }
    }
}
