/* ===== 起動 =====
 * 部品をつなぐだけ。ルールや描画の中身は持たない。
 * 流れ: 入力デバイス -> RK.Input -> (1tickごとに poll) -> RK.Game.update -> (毎フレーム) RK.Renderer
 */
(function (w) {
  const RK = w.RK;
  const canvas = document.getElementById('screen');
  const statusEl = document.getElementById('status');
  const errorsEl = document.getElementById('errors');
  const btnGrid = document.getElementById('btn-grid');

  RK.Screen.init(canvas);

  const game = RK.Game.create(RK.StageData.stage01);
  const stage = game.stage;

  if (stage.errors.length) {
    errorsEl.hidden = false;
    errorsEl.textContent = stage.errors.join('\n');
  }

  // 入力: キーボード + 擬似スティック/ハンマーボタン（どちらも同じ RK.Input に入る）
  const input = RK.Input.create();
  RK.Input.attachKeyboard(input, w);
  RK.Touch.attach(input, {
    stick: document.getElementById('stick'),
    knob: document.getElementById('stick-knob'),
    hammer: document.getElementById('btn-hammer'),
  });

  function update() { RK.Game.update(game, input.poll()); }

  let lastStatus = '';
  function render() {
    RK.Renderer.drawStage(RK.Screen.ctx, stage, game.actors);
    const p = game.player;
    let text = `${stage.name}  ${stage.cols}x${stage.rows}セル  x${RK.Screen.scale}`;
    if (p) text += `   P x=${p.x} y=${p.y} (col ${stage.colAt(p.x)}, row ${stage.rowAtFeet(p.y)}) ${p.facing > 0 ? '→' : '←'}`;
    if (text !== lastStatus) { statusEl.textContent = text; lastStatus = text; }
  }

  function toggleGrid() { RK.Renderer.showGrid = !RK.Renderer.showGrid; }

  btnGrid.addEventListener('click', () => { toggleGrid(); btnGrid.blur(); });
  w.addEventListener('keydown', (e) => { if (e.key === 'g' || e.key === 'G') toggleGrid(); });
  w.addEventListener('resize', () => RK.Screen.fit());

  RK.game = game;   // デバッグ用（コンソールから RK.game.player などを確認できる）
  RK.stage = stage;
  RK.input = input;
  RK.Loop.start(update, render);
  RK.booted = true;
})(window);
