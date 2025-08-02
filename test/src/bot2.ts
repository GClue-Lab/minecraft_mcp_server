import mineflayer, { Bot } from 'mineflayer';
import { pathfinder, Movements, goals } from 'mineflayer-pathfinder';
import { Block } from 'prismarine-block'; // Blockの型をインポート

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

  const defaultMove = new Movements(bot);
  bot.pathfinder.setMovements(defaultMove);

  bot.on('chat', (username: string, message: string) => {
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

    // --- ここからが大きな修正点 ---

    // 1. findBlockは同期関数のため、直接呼び出して結果を受け取る
    const block: Block | null = bot.findBlock({
      matching: blockType.id,
      maxDistance: 64,
    });

    // 2. 結果をチェックする
    if (!block) {
      bot.chat('近くに指定されたブロックが見つかりませんでした。');
      return;
    }

    // 3. 最初の非同期関数である `goto` からPromiseチェーンを開始する
    bot.pathfinder.goto(new goals.GoalNear(block.position.x, block.position.y, block.position.z, 1))
      .then(() => {
        // gotoが成功したら、次の非同期処理(dig)のPromiseを返す
        return bot.dig(block);
      })
      .then(() => {
        // digが成功したら、最後の処理を実行
        bot.chat('採取が完了しました！');
      })
      .catch((err: Error) => { // 型を明記
        // gotoまたはdigでエラーが発生した場合
        console.error(err);
        bot.chat(`エラーが発生しました: ${err.message}`);
      });
  });
});

bot.on('kicked', (reason: string) => console.log(reason));
bot.on('error', (err: Error) => console.error(err));
