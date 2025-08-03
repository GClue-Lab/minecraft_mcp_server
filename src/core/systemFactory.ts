// src/core/systemFactory.ts (安全版)
// - BotManager 側で pathfinder 注入 & spawn 時 Movements 設定後に
//   `pathfinder-ready` を emit する前提。
// - 初回は各 Manager/Engine を生成し、Planner を "一度だけ" 起動。
// - 再接続（end→connect）で新しい bot が来たら BehaviorEngine 等に差し替え。

import * as mineflayer from 'mineflayer';
import { BotManager } from '../services/BotManager';
import { CommandHandler } from '../services/CommandHandler';
import { WorldKnowledge } from '../services/WorldKnowledge';
import { BehaviorEngine } from '../services/BehaviorEngine';
import { TaskManager } from '../services/TaskManager';
import { ModeManager } from '../services/ModeManager';
import { StatusManager } from '../services/StatusManager';
import { ChatReporter } from '../services/ChatReporter';
import { Planner } from '../services/Planner';

export function setupBotSystem(botManager: BotManager): CommandHandler {
  const chatReporter = new ChatReporter(botManager);
  const commandHandler = new CommandHandler(botManager, null, null, null, null, chatReporter);

  // 生成済みオブジェクトをここに捕捉（初回以降も使い回す）
  let worldKnowledge: WorldKnowledge | null = null;
  let modeManager: ModeManager | null = null;
  let taskManager: TaskManager | null = null;
  let behaviorEngine: BehaviorEngine | null = null;
  let statusManager: StatusManager | null = null;
  let planner: Planner | null = null;

  let plannerStarted = false; // Planner は 1 回だけ start する

  // 初回・再接続の両方で呼ばれる
  botManager.getBotInstanceEventEmitter().on('pathfinder-ready', (bot: mineflayer.Bot) => {
    // 1) 初回: 依存を生成
    if (!commandHandler.isReady()) {
      worldKnowledge = new WorldKnowledge(bot);
      modeManager = new ModeManager(chatReporter);
      taskManager = new TaskManager(chatReporter);
      behaviorEngine = new BehaviorEngine(bot, worldKnowledge, botManager, chatReporter, taskManager);
      statusManager = new StatusManager(bot, worldKnowledge, taskManager, modeManager, behaviorEngine);
      planner = new Planner(behaviorEngine, taskManager, modeManager, worldKnowledge, statusManager, chatReporter);

      // CommandHandler へ依存を注入
      commandHandler.setDependencies(taskManager, modeManager, statusManager, behaviorEngine);

      // Planner は 1 回だけ開始（以後は自然に再稼働する）
      if (!plannerStarted && planner) {
        planner.start();
        plannerStarted = true;
      }
      return;
    }

    // 2) 再接続: bot を各サービスに差し替え
    if (behaviorEngine) behaviorEngine.setBotInstance(bot);
    // WorldKnowledge / StatusManager に bot 差し替え用の API があれば呼ぶ
    // 例: (worldKnowledge as any)?.setBot?.(bot);
    // 例: (statusManager as any)?.setBot?.(bot);

    // ChatReporter は BotManager のイベントで自動的に最新 bot を受け取る設計なら何もしない
  });

  // 参考: death→respawn は同一インスタンス。必要ならここで軽い同期を取る
  botManager.getBotInstanceEventEmitter().on('respawn', () => {
    // 同一 bot なので通常は何も不要。必要なら状態を整える処理を追加。
  });

  return commandHandler;
}
