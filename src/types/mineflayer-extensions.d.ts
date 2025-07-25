// src/types/mineflayer-extensions.d.ts (変更なし - 以前の修正で対応済みのはず)

import { EventEmitter } from 'events';

declare module 'mineflayer' {
    interface Bot {
        pathfinder: import('mineflayer-pathfinder').Pathfinder & EventEmitter;
    }
    // Mineflayer の Entity と Block もここで拡張する
    // ただし、これらは mineflayer の BotEvents から直接取得するのがより正確
    // interface Entity { /* 必要であれば追加 */ }
    // interface Block { /* 必要であれば追加 */ }
}

declare module 'mineflayer-pathfinder' {
    // Pathfinder 自体が EventEmitter を継承していることを明示
    interface Pathfinder extends EventEmitter {
        // 'getPath' の代わりに 'getPathTo' が存在し、その戻り値は ComputedPath
        getPathTo(
            movements: import('mineflayer-pathfinder').Movements, // movementsの型も指定
            goal: import('mineflayer-pathfinder').goals.Goal, // goalの型も指定
            timeout?: number
        ): Path; // ComputedPath が Pathfinder.Path と同じなら Path を使用
    }
    // Pathfinder の getPathTo メソッドの戻り値の型
    interface Path {
        // Path の具体的なプロパティ（例: result, movements）があればここに定義
        // mineflayer-pathfinder のソースコードやドキュメントで確認
        result: string; // 例えば 'success'
        movements: Array<any>; // 動きの配列
        // ... 他のプロパティ
    }
}
