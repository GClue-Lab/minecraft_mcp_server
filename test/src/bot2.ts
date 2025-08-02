import mineflayer, { Bot } from 'mineflayer';
import { pathfinder, Movements, goals } from 'mineflayer-pathfinder';

// --- サーバー接続情報 ---
const BOT_USERNAME: string = 'CollectorBot';
const SERVER_ADDRESS: string = 'docker.host.internal';
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

  // 'async'キーワードを削除し、.then()チェーンで処理を記述
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

    // findBlockから.then()で処理を繋げる
    bot.findBlock({
      matching: blockType.id,
      maxDistance: 64,
    })
    .then(block => {
      // 最初のPromise(findBlock)が成功したときの処理
      if (!block) {
        bot.chat('近くに指定されたブロックが見つかりませんでした。');
        // これ以上処理を続けない
        return; 
      }

      // 次の非同期処理(goto)のPromiseを返すことで、チェーンを繋げる
      return bot.pathfinder.goto(new goals.GoalNear(block.position.x, block.position.y, block.position.z, 1))
        .then(() => {
          // gotoが成功したら、次の非同期処理(dig)のPromiseを返す
          return bot.dig(block);
        });
    })
    .then(() => {
      // digが成功したら、最後の処理を実行
      bot.chat('採取が完了しました！');
    })
    .catch(err => {
      // チェーンのどこかでエラーが発生したら、ここで一括して捉える
      const error = err as Error;
      console.error(error);
      bot.chat(`エラーが発生しました: ${error.message}`);
    });
  });
});

bot.on('kicked', (reason: string) => console.log(reason));
bot.on('error', (err: Error) => console.error(err));
