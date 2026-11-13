/* ===== プレイヤー =====
 * 座標は「中心x」と「足y」（整数ドット）。足y は足場面と同じ座標系（足場面の真上に立つとき y = surfaceY(row)）。
 *   体の矩形: 左 = x - w/2, 上 = y - h, 右 = x + w/2, 下 = y
 *   いるセル: col = stage.colAt(x), row = stage.rowAtFeet(y)
 *
 * ステップ4の範囲: 左右移動（樽には横から通れない）、床・樽の上に立つ、足場が無くなったら通常落下。
 * まだ無いもの: 梯子(5)、画面端ループ(6)、攻撃判定(7)、異常落下(8)、樽以外との横の衝突。
 * 描画はこのファイルに無い（sprites.js）。足場・衝突の判定は physics/terrain.js。ここは状態を更新するだけ。
 *
 * mode（通常落下と異常落下は別状態にする。いまは 'ground' と 'fall' だけ）:
 *  - 'ground': 足場の上。左右に動ける。毎tick、足場に乗っているかを確認し、乗っていなければ 'fall' へ。
 *  - 'fall'  : 通常落下。1tick に PLAYER_FALL_SPEED ドット下へ。足場（床か樽の上）で止まり 'ground' に戻る。
 *              落下中は左右入力を無視する（暫定。context.md §9 / §11）。ハンマーの表示は受け付ける（仮）。
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
      mode: 'ground',                     // 'ground' / 'fall'（通常落下）。将来: 'ladder' / 'abnormal_fall'
      stepDir: 0,                         // チョン移動の向き
      stepTick: C.PLAYER_TAP_FRAMES,      // チョン開始からの経過tick。PLAYER_TAP_FRAMES 以上なら「チョンではない」
      hammerFrames: 0,                    // 仮: ハンマー表示の残りtick（0なら非表示）
    };
  }

  /**
   * 横に d ドット動かす（1ドットずつ確かめる）。画面内に収め（左右ループはステップ6で置き換える）、
   * stage があれば樽に横からぶつかったところで止める。stage を省くと衝突は見ない。
   */
  function moveX(p, d, stage) {
    const half = p.w / 2;
    const dir = d > 0 ? 1 : -1;
    for (let i = 0, n = Math.abs(d); i < n; i++) {
      const nx = p.x + dir;
      if (nx < half || nx > C.WIDTH - half) break;
      if (stage && RK.Physics.blockedX(stage, nx, p.y, p.w, p.h, dir)) break;
      p.x = nx;
    }
  }

  /** 通常落下を始める。チョンの途中だったら捨てる（着地後に残さない） */
  function startFall(p) {
    p.mode = 'fall';
    p.stepDir = 0;
    p.stepTick = C.PLAYER_TAP_FRAMES;
  }

  /** 通常落下の1tick。足場に当たったらそこで止まって 'ground' に戻る */
  function updateFall(p, stage) {
    const r = RK.Physics.fallTo(stage, p.x, p.w, p.y, C.PLAYER_FALL_SPEED);
    p.y = r.y;
    if (r.landed) p.mode = 'ground';
  }

  /** 足場の上での1tick（左右移動）。動いた結果、足場から外れたら落下を始める（落ち始めの y 移動は次のtick） */
  function updateGround(p, input, stage) {
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
    if (move !== 0) moveX(p, move, stage);

    if (!RK.Physics.isSupported(stage, p.x, p.y, p.w)) startFall(p);
  }

  /** 1tick 進める。input は RK.Input の poll() の結果 */
  function update(p, input, stage) {
    // 足場が（スポーン位置や、将来は破壊で）無くなっていたら、この tick から落ちる
    if (p.mode === 'ground' && !RK.Physics.isSupported(stage, p.x, p.y, p.w)) startFall(p);

    if (p.mode === 'fall') updateFall(p, stage);   // 着地した tick は移動しない
    else updateGround(p, input, stage);

    // --- ハンマー（仮。押した瞬間に表示開始。長押しでは繰り返さない） ---
    if (p.hammerFrames > 0) p.hammerFrames--;
    if (input.hammerPressed) p.hammerFrames = C.HAMMER_FRAMES;
  }

  RK.Player = Object.freeze({ create, update, moveX });
})(window);
