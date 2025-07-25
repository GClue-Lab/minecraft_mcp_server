// src/services/BehaviorEngine.ts v1.2

import * as mineflayer from 'mineflayer';
import { WorldKnowledge, WorldEntity } from './WorldKnowledge';
import { FollowPlayerBehavior, FollowPlayerOptions } from '../behaviors/followPlayer';
import { MineBlockBehavior, MineBlockOptions } from '../behaviors/mineBlock';
import { CombatBehavior, CombatOptions } from '../behaviors/combat';
import { Vec3 } from 'vec3';
import { BotManager } from './BotManager';

// 行動の種類と優先順位を定義
export type BehaviorName = 'combat' | 'followPlayer' | 'mineBlock' | 'idle';

const BEHAVIOR_PRIORITIES: { [key in BehaviorName]: number } = {
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

export interface CurrentBehavior {
    name: BehaviorName;
    target?: string | number | Vec3 | null;
    isActive: boolean;
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

    constructor(bot: mineflayer.Bot, worldKnowledge: WorldKnowledge, botManager: BotManager) {
        this.bot = bot;
        this.worldKnowledge = worldKnowledge;
        this.botManager = botManager;
        console.log('BehaviorEngine initialized.');
        this.setupBotEvents(botManager);
        this.startInterruptMonitor(); // ここで呼び出し
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
            if (botHealth && botHealth < 20) {
                this.tryInterruptForCombat(true); // 引数を渡す
            }
        });
    }

    // 新規追加: 割り込み監視のインターバルを開始するメソッド
    private startInterruptMonitor(): void {
        if (this.interruptMonitorInterval) {
            clearInterval(this.interruptMonitorInterval);
        }
        this.interruptMonitorInterval = setInterval(() => {
            if (this.combatModeEnabled) {
                this.tryInterruptForCombat(false); // 引数を渡す
            }
        }, this.MONITOR_INTERVAL_MS);
    }

    // 新規追加: 警戒モードを設定するメソッド
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

    // tryInterruptForCombat メソッドの引数を修正
    private tryInterruptForCombat(forceInterrupt: boolean): void { // 引数を受け取る
        const botEntity = this.worldKnowledge.getBotEntity();
        if (!botEntity) return;

        const nearbyHostileMob = this.worldKnowledge.getAllEntities().find(e =>
            e.type === 'mob' &&
            e.isAlive &&
            (e.name === 'zombie' || e.name === 'skeleton' || e.name === 'spider' || e.name === 'creeper' || e.name === 'enderman') &&
            botEntity.position.distanceTo(e.position) <= (forceInterrupt ? 32 : 16)
        );

        if (nearbyHostileMob) {
            const combatPriority = BEHAVIOR_PRIORITIES.combat;
            const currentPriority = this.currentBehaviorName ? BEHAVIOR_PRIORITIES[this.currentBehaviorName] : BEHAVIOR_PRIORITIES.idle;

            if (currentPriority > combatPriority || (forceInterrupt && this.currentBehaviorName !== 'combat')) {
                 this.startBehavior('combat', { 
                    targetMobName: nearbyHostileMob.name,
                    stopAfterKill: true
                });
            } else if (this.currentBehaviorName === 'combat' && this.activeBehaviorInstances.combat?.isRunning()) {
                const combatInstance = this.activeBehaviorInstances.combat as CombatBehavior;
                if (!combatInstance.isRunning() || combatInstance.getOptions().targetMobName !== nearbyHostileMob.name) {
                    this.startBehavior('combat', { 
                        targetMobName: nearbyHostileMob.name,
                        stopAfterKill: true
                    });
                }
            }
        }
    }

    public getCurrentBehavior(): CurrentBehavior | null {
        if (this.currentBehaviorName && this.activeBehaviorInstances[this.currentBehaviorName]?.isRunning()) {
            const instance = this.activeBehaviorInstances[this.currentBehaviorName];
            
            if (instance === undefined) { 
                return null; 
            }

            let targetInfo: string | number | Vec3 | null | undefined;

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
        } else if (newBehaviorPriority > currentBehaviorPriority) {
            console.warn(`BehaviorEngine: Cannot start '${behaviorName}' (priority ${newBehaviorPriority}) because current behavior '${this.currentBehaviorName}' (priority ${currentBehaviorPriority}) has higher/equal priority.`);
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
                this.worldKnowledge.stopPathfinding();
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
        this.worldKnowledge.stopPathfinding();
    }
}
