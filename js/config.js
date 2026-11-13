/* ===== 全体定数 =====
 * 座標の単位は「論理ピクセル（1ドット）」の整数。
 * 1セル = 横16 x 縦24 ドット（横2 : 縦3）。
 * 縦横比を変えるときは CELL_H（と、必要なら ROWS）だけ直す。
 * 例: 縦をもっと細くしたければ CELL_H=28, ROWS=8 など。ステージデータの行数も合わせる。
 *
 * 【操作感の調整はここ】プレイヤーの移動は PLAYER_SPEED / PLAYER_TAP_DOTS / PLAYER_TAP_FRAMES の3つ。
 * 落ちる速さは PLAYER_FALL_SPEED。
 */
(function (w) {
  const RK = (w.RK = w.RK || {});
  const CELL_W = 16;
  const CELL_H = 24;
  const COLS = 16;
  const ROWS = 9;

  RK.CONFIG = Object.freeze({
    CELL_W, CELL_H, COLS, ROWS,
    WIDTH: CELL_W * COLS,   // 256
    HEIGHT: CELL_H * ROWS,  // 216
    BG_COLOR: '#000000',
    FLOOR_DRAW_H: 4,        // 床の見た目の厚み(ドット)。論理上の厚みは0。セル下端に描く

    // --- ゲームループ ---
    TICK_HZ: 60,            // ロジックは固定 60Hz。描画は別（ブラウザのフレームごと）

    // --- プレイヤー（ステップ3の暫定値。操作感を見て調整する） ---
    PLAYER_W: 12,           // 当たり幅(ドット)。偶数にする（中心xが整数のため）
    PLAYER_H: 24,           // 当たり高さ。= CELL_H（1セルに収める）
    PLAYER_SPEED: 1,        // 押し続けたときの速さ。1tickあたり進むドット数（整数）
    PLAYER_TAP_DOTS: 3,     // 「チョン押し」で進むドット数（押した瞬間に確定。途中で離しても最後まで進む）
    PLAYER_TAP_FRAMES: 6,   // チョンの動きにかけるtick数。この間押し続けていたら、その後は連続移動
                            // 推奨: PLAYER_TAP_DOTS <= PLAYER_TAP_FRAMES * PLAYER_SPEED（加速が滑らかになる）

    // --- 通常落下（ステップ4。暫定値） ---
    PLAYER_FALL_SPEED: 2,   // 通常落下の速さ。1tickあたり下へ進むドット数（整数・加速なし）。24ドット(1セル)を12tick

    // --- ハンマー（仮。ステップ7で攻撃判定ごと置き換える。いまは見た目の表示だけ） ---
    HAMMER_FRAMES: 12,      // ボタンを押してからハンマーを表示するtick数
  });
})(window);
