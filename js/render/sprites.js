/* ===== スプライト登録所 =====
 * symbol id → 描画関数 (ctx, x, y, w, h)。
 * いまは色付きの仮図形。ドット絵に差し替えるときは register で上書きするだけ。
 * 描画は内部状態を読むだけで、ルールは持たない。
 */
(function (w) {
  const RK = (w.RK = w.RK || {});
  const drawers = {};

  function register(id, fn) { drawers[id] = fn; }

  function draw(ctx, id, x, y, cw, ch) {
    const fn = drawers[id];
    if (fn) fn(ctx, x, y, cw, ch);
  }


  function label(ch, fg) {
    return (ctx, x, y, cw, chh, bg) => {
      ctx.fillStyle = bg; ctx.fillRect(x + 1, y + 1, cw - 2, chh - 2);
      ctx.fillStyle = fg; ctx.font = '8px monospace'; ctx.textBaseline = 'top';
      ctx.fillText(ch, x + 5, y + 2);
    };
  }

  // 地形・オブジェクト（仮）
  // 床: 厚み0の面を見えるようにした細い帯（高さ = FLOOR_DRAW_H）
  register('floor', (ctx, x, y, cw, ch) => {
    ctx.fillStyle = '#b8541c'; ctx.fillRect(x, y, cw, ch);
    ctx.fillStyle = '#f0a060'; ctx.fillRect(x, y, cw, 1);
    ctx.fillStyle = '#6c2c08'; ctx.fillRect(x, y + ch - 1, cw, 1);
  });
  ['wall_a', 'wall_b', 'wall_c'].forEach((id, i) => {
    const c = ['#7c7c7c', '#4c78c8', '#58a858'][i];
    register(id, (ctx, x, y, cw, ch) => {
      ctx.fillStyle = c; ctx.fillRect(x + 1, y + 1, cw - 2, ch - 2);
      ctx.fillStyle = '#00000055';
      for (let yy = 8; yy < ch; yy += 8) ctx.fillRect(x + 1, y + yy, cw - 2, 1);
    });
  });
  const ladder = (rail) => (ctx, x, y, cw, ch) => {
    ctx.fillStyle = rail;
    ctx.fillRect(x + 2, y, 2, ch); ctx.fillRect(x + cw - 4, y, 2, ch);
    for (let yy = 4; yy < ch; yy += 8) ctx.fillRect(x + 4, y + yy, cw - 8, 2);
  };
  register('ladder', ladder('#fcbc3c'));
  register('ladder_solid', ladder('#fcfcfc'));
  register('barrel', (ctx, x, y, cw, ch) => {
    ctx.fillStyle = '#a05828'; ctx.fillRect(x + 1, y + ch / 2, cw - 2, ch / 2);
    ctx.fillStyle = '#e8a860'; ctx.fillRect(x + 1, y + ch / 2, cw - 2, 2);
    ctx.fillStyle = '#4c2808'; ctx.fillRect(x + 1, y + ch / 2 + 8, cw - 2, 2);
  });
  register('pillar', (ctx, x, y, cw, ch) => {
    ctx.fillStyle = '#bcbcbc'; ctx.fillRect(x + 5, y, cw - 10, ch);
    ctx.fillStyle = '#585858'; ctx.fillRect(x + cw - 7, y, 2, ch);
  });
  register('bomb', (ctx, x, y, cw, ch) => {
    ctx.fillStyle = '#202020'; ctx.fillRect(x + 2, y + ch - 14, cw - 4, 12);
    ctx.fillStyle = '#fc7460'; ctx.fillRect(x + cw / 2 - 1, y + ch - 18, 2, 4);
  });
  register('door', (ctx, x, y, cw, ch) => {
    ctx.fillStyle = '#6844fc'; ctx.fillRect(x + 1, y + 2, cw - 2, ch - 2);
    ctx.fillStyle = '#fcfc00'; ctx.fillRect(x + cw - 5, y + ch / 2, 2, 2);
  });

  // アクター（仮の 1x2 の箱 + 識別文字）
  const actor = (bg, fg, ch) => (ctx, x, y, cw, chh) => label(ch, fg)(ctx, x, y, cw, chh, bg);
  register('player',      actor('#fc7460', '#000', 'P'));
  register('chaser',      actor('#d82800', '#fff', '1'));
  register('runner',      actor('#00a800', '#fff', '2'));
  register('foreman',     actor('#0058f8', '#fff', '3'));
  register('fast_chaser', actor('#f8b800', '#000', '4'));

  RK.Sprites = { register, draw, drawers };
})(window);
