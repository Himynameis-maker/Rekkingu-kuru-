/* ===== 入力 =====
 * キーボードもタッチも、最終的に同じ「入力スナップショット」にまとめる。ゲーム側はどちらかを意識しない。
 *
 *   const input = RK.Input.create();
 *   input.set('key' | 'touch', 'left'|'right'|'up'|'down'|'hammer', true|false);  // デバイス側が呼ぶ
 *   const snap = input.poll();   // 1tickに1回、ロジック側が呼ぶ
 *
 * snap = {
 *   dx: -1|0|1, dy: -1|0|1,        // 左右 / 上下（上=-1, 下=+1。画面座標）。左右同時押しは 0
 *   dxPressed, dyPressed: bool,    // そのtickで「新しく押された」。チョン押し判定に使う
 *   hammer: bool, hammerPressed: bool
 * }
 *
 * ラッチ: tick間に「押して離した」だけの短い入力も、次のpollで必ず1回は「押された」として拾う。
 * ブラウザのイベントと60Hzのtickは非同期なので、これがないと短いチョン押しを取りこぼす。
 * このファイルは DOM に触らない（Node でテスト可能）。キーボードの接続は attachKeyboard。
 */
(function (w) {
  const RK = (w.RK = w.RK || {});
  const NAMES = ['left', 'right', 'up', 'down', 'hammer'];

  const KEYMAP = Object.freeze({
    ArrowLeft: 'left', KeyA: 'left',
    ArrowRight: 'right', KeyD: 'right',
    ArrowUp: 'up', KeyW: 'up',
    ArrowDown: 'down', KeyS: 'down',
    Space: 'hammer', KeyZ: 'hammer', KeyJ: 'hammer',
  });

  const zero = () => ({ left: false, right: false, up: false, down: false, hammer: false });

  function create() {
    const src = { key: zero(), touch: zero() };
    const latch = zero();
    let prevDx = 0;
    let prevDy = 0;

    const held = (n) => src.key[n] || src.touch[n];

    return {
      /** デバイス側から呼ぶ。同じ状態の再通知は無視。false->true のときだけラッチを立てる */
      set(source, name, down) {
        const s = src[source];
        if (!s || !(name in s)) return;
        down = !!down;
        if (s[name] === down) return;
        const before = held(name);
        s[name] = down;
        if (!before && held(name)) latch[name] = true;
      },

      releaseAll(source) {
        NAMES.forEach((n) => { src[source][n] = false; });
      },

      poll() {
        const on = (n) => held(n) || latch[n];
        const dx = (on('right') ? 1 : 0) - (on('left') ? 1 : 0);
        const dy = (on('down') ? 1 : 0) - (on('up') ? 1 : 0);
        const snap = {
          dx, dy,
          dxPressed: dx !== 0 && (dx !== prevDx || (dx > 0 ? latch.right : latch.left)),
          dyPressed: dy !== 0 && (dy !== prevDy || (dy > 0 ? latch.down : latch.up)),
          hammer: on('hammer'),
          hammerPressed: latch.hammer,
        };
        NAMES.forEach((n) => { latch[n] = false; });
        prevDx = dx;
        prevDy = dy;
        return snap;
      },
    };
  }

  /** キーボードを input に接続する。target は通常 window */
  function attachKeyboard(input, target) {
    const down = {}; // code -> bool
    function sync() {
      NAMES.forEach((n) => {
        const on = Object.keys(KEYMAP).some((code) => KEYMAP[code] === n && down[code]);
        input.set('key', n, on);
      });
    }
    target.addEventListener('keydown', (e) => {
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      const code = e.code || e.key;
      if (!(code in KEYMAP)) return;
      e.preventDefault(); // 矢印・スペースでページがスクロールしたり、ボタンが押されたりしないように
      if (down[code]) return; // キーリピートは無視
      down[code] = true;
      sync();
    });
    target.addEventListener('keyup', (e) => {
      const code = e.code || e.key;
      if (!(code in KEYMAP)) return;
      e.preventDefault();
      down[code] = false;
      sync();
    });
    // フォーカスが外れたとき押しっぱなしにならないように
    const reset = () => { Object.keys(down).forEach((k) => { down[k] = false; }); sync(); };
    target.addEventListener('blur', reset);
    if (target.document) target.document.addEventListener('visibilitychange', reset);
  }

  RK.Input = Object.freeze({ create, attachKeyboard, KEYMAP, NAMES });
})(window);
