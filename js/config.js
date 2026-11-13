/* ===== 全体定数 =====
 * 座標の単位は「論理ピクセル（1ドット）」の整数。
 * 1セル = 横16 x 縦24 ドット（横2 : 縦3）。
 * 縦横比を変えるときは CELL_H（と、必要なら ROWS）だけ直す。
 * 例: 縦をもっと細くしたければ CELL_H=28, ROWS=8 など。ステージデータの行数も合わせる。
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
  });
})(window);
