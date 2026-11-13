/* ===== プレイヤー =====
 * 座標は「中心x」と「足y」（整数ドット）。足y は足場面と同じ座標系（足場面の真上に立つとき y = surfaceY(row)）。
 *   体の矩形: 左 = x - w/2, 上 = y - h, 右 = x + w/2, 下 = y
 *   いるセル: col = stage.colAt(x), row = stage.rowAtFeet(y)
 *
 * ステップ6の範囲: 左右移動（樽には横から通れない。画面の左右端はつながっている）、床・樽の上に立つ、
 *   足場が無くなったら通常落下、梯子の昇降。
 * 中心x は常に 0 〜 WIDTH-1。端を越えたら反対側へ移る（moveX）。体が端をまたいでいる間の足場・樽の判定は terrain.js。
 * まだ無いもの: 攻撃判定(7)、異常落下(8)、樽以外との横の衝突。
 * 描画はこのファイルに無い（sprites.js）。足場・衝突の判定は physics/terrain.js。ここは状態を更新するだけ。
 *
 * mode（通常落下と異常落下は別状態にする。いまは 'ground' と 'fall' だけ）:
 *  - 'ground': 足場の上。左右に動ける。毎tick、足場に乗っているかを確認し、乗っていなければ 'fall' へ。
 *  - 'fall'  : 通常落下。1tick に PLAYER_FALL_SPEED ドット下へ。足場（床か樽の上）で止まり 'ground' に戻る。
 *              落下中は左右入力を無視する（暫定。context.md §9 / §11）。ハンマーの表示は受け付ける（仮）。
 *              落下中に上入力があり、体の足元に梯子（中心から LADDER_GRAB_DOTS 以内）があれば、つかまって 'ladder' へ。
 *  - 'ladder': 梯子の上。上下入力で PLAYER_CLIMB_SPEED ドット/tick で昇り降り（x は中心へ寄る）。
 *              昇り降りしていない tick は、どの高さでも左右に動ける。中心から LADDER_GRAB_DOTS ドットを超えて離れたら梯子から外れ、通常落下。
 *              上端（上の足場面の高さ。穴の上なので足場ではない）では、床のある列（足場になる列）へは横に入れない
 *              （足が床につっかえて上の段に立てない。確定）。床の無い列へは動け、梯子の範囲を出れば落ちる。
 *              下端に着いて足場に乗ったら 'ground' に戻る。
 *  - 'ground' から: 上入力で足元の梯子に乗る（中心から LADDER_GRAB_DOTS 以内）。上の段から梯子へは、穴を歩いて落ち、落下中に上入力でつかまる。
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
      mode: 'ground',                     // 'ground' / 'fall'（通常落下）/ 'ladder'。将来: 'abnormal_fall'
      ladderCol: -1,                      // 'ladder' のとき乗っている梯子の列
      stepDir: 0,                         // チョン移動の向き
      stepTick: C.PLAYER_TAP_FRAMES,      // チョン開始からの経過tick。PLAYER_TAP_FRAMES 以上なら「チョンではない」
      hammerFrames: 0,                    // 仮: ハンマー表示の残りtick（0なら非表示）
    };
  }

  /**
   * 横に d ドット動かす（1ドットずつ確かめる）。画面の左右はつながっていて、中心x が画面の外へ出たら
   * 反対側へ移す（中心x は常に 0 〜 WIDTH-1。左端を越えたら WIDTH-1、右端を越えたら 0）。
   * stage があれば樽に横からぶつかったところで止める（端をまたぐ樽も同じ）。stage を省くと衝突は見ない。
   * solidFloor が true（梯子のてっぺんにいるとき）なら、足場のある列（床・樽の上面）へ新しく入る一歩でも止める。
   */
  function moveX(p, d, stage, solidFloor) {
    const dir = d > 0 ? 1 : -1;
    for (let i = 0, n = Math.abs(d); i < n; i++) {
      const nx = p.x + dir;                    // 画面の外になることがある（-1 や WIDTH）。衝突判定は外でも反対側の列で行う
      if (stage && RK.Physics.blockedX(stage, nx, p.y, p.w, p.h, dir)) break;
      if (stage && solidFloor && RK.Physics.blockedByFloorX(stage, nx, p.y, p.w, dir)) break;
      p.x = RK.Physics.wrapX(nx);
    }
  }

  /** 通常落下を始める。チョンの途中だったら捨てる（着地後に残さない） */
  function startFall(p) {
    p.mode = 'fall';
    p.stepDir = 0;
    p.stepTick = C.PLAYER_TAP_FRAMES;
  }

  /** 梯子に乗る。x を梯子の中心へスナップし、チョンの途中だったら捨てる */
  function boardLadder(p, stage, col) {
    p.mode = 'ladder';
    p.ladderCol = col;
    p.x = stage.centerX(col);
    p.stepDir = 0;
    p.stepTick = C.PLAYER_TAP_FRAMES;
  }

  /** 通常落下の1tick。上入力で梯子につかまる。足場に当たったらそこで止まって 'ground' に戻る */
  function updateFall(p, input, stage) {
    if (input.dy < 0) {
      const col = RK.Physics.ladderColAt(stage, p.x, stage.rowAtFeet(p.y));
      if (col >= 0) { boardLadder(p, stage, col); return; }
    }
    const r = RK.Physics.fallTo(stage, p.x, p.w, p.y, C.PLAYER_FALL_SPEED);
    p.y = r.y;
    if (r.landed) p.mode = 'ground';
  }

  /** 左右の入力を処理して横に動かす（チョン + 連続）。足場の上と、梯子の上で使う。solidFloor は梯子のてっぺんのとき true（moveX 参照） */
  function stepHorizontal(p, input, stage, solidFloor) {
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
    if (move !== 0) moveX(p, move, stage, solidFloor);
  }

  /** 足場の上での1tick。上入力で足元に梯子があれば、その tick は乗るだけ。なければ左右移動。外れたら落下開始（y の移動は次のtick） */
  function updateGround(p, input, stage) {
    if (input.dy < 0) {
      const col = RK.Physics.ladderColAt(stage, p.x, stage.rowAtFeet(p.y));
      if (col >= 0) { boardLadder(p, stage, col); return; }
    }
    stepHorizontal(p, input, stage);
    if (!RK.Physics.isSupported(stage, p.x, p.y, p.w)) startFall(p);
  }

  /**
   * 梯子の上での1tick。上下入力で昇り降り（x は中心へ）。昇り降りしていない tick は左右に動ける（どの高さでも）。
   * 上端か下端で足場に乗ったら 'ground'。そうでなく中心から LADDER_GRAB_DOTS を超えて離れたら梯子から外れて通常落下。
   * 梯子が無くなっていたら落ちる（将来、梯子の破壊は異常落下になる。ステップ8）。
   */
  function updateLadder(p, input, stage) {
    const span = RK.Physics.ladderSpan(stage, p.ladderCol, p.y);
    if (!span) { startFall(p); return; }

    const cx = stage.centerX(p.ladderCol);
    let climbed = false;
    if (input.dy !== 0 && Math.abs(p.x - cx) <= C.LADDER_GRAB_DOTS) {
      const ny = Math.min(Math.max(p.y + input.dy * C.PLAYER_CLIMB_SPEED, span.top), span.bottom);
      if (ny !== p.y) { p.y = ny; p.x = cx; climbed = true; }
    }
    if (!climbed) stepHorizontal(p, input, stage, p.y === span.top);   // てっぺんでは床のある列へ入れない

    if ((p.y === span.top || p.y === span.bottom) && RK.Physics.isSupported(stage, p.x, p.y, p.w)) {
      p.mode = 'ground';                                          // 梯子の端で足場に乗った
    } else if (Math.abs(p.x - cx) > C.LADDER_GRAB_DOTS) {
      startFall(p);                                               // 梯子から外れた
    }
  }

  /** 1tick 進める。input は RK.Input の poll() の結果 */
  function update(p, input, stage) {
    // 足場が（スポーン位置や、将来は破壊で）無くなっていたら、この tick から落ちる
    if (p.mode === 'ground' && !RK.Physics.isSupported(stage, p.x, p.y, p.w)) startFall(p);

    if (p.mode === 'fall') updateFall(p, input, stage);   // 着地した tick は移動しない
    else if (p.mode === 'ladder') updateLadder(p, input, stage);
    else updateGround(p, input, stage);

    // --- ハンマー（仮。押した瞬間に表示開始。長押しでは繰り返さない） ---
    if (p.hammerFrames > 0) p.hammerFrames--;
    if (input.hammerPressed) p.hammerFrames = C.HAMMER_FRAMES;
  }

  RK.Player = Object.freeze({ create, update, moveX });
})(window);
