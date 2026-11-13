/* 起動スモークテスト: node tests/smoke.js
 * 偽の DOM（window / document / canvas / 各要素）の上で index.html の <script> を書かれた順に読み込み、
 * 起動できるか、キーボード・擬似スティック・ハンマーボタンの操作が反映されるかを確認する。
 * 本物のブラウザの代わりではない（見た目・実機のタッチ感は確認できない）。読み込み順やIDの食い違いを見つける用。 */
const vm = require('vm');
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');

// --- 偽 DOM ---
function noopCtx() {
  const store = {};
  return new Proxy(store, { get: (t, k) => (k in t ? t[k] : () => {}), set: (t, k, v) => { t[k] = v; return true; } });
}
function el(id, rect) {
  const h = {};
  return {
    id, style: {}, hidden: false, textContent: '', _h: h,
    classList: { _s: new Set(), add(c) { this._s.add(c); }, remove(c) { this._s.delete(c); } },
    addEventListener(t, f) { (h[t] = h[t] || []).push(f); },
    getBoundingClientRect: () => rect || { left: 0, top: 0, width: 0, height: 0 },
    setPointerCapture() {}, blur() {},
    getContext: () => noopCtx(),
  };
}
const stickRect = { left: 20, top: 500, width: 132, height: 132 }; // 中心 (86, 566)
const els = {};
['screen', 'status', 'errors', 'btn-grid', 'stick', 'stick-knob', 'btn-hammer'].forEach((id) => {
  els[id] = el(id, id === 'stick' ? stickRect : null);
});
els.errors.hidden = true;

const winH = {}, docH = {};
let rafCb = null;
const sandbox = {
  innerWidth: 390, innerHeight: 844, devicePixelRatio: 3,
  addEventListener(t, f) { (winH[t] = winH[t] || []).push(f); },
  requestAnimationFrame(cb) { rafCb = cb; return 1; },
  document: {
    getElementById: (id) => els[id] || null,
    addEventListener(t, f) { (docH[t] = docH[t] || []).push(f); },
  },
};
sandbox.window = sandbox;
vm.createContext(sandbox);

// --- index.html の <script src> を順番通りに読み込む ---
const srcs = [...html.matchAll(/<script src="([^"]+)"><\/script>/g)].map((m) => m[1]);
srcs.forEach((s) => {
  const file = path.join(root, s);
  if (!fs.existsSync(file)) throw new Error('index.html が参照するファイルがありません: ' + s);
  vm.runInContext(fs.readFileSync(file, 'utf8'), sandbox, { filename: s });
});
const RK = sandbox.RK;

let passed = 0, failed = 0;
function test(name, fn) {
  try { fn(); passed++; console.log('  ok   ' + name); }
  catch (e) { failed++; console.log('  FAIL ' + name + '\n         ' + e.message); }
}
function eq(a, b, what) { if (a !== b) throw new Error((what || 'value') + ': expected ' + b + ', got ' + a); }
function ok(c, what) { if (!c) throw new Error(what); }

const ev = (props) => Object.assign({ preventDefault() {}, pointerId: 1 }, props);
const fire = (h, type, props) => (h[type] || []).forEach((f) => f(ev(props)));
let now = 0;
function frames(n, dt) { for (let i = 0; i < n; i++) { now += dt || 16.7; const cb = rafCb; rafCb = null; cb(now); } }
const P = () => RK.game.player;

console.log('起動');
test('index.html の script が全部読めて起動する(RK.booted)', () => ok(RK.booted === true, 'booted でない'));
test('エラー表示が出ていない', () => eq(els.errors.hidden, true, 'errors.hidden'));
test('1フレーム回せる(描画で例外が出ない)', () => frames(3));
test('ステータスに座標が出る', () => ok(/x=24 y=216/.test(els.status.textContent), els.status.textContent));

console.log('キーボード');
test('→ 押しっぱなしで右へ進み、離すと止まる', () => {
  const x0 = P().x;
  fire(winH, 'keydown', { code: 'ArrowRight' }); frames(20);
  ok(P().x > x0 + 10, '進んでいない: ' + P().x);
  fire(winH, 'keyup', { code: 'ArrowRight' }); frames(3);
  const x1 = P().x; frames(20); eq(P().x, x1, '止まっていない');
});
test('キーリピート(同じkeydownの連続)で加速しない', () => {
  const x0 = P().x;
  for (let i = 0; i < 10; i++) { fire(winH, 'keydown', { code: 'ArrowLeft' }); frames(1); }
  fire(winH, 'keyup', { code: 'ArrowLeft' }); frames(5);
  ok(x0 - P().x <= 12, '進みすぎ: ' + (x0 - P().x));
});
test('スペースでハンマー表示', () => {
  fire(winH, 'keydown', { code: 'Space' }); frames(2); fire(winH, 'keyup', { code: 'Space' });
  ok(P().hammerFrames > 0, 'hammerFrames=' + P().hammerFrames);
  frames(20); eq(P().hammerFrames, 0, '消えていない');
});
test('フォーカスが外れたら押しっぱなしを解除', () => {
  const x0 = P().x;
  fire(winH, 'keydown', { code: 'ArrowRight' }); frames(2);
  fire(winH, 'blur', {}); frames(30);
  ok(P().x - x0 < 10, '止まっていない: ' + (P().x - x0));
  fire(winH, 'keyup', { code: 'ArrowRight' }); frames(2);
});

console.log('擬似スティック');
test('右に倒すと右へ進み、離すと止まる', () => {
  const x0 = P().x;
  fire(els.stick._h, 'pointerdown', { clientX: 86 + 50, clientY: 566 }); frames(20);
  ok(P().x > x0 + 10, '進んでいない'); eq(P().facing, 1, 'facing');
  ok(els.stick.classList._s.has('is-down'), 'is-down が付いていない');
  ok(/translate\(/.test(els['stick-knob'].style.transform), 'つまみが動いていない');
  fire(els.stick._h, 'pointerup', {}); frames(3);
  const x1 = P().x; frames(20); eq(P().x, x1, '止まっていない');
  eq(els['stick-knob'].style.transform, '', 'つまみが戻っていない');
});
test('左に倒すと左へ進む', () => {
  const x0 = P().x;
  fire(els.stick._h, 'pointerdown', { clientX: 86 - 50, clientY: 566 }); frames(20);
  ok(x0 - P().x > 10, '進んでいない'); eq(P().facing, -1, 'facing');
  fire(els.stick._h, 'pointerup', {}); frames(3);
});
test('不感帯の中(真ん中付近)では動かない', () => {
  const x0 = P().x;
  fire(els.stick._h, 'pointerdown', { clientX: 86 + 8, clientY: 566 }); frames(20);
  eq(P().x, x0, 'x'); fire(els.stick._h, 'pointerup', {}); frames(2);
});
test('上や下に倒しても左右には動かない', () => {
  const x0 = P().x;
  fire(els.stick._h, 'pointerdown', { clientX: 86 + 8, clientY: 566 - 50 }); frames(20);
  eq(P().x, x0, 'x(上)');
  fire(els.stick._h, 'pointermove', { clientX: 86 + 8, clientY: 566 + 50 }); frames(20);
  eq(P().x, x0, 'x(下)'); fire(els.stick._h, 'pointerup', {}); frames(2);
});
test('別の指(pointerId)の動きは無視', () => {
  const x0 = P().x;
  fire(els.stick._h, 'pointerdown', { pointerId: 7, clientX: 86 + 50, clientY: 566 });
  fire(els.stick._h, 'pointermove', { pointerId: 9, clientX: 86 - 50, clientY: 566 }); frames(20);
  ok(P().x > x0, '右に進むはず');
  fire(els.stick._h, 'pointerup', { pointerId: 7 }); frames(2);
});
test('斜めの境目でも軸がバタつかない(右 -> 少し下)', () => {
  const x0 = P().x;
  fire(els.stick._h, 'pointerdown', { clientX: 86 + 50, clientY: 566 });
  fire(els.stick._h, 'pointermove', { clientX: 86 + 50, clientY: 566 + 55 }); frames(20); // |oy| が |ox| を少し超える
  ok(P().x - x0 > 10, '右に進み続けるはず: ' + (P().x - x0));
  fire(els.stick._h, 'pointerup', {}); frames(2);
});

console.log('ハンマーボタン');
test('押している間は入力され、離すと戻る', () => {
  fire(els['btn-hammer']._h, 'pointerdown', {}); frames(2);
  ok(P().hammerFrames > 0, 'hammerFrames=' + P().hammerFrames);
  ok(els['btn-hammer'].classList._s.has('is-down'), 'is-down が付いていない');
  fire(els['btn-hammer']._h, 'pointerup', {}); frames(30);
  eq(P().hammerFrames, 0, '消えていない'); ok(!els['btn-hammer'].classList._s.has('is-down'), 'is-down が残っている');
});
test('スティックとハンマーを同時に(別の指で)操作できる', () => {
  const x0 = P().x;
  fire(els.stick._h, 'pointerdown', { pointerId: 1, clientX: 86 + 50, clientY: 566 });
  fire(els['btn-hammer']._h, 'pointerdown', { pointerId: 2 }); frames(3);
  ok(P().hammerFrames > 0, 'ハンマーが入らない'); frames(15); ok(P().x > x0 + 8, '歩けない');
  fire(els.stick._h, 'pointerup', { pointerId: 1 }); fire(els['btn-hammer']._h, 'pointerup', { pointerId: 2 }); frames(2);
});

console.log('描画');
test('グリッド切り替え(Gキー)で例外が出ない', () => {
  fire(winH, 'keydown', { key: 'g', code: 'KeyG' }); frames(2);
  eq(RK.Renderer.showGrid, true, 'showGrid'); fire(winH, 'keydown', { key: 'g', code: 'KeyG' }); eq(RK.Renderer.showGrid, false, 'showGrid(戻し)');
});

console.log('\n' + passed + ' passed, ' + failed + ' failed');
process.exit(failed ? 1 : 0);
