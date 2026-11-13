/* ヘッドレステスト: node tests/run.js
 * DOM を使わない部分（config / stage / input / loop / player / game）を Node の vm に読み込んで確認する。
 * 新しいステップを作るたびに、そのルールのテストをここに足していく。 */
const vm = require('vm');
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const sandbox = {};
sandbox.window = sandbox;
vm.createContext(sandbox);
[
  'js/config.js', 'js/stage/symbols.js', 'js/stage/stage.js', 'js/data/stages/stage01.js',
  'js/core/input.js', 'js/core/loop.js', 'js/entities/player.js', 'js/core/game.js',
].forEach((f) => vm.runInContext(fs.readFileSync(path.join(root, f), 'utf8'), sandbox, { filename: f }));
const RK = sandbox.RK;
const C = RK.CONFIG;

let passed = 0;
let failed = 0;
function test(name, fn) {
  try { fn(); passed++; console.log('  ok   ' + name); }
  catch (e) { failed++; console.log('  FAIL ' + name + '\n         ' + e.message); }
}
function eq(actual, expected, what) {
  if (actual !== expected) throw new Error((what || 'value') + ': expected ' + expected + ', got ' + actual);
}

/** テスト用ハーネス。1tick = 入力イベントを流して poll して Game.update */
function setup() {
  const game = RK.Game.create(RK.StageData.stage01);
  const input = RK.Input.create();
  return {
    game, input, p: game.player,
    tick(n) { for (let i = 0; i < (n || 1); i++) RK.Game.update(game, input.poll()); },
    press(name) { input.set('key', name, true); },
    release(name) { input.set('key', name, false); },
  };
}

console.log('Stage');
test('stage01 にエラーがない', () => eq(RK.Game.create(RK.StageData.stage01).stage.errors.length, 0, 'errors'));
test('toData() の往復が一致', () => {
  const d = RK.StageData.stage01;
  const back = RK.Stage.parse(d.name, d).toData();
  eq(JSON.stringify(back.floor), JSON.stringify(d.floor), 'floor');
  eq(JSON.stringify(back.objects), JSON.stringify(d.objects), 'objects');
});
test('colAt / rowAtFeet / centerX / surfaceY', () => {
  const s = setup().game.stage;
  eq(s.centerX(1), 24, 'centerX(1)');
  eq(s.colAt(24), 1, 'colAt(24)');
  eq(s.colAt(15), 0, 'colAt(15)');
  eq(s.colAt(16), 1, 'colAt(16)');
  eq(s.surfaceY(8), 216, 'surfaceY(8)');
  eq(s.rowAtFeet(216), 8, 'rowAtFeet(216)');
  eq(s.rowAtFeet(193), 8, 'rowAtFeet(193)');
  eq(s.rowAtFeet(192), 7, 'rowAtFeet(192)');
});

console.log('Player: 出現');
test('P のスポーン位置の中心・足場面に立つ', () => {
  const t = setup();
  eq(t.p.x, 24, 'x'); eq(t.p.y, 216, 'y');
  eq(t.game.stage.colAt(t.p.x), 1, 'col'); eq(t.game.stage.rowAtFeet(t.p.y), 8, 'row');
});

console.log('Player: 左右移動');
test('チョン押し(1tickだけ押して離す) = TAP_DOTS ドット', () => {
  const t = setup(); const x0 = t.p.x;
  t.press('right'); t.tick(); t.release('right'); t.tick(20);
  eq(t.p.x - x0, C.PLAYER_TAP_DOTS, '移動量');
});
test('tick の間に押して離しただけでも拾う(ラッチ)', () => {
  const t = setup(); const x0 = t.p.x;
  t.press('right'); t.release('right'); t.tick(20);
  eq(t.p.x - x0, C.PLAYER_TAP_DOTS, '移動量');
});
test('チョンの途中で離しても最後まで進む / 左も同じ', () => {
  const t = setup(); const x0 = t.p.x;
  t.press('left'); t.tick(2); t.release('left'); t.tick(20);
  eq(x0 - t.p.x, C.PLAYER_TAP_DOTS, '移動量');
  eq(t.p.facing, -1, 'facing');
});
test('押し続け: TAP_FRAMES で TAP_DOTS、その後は 1tick = SPEED', () => {
  const t = setup(); const x0 = t.p.x; const N = 20;
  t.press('right'); t.tick(N);
  eq(t.p.x - x0, C.PLAYER_TAP_DOTS + (N - C.PLAYER_TAP_FRAMES) * C.PLAYER_SPEED, '移動量');
});
test('離せば止まる', () => {
  const t = setup();
  t.press('right'); t.tick(20); t.release('right'); t.tick(1);
  const x = t.p.x; t.tick(30);
  eq(t.p.x, x, 'x');
});
test('チョンを連打すると、押した回数 x TAP_DOTS', () => {
  const t = setup(); const x0 = t.p.x;
  for (let i = 0; i < 4; i++) { t.press('right'); t.tick(1); t.release('right'); t.tick(C.PLAYER_TAP_FRAMES); }
  eq(t.p.x - x0, 4 * C.PLAYER_TAP_DOTS, '��動量');
});
test('チョン中に逆方向を押すと、新しい向きでやり直す', () => {
  const t = setup(); const x0 = t.p.x;
  t.press('right'); t.tick(2); t.release('right');
  t.press('left'); t.tick(1); t.release('left'); t.tick(20);
  // 右へ2tick分 + 左へ TAP_DOTS
  const right = Math.floor((2 * C.PLAYER_TAP_DOTS) / C.PLAYER_TAP_FRAMES);
  eq(t.p.x - x0, right - C.PLAYER_TAP_DOTS, '移動量');
  eq(t.p.facing, -1, 'facing');
});
test('左右同時押しは動かない', () => {
  const t = setup(); const x0 = t.p.x;
  t.press('left'); t.press('right'); t.tick(30);
  eq(t.p.x, x0, 'x');
});
test('矢印キーと WASD のどちらでも同じ(KEYMAP)', () => {
  eq(RK.Input.KEYMAP.ArrowLeft, 'left'); eq(RK.Input.KEYMAP.KeyD, 'right');
  eq(RK.Input.KEYMAP.Space, 'hammer'); eq(RK.Input.KEYMAP.KeyZ, 'hammer');
});
test('タッチ入力もキーボードと同じ結果になる', () => {
  const a = setup(); const b = setup();
  a.press('right'); a.tick(15);
  b.input.set('touch', 'right', true); b.tick(15);
  eq(a.p.x, b.p.x, 'x');
});
test('画面端で止まる（ループはステップ6）', () => {
  const t = setup();
  t.press('left'); t.tick(400);
  eq(t.p.x, C.PLAYER_W / 2, '左端');
  t.release('left'); t.press('right'); t.tick(1000);
  eq(t.p.x, C.WIDTH - C.PLAYER_W / 2, '右端');
});
test('y（足）は動かない', () => {
  const t = setup(); t.press('right'); t.tick(50); eq(t.p.y, 216, 'y');
});

console.log('Player: ハンマー（仮）');
test('押した瞬間に表示開始し、HAMMER_FRAMES で消える', () => {
  const t = setup();
  t.press('hammer'); t.tick(); eq(t.p.hammerFrames, C.HAMMER_FRAMES, '開始');
  t.tick(); eq(t.p.hammerFrames, C.HAMMER_FRAMES - 1, '1tick後');
  t.release('hammer'); t.tick(C.HAMMER_FRAMES); eq(t.p.hammerFrames, 0, '終了');
});
test('押しっぱなしでは繰り返さない / 離して押し直すと再開', () => {
  const t = setup();
  t.press('hammer'); t.tick(C.HAMMER_FRAMES + 5); eq(t.p.hammerFrames, 0, '長押し');
  t.release('hammer'); t.tick(); t.press('hammer'); t.tick(); eq(t.p.hammerFrames, C.HAMMER_FRAMES, '再押下');
});
test('ハンマーを振っても位置は変わらない', () => {
  const t = setup(); const x0 = t.p.x; t.press('hammer'); t.tick(30); eq(t.p.x, x0, 'x');
});

console.log('決定性・ループ');
test('同じ入力列なら同じ結果', () => {
  function run() {
    const t = setup();
    const script = [['right', 1], [null, 5], ['left', 9], [null, 3], ['right', 30], ['hammer', 2], [null, 10]];
    script.forEach(([name, n]) => {
      if (name) t.press(name);
      t.tick(n);
      if (name) t.release(name);
    });
    return JSON.stringify(t.p);
  }
  eq(run(), run(), 'state');
});
test('Stepper: 16.67ms x 3 = 3tick', () => {
  let n = 0; const s = RK.Loop.createStepper(() => n++);
  for (let i = 0; i < 3; i++) s.advance(16.7);
  eq(n, 3, 'tick数');
});
test('Stepper: 少しゆらいでも 1フレーム1tick（vsyncのゆらぎ）', () => {
  let n = 0; const s = RK.Loop.createStepper(() => n++);
  [16.0, 17.3, 16.2, 17.1, 16.6, 16.9, 16.4, 16.8].forEach((d) => s.advance(d));
  eq(n, 8, 'tick数');
});
test('Stepper: 大きく遅れても上限で打ち切る', () => {
  let n = 0; const s = RK.Loop.createStepper(() => n++);
  const ran = s.advance(5000);
  eq(ran, RK.Loop.MAX_STEPS, '1フレームの上限');
});
test('Stepper: 120Hz 表示(8.33ms)でも 60tick/秒', () => {
  let n = 0; const s = RK.Loop.createStepper(() => n++);
  for (let i = 0; i < 120; i++) s.advance(1000 / 120);
  eq(n, 60, 'tick数');
});

console.log('\n' + passed + ' passed, ' + failed + ' failed');
process.exit(failed ? 1 : 0);
