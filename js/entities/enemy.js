/* ===== 敵の共通土台（ステップ8b-4） =====
 * 座標系・地形判定・落下状態はプレイヤーと共通（中心x + 足y、整数ドット）。
 * AI（方向転換・梯子選択）は「グリッドの節目（イベント）」および親方のtickフックで呼び出す:
 *   - 'spawn'        : スポーン直後
 *   - 'cell_center'  : 地上歩行中にセルの中心（x === stage.centerX(col)）へ到達した瞬間（または再判定要求時）
 *   - 'blocked'      : 地上歩行中に障害物（樽など）で進めなくなった瞬間
 *   - 'ladder_floor' : 梯子昇降中に床の高さ（y % CELL_H === 0）または梯子端へ到達した瞬間
 *   - 'land'         : 通常落下または梯子消滅で床に着地した瞬間（スタン・速度段階上昇ともにしない）
 *   - 'stun_end'     : 着地後のスタンが終了した瞬間（異常落下後の再判定などに使用）
 *
 * 各敵種（chaser / runner / foreman / fast_chaser）の判断ロジックは registerAI(id, fn) で差し込む。
 */
(function (w) {
  const RK = (w.RK = w.RK || {});
  const C = RK.CONFIG;

  const ENEMY_IDS = ['chaser', 'runner', 'foreman', 'fast_chaser'];
  const aiRegistry = {};

  function isEnemyId(id) {
    return ENEMY_IDS.indexOf(id) >= 0;
  }

  /** 各敵種のAI関数 fn(enemy, event, game) => { dirX?, dirY? } を登録する */
  function registerAI(id, fn) {
    aiRegistry[id] = fn;
  }

  function create(stage, spawn) {
    return {
      id: spawn.id,                       // 'chaser' | 'runner' | 'foreman' | 'fast_chaser'
      x: stage.centerX(spawn.col),
      y: stage.surfaceY(spawn.row),
      w: C.ENEMY_W,
      h: C.ENEMY_H,
      facing: 1,                          // 向き: -1=左 / 1=右
      dirX: 1,                            // 現在の横移動方向: -1 / 0 / 1
      dirY: 0,                            // 現在の縦移動方向: -1(上) / 0 / 1(下)
      mode: 'ground',                     // 'ground' | 'fall' | 'abnormal_fall' | 'ladder'
      ladderCol: -1,                      // 'ladder' 中に乗っている梯子の列
      stunFrames: 0,                      // スタン残りtick
      wasAbnormalFall: false,             // 直前の落下が異常落下だったか（スタン終了時の再判定用）
      invincible: false,                  // 無敵状態（'abnormal_fall' 中のみ true）
      speedBoost: 0,                      // 異常落下経験による速度上昇段階（0〜2。親方は未使用）
      moveAccum: 0,                       // サブピクセル移動累積（整数ドット移動を決定的に維持）
      climbAccum: 0,                      // サブピクセル梯子昇降累積（整数ドット移動を決定的に維持）
      needsReeval: false,                 // 再判定フラグ（梯子付近の停止・循環時・親方の方向転換トリガー時）
      runnerVertical: null,               // Runner用: 縦移動の優先方向（null=未決定 / -1=上 / 1=下）
      horizontalNext: false,              // Runner用: 縦移動直後は横移動を最優先するフラグ
      hammerFrames: 0,                    // 親方のハンマー表示残りtick
      pauseFrames: 0,                     // 親方の行動切替停止残りtick
      foremanPhase: 'patrol',             // 親方用: 'patrol' | 'periodic_pause' | 'spot_pause' | 'swing_wait'
      foremanWalkTimer: 0,                // 親方用: 次の定期立ち止まりまでの移動残りtick（4〜6s）
      foremanCheckTick: 0,                // 親方用: 荒い接近・高さ合わせチェックカウンタ（0..3）
    };
  }

  /** 現在の移動速度（ドット/tick） */
  function currentSpeed(e) {
    if (e.id === 'foreman') return C.FOREMAN_SPEED !== undefined ? C.FOREMAN_SPEED : 1.1;
    let base = C.ENEMY_SPEED;
    if (e.id === 'fast_chaser') base = C.FAST_CHASER_SPEED;
    else if (e.id === 'runner') base = C.RUNNER_SPEED;
    return base + e.speedBoost * (C.ENEMY_SPEED_BOOST_STEP || 0);
  }

  /** 現在の梯子昇降速度（ドット/tick。上下共通、キャラ個別） */
  function currentClimbSpeed(e) {
    if (e.id === 'runner' && C.RUNNER_CLIMB_SPEED !== undefined) return C.RUNNER_CLIMB_SPEED;
    if (e.id === 'foreman' && C.FOREMAN_CLIMB_SPEED !== undefined) return C.FOREMAN_CLIMB_SPEED;
    if (e.id === 'fast_chaser' && C.FAST_CHASER_CLIMB_SPEED !== undefined) return C.FAST_CHASER_CLIMB_SPEED;
    return C.ENEMY_CLIMB_SPEED;
  }

  /** 通常落下開始 */
  function startFall(e) {
    e.mode = 'fall';
    e.wasAbnormalFall = false;
    e.ladderCol = -1;
    e.climbAccum = 0;
    e.dirY = 0;
  }

  /** 異常落下開始（梯子破壊・壁破壊・爆発など）。落下中は無敵 */
  function startAbnormalFall(e) {
    e.mode = 'abnormal_fall';
    e.wasAbnormalFall = true;
    e.invincible = true;
    e.ladderCol = -1;
    e.climbAccum = 0;
    e.dirY = 0;
    e.stunFrames = 0;
    e.pauseFrames = 0;
    if (e.id === 'foreman') {
      e.foremanPhase = 'patrol';
    }
  }

  /** 梯子に乗る（x を梯子中心へスナップ） */
  function boardLadder(e, stage, col, dirY) {
    e.mode = 'ladder';
    e.ladderCol = col;
    e.climbAccum = 0;
    e.x = stage.centerX(col);
    e.dirX = 0;
    e.dirY = dirY;
  }

  /** AI判断結果 { dirX, dirY } を敵の状態へ反映する */
  function applyDecision(e, decision, game) {
    if (!decision) return;
    const stage = game.stage;

    if (decision.dirY !== undefined && decision.dirY !== 0) {
      const dy = decision.dirY > 0 ? 1 : -1;
      const col = e.mode === 'ladder' ? e.ladderCol : stage.wrapCol(stage.colAt(e.x));
      const checkY = dy < 0 ? e.y : e.y + 1;
      const span = RK.Physics.ladderSpan(stage, col, checkY);
      if (span && ((dy < 0 && e.y > span.top) || (dy > 0 && e.y < span.bottom))) {
        boardLadder(e, stage, col, dy);
        return;
      }
    }

    if (decision.dirX !== undefined) {
      const dx = decision.dirX === 0 ? 0 : (decision.dirX > 0 ? 1 : -1);
      if (e.mode === 'ladder') {
        if (RK.Physics.isSupported(stage, e.x, e.y, e.w)) {
          e.mode = 'ground';
          e.ladderCol = -1;
          e.climbAccum = 0;
          e.dirY = 0;
          e.dirX = dx;
          if (dx !== 0) e.facing = dx;
        }
      } else {
        e.dirX = dx;
        e.dirY = 0;
        if (dx !== 0) e.facing = dx;
      }
    }
  }

  /** デフォルトAI（個別AI未登録時の仮挙動：横直進、障害物で反転） */
  function defaultDecide(e, event) {
    if (event === 'blocked') {
      return { dirX: -(e.facing || 1), dirY: 0 };
    }
    if (e.dirX === 0) {
      return { dirX: e.facing || 1, dirY: 0 };
    }
    return null;
  }

  /** 個別AIが実装済みの敵種 */
  const IMPLEMENTED_AI = ['chaser', 'runner', 'foreman', 'fast_chaser'];
  const warnedMissingAI = {};

  /** グリッドの節目（イベント）でAIを呼び出す */
  function triggerAI(e, event, game) {
    let fn = aiRegistry[e.id];
    if (!fn) {
      if (IMPLEMENTED_AI.indexOf(e.id) >= 0 && !warnedMissingAI[e.id] && typeof console !== 'undefined') {
        warnedMissingAI[e.id] = true;
        console.warn('[RK] ' + e.id + ' のAIが未登録のため仮AI（直進のみ）で動きます。index.html の読み込み順を確認してください。');
      }
      fn = defaultDecide;
    }
    const decision = fn(e, event, game);
    applyDecision(e, decision, game);
  }

  /** 地上での1tick更新 */
  function updateGround(e, game) {
    const stage = game.stage;
    if (!RK.Physics.isSupported(stage, e.x, e.y, e.w)) {
      startFall(e);
      return;
    }
    if (e.stunFrames > 0 || e.pauseFrames > 0) return;

    if (e.dirX === 0) {
      if (e.needsReeval) {
        triggerAI(e, 'cell_center', game);
      }
      return;
    }

    e.moveAccum += currentSpeed(e);
    const steps = Math.floor(e.moveAccum + 1e-9);
    e.moveAccum -= steps;

    for (let i = 0; i < steps; i++) {
      if (e.mode !== 'ground' || e.dirX === 0 || e.pauseFrames > 0) break;
      const dir = e.dirX > 0 ? 1 : -1;
      e.facing = dir;
      const nx = e.x + dir;

      if (RK.Physics.blockedX(stage, nx, e.y, e.w, e.h, dir)) {
        triggerAI(e, 'blocked', game);
        break;
      }

      e.x = RK.Physics.wrapX(nx);

      const col = stage.colAt(e.x);
      if (e.x === stage.centerX(col)) {
        const prevDirX = e.dirX;
        triggerAI(e, 'cell_center', game);
        if (e.mode !== 'ground' || e.dirX !== prevDirX || e.pauseFrames > 0) break;
      }

      if (!RK.Physics.isSupported(stage, e.x, e.y, e.w)) {
        startFall(e);
        break;
      }
    }
  }

  /** 梯子上での1tick更新 */
  function updateLadder(e, game) {
    const stage = game.stage;
    const checkY = e.dirY > 0 ? e.y + 1 : e.y;
    const span = RK.Physics.ladderSpan(stage, e.ladderCol, checkY) || RK.Physics.ladderSpan(stage, e.ladderCol, e.y);
    if (!span) {
      startAbnormalFall(e);
      return;
    }
    if (e.stunFrames > 0 || e.pauseFrames > 0) return;

    // 親方がハシゴ上でプレイヤー高さにピタッと合わせて停止中（dirY === 0）の場合
    if (e.dirY === 0) {
      e.climbAccum = 0;
      return;
    }

    e.climbAccum += currentClimbSpeed(e);
    const steps = Math.floor(e.climbAccum + 1e-9);
    e.climbAccum -= steps;

    for (let i = 0; i < steps; i++) {
      if (e.mode !== 'ladder' || e.dirY === 0 || e.pauseFrames > 0) break;
      const dy = e.dirY > 0 ? 1 : -1;
      const ny = Math.min(Math.max(e.y + dy, span.top), span.bottom);

      if (ny === e.y) {
        triggerAI(e, 'ladder_floor', game);
        if (e.mode === 'ladder' && RK.Physics.isSupported(stage, e.x, e.y, e.w)) {
          e.mode = 'ground';
          e.ladderCol = -1;
          e.climbAccum = 0;
          e.dirY = 0;
          e.dirX = e.facing || 1;
        }
        break;
      }

      e.y = ny;
      e.x = stage.centerX(e.ladderCol);

      if (e.y % C.CELL_H === 0) {
        const prevDirY = e.dirY;
        triggerAI(e, 'ladder_floor', game);
        if (e.mode !== 'ladder' || e.dirY !== prevDirY || e.pauseFrames > 0) break;
      }
    }
  }

  /** 通常落下の1tick更新 */
  function updateFall(e, game) {
    const r = RK.Physics.fallTo(game.stage, e.x, e.w, e.y, C.ENEMY_FALL_SPEED);
    e.y = r.y;
    if (r.landed) {
      e.mode = 'ground';
      e.wasAbnormalFall = false;
      triggerAI(e, 'land', game);
    }
  }

  /** 異常落下の1tick更新 */
  function updateAbnormalFall(e, game) {
    e.invincible = true;
    const r = RK.Physics.abnormalFallTo(game.stage, e.x, e.w, e.y, C.ENEMY_FALL_SPEED);
    e.y = r.y;
    if (r.landed) {
      e.mode = 'ground';
      e.invincible = false;
      if (e.id === 'foreman') {
        // 親方は加速せず、プレイヤーと同じ時間だけ異常落下スタンする
        e.stunFrames = C.PLAYER_ABNORMAL_LAND_STUN_FRAMES;
      } else {
        e.stunFrames = C.ENEMY_ABNORMAL_LAND_STUN_FRAMES;
        e.speedBoost = Math.min(2, e.speedBoost + 1);
      }
    }
  }

  /** 1tick 進める */
  function update(e, game) {
    if (e.hammerFrames > 0) e.hammerFrames--;
    if (e.pauseFrames > 0) e.pauseFrames--;

    if (e.stunFrames > 0) {
      e.stunFrames--;
      if (e.stunFrames === 0) {
        triggerAI(e, 'stun_end', game);
        e.wasAbnormalFall = false;
      }
    }

    // 親方専用のtickフック（定期立ち止まり・接近停止・ハンマー振り・ハシゴ生座標高さ合わせ）
    if (e.id === 'foreman' && RK.ForemanAI && RK.ForemanAI.onTick) {
      RK.ForemanAI.onTick(e, game);
    }

    e.invincible = (e.mode === 'abnormal_fall');

    if (e.mode === 'abnormal_fall') {
      updateAbnormalFall(e, game);
    } else if (e.mode === 'fall') {
      updateFall(e, game);
    } else if (e.mode === 'ladder') {
      updateLadder(e, game);
    } else {
      updateGround(e, game);
    }
  }

  RK.Enemy = Object.freeze({
    ENEMY_IDS,
    isEnemyId,
    registerAI,
    create,
    update,
    startFall,
    startAbnormalFall,
    triggerAI,
  });
})(window);
