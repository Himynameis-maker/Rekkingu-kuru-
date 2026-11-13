/* ===== 全体定数 =====
 * 座標の単位は「論理ピクセル（1ドット）」の整数。
 * 1セル = 横16 x 縦32 ドット（縦2・横1）。
 */
(function (w) {
  const RK = (w.RK = w.RK || {});
  const CELL_W = 16;
  const CELL_H = 32;
  const COLS = 16;
  const ROWS = 7;

  RK.CONFIG = Object.freeze({
    CELL_W, CELL_H, COLS, ROWS,
    WIDTH: CELL_W * COLS,   // 256
    HEIGHT: CELL_H * ROWS,  // 224
    BG_COLOR: '#000000',
  });
})(window);
