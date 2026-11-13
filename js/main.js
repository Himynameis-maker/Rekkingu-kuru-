/* ===== 起動 ===== */
(function (w) {
  const RK = w.RK;
  const canvas = document.getElementById('screen');
  const statusEl = document.getElementById('status');
  const errorsEl = document.getElementById('errors');
  const btnGrid = document.getElementById('btn-grid');

  RK.Screen.init(canvas);

  const data = RK.StageData.stage01;
  const stage = RK.Stage.parse(data.name, data);

  if (stage.errors.length) {
    errorsEl.hidden = false;
    errorsEl.textContent = stage.errors.join('\n');
  }

  function render() {
    RK.Renderer.drawStage(RK.Screen.ctx, stage);
    statusEl.textContent = `${stage.name}  ${stage.cols}x${stage.rows}セル  x${RK.Screen.scale}`;
  }

  function toggleGrid() { RK.Renderer.showGrid = !RK.Renderer.showGrid; render(); }

  btnGrid.addEventListener('click', toggleGrid);
  w.addEventListener('keydown', (e) => { if (e.key === 'g' || e.key === 'G') toggleGrid(); });
  w.addEventListener('resize', () => { RK.Screen.fit(); render(); });

  RK.stage = stage; // デバッグ用（コンソールから確認できる）
  render();
  RK.booted = true;
})(window);
