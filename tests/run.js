/* ヘッドレステスト: node tests/run.js
 * DOM を使わない部分（config / stage / input / loop / physics / player / game）を Node の vm に読み込んで確認する。
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
  'js/core/input.js', 'js/core/loop.js', 'js/physics/terrain.js', 'js/entities/player.js', 'js/core/game.js',
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

/** テスト用ステージ。rows = { 行番号: 16文字 }（無い行は全部 '.'）。floor / objects の2レイヤー */
function mkStage(floor, objects) {
  const blank = '.'.repeat(16);
  const layer = (m) => { const a = []; for (let r = 0; r < C.ROWS; r++) a.push(m[r] || blank); return a; };
  return { name: 'test', floor: layer(floor), objects: layer(objects) };
}
const FULL = '='.repeat(16);
// 平らな地面だけ。P は (col1,row8) = x24,y216
const FLAT = mkStage({ 8: FULL }, { 8: '.P..............' });

/** テスト用ハーネス。1tick = 入力イベントを流して poll して Game.update */
function setup(stageData) {
  const game = RK.Game.create(stageData || RK.StageData.stage01);
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
  eq(t.p.x - x0, 4 * C.PLAYER_TAP_DOTS, '移動量');
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
  const t = setup(FLAT);
  t.press('left'); t.tick(400);
  eq(t.p.x, C.PLAYER_W / 2, '左端');
  t.release('left'); t.press('right'); t.tick(1000);
  eq(t.p.x, C.WIDTH - C.PLAYER_W / 2, '右端');
});
test('足場の上を歩いても y（足）は動かない', () => {
  const t = setup(FLAT); t.press('right'); t.tick(50); eq(t.p.y, 216, 'y');
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

console.log('地形: 足場（床・樽）');
// 床 row6 に穴(col5..8 = x80..143)。下の row8 は全面の床。P は (col1,row6) = x24,y168
const HOLE = mkStage({ 6: '=====....=======', 8: FULL }, { 6: '.P..............' });
// 樽 (col4,row8) = x64..79、上面 y=192。row7 の P はその上に立つ = x72,y192
const BARREL_TOP = mkStage({ 8: FULL }, { 7: '....P...........', 8: '....O...........' });
// 樽の真上(row6)に出現（足場なし）→ 落ちて樽の上で止まる
const BARREL_DROP = mkStage({ 8: FULL }, { 6: '....P...........', 8: '....O...........' });

test('stage01 のスポーン位置は足場の上', () => {
  const t = setup(); eq(RK.Physics.isSupported(t.game.stage, t.p.x, t.p.y, t.p.w), true, 'supported');
});
test('1ドットでも乗っていれば立てる（床の右端）', () => {
  const s = setup(HOLE).game.stage;
  eq(RK.Physics.isSupported(s, 85, 168, 12), true, 'x=85 左端が床の最後の1ドット(79)');
  eq(RK.Physics.isSupported(s, 86, 168, 12), false, 'x=86 全部穴の上');
});
test('1ドットでも乗っていれば立てる（穴の反対側＝床の左端）', () => {
  const s = setup(HOLE).game.stage;
  eq(RK.Physics.isSupported(s, 139, 168, 12), true, 'x=139 右端が床の最初の1ドット(144)');
  eq(RK.Physics.isSupported(s, 138, 168, 12), false, 'x=138');
});
test('足場面の高さでなければ立っていない', () => {
  const s = setup(HOLE).game.stage;
  eq(RK.Physics.isSupported(s, 24, 170, 12), false, 'y=170');
});
test('樽の上面は足場。1ドットでも乗っていれば立てる', () => {
  const s = setup(BARREL_TOP).game.stage;
  eq(RK.Physics.isSupported(s, 72, 192, 12), true, '真上');
  eq(RK.Physics.isSupported(s, 85, 192, 12), true, '右端1ドット');
  eq(RK.Physics.isSupported(s, 86, 192, 12), false, '右へ外れた');
  eq(RK.Physics.isSupported(s, 59, 192, 12), true, '左端1ドット');
  eq(RK.Physics.isSupported(s, 58, 192, 12), false, '左へ外れた');
});
test('画面下端は足場として扱う（暫定）', () => {
  const s = setup(mkStage({}, { 8: '.P..............' })).game.stage; // 床なし
  eq(RK.Physics.isSupported(s, 24, C.HEIGHT, 12), true, 'y=HEIGHT');
});

console.log('Player: 通常落下');
test('床の端から外れたら落ちる。全部が穴の上に出る x=86 で落下開始', () => {
  const t = setup(HOLE);
  t.press('right');
  let n = 0; while (t.p.mode !== 'fall' && n++ < 200) t.tick();
  eq(t.p.mode, 'fall', 'mode'); eq(t.p.x, 86, 'x'); eq(t.p.y, 168, 'y（まだ落ちていない）');
});
test('落下は 1tick = FALL_SPEED ドット。床(y=216)まで 24 tick で止まり、通常移動に戻る', () => {
  const t = setup(HOLE);
  t.press('right');
  let n = 0; while (t.p.mode !== 'fall' && n++ < 200) t.tick();
  t.tick(1); eq(t.p.y, 168 + C.PLAYER_FALL_SPEED, '1tick後');
  let k = 1; while (t.p.mode === 'fall' && k++ < 200) t.tick();
  eq(k, (216 - 168) / C.PLAYER_FALL_SPEED, '落下tick数'); eq(t.p.y, 216, 'y'); eq(t.p.mode, 'ground', 'mode');
});
test('落下中は左右入力を無視する（暫定）。着地後は押し続けで歩き出す', () => {
  const t = setup(HOLE);
  t.press('right');
  let n = 0; while (t.p.mode !== 'fall' && n++ < 200) t.tick();
  const x0 = t.p.x;
  while (t.p.mode === 'fall') { t.tick(); if (t.p.mode === 'fall') eq(t.p.x, x0, '落下中のx'); }
  eq(t.p.x, x0, '着地時のx');
  t.tick(5); eq(t.p.x, x0 + 5 * C.PLAYER_SPEED, '着地後の移動');
});
test('途中の足場の無い高さは素通りし、床で止まる（row7 に床なし）', () => {
  const s = setup(HOLE).game.stage;
  const r = RK.Physics.fallTo(s, 110, 12, 168, 1000);
  eq(r.landed, true, 'landed'); eq(r.y, 216, 'y');
});
test('足場の無いスポーン位置なら最初のtickから落ちる', () => {
  const t = setup(BARREL_DROP);
  t.tick(); eq(t.p.mode, 'fall', 'mode'); eq(t.p.y, 168 + C.PLAYER_FALL_SPEED, 'y');
});
test('樽の上で止まる（床まで落ちない）', () => {
  const t = setup(BARREL_DROP);
  t.tick(11); eq(t.p.mode, 'fall', '11tick後'); eq(t.p.y, 190, 'y');
  t.tick(1); eq(t.p.mode, 'ground', '12tick後'); eq(t.p.y, 192, 'y');
  t.tick(30); eq(t.p.y, 192, '立ち続ける');
});
test('速く落ちても樽を通り抜けない', () => {
  const s = setup(BARREL_DROP).game.stage;
  const r = RK.Physics.fallTo(s, 72, 12, 168, 100);
  eq(r.landed, true, 'landed'); eq(r.y, 192, 'y');
});
test('樽の上を歩いて端から外れると落ちる（右 x=86 / 左 x=58）', () => {
  const a = setup(BARREL_TOP);
  eq(a.p.x, 72, 'x0'); eq(a.p.y, 192, 'y0');
  a.tick(10); eq(a.p.mode, 'ground', '立っている'); eq(a.p.y, 192, 'y');
  a.press('right'); let n = 0; while (a.p.mode !== 'fall' && n++ < 200) a.tick();
  eq(a.p.x, 86, '右へ外れたx');
  const b = setup(BARREL_TOP);
  b.press('left'); n = 0; while (b.p.mode !== 'fall' && n++ < 200) b.tick();
  eq(b.p.x, 58, '左へ外れたx');
  b.release('left'); b.tick(30); eq(b.p.y, 216, '床に着地'); eq(b.p.mode, 'ground', 'mode');
});
test('チョンの途中で落ち始めても、着地後に残りのチョンは続かない', () => {
  const t = setup(HOLE);
  t.p.x = 85;                                  // あと1ドットで落ちる位置
  t.press('right'); t.tick(1); t.release('right');   // チョン開始（3ドットのうち最初の1tickで0〜1ドット）
  t.tick(40);
  const x = t.p.x; t.tick(20); eq(t.p.x, x, '着地後に動き続けない');
  eq(t.p.mode, 'ground', 'mode'); eq(t.p.y, 216, 'y');
});

console.log('Player: 樽にぶつかる（横）');
const SIDE_L = mkStage({ 8: FULL }, { 8: '.P..O...........' });   // 樽 x64..79。P は樽の左 x24
const SIDE_R = mkStage({ 8: FULL }, { 8: '....O..P........' });   // P は樽の右 x120
test('左から押し続けると樽の手前(x=58)で止まる', () => {
  const t = setup(SIDE_L); t.press('right'); t.tick(200); eq(t.p.x, 58, 'x'); eq(t.p.y, 216, 'y');
});
test('右から押し続けると樽の手前(x=86)で止まる', () => {
  const t = setup(SIDE_R); t.press('left'); t.tick(300); eq(t.p.x, 86, 'x');
});
test('樽の手前でチョンしても動かない / 手前の1ドット手前なら1ドットだけ進む', () => {
  const t = setup(SIDE_L); t.press('right'); t.tick(200); t.release('right'); t.tick(2);
  t.press('right'); t.tick(1); t.release('right'); t.tick(20); eq(t.p.x, 58, '壁ぎわ');
  t.p.x = 57; t.press('right'); t.tick(1); t.release('right'); t.tick(20); eq(t.p.x, 58, '1ドットだけ');
});
test('樽の手前では止まるが、反対向きには歩ける', () => {
  const t = setup(SIDE_L); t.press('right'); t.tick(200); t.release('right'); t.tick(2);
  t.press('left'); t.tick(20); eq(t.p.x < 58, true, 'x=' + t.p.x);
});
test('壁 W は横に通れる（樽だけが横のぶつかり。他は後で決める）', () => {
  const t = setup(mkStage({ 8: FULL }, { 8: '.P..W...........' }));
  t.press('right'); t.tick(100); eq(t.p.x > 80, true, 'x=' + t.p.x);
});
test('頭より上の樽(row7)の下は通れる', () => {
  const t = setup(mkStage({ 8: FULL }, { 7: '....O...........', 8: '.P..............' }));
  t.press('right'); t.tick(100); eq(t.p.x > 80, true, 'x=' + t.p.x);
});
test('樽に重なって出現しても、樽の外側へは抜けられる', () => {
  // 出現位置を樽の中に置くステージは作れない（P が樽と同じセルに書けない）ので、後から樽の中へ置く
  const g = setup(mkStage({ 8: FULL }, { 8: '.P..O...........' }));
  g.p.x = 72;                                  // 樽(64..79)の真ん中
  g.press('left'); g.tick(30); eq(g.p.x < 72, true, '左へ抜ける x=' + g.p.x);
  const h = setup(mkStage({ 8: FULL }, { 8: '.P..O...........' }));
  h.p.x = 72; h.press('right'); h.tick(30); eq(h.p.x > 72, true, '右へ抜ける x=' + h.p.x);
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
