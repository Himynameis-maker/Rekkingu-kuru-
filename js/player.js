/* ===== プレイヤー =====
 * 座標は「中心x」と「足y」（整数ドット）。足y は足場面と同じ座標系（足場面の真上に立つとき y = surfaceY(row)）。
 *   体の矩形: 左 = x - w/2, 上 = y - h, 右 = x + w/2, 下 = y
 *   いるセル: col = stage.colAt(x), row = stage.rowAtFeet(y)
 *
 * ステップ3の範囲: 左右移動と、ハンマーボタンの受け付け（見た目だけ）。
 * まだ無いもの: 床判定・落下(4)、梯子(5)、画面端ループ(6)、攻撃判定(7)、壁などとの横の衝突。
 * 描画はこのファイルに無い（sprites.js）。ここは状態を更新するだけ。
 *
 * 移動のしかた（config.js の3つの値で調整）:
 *  - 押した瞬間 = 「チョン」開始。PLAYER_TAP_FRAMES tick かけて PLAYER_TAP_DOTS ドット進む。
 *    チョンの途中で離しても最後まで進む（短いタップでも毎回同じ距離）。
 *  - チョンの時間を過ぎても押し続けていたら、その後は 1tick に PLAYER_SPEED ドットで連続移動。
 *  - チョンの途中で逆方向を押したら、新しい向きのチョンを最初からやり直す。
 */
(function (w) {
  const RK = (w.RK = w.RK || {});
  const C = RK.CONFIG;

  function create(stage, spawn) {
    return {
      id: 'player',                       // sprites.js の登録名
      x: stage.centerX(spawn.col),
      y: stage.surfaceY(spawn.row),
      w: C.PLAYER_W,
      h: C.PLAYER_H,
      facing: 1,                          // 向き。-1=左 / 1=右（ハンマーは向いている方向に振る）
      mode: 'ground',                     // 将来: 'ladder' / 'fall' / 'abnormal_fall'（通常落下と異常落下は別状態）
      stepDir: 0,                         // チョン移動の向き
      stepTick: C.PLAYER_TAP_FRAMES,      // チョン開始からの経過tick。PLAYER_TAP_FRAMES 以上なら「チョンではない」
      hammerFrames: 0,                    // 仮: ハンマー表示の残りtick（0なら非表示）
    };
  }

  /** 横に d ドット動かす。いまは画面内に収めるだけ（左右ループはステップ6で置き換える） */
  function moveX(p, d) {
    const half = p.w / 2;
    p.x = Math.min(Math.max(p.x + d, half), C.WIDTH - half);
  }

  /** 1tick 進める。input は RK.Input の poll() の結果 */
  function update(p, input, stage) {
    // --- 左右移動 ---
    if (input.dxPressed) {
      p.stepDir = input.dx;
      p.stepTick = 0;
      p.facing = input.dx;
    }

    let move = 0;
    if (p.stepTick < C.PLAYER_TAP_FRAMES) {
      // チョン: TAP_DOTS ドットを TAP_FRAMES tick に均等に割り振る（整数のみ・浮動小数なし）
      const t = p.stepTick;
      const dots = Math.floor(((t + 1) * C.PLAYER_TAP_DOTS) / C.PLAYER_TAP_FRAMES)
                 - Math.floor((t * C.PLAYER_TAP_DOTS) / C.PLAYER_TAP_FRAMES);
      move = p.stepDir * dots;
      p.stepTick++;
    } else if (input.dx !== 0) {
      // 押し続け: 連続移動
      p.facing = input.dx;
      move = input.dx * C.PLAYER_SPEED;
    }
    if (move !== 0) moveX(p, move);

    // --- ハンマー（仮。押した瞬間に表示開始。長押しでは繰り返さない） ---
    if (p.hammerFrames > 0) p.hammerFrames--;
    if (input.hammerPressed) p.hammerFrames = C.HAMMER_FRAMES;
  }

  RK.Player = Object.freeze({ create, update, moveX });
})(window);
