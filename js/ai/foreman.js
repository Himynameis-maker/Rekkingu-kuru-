/* ===== 親方（Foreman）行動アルゴリズム（原作6502思考統合・刷新版） =====
 * 1. 既存のランダム巡回タイマー（4〜6s歩行→小休止）は廃止。
 * 2. 原作 $D125 準拠: 2tick周期でプレイヤー位置を再評価して追尾する。
 * 3. 原作 $D181-$D1E9 準拠:
 *    - 同じ段でプレイヤーとX位置が重なると、足を止めて様子見（約1.0s）をする。
 *    - 様子見中にプレイヤーが向きを変えると警戒して待機を少し延長する。
 *    - ハシゴ上でプレイヤーと並んだときは生のY座標に合わせようとし、数ドット上下に揺れてから止まる。
 * 4. 原作 $D296 準拠（ハンマー発動条件）:
 *    - 親方とプレイヤーが同じグリッド（または境界隣接1列）におり、
 *      そこに壊せる壁（wall_a / wall_b / wall_c）または壊せる梯子（ladder）があるときのみハンマーを振る。
 *    - プレイヤーがいない場所の壁・梯子は壊さない。扉・爆弾・鉄柱・不可梯子も壊さない。
 */
(function (w) {
  const RK = (w.RK = w.RK || {});
  const C = RK.CONFIG;

  /** 親方がハンマーで壊せる対象か（壁3種または壊せる梯子のみ） */
  function isBreakableTargetId(id) {
    return id === 'wall_a' || id === 'wall_b' || id === 'wall_c' || id === 'ladder';
  }

  /** プレイヤーの現在向き（-1 | 0 | 1） */
  function getPlayerFacing(player) {
    if (!player) return 0;
    return player.facing || player.dirX || 0;
  }

  /**
   * 親方がハンマーを振れる対象セルを返す（無ければ null）。
   * 原作 $D296 (CPY $030F) 準拠: プレイヤーと親方が同じセル（または境界1列ズレ）にいて、
   * そこに壊せる壁・壊せる梯子がある場合のみ対象とする。
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

  /** ハンマーを1回振り下ろす */
  function swingForemanHammer(e, target, game) {
    e.hammerFrames = C.HAMMER_FRAMES;
    if (RK.Game && RK.Game.hitCellByHammer) {
      RK.Game.hitCellByHammer(game, e, target.col, target.row);
    } else {
      game.stage.damageCell(target.col, target.row, 1);
    }
  }

  /** 待機を解除して追跡を再開する */
  function resumeTracking(e, game) {
    e.foremanPhase = 'chase';
    e.foremanLockedTarget = null;
    e.pauseFrames = 0;
    e.needsReeval = true;
    RK.Enemy.triggerAI(e, 'spawn', game);
  }

  /** 毎tick呼ばれる親方固有の状態進行 */
  function onTick(e, game) {
    const stage = game.stage;
    const player = game.player;

    // 異常落下中・通常落下中・着地スタン中はロックを解除して待機
    if (e.mode === 'abnormal_fall' || e.mode === 'fall' || e.stunFrames > 0) {
      e.foremanLockedTarget = null;
      e.foremanPhase = 'chase';
      return;
    }

    // 1A. 同段・同X列でのピタッと停止＆様子見（原作 $D181-$D1E9 準拠）
    if (e.foremanPhase === 'align_pause') {
      if (!player) {
        resumeTracking(e, game);
        return;
      }

      // 様子見中にプレイヤーが壊せる壁・梯子に入った場合は即ハンマー構えへ移行
      const target = findBreakableTargetCell(stage, e, player);
      if (target) {
        e.foremanLockedTarget = target;
        e.foremanPhase = 'spot_pause';
        e.pauseFrames = C.FOREMAN_SPOT_FRAMES;
        return;
      }

      const d = playerDelta(e, player);
      const sameRow = stage.rowAtFeet(e.y) === stage.rowAtFeet(player.y);

      // プレイヤーが別の段へ移動した or 横に離れたら即追跡再開
      if (!sameRow || d.dx > C.FOREMAN_ALIGN_X_RANGE) {
        e.foremanAlignCooldown = C.FOREMAN_ALIGN_COOLDOWN_FRAMES;
        resumeTracking(e, game);
        return;
      }

      // 様子見中にプレイヤーが左右の向きを変えたら警戒して待機を延長（原作のフェイント反応）
      const curPFacing = getPlayerFacing(player);
      if (curPFacing !== 0 && e.foremanLastPlayerFacing !== 0 && curPFacing !== e.foremanLastPlayerFacing) {
        e.pauseFrames = Math.min(C.FOREMAN_ALIGN_PAUSE_FRAMES, e.pauseFrames + C.FOREMAN_FEINT_EXTEND_FRAMES);
      }
      if (curPFacing !== 0) {
        e.foremanLastPlayerFacing = curPFacing;
      }

      if (e.pauseFrames <= 0) {
        e.foremanAlignCooldown = C.FOREMAN_ALIGN_COOLDOWN_FRAMES;
        resumeTracking(e, game);
      }
      return;
    }

    // 1B. ハンマー前の構え停止（spot_pause）
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
        resumeTracking(e, game);
      }
      return;
    }

    // 1C. ハンマー連続振り待機（swing_wait）
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
        resumeTracking(e, game);
      }
      return;
    }

    // === 以下 chase（通常追跡中） ===
    if (e.foremanAlignCooldown > 0) {
      e.foremanAlignCooldown--;
    }
    if (e.foremanTurnCooldown > 0) {
      e.foremanTurnCooldown--;
    }

    if (!player) return;

    const d = playerDelta(e, player);
    const sameRow = stage.rowAtFeet(e.y) === stage.rowAtFeet(player.y);

    // 2. プレイヤーと同じ位置に壊せる壁・壊せる梯子がある場合のハンマー構え（最優先）
    if (d.dx <= C.FOREMAN_ALIGN_X_RANGE && d.dy <= C.FOREMAN_ALIGN_Y_RANGE) {
      const target = findBreakableTargetCell(stage, e, player);
      if (target) {
        e.foremanLockedTarget = target;
        e.foremanPhase = 'spot_pause';
        e.pauseFrames = C.FOREMAN_SPOT_FRAMES;
        return;
      }
    }

    // 3. 同段・同X列到達時のピタッと停止＆様子見（原作 $D181 準拠）
    if (sameRow && e.mode !== 'ladder' && e.foremanAlignCooldown <= 0 && d.dx <= C.FOREMAN_ALIGN_X_RANGE) {
      e.foremanPhase = 'align_pause';
      e.pauseFrames = C.FOREMAN_ALIGN_PAUSE_FRAMES;
      e.foremanLastPlayerFacing = getPlayerFacing(player);
      return;
    }

    // 4. 2tick周期のリアルタイム思考（原作 $D125 準拠）
    e.foremanCheckTick = ((e.foremanCheckTick || 0) + 1) % C.FOREMAN_CHECK_INTERVAL;
    if (e.foremanCheckTick === 0) {
      if (e.mode === 'ladder') {
        // ハシゴ上でプレイヤーと同じ列（または横1セル以内）なら生のY座標に合わせる（数ドット上下に揺れて停止）
        const pCol = stage.wrapCol(stage.colAt(player.x));
        if (pCol === e.ladderCol || d.dx <= C.CELL_W) {
          const diffY = player.y - e.y;
          e.dirY = Math.abs(diffY) <= 2 ? 0 : (diffY < 0 ? -1 : 1);
        }
      } else if (e.foremanTurnCooldown <= 0) {
        // 平地でもプレイヤーの移動に合わせてリアルタイムに方向再評価
        const prevDirX = e.dirX;
        RK.Enemy.triggerAI(e, 'spawn', game);
        if (e.dirX !== prevDirX) {
          e.foremanTurnCooldown = C.FOREMAN_TURN_COOLDOWN_FRAMES;
        }
      }
    }
  }

  /** イベント駆動の方向判断 */
  function decide(e, event, game) {
    if (event === 'spawn') {
      e.foremanPhase = e.foremanPhase || 'chase';
      e.foremanAlignCooldown = e.foremanAlignCooldown || 0;
      e.foremanTurnCooldown = e.foremanTurnCooldown || 0;
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
