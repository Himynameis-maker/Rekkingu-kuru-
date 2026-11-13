/* ===== ゲームループ（固定タイムステップ） =====
 * ロジック(update)は常に 1/60 秒刻みで進め、描画(render)はブラウザのフレームごとに1回。
 * 端末が速くても遅くても、同じ入力列なら同じ結果になる（決定性）。
 *
 * createStepper(update): 時間(ms)を渡すと update を必要な回数だけ呼ぶ。DOM非依存でテストできる。
 * start(update, render): requestAnimationFrame に載せる。例外が出たらループを止める（エラー連発を防ぐ）。
 */
(function (w) {
  const RK = (w.RK = w.RK || {});
  const STEP_MS = 1000 / RK.CONFIG.TICK_HZ;
  const MAX_DT = 250;    // 1フレームで進める時間の上限(ms)。タブ復帰などで一気に進めない
  const MAX_STEPS = 5;   // 1フレームで回すtickの上限。超えた分は捨てる
  const SNAP = 1.2;      // vsyncのゆらぎ(ms)。STEP_MS にほぼ等しければ丸めて、1回おきに2tickになるのを防ぐ

  function createStepper(update) {
    let acc = 0;
    return {
      /** dtMs 経過したことを伝える。実行したtick数を返す */
      advance(dtMs) {
        let dt = Math.min(Math.max(dtMs, 0), MAX_DT);
        if (Math.abs(dt - STEP_MS) < SNAP) dt = STEP_MS;
        acc += dt;
        let n = 0;
        while (acc >= STEP_MS - 1e-9 && n < MAX_STEPS) { update(); acc -= STEP_MS; n++; }
        if (n === MAX_STEPS) acc = 0;
        return n;
      },
    };
  }

  function start(update, render) {
    const stepper = createStepper(update);
    let last = null;
    let stopped = false;
    function frame(t) {
      if (stopped) return;
      try {
        if (last === null) last = t;
        stepper.advance(t - last);
        last = t;
        render();
      } catch (e) { stopped = true; throw e; }
      w.requestAnimationFrame(frame);
    }
    w.document.addEventListener('visibilitychange', () => { last = null; });
    w.requestAnimationFrame(frame);
  }

  RK.Loop = Object.freeze({ STEP_MS, MAX_DT, MAX_STEPS, createStepper, start });
})(window);
