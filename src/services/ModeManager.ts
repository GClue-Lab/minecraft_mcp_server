// src/services/ModeManager.ts (新規作成)

/**
 * ボットの永続的な「モード」設定を管理するクラス。
 * TaskManagerが「次に何をすべきか」を判断する際に参照する。
 */
export class ModeManager {
    private combatMode: boolean = false;
    private followMode: boolean = false;
    private followTarget: string | null = null;

    public setCombatMode(enabled: boolean): void {
        this.combatMode = enabled;
        console.log(`[ModeManager] Combat mode set to: ${enabled}`);
    }

    public setFollowMode(enabled: boolean, target: string | null): void {
        this.followMode = enabled;
        this.followTarget = enabled ? target : null;
        console.log(`[ModeManager] Follow mode set to: ${enabled}, Target: ${this.followTarget}`);
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
        return {
            combatMode: this.combatMode,
            followMode: this.followMode,
            followTarget: this.followTarget,
        };
    }
}
