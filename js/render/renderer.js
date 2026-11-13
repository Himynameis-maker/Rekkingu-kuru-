/* ===== 描画 =====
 * Stage を読んで描くだけ。状態は変更しない。
 */
(function (w) {
  const RK = (w.RK = w.RK || {});
  const { CELL_W, CELL_H, WIDTH, HEIGHT, BG_COLOR } = RK.CONFIG;

  const Renderer = {
    showGrid: false,

    drawStage(ctx, stage) {
      ctx.fillStyle = BG_COLOR;
      ctx.fillRect(0, 0, WIDTH, HEIGHT);

      for (let r = 0; r < stage.rows; r++) {
        for (let c = 0; c < stage.cols; c++) {
          const id = stage.cells[r][c];
          if (id !== 'empty') RK.Sprites.draw(ctx, id, c * CELL_W, r * CELL_H, CELL_W, CELL_H);
        }
      }
      stage.spawns.forEach((s) => {
        RK.Sprites.draw(ctx, s.id, s.col * CELL_W, s.row * CELL_H, CELL_W, CELL_H);
      });

      if (this.showGrid) this.drawGrid(ctx, stage);
    },

    /** 1x2 セルの枠。1ドット幅の線 */
    drawGrid(ctx, stage) {
      ctx.fillStyle = 'rgba(255,255,255,0.22)';
      for (let c = 0; c <= stage.cols; c++) ctx.fillRect(Math.min(c * CELL_W, WIDTH - 1), 0, 1, HEIGHT);
      for (let r = 0; r <= stage.rows; r++) ctx.fillRect(0, Math.min(r * CELL_H, HEIGHT - 1), WIDTH, 1);
    },
  };

  RK.Renderer = Renderer;
})(window);
