// src/services/BehaviorEngine.ts v1.22

import * as mineflayer from 'mineflayer';
import { WorldKnowledge, WorldEntity } from './WorldKnowledge';
import { FollowPlayerBehavior, FollowPlayerOptions } from '../behaviors/followPlayer';
import { MineBlockBehavior, MineBlockOptions } from '../behaviors/mineBlock';
import { CombatBehavior, CombatOptions } from '../behaviors/combat';
import { Vec3 } from 'vec3';
import { BotManager } from './BotManager';
// ここを修正: BehaviorName は mcp.d.ts からインポートする (この行は正しい)
import { CurrentBehavior, BehaviorName } from '../types/mcp'; 

// ここを修正: BehaviorName のローカル宣言を**完全に削除**します
// export type BehaviorName = 'combat' | 'followPlayer' | 'mineBlock' | 'idle'; // <<< この行を**完全に削除**します

// 優先度は動的に変更可能にするため、let で宣言 (このファイル内に残す)
let BEHAVIOR_PRIORITIES: { [key in BehaviorName]: number } = {
    'combat': 0,        // 最優先
    'followPlayer': 10,
    'mineBlock': 20,
    'idle': 100,        // 最低優先
};

interface BehaviorInstance {
    start(): Promise<boolean> | boolean;
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
    private followModeEnabled: boolean = false; // 新規追加: 追従モードの状態
    private followTargetPlayer: string | null = null; // 新規追加: 追従ターゲットプレイヤー名

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
            const botHealth = this.bot.health;
            if (botHealth && botHealth < 20) { // ヘルスが減った場合に割り込みを検討
                console.log(`BehaviorEngine: Bot health is ${botHealth}. Forcing combat check.`);
                this.tryInterruptForCombat(true);
            }
        });
        
        this.interruptMonitorInterval = setInterval(() => {
            if (this.combatModeEnabled) {
                console.log('BehaviorEngine: Combat mode ON. Performing regular enemy check.');
                this.tryInterruptForCombat(false);
            }
            if (this.followModeEnabled && this.followTargetPlayer && this.currentBehaviorName !== 'followPlayer' && this.currentBehaviorName !== 'combat') {
                console.log('BehaviorEngine: Follow mode ON. Performing regular follow check.');
                this.tryStartFollowBehavior();
            }
        }, this.MONITOR_INTERVAL_MS);
    }

    private startInterruptMonitor(): void {
        if (this.interruptMonitorInterval) {
            clearInterval(this.interruptMonitorInterval);
        }
        console.log(`BehaviorEngine: Starting interrupt monitor (interval: ${this.MONITOR_INTERVAL_MS}ms).`);
        this.interruptMonitorInterval = setInterval(() => {
            if (this.combatModeEnabled) {
                console.log('BehaviorEngine: Combat mode ON. Performing regular enemy check.');
                this.tryInterruptForCombat(false);
            }
            if (this.followModeEnabled && this.followTargetPlayer && this.currentBehaviorName !== 'followPlayer' && this.currentBehaviorName !== 'combat') {
                console.log('BehaviorEngine: Follow mode ON. Performing regular follow check.');
                this.tryStartFollowBehavior();
            }
        }, this.MONITOR_INTERVAL_MS);
    }

    public setCombatMode(enabled: boolean): void {
        this.combatModeEnabled = enabled;
        console.log(`BehaviorEngine: Combat Mode set to ${enabled ? 'ON' : 'OFF'}.`);
        if (enabled && this.currentBehaviorName !== 'combat') {
            console.log('BehaviorEngine: Combat mode activated. Initial enemy check.');
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
            console.log('BehaviorEngine: Follow mode activated. Attempting initial follow.');
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
            console.log('BehaviorEngine: Follow mode not enabled or no target player.');
            return;
        }

        const followPriority = BEHAVIOR_PRIORITIES.followPlayer;
        const currentPriority = this.currentBehaviorName ? BEHAVIOR_PRIORITIES[this.currentBehaviorName] : BEHAVIOR_PRIORITIES.idle;

        if (currentPriority > followPriority && this.currentBehaviorName !== 'combat') {
             console.log(`BehaviorEngine: Attempting to start follow behavior. Current: ${this.currentBehaviorName}, New: followPlayer.`);
             this.startBehavior('followPlayer', { targetPlayer: this.followTargetPlayer });
        } else if (this.currentBehaviorName === 'followPlayer' && this.activeBehaviorInstances.followPlayer?.isRunning()) {
            console.log(`BehaviorEngine: Already following ${this.followTargetPlayer}. No new action needed.`);
        } else {
            console.log(`BehaviorEngine: Cannot start follow behavior. Current behavior '${this.currentBehaviorName}' (Prio: ${currentPriority}) has higher/equal priority or is combat.`);
        }
    }

    private tryInterruptForCombat(forceInterrupt: boolean): void {
        const botEntity = this.worldKnowledge.getBotEntity();
        if (!botEntity) {
            console.warn('BehaviorEngine: tryInterruptForCombat - Bot entity not available.');
            return;
        }

        console.log(`BehaviorEngine: tryInterruptForCombat called (force: ${forceInterrupt}). Checking for hostile mobs.`);
        
        const hostileMobNames = ['zombie', 'skeleton', 'spider', 'creeper', 'enderman', 'husk', 'stray', 'cave_spider', 'zombified_piglin', 'drowned', 'witch', 'guardian', 'elder_guardian', 'shulker', 'blaze', 'ghast', 'magma_cube', 'slime', 'phantom', 'wither_skeleton', 'piglin', 'piglin_brute', 'zoglin', 'vex', 'vindicator', 'evoker', 'ravager', 'illusions_illager', 'pillager'];
        
        const nearbyHostileMob = this.worldKnowledge.getAllEntities().find(e => {
            const isValidEntity = e.isValid; 
            if (!isValidEntity) {
                 console.log(`BehaviorEngine: Skipping invalid entity ID:${e.id}, Name:${e.name || 'N/A'}. Reason: Not valid.`);
                 return false;
            }
            // プレイヤー自身は敵対モブとしない
            if (e.type === 'player' && e.name === this.bot.username) {
                return false;
            }
            // naisy714 プレイヤーも敵対モブとしない
            if (e.type === 'player' && e.name === 'naisy714') {
                return false;
            }

            const isMobType = e.type === 'mob' || e.type === 'hostile'; // 'hostile'も追加
            const isNamedHostile = e.name && hostileMobNames.includes(e.name);

            const isHostile = isMobType && isNamedHostile;

            if (!isHostile) {
                console.log(`BehaviorEngine: Skipping non-hostile mob or unknown type: ID:${e.id}, Type:${e.type}, Name:${e.name || 'N/A'}.`);
                return false;
            }

            const distance = botEntity.position.distanceTo(e.position);
            const detectionRange = forceInterrupt ? 64 : 64; // 強制/通常ともに64ブロックに拡大 (スケルトン対応)
            const isInRange = distance <= detectionRange;
            
            console.log(`BehaviorEngine: Found potential mob: ${e.name} (ID: ${e.id}) at (${e.position.x.toFixed(2)},${e.position.y.toFixed(2)},${e.position.z.toFixed(2)}) (Dist: ${distance.toFixed(2)}, Valid: ${isValidEntity}, InRange: ${isInRange}).`);

            return isHostile && isInRange;
        });


        if (nearbyHostileMob) {
            console.log(`BehaviorEngine: Hostile mob ${nearbyHostileMob.name} detected.`);
            const combatPriority = BEHAVIOR_PRIORITIES.combat;
            const currentPriority = this.currentBehaviorName ? BEHAVIOR_PRIORITIES[this.currentBehaviorName] : BEHAVIOR_PRIORITIES.idle;

            if (this.currentBehaviorName === 'combat' && this.activeBehaviorInstances.combat?.isRunning()) {
                const combatInstance = this.activeBehaviorInstances.combat as CombatBehavior;
                if (combatInstance.getOptions().targetMobName === nearbyHostileMob.name && combatInstance.isRunning()) {
                    console.log(`BehaviorEngine: Already in combat with ${nearbyHostileMob.name}. No new action needed.`);
                    return;
                }
                console.log(`BehaviorEngine: Already in combat, but target changed or previous combat ended. Restarting combat for ${nearbyHostileMob.name}.`);
                this.startBehavior('combat', { 
                    targetMobName: nearbyHostileMob.name,
                    stopAfterKill: true
                });
                return;
            }

            if (currentPriority > combatPriority || (forceInterrupt && this.currentBehaviorName !== 'combat')) {
                 console.log(`BehaviorEngine: Initiating combat for ${nearbyHostileMob.name}. Current: ${this.currentBehaviorName} (Prio: ${currentPriority}), New: combat (Prio: ${combatPriority}).`);
                this.startBehavior('combat', { 
                    targetMobName: nearbyHostileMob.name,
                    stopAfterKill: true
                });
            } else {
                 console.log(`BehaviorEngine: Hostile mob ${nearbyHostileMob.name} detected, but current behavior '${this.currentBehaviorName}' (Prio: ${currentPriority}) has higher/equal priority.`);
            }
        } else {
            console.log('BehaviorEngine: No hostile mobs detected within range.');
        }
    }

    public getCurrentBehavior(): CurrentBehavior | null {
        if (this.currentBehaviorName && this.activeBehaviorInstances[this.currentBehaviorName]?.isRunning()) {
            const instance = this.activeBehaviorInstances[this.currentBehaviorName];
            
            if (instance === undefined) { 
                return null; 
            }

            let targetInfo: string | number | { x: number, y: number, z: number } | null | undefined;

            const options = instance.getOptions();
            if (this.currentBehaviorName === 'followPlayer') {
                targetInfo = options.targetPlayer;
            } else if (this.currentBehaviorName === 'mineBlock') {
                targetInfo = options.blockName || options.blockId;
            } else if (this.currentBehaviorName === 'combat') {
                targetInfo = options.targetMobName;
            }

            return {
                name: this.currentBehaviorName,
                isActive: true,
                target: targetInfo,
            };
        }
        return null;
    }

    public async startBehavior(behaviorName: BehaviorName, options?: any): Promise<boolean> {
        const newBehaviorPriority = BEHAVIOR_PRIORITIES[behaviorName];
        const currentBehaviorPriority = this.currentBehaviorName ? BEHAVIOR_PRIORITIES[this.currentBehaviorName] : BEHAVIOR_PRIORITIES.idle;

        if (newBehaviorPriority < currentBehaviorPriority) {
            if (this.currentBehaviorName && this.activeBehaviorInstances[this.currentBehaviorName]?.isRunning()) {
                console.log(`BehaviorEngine: Interrupting '${this.currentBehaviorName}' (priority ${currentBehaviorPriority}) for '${behaviorName}' (priority ${newBehaviorPriority}).`);
                this.activeBehaviorInstances[this.currentBehaviorName]?.pause();
                this.behaviorStack.push(this.currentBehaviorName);
            }
        } else if (newBehaviorPriority > currentBehaviorPriority) { // <<<< currentPriority を currentBehaviorPriority に修正
            console.warn(`BehaviorEngine: Cannot start '${behaviorName}' (priority ${newBehaviorPriority}) because current behavior '${this.currentBehaviorName}' (priority ${currentBehaviorPriority}) has higher/equal priority.`); // <<<< ログも修正
            return false;
        } else if (this.currentBehaviorName === behaviorName && this.activeBehaviorInstances[behaviorName]?.isRunning()) {
            console.log(`BehaviorEngine: Behavior '${behaviorName}' is already active. Ignoring start request.`);
            return true;
        }

        if (this.currentBehaviorName && this.currentBehaviorName !== behaviorName) {
             this.stopCurrentBehavior();
        }

        console.log(`Starting behavior: ${behaviorName} with options:`, options);
        this.currentBehaviorName = behaviorName;

        let behaviorStarted = false;
        let behaviorInstance: BehaviorInstance | undefined;

        switch (behaviorName) {
            case 'followPlayer':
                if (options && typeof options.targetPlayer === 'string') {
                    behaviorInstance = new FollowPlayerBehavior(this.bot, this.worldKnowledge, options as FollowPlayerOptions);
                    if (behaviorInstance) { 
                        behaviorStarted = await Promise.resolve(behaviorInstance.start());
                    }
                } else {
                    console.error('FollowPlayer behavior requires a targetPlayer option (string).');
                }
                break;
            case 'mineBlock':
                if ((options && (options.blockId !== undefined || options.blockName !== undefined))) {
                    behaviorInstance = new MineBlockBehavior(this.bot, this.worldKnowledge, options as MineBlockOptions);
                    if (behaviorInstance) {
                        behaviorStarted = await Promise.resolve(behaviorInstance.start());
                    }
                } else {
                    console.error('MineBlock behavior requires either blockId or blockName option.');
                }
                break;
            case 'combat':
                if (options && options.targetMobName) {
                    behaviorInstance = new CombatBehavior(this.bot, this.worldKnowledge, options as CombatOptions);
                    if (behaviorInstance) {
                        behaviorStarted = await Promise.resolve(behaviorInstance.start());
                        if (behaviorStarted) {
                            this.monitorBehaviorCompletion(behaviorInstance, behaviorName);
                        }
                    }
                } else {
                    console.error('Combat behavior requires a targetMobName option (string).');
                }
                break;
            case 'idle':
                console.log('Bot is now idle.');
                this.bot.clearControlStates();
                behaviorStarted = true;
                break;
            default:
                console.error(`Unknown behavior: ${behaviorName}`);
                break;
        }

        if (behaviorStarted && behaviorInstance) {
            this.activeBehaviorInstances[behaviorName] = behaviorInstance;
        } else {
            this.currentBehaviorName = null;
            return false;
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
                    if (this.combatModeEnabled && behaviorName === 'combat' && !this.behaviorStack.length) {
                         console.log("BehaviorEngine: Combat mode ON. Re-evaluating for next enemy.");
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
                console.log(`BehaviorEngine: Resuming previous behavior '${previousBehaviorName}'.`);
                this.currentBehaviorName = previousBehaviorName;
                previousInstance.resume();
                this.monitorBehaviorCompletion(previousInstance, previousBehaviorName);
            } else {
                console.warn(`BehaviorEngine: Previous behavior instance for '${previousBehaviorName}' not found. Starting idle.`);
                this.startBehavior('idle');
            }
        } else {
            console.log('BehaviorEngine: Behavior stack is empty. No previous behavior to resume. Starting idle.');
            this.startBehavior('idle');
        }
    }

    public stopCurrentBehavior(): void {
        if (!this.currentBehaviorName) {
            console.log('No active behavior to stop.');
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
