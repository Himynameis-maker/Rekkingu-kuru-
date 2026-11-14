/* ===== 親方（Foreman）行動アルゴリズム（ステップ8b-4） =====
 * 仕様に基づく決定的な追跡・破壊AI:
 *   1. ゲーム中最速（FOREMAN_SPEED = 1.1）で Chaser と同じ追跡ルールで移動（加速なし）。
 *   2. 移動開始から 4.0〜6.0s（240〜360 tick）経つと 0.6〜1.2s（36〜72 tick）立ち止まり、
 *      動き出す瞬間に方向転換トリガー（フル再評価）が働く。
 *   3. 4tick周期の荒いチェック＋生座標 (x, y) 追尾:
 *      - 平地ではタイミングの噛み合わせによりプレイヤー横で止まることも、判定枠を抜けて追い抜くこともある。
 *      - ハシゴ上ではプレイヤーの生の y 座標へ合わせようとするため、速度の端数と周期のズレにより
 *        数ドット上下に揺れてから止まる（フラフラする）人間味のある動きが自然に発生する。
 *   4. プレイヤーのグリッドに辿り着き、そこに壊せる壁（W/w/V）または壊せる梯子（L）があり親方もそこにいるとき、
 *      0.3〜0.8s（18〜48 tick）立ち止まる。
 *      その直後も振り判定範囲内にいればハンマーを1回振り下ろし、さらに 1.0s（60 tick）後に再判定。
 *      判定外・対象なしになれば方向転換トリガーを発動して歩き出す。
 *   5. 扉(D)・爆弾(B)・鉄柱(I)・壊せない梯子(H)は壊せず、ハンマーを振りもしない。
 */
(function (w) {
  const RK = (w.RK = w.RK || {});
  const C = RK.CONFIG;

  /** 決定的な疑似乱数（ゲームごとに再現性を維持する） */
  function nextRandInt(game, min, max) {
    if (game.rngState === undefined) {
      game.rngState = 0x5f3759df;
    }
    let s = (game.rngState + 0x6d2b79f5) | 0;
    game.rngState = s;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    const u = ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    return min + Math.floor(u * (max - min + 1));
  }

  function rollWalkFrames(game) {
    return nextRandInt(game, C.FOREMAN_WALK_MIN_FRAMES, C.FOREMAN_WALK_MAX_FRAMES);
  }

  function rollPauseFrames(game) {
    return nextRandInt(game, C.FOREMAN_PAUSE_MIN_FRAMES, C.FOREMAN_PAUSE_MAX_FRAMES);
  }

  function rollSpotFrames(game) {
    return nextRandInt(game, C.FOREMAN_SPOT_MIN_FRAMES, C.FOREMAN_SPOT_MAX_FRAMES);
  }

  /** 親方がハンマーで壊せる対象か（壁3種 W/w/V または壊せる梯子 L のみ。扉・爆弾・鉄柱・不可梯子は false） */
  function isBreakableTargetId(id) {
    return id === 'wall_a' || id === 'wall_b' || id === 'wall_c' || id === 'ladder';
  }

  /**
   * 親方がハンマーを振れる対象セルを返す（無ければ null）。
   * 条件: プレイヤーが壊せるハシゴか壁のある場所に立っている且つ、そこに親方がいるとき。
   */
  function findBreakableTargetCell(stage, e, player) {
    if (!player) return null;
    const fCol = stage.wrapCol(stage.colAt(e.x));
    const fRow = stage.rowAtFeet(e.y);
    const pCol = stage.wrapCol(stage.colAt(player.x));
    const pRow = stage.rowAtFeet(player.y);

    if (fCol === pCol && fRow === pRow && isBreakableTargetId(stage.idAt(fCol, fRow))) {
      return { col: fCol, row: fRow };
    }
    // 境界付近でわずかに1列ずれている場合も、親方側またはプレイヤー側に対象があれば許容する
    if (fRow === pRow && Math.abs(fCol - pCol) <= 1) {
      if (isBreakableTargetId(stage.idAt(fCol, fRow))) return { col: fCol, row: fRow };
      if (isBreakableTargetId(stage.idAt(pCol, pRow))) return { col: pCol, row: pRow };
    }
    return null;
  }

  /** 親方とプレイヤーの距離（横は最短ループ距離） */
  function playerDelta(e, player) {
    let dx = Math.abs(e.x - player.x);
    if (dx > C.WIDTH / 2) dx = C.WIDTH - dx;
    const dy = Math.abs(e.y - player.y);
    return { dx, dy };
  }

  /** ハンマーを1回振り下ろす */
  function swingForemanHammer(e, target, game) {
    e.hammerFrames = C.HAMMER_FRAMES;
    if (RK.Game && RK.Game.hitCellByHammer) {
      RK.Game.hitCellByHammer(game, e, target.col, target.row);
    } else {
      game.stage.damageCell(target.col, target.row, 1);
    }
  }

  /** 方向転換トリガーを発動して歩き出す */
  function triggerTurnAndResume(e, game) {
    e.foremanPhase = 'patrol';
    e.pauseFrames = 0;
    e.needsReeval = true;
    if (e.foremanWalkTimer <= 0) {
      e.foremanWalkTimer = rollWalkFrames(game);
    }
    RK.Enemy.triggerAI(e, 'cell_center', game);
  }

  /** 毎tick呼ばれる親方固有の状態進行 */
  function onTick(e, game) {
    const stage = game.stage;
    const player = game.player;

    if (e.foremanWalkTimer <= 0 && e.foremanPhase === 'patrol') {
      e.foremanWalkTimer = rollWalkFrames(game);
    }

    // 異常落下中または着地スタン中はタイマー進行のみリセットして待機
    if (e.mode === 'abnormal_fall' || e.mode === 'fall' || e.stunFrames > 0) {
      return;
    }

    // 1. 停止・待機フェーズの満了処理
    if (e.foremanPhase === 'periodic_pause') {
      if (e.pauseFrames <= 0) {
        e.foremanWalkTimer = rollWalkFrames(game);
        triggerTurnAndResume(e, game);
      }
      return;
    }

    if (e.foremanPhase === 'spot_pause' || e.foremanPhase === 'swing_wait') {
      if (e.pauseFrames <= 0) {
        const target = findBreakableTargetCell(stage, e, player);
        if (player && target) {
          const d = playerDelta(e, player);
          if (d.dx <= C.FOREMAN_SWING_X_RANGE && d.dy <= C.FOREMAN_SWING_Y_RANGE) {
            swingForemanHammer(e, target, game);
            e.foremanPhase = 'swing_wait';
            e.pauseFrames = C.FOREMAN_SWING_INTERVAL_FRAMES;
            return;
          }
        }
        // 判定範囲外に出た、または対象が壊れきった場合は方向転換トリガー発動
        triggerTurnAndResume(e, game);
      }
      return;
    }

    // 2. patrol（通常移動中）のカウントダウン
    if (e.foremanWalkTimer > 0) {
      e.foremanWalkTimer--;
      if (e.foremanWalkTimer === 0) {
        e.foremanPhase = 'periodic_pause';
        e.pauseFrames = rollPauseFrames(game);
        return;
      }
    }

    // 3. 荒い周期（FOREMAN_CHECK_INTERVAL = 4tickごと）での接近判定＆ハシゴ高さ合わせ
    e.foremanCheckTick = (e.foremanCheckTick + 1) % C.FOREMAN_CHECK_INTERVAL;
    if (e.foremanCheckTick !== 0 || !player) return;

    // プレイヤーの位置合わせ判定範囲内かつ壊せる壁/ハシゴがあるなら立ち止まる（0.3〜0.8s）
    const d = playerDelta(e, player);
    if (d.dx <= C.FOREMAN_ALIGN_X_RANGE && d.dy <= C.FOREMAN_ALIGN_Y_RANGE) {
      const target = findBreakableTargetCell(stage, e, player);
      if (target) {
        e.foremanPhase = 'spot_pause';
        e.pauseFrames = rollSpotFrames(game);
        return;
      }
    }

    // ハシゴ上のとき、プレイヤーが同じハシゴ付近にいるならプレイヤーの生y座標へ高さを合わせる
    // （速度の端数と4tick周期のズレにより、数ドット上下にフラフラ揺れて止まる挙動が自然に起きる）
    if (e.mode === 'ladder') {
      const pCol = stage.wrapCol(stage.colAt(player.x));
      if (pCol === e.ladderCol || d.dx <= C.CELL_W) {
        const diffY = player.y - e.y;
        if (Math.abs(diffY) <= 2) {
          e.dirY = 0;
        } else {
          e.dirY = diffY < 0 ? -1 : 1;
        }
      }
    }
  }

  /** イベント駆動の方向判断（Chaser と同じアルゴリズムを流用） */
  function decide(e, event, game) {
    if (event === 'spawn' && e.foremanWalkTimer <= 0) {
      e.foremanWalkTimer = rollWalkFrames(game);
    }
    if (RK.ChaserAI && RK.ChaserAI.decide) {
      return RK.ChaserAI.decide(e, event, game);
    }
    return null;
  }

  RK.ForemanAI = Object.freeze({
    decide,
    onTick,
    isBreakableTargetId,
    findBreakableTargetCell,
  });

  if (RK.Enemy) {
    RK.Enemy.registerAI('foreman', decide);
  }
})(window);
