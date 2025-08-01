// src/services/ModeManager.ts (修正後)

import { ChatReporter } from './ChatReporter';

/**
 * ボットの永続的な「モード」設定を管理するクラス。
 */
export class ModeManager {
    private combatMode: boolean = false;
    private followMode: boolean = false;
    private followTarget: string | null = null;
    // ★ここから修正: miningModeのプロパティを追加
    private miningMode: boolean = false; 
    private chatReporter: ChatReporter;

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

    // ★ここから修正: miningModeを制御するメソッドを追加
    public setMiningMode(enabled: boolean): void {
        this.miningMode = enabled;
        this.chatReporter.reportModeChange('Mining', enabled);
    }

    public isCombatMode(): boolean {
        return this.combatMode;
    }

    public isFollowMode(): boolean {
        return this.followMode;
    }

    // ★ここから修正: miningModeの状態を返すメソッドを追加
    public isMiningMode(): boolean {
        return this.miningMode;
    }

    public getFollowTarget(): string | null {
        return this.followTarget;
    }

    /**
     * 現在のモード設定をオブジェクトで返す
     */
    public getStatus() {
        // ★ここを修正: 返り値にminingModeを追加
        return {
            combatMode: this.combatMode,
            followMode: this.followMode,
            followTarget: this.followTarget,
            miningMode: this.miningMode,
        };
    }
}
