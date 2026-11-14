/* ===== プレイヤー =====
 * 座標は「中心x」と「足y」（整数ドット）。足y は足場面と同じ座標系（足場面の真上に立つとき y = surfaceY(row)）。
 *   体の矩形: 左 = x - w/2, 上 = y - h, 右 = x + w/2, 下 = y
 *   いるセル: col = stage.colAt(x), row = stage.rowAtFeet(y)
 *
 * ステップ8aの範囲: 左右移動（樽には横から通れない。壁は背景側なので通れる。画面の左右端はつながっている）、
 *   床・樽の上に立つ、足場が無くなったら通常落下、梯子の昇降、ハンマー攻撃（画面奥に振り、壁W/w/Vを破壊）、
 *   異常落下（通常の床や途中の段の樽を無視して一番下の床またはその上の樽まで落下。落下中は無敵、着地後即座に無敵解除＆0.5s硬直）。
 * 中心x は常に 0 〜 WIDTH-1。端を越えたら反対側へ移る（moveX）。体が端をまたいでいる間の足場・樽の判定は terrain.js。
 * まだ無いもの: 敵(8b〜)、破壊可能な梯子・鉄柱・爆弾・扉の挙動(9)。
 * 描画はこのファイルに無い（sprites.js）。足場・衝突の判定は physics/terrain.js。ここは状態を更新するだけ。
 *
 * mode（通常落下と異常落下は必ず別状態にする）:
 *  - 'ground': 足場の上。左右に動ける。毎tick、足場に乗っているかを確認し、乗っていなければ 'fall' へ。
 *              歩行可能なこの状態（かつ硬直・ロック中でないとき）でのみハンマーを振れる。振った瞬間に画面奥の1セル（自分の中心があるセル）を1回叩き、
 *              HAMMER_LOCK_FRAMES の間は行動を受け付けず、HAMMER_COOLDOWN_FRAMES の間は次のハンマーを振れない。
 *  - 'fall'  : 通常落下。1tick に PLAYER_FALL_SPEED ドット下へ。足場（床か樽の上）で止まり 'ground' に戻る。
 *              落下中は左右入力を無視する（暫定。context.md §9 / §11）。ハンマーは振れない。
 *              落下中に上入力があり、体の足元に梯子（中心から LADDER_GRAB_DOTS 以内）があれば、つかまって 'ladder' へ。
 *  - 'abnormal_fall': 異常落下。梯子の破壊や爆発などで強制的に発生（startAbnormalFall）。
 *              1tick に PLAYER_ABNORMAL_FALL_SPEED ドット下へ。通常の床や途中の段の樽を無視し、一番下の床または一番下の床の上の樽で止まる。
 *              落下中は無敵（invincible = true）。左右移動・梯子つかまり・ハンマー攻撃はすべて不可。
 *              着地した瞬間に 'ground' へ戻り、無敵は即座に解除（invincible = false）され、PLAYER_ABNORMAL_LAND_STUN_FRAMES（0.5s）の着地硬直に入る。
 *  - 'ladder': 梯子の上。上下入力で PLAYER_CLIMB_SPEED ドット/tick で昇り降り（x は中心へ寄る）。ハンマーは振れない。
 *              昇り降りしていない tick は、どの高さでも左右に動ける。中心から LADDER_GRAB_DOTS ドットを超えて離れたら梯子から外れ、
 *              その高さに足場があれば 'ground' に乗り、なければ通常落下。
 *              梯子の真上に床がある場合に限り、床をすり抜けて昇れ、上端(span.top)でその床('ground')に乗れる（確定）。
 *              梯子の上が穴（床なし）の場合は、上端(span.top)で床のある列へは横に入れない（足が床につっかえて上の段に立てない。確定）。
 *              床の無い列へは動け、梯子の範囲を出れば落ちる。
 *              下端に着いて足場に乗ったら 'ground' に戻る。
 *  - 'ground' から: 上入力で足元の梯子に乗る（中心から LADDER_GRAB_DOTS 以内）。下入力で、足場面の真下に梯子があり、その真上に床があれば床をすり抜けて乗る（確定）。
 *    穴のてっぺんの梯子へは、穴を歩いて落ち、落下中に上入力でつかまる（下入力では乗らない）。
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
      facing: 1,                          // 向き。-1=左 / 1=右
      mode: 'ground',                     // 'ground' / 'fall'（通常落下）/ 'abnormal_fall'（異常落下）/ 'ladder'
      ladderCol: -1,                      // 'ladder' のとき乗っている梯子の列
      climbAccum: 0,                      // 梯子昇降のサブピクセル累積（小数値速度にも対応）
      stepDir: 0,                         // チョン移動の向き
      stepTick: C.PLAYER_TAP_FRAMES,      // チョン開始からの経過tick。PLAYER_TAP_FRAMES 以上なら「チョンではない」
      hammerFrames: 0,                    // ハンマー表示の残りtick（0なら非表示）
      hammerLockFrames: 0,                // ハンマー後の行動受付不可の残りtick（歩行クールタイム）
      hammerCooldown: 0,                  // 次にハンマーを振れるまでの残りtick（ハンマークールタイム）
      stunFrames: 0,                      // 異常落下の着地後に動けない残りtick（0.5s）
      invincible: false,                  // 無敵状態（異常落下中のみ true、着地後即座に false）
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
    p.ladderCol = -1;
    p.climbAccum = 0;
    p.stepDir = 0;
    p.stepTick = C.PLAYER_TAP_FRAMES;
    p.hammerLockFrames = 0;
  }

  /** 異常落下を始める（梯子破壊・爆発など）。落下中は無敵、進行中のチョン・ロックは破棄 */
  function startAbnormalFall(p) {
    p.mode = 'abnormal_fall';
    p.invincible = true;
    p.ladderCol = -1;
    p.climbAccum = 0;
    p.stepDir = 0;
    p.stepTick = C.PLAYER_TAP_FRAMES;
    p.hammerLockFrames = 0;
    p.stunFrames = 0;
  }

  /** 梯子に乗る。x を梯子の中心へスナップし、チョンの途中だったら捨てる */
  function boardLadder(p, stage, col) {
    p.mode = 'ladder';
    p.ladderCol = col;
    p.climbAccum = 0;
    p.x = stage.centerX(col);
    p.stepDir = 0;
    p.stepTick = C.PLAYER_TAP_FRAMES;
  }

  /** ハンマーを画面奥に振る。振った瞬間に1回だけ、自分の中心がある奥の1セルにダメージを与える（同時破壊なし） */
  function swingHammer(p, stage) {
    p.hammerFrames = C.HAMMER_FRAMES;
    p.hammerLockFrames = C.HAMMER_LOCK_FRAMES;
    p.hammerCooldown = C.HAMMER_COOLDOWN_FRAMES;
    p.stepDir = 0;
    p.stepTick = C.PLAYER_TAP_FRAMES;
    const col = stage.wrapCol(stage.colAt(p.x));
    const row = stage.rowAtFeet(p.y);
    stage.damageCell(col, row, 1);
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

  /** 異常落下の1tick。通常の床や途中の段の樽を無視し、一番下の床またはその上の樽で停止。着地瞬間に無敵解除・0.5s硬直開始 */
  function updateAbnormalFall(p, stage) {
    p.invincible = true;
    const r = RK.Physics.abnormalFallTo(stage, p.x, p.w, p.y, C.PLAYER_ABNORMAL_FALL_SPEED);
    p.y = r.y;
    if (r.landed) {
      p.mode = 'ground';
      p.invincible = false;
      p.stunFrames = C.PLAYER_ABNORMAL_LAND_STUN_FRAMES;
    }
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

  /**
   * 足場面に立っているとき、その真下のセルにある梯子の列（中心から LADDER_GRAB_DOTS 以内）。無ければ -1。
   * 床の上から下入力で、床をすり抜けて梯子へ降りるために使う。梯子の真上に床（'='）がある列だけが対象
   * （穴のてっぺんの梯子には、下入力では乗らない。確定）。
   */
  function ladderBelowCol(p, stage) {
    if (p.y % C.CELL_H !== 0 || p.y >= C.HEIGHT) return -1;
    const row = p.y / C.CELL_H;                         // 足場面のすぐ下の行
    const col = RK.Physics.ladderColAt(stage, p.x, row);
    if (col < 0 || !stage.hasFloor(col, row - 1)) return -1;
    return col;
  }

  /**
   * 足場の上での1tick。梯子に乗れるときは、その tick は乗るだけ。なければ左右移動。外れたら落下開始（y の移動は次のtick）。
   *  - 上入力: 足元（体のいるセル）に梯子があれば乗る。梯子の真上に床があっても、昇ってすり抜けられる（updateLadder）。
   *  - 下入力: 真下のセルに梯子があれば、床をすり抜けて乗る（梯子の上端 span.top から降りる）。
   */
  function updateGround(p, input, stage) {
    if (input.dy < 0) {
      const col = RK.Physics.ladderColAt(stage, p.x, stage.rowAtFeet(p.y));
      if (col >= 0) { boardLadder(p, stage, col); return; }
    } else if (input.dy > 0) {
      const col = ladderBelowCol(p, stage);
      if (col >= 0) { boardLadder(p, stage, col); return; }
    }
    stepHorizontal(p, input, stage);
    if (!RK.Physics.isSupported(stage, p.x, p.y, p.w)) startFall(p);
  }

  /**
   * 梯子の上での1tick。上下入力で昇り降り（x は中心へ）。昇り降りしていない tick は左右に動ける（どの高さでも）。
   * 上端か下端で足場に乗ったら 'ground'（梯子の真上に床があるときは床をすり抜けて上端でその床に乗る）。
   * そうでなく中心から LADDER_GRAB_DOTS を超えて離れたら梯子から外れ、その高さに足場があれば 'ground'、なければ通常落下。
   * 梯子が無くなっていたら落ちる（将来、梯子の破壊は startAbnormalFall を使う）。
   */
  function updateLadder(p, input, stage) {
    const span = RK.Physics.ladderSpan(stage, p.ladderCol, p.y);
    if (!span) { startFall(p); return; }

    const cx = stage.centerX(p.ladderCol);
    let climbed = false;
    if (input.dy !== 0 && Math.abs(p.x - cx) <= C.LADDER_GRAB_DOTS) {
      p.climbAccum += C.PLAYER_CLIMB_SPEED;
      const steps = Math.floor(p.climbAccum + 1e-9);
      p.climbAccum -= steps;
      if (steps > 0) {
        const ny = Math.min(Math.max(p.y + input.dy * steps, span.top), span.bottom);
        if (ny !== p.y) { p.y = ny; p.x = cx; climbed = true; }
      }
    } else {
      p.climbAccum = 0;
    }
    if (!climbed) stepHorizontal(p, input, stage, p.y === span.top);   // てっぺんでは床のある列へ入れない

    if ((p.y === span.top || p.y === span.bottom) && RK.Physics.isSupported(stage, p.x, p.y, p.w)) {
      p.mode = 'ground';                                          // 梯子の端で足場に乗った
      p.climbAccum = 0;
    } else if (Math.abs(p.x - cx) > C.LADDER_GRAB_DOTS) {
      if (RK.Physics.isSupported(stage, p.x, p.y, p.w)) {
        p.mode = 'ground';                                        // 途中の床の高さで横に降りて床に乗った
        p.climbAccum = 0;
      } else {
        startFall(p);                                             // 梯子から外れた
      }
    }
  }

  /** 1tick 進める。input は RK.Input の poll() の結果 */
  function update(p, input, stage) {
    if (p.hammerFrames > 0) p.hammerFrames--;
    if (p.hammerLockFrames > 0) p.hammerLockFrames--;
    if (p.hammerCooldown > 0) p.hammerCooldown--;
    if (p.stunFrames > 0) p.stunFrames--;
    p.invincible = (p.mode === 'abnormal_fall');

    if (p.mode === 'abnormal_fall') {
      updateAbnormalFall(p, stage);
      return;
    }

    // 足場が（スポーン位置や、将来は破壊で）無くなっていたら、この tick から落ちる
    if (p.mode === 'ground' && !RK.Physics.isSupported(stage, p.x, p.y, p.w)) startFall(p);

    if (p.mode === 'fall') {
      updateFall(p, input, stage);   // 着地した tick は移動しない
    } else if (p.mode === 'ladder') {
      updateLadder(p, input, stage);
    } else {
      // 異常落下着地後の硬直中は動けない・ハンマーも振れない
      if (p.stunFrames > 0) return;
      // 歩行可能な状態('ground')でのみハンマーを振れる。振ったあと HAMMER_LOCK_FRAMES は行動を受け付けない
      if (input.hammerPressed && p.hammerCooldown === 0 && p.hammerLockFrames === 0) {
        swingHammer(p, stage);
      } else if (p.hammerLockFrames === 0) {
        updateGround(p, input, stage);
      }
    }
  }

  RK.Player = Object.freeze({ create, update, moveX, startAbnormalFall });
})(window);
