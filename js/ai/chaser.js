/* ===== チェイサー & ファストチェイサー行動アルゴリズム（ステップ8b-2） =====
 * 仕様書 §1〜§13 に基づく決定的な追跡AI。
 *   - 毎フレーム再判定せず、節目イベント（spawn / cell_center / blocked / ladder_floor / land / stun_end）でのみ判断。
 *   - ファストチェイサー（'fast_chaser'）は移動速度パラメータのみ異なり、判断ロジックは完全共通。
 *   - 行き止まり梯子も登り、てっぺんの行き止まりに着いたら1段降りて通常アルゴリズムに戻る。
 */
(function (w) {
  const RK = (w.RK = w.RK || {});
  const C = RK.CONFIG;

  function isLadderId(id) {
    return id === 'ladder' || id === 'ladder_solid';
  }

  /** 横方向 dir (-1 | 1) へ移動可能か（樽・足場なし・梯子中の降り判定を含む） */
  function canMoveHorizontal(stage, e, dir) {
    if (!dir) return false;
    if (e.mode === 'ladder' && !RK.Physics.isSupported(stage, e.x, e.y, e.w)) {
      return false;
    }
    const nx = RK.Physics.wrapX(e.x + dir);
    return !RK.Physics.blockedX(stage, nx, e.y, e.w, e.h, dir);
  }

  /** 列 col の高さ y から上へ登れる有効な梯子か（§4-2: 接続確認。行き止まり梯子も登る） */
  function canClimbUpAt(stage, col, y) {
    if (y % C.CELL_H !== 0) return false;
    const row = stage.rowAtFeet(y);
    if (!stage.inBounds(col, row) || !isLadderId(stage.idAt(col, row))) return false;
    const span = RK.Physics.ladderSpan(stage, col, y);
    return !!span && span.top <= y - C.CELL_H;
  }

  /** 列 col の高さ y から下へ降りられる有効な梯子か（§4-2: 梯子の直上マスからの下降接続） */
  function canClimbDownAt(stage, col, y) {
    if (y % C.CELL_H !== 0) return false;
    const rowBelow = stage.rowAtFeet(y + 1);
    if (!stage.inBounds(col, rowBelow) || !isLadderId(stage.idAt(col, rowBelow))) return false;
    const span = RK.Physics.ladderSpan(stage, col, y + 1);
    return !!span && span.bottom >= y + C.CELL_H;
  }

  /** 梯子を登り切っててっぺんの行き止まり（足場がなく横に出られない）に着いたか */
  function isAtLadderDeadEnd(stage, e) {
    if (e.mode !== 'ladder' || e.dirY >= 0) return false;
    const span = RK.Physics.ladderSpan(stage, e.ladderCol, e.y);
    if (!span || e.y > span.top) return false;
    return !RK.Physics.isSupported(stage, e.x, e.y, e.w);
  }

  /** 現在列 curCol から targetCol へ同じ高さの床上で水平到達可能か（画面端ループ・樽・穴を考慮） */
  function isHorizontallyReachable(stage, curCol, targetCol, y, bw, bh) {
    if (curCol === targetCol) return true;
    for (const dir of [-1, 1]) {
      let c = curCol;
      for (let step = 0; step < C.COLS; step++) {
        const nextCol = stage.wrapCol(c + dir);
        const nx = stage.centerX(nextCol);
        if (RK.Physics.blockedX(stage, nx, y, bw, bh, dir)) break;
        c = nextCol;
        if (c === targetCol) return true;
        if (!RK.Physics.isSupported(stage, nx, y, bw)) break;
      }
    }
    return false;
  }

  /** 同じ高さ（row）で x1 と x2 の間に樽があるか（§3-4: 画面内直線範囲で判定） */
  function hasBarrelBetween(stage, row, x1, x2) {
    const c1 = stage.colAt(x1);
    const c2 = stage.colAt(x2);
    const minC = Math.min(c1, c2);
    const maxC = Math.max(c1, c2);
    for (let c = minC + 1; c < maxC; c++) {
      if (stage.idAt(c, row) === 'barrel') return true;
    }
    return false;
  }

  /** 現在位置より左側（col < curCol）の同じ高さに樽があるか（§5-1） */
  function hasBarrelOnLeft(stage, row, ex) {
    const curCol = stage.colAt(ex);
    for (let c = 0; c < curCol; c++) {
      if (stage.idAt(c, row) === 'barrel') return true;
    }
    return false;
  }

  /**
   * 異なる高さのプレイヤーを追うための目標梯子を選択する（§4）。
   * 画面端ループ距離は使わず Math.abs(e.x - ladderX) で比較し、同距離なら左側（小さい列）を優先する。
   */
  function selectTargetLadder(stage, e, needUp) {
    const curCol = stage.wrapCol(stage.colAt(e.x));
    let bestCol = -1;
    let bestDist = Infinity;

    for (let col = 0; col < C.COLS; col++) {
      const ok = needUp
        ? canClimbUpAt(stage, col, e.y)
        : canClimbDownAt(stage, col, e.y);
      if (!ok) continue;
      if (!isHorizontallyReachable(stage, curCol, col, e.y, e.w, e.h)) continue;

      const dist = Math.abs(e.x - stage.centerX(col));
      if (dist < bestDist || (dist === bestDist && col < bestCol)) {
        bestDist = dist;
        bestCol = col;
      }
    }
    return bestCol;
  }

  /** §6 障害物・行き止まり時の方向決定（進行不可なら反転、両側不可なら停止） */
  function resolveHorizontalMove(stage, e, desiredDir) {
    const dir = desiredDir || e.facing || 1;
    if (canMoveHorizontal(stage, e, dir)) {
      e.needsReeval = false;
      return { dirX: dir, dirY: 0 };
    }
    const opp = -dir;
    if (canMoveHorizontal(stage, e, opp)) {
      e.needsReeval = false;
      return { dirX: opp, dirY: 0 };
    }
    e.needsReeval = true;
    return { dirX: 0, dirY: 0 };
  }

  /** 追跡方針をフル再評価する（開始時・梯子マス到達時・梯子昇降の床到達時・着地時・スタン終了時） */
  function evaluateFull(stage, e, player) {
    if (!player) {
      return resolveHorizontalMove(stage, e, e.dirX || e.facing || 1);
    }

    const curCol = stage.wrapCol(stage.colAt(e.x));

    // §3 同じ高さにいる場合
    if (e.y === player.y) {
      if (e.x === player.x) {
        return resolveHorizontalMove(stage, e, e.dirX || e.facing || 1);
      }
      let dir = player.x > e.x ? 1 : -1;
      const row = stage.rowAtFeet(e.y);
      // §3-4 プレイヤーとの間に同じ高さの樽がある場合は反対方向へ移動
      if (hasBarrelBetween(stage, row, e.x, player.x)) {
        dir = -dir;
      }
      return resolveHorizontalMove(stage, e, dir);
    }

    // §4 異なる高さにいる場合
    const needUp = player.y < e.y;
    const targetCol = selectTargetLadder(stage, e, needUp);

    if (targetCol >= 0) {
      if (targetCol === curCol) {
        const dy = needUp ? -1 : 1;
        e.needsReeval = false;
        return { dirX: 0, dirY: dy };
      }

      const desiredDir = targetCol > curCol ? 1 : -1;
      // §7 梯子付近での循環防止（目標梯子方向へ進めず、反対方向も塞がれている／梯子へ戻される場合）
      if (!canMoveHorizontal(stage, e, desiredDir)) {
        const opp = -desiredDir;
        if (!canMoveHorizontal(stage, e, opp)) {
          e.needsReeval = true;
          return { dirX: 0, dirY: 0 };
        }
        // 梯子の直横から離れようとしてすぐ引き戻される循環の検知
        if (Math.abs(targetCol - curCol) === 1) {
          e.needsReeval = true;
          return { dirX: 0, dirY: 0 };
        }
        e.needsReeval = false;
        return { dirX: opp, dirY: 0 };
      }

      e.needsReeval = false;
      return { dirX: desiredDir, dirY: 0 };
    }

    // §5 有効な梯子がない場合: 左側に同じ高さの樽があれば右へ、なければ左へ
    const row = stage.rowAtFeet(e.y);
    const fallbackDir = hasBarrelOnLeft(stage, row, e.x) ? 1 : -1;
    return resolveHorizontalMove(stage, e, fallbackDir);
  }

  /** チェイサーAI エントリポイント（イベント駆動） */
  function decide(e, event, game) {
    const stage = game.stage;
    const player = game.player;

    // 梯子の行き止まりに着いた場合: 1段降り、到着後に通常アルゴリズムへ戻る
    if (event === 'ladder_floor' && isAtLadderDeadEnd(stage, e)) {
      if (canClimbDownAt(stage, e.ladderCol, e.y)) {
        e.needsReeval = false;
        return { dirX: 0, dirY: 1 };
      }
    }

    // §2-1 / §8 / §9 フル再判定が必要なイベント
    if (event === 'spawn' || event === 'ladder_floor' || event === 'land' || event === 'stun_end') {
      return evaluateFull(stage, e, player);
    }

    // §6 障害物にぶつかった場合: 反対方向へ反転（両方不可なら停止）
    if (event === 'blocked') {
      const curDir = e.dirX || e.facing || 1;
      return resolveHorizontalMove(stage, e, -curDir);
    }

    // §2-2 / §2-3 セル中心到達時:
    // 平地歩行中はプレイヤーの位置・高さが変化していても再判定せず、梯子のマス／直上マスに到達したときのみ再判定
    if (event === 'cell_center') {
      if (e.needsReeval) {
        return evaluateFull(stage, e, player);
      }
      const col = stage.wrapCol(stage.colAt(e.x));
      if (canClimbUpAt(stage, col, e.y) || canClimbDownAt(stage, col, e.y)) {
        return evaluateFull(stage, e, player);
      }
      return null;
    }

    return null;
  }

  RK.ChaserAI = Object.freeze({
    decide,
    canClimbUpAt,
    canClimbDownAt,
    hasBarrelBetween,
    hasBarrelOnLeft,
    selectTargetLadder,
  });

  if (RK.Enemy) {
    RK.Enemy.registerAI('chaser', decide);
    RK.Enemy.registerAI('fast_chaser', decide);
  }
})(window);
