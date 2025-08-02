import mineflayer, { Bot } from 'mineflayer';
// 修正①: pathfinderとgoalsをまとめてインポート
import { pathfinder, Movements, goals } from 'mineflayer-pathfinder'; 
// 修正②: 不要な 'path' のインポートを削除

// --- サーバー接続情報 ---
const BOT_USERNAME: string = 'CollectorBot';
const SERVER_ADDRESS: string = 'host.docker.internal';
const SERVER_PORT: number = 25565;
// -----------------------

const bot: Bot = mineflayer.createBot({
  host: SERVER_ADDRESS,
  port: SERVER_PORT,
  username: BOT_USERNAME
});

bot.loadPlugin(pathfinder);

bot.once('spawn', () => {
  console.log(`✨ ボット「${bot.username}」がワールドにスポーンしました。`);

  // 修正③: Movementsのコンストラクタは引数を1つだけ取る
  const defaultMove = new Movements(bot); 
  bot.pathfinder.setMovements(defaultMove);

  bot.on('chat', async (username: string, message: string) => {
    if (username === bot.username) return;

    const args: string[] = message.split(' ');
    if (args[0] !== '採取') return;
    if (args.length < 2) {
      bot.chat('採取するブロックの名前を指定してください。例: 採取 stone');
      return;
    }

    const blockNameToCollect: string = args[1];

    const blockType = bot.registry.blocksByName[blockNameToCollect];
    if (!blockType) {
      bot.chat(`「${blockNameToCollect}」というブロックは存在しません。`);
      return;
    }

    bot.chat(`${blockNameToCollect} を探しに行きます。`);

    try {
      const block = await bot.findBlock({
        matching: blockType.id,
        maxDistance: 64,
      });

      if (!block) {
        bot.chat('近くに指定されたブロックが見つかりませんでした。');
        return;
      }
      
      // 修正①: goalsオブジェクト経由でGoalNearを呼び出す
      await bot.pathfinder.goto(new goals.GoalNear(block.position.x, block.position.y, block.position.z, 1)); 
      await bot.dig(block);
      bot.chat('採取が完了しました！');

    } catch (err) {
      const error = err as Error;
      console.error(error);
      bot.chat(`エラーが発生しました: ${error.message}`);
    }
  });
});

bot.on('kicked', (reason: string) => console.log(reason));
bot.on('error', (err: Error) => console.error(err));
