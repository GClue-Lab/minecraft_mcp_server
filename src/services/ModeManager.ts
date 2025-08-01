// src/services/ModeManager.ts (診断ログ付き)

import { ChatReporter } from './ChatReporter';

/**
 * ボットの永続的な「モード」設定を管理するクラス。
 */
export class ModeManager {
    private combatMode: boolean = false;
    private followMode: boolean = false;
    private followTarget: string | null = null;
    private chatReporter: ChatReporter;

    constructor(chatReporter: ChatReporter) {
        this.chatReporter = chatReporter;
    }

    public setCombatMode(enabled: boolean): void {
        // console.errorはSTDIO_MODEでも表示されるため、デバッグに利用
        console.error(`[DIAGNOSTIC] ModeManager.setCombatMode called. Before: ${this.combatMode}, After: ${enabled}`);
        this.combatMode = enabled;
        this.chatReporter.reportModeChange('Combat', enabled);
    }

    public setFollowMode(enabled: boolean, target: string | null): void {
        console.error(`[DIAGNOSTIC] ModeManager.setFollowMode called. Before: ${this.followMode}, After: ${enabled}`);
        this.followMode = enabled;
        this.followTarget = enabled ? target : null;
        this.chatReporter.reportModeChange('Follow', enabled, this.followTarget);
    }

    public isCombatMode(): boolean {
        return this.combatMode;
    }

    public isFollowMode(): boolean {
        return this.followMode;
    }

    public getFollowTarget(): string | null {
        return this.followTarget;
    }

    /**
     * 現在のモード設定をオブジェクトで返す
     */
    public getStatus() {
        console.error(`[DIAGNOSTIC] ModeManager.getStatus called. Returning followMode: ${this.followMode}`);
        return {
            combatMode: this.combatMode,
            followMode: this.followMode,
            followTarget: this.followTarget,
        };
    }
}
