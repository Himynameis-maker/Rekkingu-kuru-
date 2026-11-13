/* ===== 描画 =====
 * Stage を読んで描くだけ。状態は変更しない。
 * 順序: 物 -> アクター -> 床。床は厚み0の面だが、見えるように
 * セル下端の FLOOR_DRAW_H ドットに描く（見た目だけの厚み）。
 */
(function (w) {
  const RK = (w.RK = w.RK || {});
  const { CELL_W, CELL_H, WIDTH, HEIGHT, BG_COLOR, FLOOR_DRAW_H } = RK.CONFIG;

  const Renderer = {
    showGrid: false,

    /** actors を渡すと、動いているアクターを描く。省略時は stage.spawns の位置に仮の箱を描く（プレビュー/エディタ用） */
    drawStage(ctx, stage, actors) {
      ctx.fillStyle = BG_COLOR;
      ctx.fillRect(0, 0, WIDTH, HEIGHT);

      for (let r = 0; r < stage.rows; r++) {
        for (let c = 0; c < stage.cols; c++) {
          const id = stage.cells[r][c];
          if (id !== 'empty') RK.Sprites.draw(ctx, id, c * CELL_W, r * CELL_H, CELL_W, CELL_H);
        }
      }
      if (actors) {
        actors.forEach((a) => RK.Sprites.drawActor(ctx, a));
      } else {
        stage.spawns.forEach((s) => {
          RK.Sprites.draw(ctx, s.id, s.col * CELL_W, s.row * CELL_H, CELL_W, CELL_H);
        });
      }
      for (let r = 0; r < stage.rows; r++) {
        for (let c = 0; c < stage.cols; c++) {
          if (stage.hasFloor(c, r)) {
            RK.Sprites.draw(ctx, 'floor', c * CELL_W, stage.surfaceY(r) - FLOOR_DRAW_H, CELL_W, FLOOR_DRAW_H);
          }
        }
      }

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
