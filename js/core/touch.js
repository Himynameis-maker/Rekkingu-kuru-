/* ===== タッチ/マウス入力（擬似スティック + ハンマーボタン） =====
 * Pointer Events を使うので、スマホのタッチもPCのマウスも同じコードで動く。
 * スティックは「4方向」。斜めは出さない（軸が決まるまでの最初の傾きが大きい方、その後は少し粘る）。
 * 出力は RK.Input の 'touch' ソースに left/right/up/down/hammer として流すだけ。ルールは持たない。
 */
(function (w) {
  const RK = (w.RK = w.RK || {});
  const DEAD = 0.3;   // スティック半径に対する不感帯の割合
  const STICKY = 1.25; // 軸を切り替えるとき、反対軸がこの倍率を超えるまで元の軸を維持する

  function attachStick(input, base, knob) {
    let pid = null;
    let axis = null; // 'h' | 'v' | null

    function setDirs(l, r, u, d) {
      input.set('touch', 'left', l);
      input.set('touch', 'right', r);
      input.set('touch', 'up', u);
      input.set('touch', 'down', d);
    }

    function update(ev) {
      const rect = base.getBoundingClientRect();
      const R = rect.width / 2;
      const ox = ev.clientX - (rect.left + R);
      const oy = ev.clientY - (rect.top + rect.height / 2);
      const len = Math.hypot(ox, oy);
      const k = len > R ? R / len : 1;
      knob.style.transform = 'translate(' + ox * k + 'px,' + oy * k + 'px)';

      if (len <= R * DEAD) { axis = null; setDirs(false, false, false, false); return; }

      const ax = Math.abs(ox);
      const ay = Math.abs(oy);
      if (axis === null) axis = ax >= ay ? 'h' : 'v';
      else if (axis === 'h' && ay > ax * STICKY) axis = 'v';
      else if (axis === 'v' && ax > ay * STICKY) axis = 'h';

      if (axis === 'h') setDirs(ox < 0, ox > 0, false, false);
      else setDirs(false, false, oy < 0, oy > 0);
    }

    function release() {
      pid = null; axis = null;
      knob.style.transform = '';
      setDirs(false, false, false, false);
      base.classList.remove('is-down');
    }

    base.addEventListener('pointerdown', (ev) => {
      if (pid !== null) return;
      pid = ev.pointerId;
      base.setPointerCapture(pid);
      base.classList.add('is-down');
      update(ev);
      ev.preventDefault();
    });
    base.addEventListener('pointermove', (ev) => { if (ev.pointerId === pid) update(ev); });
    ['pointerup', 'pointercancel', 'lostpointercapture'].forEach((t) => {
      base.addEventListener(t, (ev) => { if (ev.pointerId === pid) release(); });
    });
    base.addEventListener('contextmenu', (ev) => ev.preventDefault());
  }

  function attachButton(input, el, name) {
    let pid = null;
    function release() { pid = null; input.set('touch', name, false); el.classList.remove('is-down'); }
    el.addEventListener('pointerdown', (ev) => {
      if (pid !== null) return;
      pid = ev.pointerId;
      el.setPointerCapture(pid);
      el.classList.add('is-down');
      input.set('touch', name, true);
      ev.preventDefault();
    });
    ['pointerup', 'pointercancel', 'lostpointercapture'].forEach((t) => {
      el.addEventListener(t, (ev) => { if (ev.pointerId === pid) release(); });
    });
    el.addEventListener('contextmenu', (ev) => ev.preventDefault());
  }

  /** els = { stick, knob, hammer }（DOM要素） */
  function attach(input, els) {
    attachStick(input, els.stick, els.knob);
    attachButton(input, els.hammer, 'hammer');
  }

  RK.Touch = Object.freeze({ attach });
})(window);
