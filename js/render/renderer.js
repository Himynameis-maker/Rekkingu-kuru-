/* ===== ステージ・アクター描画 =====
 * 状態を読むだけで、ゲームルールは持たない。
 * 描画順: 物（奥の壁等） → アクター（プレイヤー・敵・ハンマー） → 床（足元4ドット帯） → グリッド線
 */
(function (w) {
  const RK = (w.RK = w.RK || {});
  const C = RK.CONFIG;

  function drawGrid(ctx, stage) {
    const cols = (stage && stage.cols) || C.COLS;
    const rows = (stage && stage.rows) || C.ROWS;
    const width = cols * C.CELL_W;
    const height = rows * C.CELL_H;
    ctx.fillStyle = 'rgba(255, 255, 255, 0.25)';
    for (let c = 1; c < cols; c++) ctx.fillRect(c * C.CELL_W, 0, 1, height);
    for (let r = 1; r < rows; r++) ctx.fillRect(0, r * C.CELL_H, width, 1);
  }

  function drawStage(ctx, stage, actors) {
    ctx.fillStyle = C.BG_COLOR;
    ctx.fillRect(0, 0, C.WIDTH, C.HEIGHT);

    // 1. 物レイヤー（壁・梯子・樽など）
    for (let r = 0; r < stage.rows; r++) {
      for (let c = 0; c < stage.cols; c++) {
        const id = stage.idAt(c, r);
        if (id && id !== 'empty') {
          RK.Sprites.draw(
            ctx,
            id,
            c * C.CELL_W,
            r * C.CELL_H,
            C.CELL_W,
            C.CELL_H,
            stage.hpAt(c, r),
            stage.maxHpAt(c, r)
          );
        }
      }
    }

    // 2. アクター（プレイヤー・敵・ハンマー）
    if (actors) {
      for (let i = 0; i < actors.length; i++) {
        RK.Sprites.drawActor(ctx, actors[i]);
      }
    }

    // 3. 床（セル下端の見た目帯）
    for (let r = 0; r < stage.rows; r++) {
      const y = (r + 1) * C.CELL_H - C.FLOOR_DRAW_H;
      for (let c = 0; c < stage.cols; c++) {
        if (stage.hasFloor(c, r)) {
          RK.Sprites.draw(ctx, 'floor', c * C.CELL_W, y, C.CELL_W, C.FLOOR_DRAW_H);
        }
      }
    }

    // 4. グリッド線（Gキーで切替）
    if (Renderer.showGrid) {
      drawGrid(ctx, stage);
    }
  }

  const Renderer = {
    showGrid: false,
    drawGrid,
    drawStage,
  };

  RK.Renderer = Renderer;
})(window);
