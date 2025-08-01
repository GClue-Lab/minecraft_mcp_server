// src/services/ModeManager.ts (ChatReporter連携版)

import { ChatReporter } from './ChatReporter';

export class ModeManager {
    private combatMode: boolean = false;
    private followMode: boolean = false;
    private followTarget: string | null = null;
    private chatReporter: ChatReporter; // ChatReporterへの参照を持つ

    constructor(chatReporter: ChatReporter) {
        this.chatReporter = chatReporter;
    }

    public setCombatMode(enabled: boolean): void {
        this.combatMode = enabled;
        this.chatReporter.reportModeChange('Combat', enabled);
    }

    public setFollowMode(enabled: boolean, target: string | null): void {
        this.followMode = enabled;
        this.followTarget = enabled ? target : null;
        this.chatReporter.reportModeChange('Follow', enabled, this.followTarget);
    }

    // (以降のメソッドは変更なし)
    public isCombatMode(): boolean { return this.combatMode; }
    public isFollowMode(): boolean { return this.followMode; }
    public getFollowTarget(): string | null { return this.followTarget; }
    public getStatus() {
        return {
            combatMode: this.combatMode,
            followMode: this.followMode,
            followTarget: this.followTarget,
        };
    }
}
