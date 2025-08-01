// src/types/mineflayer-extensions.d.ts (新規作成)

import { Pathfinder } from 'mineflayer-pathfinder';

// mineflayerのBotクラスの型定義を拡張し、
// pathfinderプラグインの型を追加します。
// これにより、'@ts-ignore'を使わずに安全にコードを書けるようになります。
declare module 'mineflayer' {
  interface Bot {
    pathfinder: Pathfinder;
  }
}
