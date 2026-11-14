/* ===== 親方（Foreman）行動アルゴリズム（ステップ8b-4改） =====
 * レトロ実装の非対称ステートマシン＋目標座標ラッチ（間欠サンプリング）に基づく決定的AI:
 *   1. 間欠サンプリング（思考タイマー: FOREMAN_THINK_FRAMES = 54 tick / 0.9s）:
 *      - タイマー発火時・画面端ループ通過時・スタン終了時にのみプレイヤー座標 (targetX, targetY) を記憶し、
 *        次のタイマー発火まではその記憶した目標座標だけを見て愚直に動く。
 *      - これにより、近づく際の一拍の遅れ・すれ違い時の行き過ぎ反転・同時登攀時の切り返し・
 *        オーバーラン落下が乱数なしで自然に発生する。
 *   2. 地上モードとハシゴモードの分離:
 *      - すでに同じ高さ（targetY === e.y）にいるなら、横のハシゴには乗らず水平に targetX を目指す。
 *      - 高さが違うときは最寄りの到達可能なハシゴへ向かい、ハシゴモード中は停止ブレーキなしで等速昇降する。
 *      - ハシゴ上で中途半端な目標Yに近づくと、速度 1.1 ドット/tick の端数によるオーバーシュートで
 *        上下に数回ブレたあと FOREMAN_LADDER_WOBBLE_FRAMES 経過でピタッと停止する。
 *      - ハシゴ下端に着地した瞬間、目標Y到達済みまたは targetX 到達済みなら着地ウェイト（思考タイマー）が
 *        セットされてその場で一拍静止する（ハシゴ途中からの横抜けでは静止しない）。
 *   3. 障害物・落下着地・ハンマー破壊:
 *      - 樽にぶつかったときは反転せず、その場で立ち止まる。
 *      - 通常落下着地時は targetX = 0 にリセットされるため、樽の有無に関わらず左へ進む。
 *      - プレイヤーが壊せる壁(W/w/V)または壊せる梯子(L)に立っており親方もそこにいるとき、
 *        対象セルをロックして 0.3〜0.8s 立ち止まった後、ハンマーを振り下ろす。
 *        扉(D)・爆弾(B)・鉄柱(I)・壊せない梯子(H)は壊さず、ハンマーも振らない。
 */
(function (w) {
  const RK = (w.RK = w.RK || {});
  const C = RK.CONFIG;

  /** 決定的な疑似乱数（ハンマー停止時間の揺らぎ用） */
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

  function rollSpotFrames(game) {
    return nextRandInt(game, C.FOREMAN_SPOT_MIN_FRAMES, C.FOREMAN_SPOT_MAX_FRAMES);
  }

  /** 親方がハンマーで壊せる対象か（壁3種 W/w/V または壊せる梯子 L のみ） */
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

  /** プレイヤーの現在座標を目標座標としてラッチ（記憶）する */
  function samplePlayerTarget(e, player) {
    if (player) {
      e.foremanTargetX = player.x;
      e.foremanTargetY = player.y;
    } else if (e.foremanTargetX === null) {
      e.foremanTargetX = e.x;
      e.foremanTargetY = e.y;
    }
    e.foremanThinkTimer = C.FOREMAN_THINK_FRAMES;
    e.foremanLadderWobble = 0;
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

  /** ハンマーフェーズ終了時に思考トリガーを発動して歩き出す */
  function resumeAfterHammer(e, game) {
    e.foremanPhase = 'patrol';
    e.foremanLockedTarget = null;
    e.pauseFrames = 0;
    samplePlayerTarget(e, game.player);
    e.needsReeval = true;
    RK.Enemy.triggerAI(e, 'cell_center', game);
  }

  /** ハシゴを登り切っててっぺんの行き止まりに着いたか */
  function isAtLadderDeadEnd(stage, e) {
    if (e.mode !== 'ladder' || e.dirY >= 0) return false;
    const span = RK.Physics.ladderSpan(stage, e.ladderCol, e.y);
    if (!span || e.y > span.top) return false;
    return !RK.Physics.isSupported(stage, e.x, e.y, e.w);
  }

  /**
   * 記憶した targetX, targetY に基づいて地上での進行方向を決める。
   * - 同じ高さ（targetY === e.y）なら横のハシゴには乗らず水平に targetX を目指す。
   * - 樽にぶつかった場合は反転せず立ち止まる（dirX: 0）。
   */
  function decideGroundAction(stage, e) {
    if (e.foremanTargetX === null || e.foremanTargetY === null) {
      return { dirX: 0, dirY: 0 };
    }

    const targetX = e.foremanTargetX;
    const targetY = e.foremanTargetY;
    const curCol = stage.wrapCol(stage.colAt(e.x));

    // 1. 異なる高さにいる場合は最寄りの有効な梯子を使う
    if (targetY !== e.y) {
      const needUp = targetY < e.y;
      const targetCol = (RK.ChaserAI && RK.ChaserAI.selectTargetLadder)
        ? RK.ChaserAI.selectTargetLadder(stage, e, needUp)
        : -1;

      if (targetCol >= 0) {
        if (targetCol === curCol) {
          e.needsReeval = false;
          return { dirX: 0, dirY: needUp ? -1 : 1 };
        }
        const desiredDir = targetCol > curCol ? 1 : -1;
        const nx = RK.Physics.wrapX(e.x + desiredDir);
        if (RK.Physics.blockedX(stage, nx, e.y, e.w, e.h, desiredDir)) {
          // 樽に塞がれたら反転せず立ち止まる
          e.needsReeval = false;
          return { dirX: 0, dirY: 0 };
        }
        e.needsReeval = false;
        return { dirX: desiredDir, dirY: 0 };
      }
    }

    // 2. 同じ高さ（または有効な梯子なし）の場合: 記憶した targetX へ向かう
    const dx = targetX - e.x;
    if (Math.abs(dx) <= C.FOREMAN_ARRIVE_TOLERANCE) {
      e.needsReeval = false;
      return { dirX: 0, dirY: 0 };
    }

    const dir = dx > 0 ? 1 : -1;
    const nx = RK.Physics.wrapX(e.x + dir);
    if (RK.Physics.blockedX(stage, nx, e.y, e.w, e.h, dir)) {
      // 樽にぶつかっても反転せず立ち止まる
      e.needsReeval = false;
      return { dirX: 0, dirY: 0 };
    }

    e.needsReeval = false;
    return { dirX: dir, dirY: 0 };
  }

  /**
   * ハシゴ昇降中の高さ合わせ処理（毎tick実行）。
   * - 目標Yまで距離がある間は止まらず一定速度で昇降する。
   * - 中途半端な高さの目標Y付近では速度 1.1 の端数で数回上下にブレたあとピタッと止まる。
   * - 床の高さに到達し、目標Yと噛み合っていれば地上モードへ降りる。
   */
  function updateLadderTracking(stage, e) {
    if (e.foremanTargetY === null) return;
    const targetY = e.foremanTargetY;
    const diffY = targetY - e.y;

    // 床の高さで目標Yと一致（±1ドット）かつ足場があれば地上へ降りる
    if (e.y % C.CELL_H === 0 && Math.abs(diffY) <= 1 && RK.Physics.isSupported(stage, e.x, e.y, e.w)) {
      e.mode = 'ground';
      e.ladderCol = -1;
      e.climbAccum = 0;
      e.dirY = 0;
      e.foremanLadderWobble = 0;
      const next = decideGroundAction(stage, e);
      e.dirX = next.dirX;
      if (next.dirX !== 0) e.facing = next.dirX;
      return;
    }

    // すでにピタッと停止完了している場合
    if (e.dirY === 0 && e.foremanLadderWobble >= C.FOREMAN_LADDER_WOBBLE_FRAMES) {
      return;
    }

    // 目標Yの近傍（±2ドット）に入った場合は数回上下にブレてからピタッと停止する
    if (Math.abs(diffY) <= 2) {
      e.foremanLadderWobble++;
      if (e.foremanLadderWobble >= C.FOREMAN_LADDER_WOBBLE_FRAMES) {
        e.dirY = 0;
        return;
      }
      if (diffY === 0) {
        // 目標Yちょうどを踏んだ場合でも、まだブレ期間中なら直前の移動方向へ1ドット行き過ぎてブレを作る
        if (e.dirY === 0) e.dirY = 1;
      } else {
        e.dirY = diffY < 0 ? -1 : 1;
      }
      return;
    }

    // 目標Yまで離れている間は止まらず等速昇降
    e.foremanLadderWobble = 0;
    e.dirY = diffY < 0 ? -1 : 1;
  }

  /** 毎tick呼ばれる親方固有の状態進行 */
  function onTick(e, game) {
    const stage = game.stage;
    const player = game.player;

    if (e.foremanTargetX === null || e.foremanTargetY === null) {
      samplePlayerTarget(e, player);
    }

    // 落下中・着地スタン中はハンマーロックを解除して待機
    if (e.mode === 'abnormal_fall' || e.mode === 'fall' || e.stunFrames > 0) {
      e.foremanLockedTarget = null;
      return;
    }

    // 1. ハンマー前停止フェーズ（spot_pause）
    if (e.foremanPhase === 'spot_pause') {
      if (e.pauseFrames <= 0) {
        const target = e.foremanLockedTarget || findBreakableTargetCell(stage, e, player);
        if (target && isBreakableTargetId(stage.idAt(target.col, target.row))) {
          swingForemanHammer(e, target, game);
          e.foremanLockedTarget = target;
          e.foremanPhase = 'swing_wait';
          e.pauseFrames = C.FOREMAN_SWING_INTERVAL_FRAMES;
          return;
        }
        resumeAfterHammer(e, game);
      }
      return;
    }

    // 2. ハンマー連続振り待機フェーズ（swing_wait）
    if (e.foremanPhase === 'swing_wait') {
      if (e.pauseFrames <= 0) {
        const locked = e.foremanLockedTarget;
        const target = (locked && isBreakableTargetId(stage.idAt(locked.col, locked.row)))
          ? locked
          : findBreakableTargetCell(stage, e, player);
        if (player && target) {
          const d = playerDelta(e, player);
          if (d.dx <= C.FOREMAN_SWING_X_RANGE && d.dy <= C.FOREMAN_SWING_Y_RANGE) {
            swingForemanHammer(e, target, game);
            e.foremanLockedTarget = target;
            e.foremanPhase = 'swing_wait';
            e.pauseFrames = C.FOREMAN_SWING_INTERVAL_FRAMES;
            return;
          }
        }
        resumeAfterHammer(e, game);
      }
      return;
    }

    // 3. プレイヤー＋破壊可能オブジェクト（壁・壊せる梯子）の同位置ロック判定
    if (player) {
      const d = playerDelta(e, player);
      if (d.dx <= C.FOREMAN_ALIGN_X_RANGE && d.dy <= C.FOREMAN_ALIGN_Y_RANGE) {
        const target = findBreakableTargetCell(stage, e, player);
        if (target) {
          e.foremanLockedTarget = target;
          e.foremanPhase = 'spot_pause';
          e.pauseFrames = rollSpotFrames(game);
          return;
        }
      }
    }

    // 4. 間欠サンプリング（思考タイマー）のカウントダウン
    if (e.foremanThinkTimer > 0) {
      e.foremanThinkTimer--;
    }
    if (e.foremanThinkTimer <= 0) {
      samplePlayerTarget(e, player);
      if (e.mode === 'ground') {
        const next = decideGroundAction(stage, e);
        if (next.dirY !== 0) {
          RK.Enemy.triggerAI(e, 'cell_center', game);
        } else {
          e.dirX = next.dirX;
          if (next.dirX !== 0) e.facing = next.dirX;
        }
      }
    }

    // 5. ハシゴモード中の高さ合わせ
    if (e.mode === 'ladder') {
      updateLadderTracking(stage, e);
    }
  }

  /** イベント駆動の方向判断 */
  function decide(e, event, game) {
    const stage = game.stage;
    const player = game.player;

    // スポーン時・スタン終了時・画面端ループ通過時は即座に目標座標を取得
    if (event === 'spawn' || event === 'stun_end' || event === 'screen_wrap') {
      samplePlayerTarget(e, player);
      return decideGroundAction(stage, e);
    }

    // 通常落下着地時は targetX = 0 にリセットされるため、樽の有無に関わらず左へ進む
    if (event === 'land') {
      e.foremanTargetX = 0;
      e.foremanTargetY = e.y;
      e.foremanThinkTimer = C.FOREMAN_THINK_FRAMES;
      e.foremanLadderWobble = 0;
      return decideGroundAction(stage, e);
    }

    // 樽にぶつかったときは反転せず立ち止まる
    if (event === 'blocked') {
      e.needsReeval = false;
      return { dirX: 0, dirY: 0 };
    }

    // ハシゴ上の節目イベント（床高さ到達・ハシゴ上下端到達）
    if (event === 'ladder_floor') {
      // 行き止まりハシゴのてっぺんに着いたら1段降りる
      if (isAtLadderDeadEnd(stage, e)) {
        if (RK.ChaserAI && RK.ChaserAI.canClimbDownAt && RK.ChaserAI.canClimbDownAt(stage, e.ladderCol, e.y)) {
          return { dirX: 0, dirY: 1 };
        }
      }

      const span = RK.Physics.ladderSpan(stage, e.ladderCol, e.dirY > 0 ? e.y + 1 : e.y) ||
        RK.Physics.ladderSpan(stage, e.ladderCol, e.y);
      const atBottomEnd = !!span && e.y >= span.bottom && e.dirY > 0;
      const targetY = e.foremanTargetY !== null ? e.foremanTargetY : e.y;

      // ハシゴ下端に突き当たった場合
      if (atBottomEnd && RK.Physics.isSupported(stage, e.x, e.y, e.w)) {
        const isHorizontal = (e.y === targetY);
        const atTargetX = e.foremanTargetX !== null &&
          Math.abs(e.foremanTargetX - e.x) <= C.FOREMAN_ARRIVE_TOLERANCE;
        if (isHorizontal || atTargetX) {
          // プレイヤーと水平、または目標X到達済みで下端に着地したときはその場で一拍静止する
          e.foremanThinkTimer = C.FOREMAN_THINK_FRAMES;
          e.needsReeval = false;
          return { dirX: 0, dirY: 0 };
        }
        return decideGroundAction(stage, e);
      }

      // ハシゴの途中で床の高さに到達し、目標Yと一致していれば止まらず横へ歩き出す
      if (Math.abs(targetY - e.y) <= 1 && RK.Physics.isSupported(stage, e.x, e.y, e.w)) {
        return decideGroundAction(stage, e);
      }

      return null;
    }

    // 地上歩行中のセル中心到達（記憶済みの目標座標に従ってハシゴ乗降や到着停止を判定）
    if (event === 'cell_center') {
      return decideGroundAction(stage, e);
    }

    return null;
  }

  RK.ForemanAI = Object.freeze({
    decide,
    onTick,
    samplePlayerTarget,
    isBreakableTargetId,
    findBreakableTargetCell,
  });

  if (RK.Enemy) {
    RK.Enemy.registerAI('foreman', decide);
  }
})(window);
