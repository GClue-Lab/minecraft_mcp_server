// 採取テストコード
// minecraft内でユーザからの会話(Tキー)で指示
// 採取 sand
// ポイント:
// bot.mcDataが使えない。
// サーバーのバージョン(bot.version)を元に、強制的にデータを読み込むことで解決する
//  const mcData = require('minecraft-data')(bot.version); 


const mineflayer = require('mineflayer');
const { pathfinder, Movements } = require('mineflayer-pathfinder');
const { GoalNear } = require('mineflayer-pathfinder').goals;

// --- サーバー接続情報 ---
const BOT_USERNAME = 'CollectorBot'; // ボットのユーザー名
const SERVER_ADDRESS = 'host.docker.internal';  // サーバーのIPアドレスまたはホスト名
const SERVER_PORT = 25565;           // サーバーのポート番号
// -----------------------

// ボットを作成
const bot = mineflayer.createBot({
  host: SERVER_ADDRESS,
  port: SERVER_PORT,
  username: BOT_USERNAME
});

// Pathfinderプラグインを読み込む
bot.loadPlugin(pathfinder);

// ボットがワールドにスポーンしたときの処理
bot.once('spawn', () => {
  console.log(`✨ ボット「${bot.username}」がワールドにスポーンしました。`);

  // ✨【最重要修正】bot.mcDataに頼らず、サーバーバージョンに合ったデータを手動で読み込む
  const mcData = require('minecraft-data')(bot.version);
  if (!mcData) {
    console.error("サーバーバージョンに対応するminecraft-dataの読み込みに失敗しました。");
    return;
  }

  // 手動で読み込んだmcDataを使って移動設定を初期化
  const defaultMove = new Movements(bot, mcData);
  bot.pathfinder.setMovements(defaultMove);

  // チャットメッセージを受信したときの処理
  bot.on('chat', async (username, message) => {
    if (username === bot.username) return;

    const args = message.split(' ');
    if (args[0] !== '採取') return;
    if (args.length < 2) {
      bot.chat('採取するブロックの名前を指定してください。例: 採取 stone');
      return;
    }

    const blockNameToCollect = args[1];

    // 手動で読み込んだmcDataを使ってブロック名チェック
    if (!mcData.blocksByName[blockNameToCollect]) {
      bot.chat(`「${blockNameToCollect}」というブロックは存在しません。`);
      return;
    }

    bot.chat(`${blockNameToCollect} を探しに行きます。`);

    try {
      // 手動で読み込んだmcDataを使ってブロック探索
      const block = bot.findBlock({
        matching: mcData.blocksByName[blockNameToCollect].id,
        maxDistance: 64,
      });

      if (!block) {
        bot.chat('近くに指定されたブロックが見つかりませんでした。');
        return;
      }

      await bot.pathfinder.goto(new GoalNear(block.position.x, block.position.y, block.position.z, 1));
      await bot.dig(block);
      bot.chat('採取が完了しました！');

    } catch (err) {
      console.error(err);
      bot.chat(`エラーが発生しました: ${err.message}`);
    }
  });
});

// エラー処理
bot.on('kicked', console.log);
bot.on('error', console.log);
