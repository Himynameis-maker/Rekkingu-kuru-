/* ===== 画面（キャンバスと整数倍拡大） =====
 * 内部は config.js の WIDTH x HEIGHT（256x216）の論理解像度。表示は端末ピクセルに対して整数倍にする。
 */
(function (w) {
  const RK = (w.RK = w.RK || {});
  const { WIDTH, HEIGHT } = RK.CONFIG;
  const MARGIN_Y = 64; // 下のステータスバー等の分

  const Screen = {
    canvas: null,
    ctx: null,
    scale: 1,

    init(canvas) {
      this.canvas = canvas;
      canvas.width = WIDTH;
      canvas.height = HEIGHT;
      this.ctx = canvas.getContext('2d');
      this.ctx.imageSmoothingEnabled = false;
      this.fit();
    },

    /** 端末ピクセル基準で整数倍に収める（CSSサイズは scale/dpr） */
    fit() {
      const dpr = w.devicePixelRatio || 1;
      const availW = w.innerWidth * dpr;
      const availH = (w.innerHeight - MARGIN_Y) * dpr;
      this.scale = Math.max(1, Math.floor(Math.min(availW / WIDTH, availH / HEIGHT)));
      this.canvas.style.width = (WIDTH * this.scale) / dpr + 'px';
      this.canvas.style.height = (HEIGHT * this.scale) / dpr + 'px';
    },
  };

  RK.Screen = Screen;
})(window);
