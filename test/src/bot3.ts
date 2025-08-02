import mineflayer, { Bot } from 'mineflayer';
import { pathfinder, Movements, goals } from 'mineflayer-pathfinder';
import { Block } from 'prismarine-block';
import { Entity } from 'prismarine-entity';

// --- 設定値 ---
const BOT_USERNAME: string = 'GuardBot';
const SERVER_ADDRESS: string = 'localhost';
const SERVER_PORT: number = 25565;

const ZOMBIE_AGGRO_RANGE = 10; // ゾンビを敵と認識する距離
const ATTACK_RANGE = 4;        // 攻撃を開始する距離
// --------------

// ボットの状態を定義
type BotState = 'IDLE' | 'FIGHTING' | 'MOVING_TO_BLOCK' | 'DIGGING';
let botState: BotState = 'IDLE';

let targetBlock: Block | null = null;
let targetEnemy: Entity | null = null;

const bot: Bot = mineflayer.createBot({
  host: SERVER_ADDRESS,
  port: SERVER_PORT,
  username: BOT_USERNAME,
});

bot.loadPlugin(pathfinder);

bot.once('spawn', () => {
  console.log(`🛡️ ガードボット「${bot.username}」が任務を開始しました。`);
  const defaultMove = new Movements(bot);
  bot.pathfinder.setMovements(defaultMove);

  // --- 1. 指示を受け取る「耳」 ---
  bot.on('chat', (username: string, message: string) => {
    if (username === bot.username) return;

    const args = message.split(' ');
    if (args[0] !== '採取') return;

    if (botState !== 'IDLE') {
      bot.chat('現在、別の任務を遂行中です。');
      return;
    }

    const blockName = args[1];
    const foundBlock = bot.findBlock({
      matching: bot.registry.blocksByName[blockName]?.id,
      maxDistance: 64,
    });

    if (!foundBlock) {
      bot.chat(`周囲に「${blockName}」が見つかりません。`);
      return;
    }

    bot.chat(`「${blockName}」の採取任務を受理しました。移動を開始します。`);
    targetBlock = foundBlock;
    botState = 'MOVING_TO_BLOCK'; // 状態を「移動中」へ
    bot.pathfinder.setGoal(new goals.GoalNear(targetBlock.position.x, targetBlock.position.y, targetBlock.position.z, 1));
  });

  // --- 2. 状況を判断し行動する「脳」 ---
  setInterval(() => {
    // 【最優先事項】常に周囲の脅威を確認
    const nearestZombie = bot.nearestEntity(e => e.name === 'zombie' && e.position.distanceTo(bot.entity.position) < ZOMBIE_AGGRO_RANGE);

    if (nearestZombie) {
      if (botState !== 'FIGHTING') {
        console.log('敵性存在を検知！全ての任務を中断し、戦闘態勢に移行します。');
        bot.stopDigging(); // 採掘中なら中断
        bot.pathfinder.stop(); // 移動中なら中断
      }
      botState = 'FIGHTING';
      targetEnemy = nearestZombie;
    } else if (botState === 'FIGHTING') {
      // ゾンビがいなくなり、戦闘状態だった場合は待機状態に戻る
      console.log('脅威は排除されました。待機状態に戻ります。');
      botState = 'IDLE';
      targetEnemy = null;
    }

    // 現在の状態に応じた行動を実行
    switch (botState) {
      case 'IDLE':
        // 何もせず、指示を待つ
        break;

      case 'FIGHTING':
        if (!targetEnemy) { // 安全策
          botState = 'IDLE';
          return;
        }
        const distance = bot.entity.position.distanceTo(targetEnemy.position);
        bot.lookAt(targetEnemy.position.offset(0, targetEnemy.height, 0));

        if (distance > ATTACK_RANGE) {
          // 攻撃範囲外なら近づく
          bot.pathfinder.setGoal(new goals.GoalFollow(targetEnemy, ATTACK_RANGE - 1));
        } else {
          // 攻撃範囲内なら移動を止めて攻撃
          bot.pathfinder.stop();
          bot.attack(targetEnemy);
        }
        break;
      
      case 'MOVING_TO_BLOCK':
        if (targetBlock && !bot.pathfinder.isMoving()) {
          // 移動が完了したら採掘を開始
          botState = 'DIGGING';
          console.log('採掘地点に到着。採掘を開始します。');
          bot.dig(targetBlock)
            .then(() => {
              console.log('採掘完了！');
              bot.chat('任務完了。待機状態に戻ります。');
              botState = 'IDLE';
            })
            .catch(err => {
              if (botState !== 'FIGHTING') { // 戦闘で中断された場合以外
                console.log('採掘に失敗しました:', err.message);
                botState = 'IDLE';
              }
            });
        }
        break;

      case 'DIGGING':
        // 採掘中は、ループ冒頭の脅威検知のみに集中。新たな行動は起こさない。
        break;
    }
  }, 200);
});

bot.on('kicked', console.log);
bot.on('error', console.error);
