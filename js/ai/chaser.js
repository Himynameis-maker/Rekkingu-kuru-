/* ===== チェイサー / ファストチェイサー 行動アルゴリズム（ステップ8b-2） =====
 * 仕様書 §1〜§13 に基づく決定的な追跡AI。
 *   - chaser と fast_chaser は同一の判断ロジックを共有し、速度パラメータのみ異なる。
 *   - 毎フレーム再判定せず、以下のイベント時のみ判断を行う:
 *       1. 'spawn'        : ゲーム開始時
 *       2. 'land'         : 通常落下後の着地時
 *       3. 'cell_center'  : 梯子のマス / 梯子の直上のマスに到達時（または needsReeval フラグ時）
 *       4. 'ladder_floor' : 梯子昇降中に床の高さへ到達時
 *       5. 'stun_end'     : 異常落下後のスタン終了時
 *       6. 'blocked'      : 進行方向の障害物にぶつかった時
 */
(function (w) {
  const RK = (w.RK = w.RK || {});
  const C = RK.CONFIG;

  function isLadderId(id) {
    return id === 'ladder' || id === 'ladder_solid';
  }

  /** 地上から横方向 dir (-1 | 1) へ1ドット移動可能か */
  function canStepHorizontal(stage, e, dir) {
    if (!dir) return false;
    const nx = RK.Physics.wrapX(e.x + dir);
    return !RK.Physics.blockedX(stage, nx, e.y, e.w, e.h, dir);
  }

  /** 現在位置が「梯子のマス」または「梯子の直上のマス」か */
  function isAtLadderTriggerCell(stage, col, y) {
    const row = stage.rowAtFeet(y);
    if (stage.inBounds(col, row) && isLadderId(stage.idAt(col, row))) return true;
    const rowBelow = stage.rowAtFeet(y + 1);
    if (stage.inBounds(col, rowBelow) && isLadderId(stage.idAt(col, rowBelow))) return true;
    return false;
  }

  /** 列 col の足場高さ y から上へ登り、上の足場へ接続している有効な梯子か */
  function canClimbUpAt(stage, col, y, bw) {
    if (y % C.CELL_H !== 0) return false;
    const row = stage.rowAtFeet(y);
    if (!stage.inBounds(col, row) || !isLadderId(stage.idAt(col, row))) return false;
    const span = RK.Physics.ladderSpan(stage, col, y);
    if (!span || span.top > y - C.CELL_H) return false;

    // 1段上〜上端のいずれかの床高さで、上の床へ乗れるか横に出られる足場が存在するか
    const lCol = stage.wrapCol(col - 1);
    const rCol = stage.wrapCol(col + 1);
    for (let fy = y - C.CELL_H; fy >= span.top; fy -= C.CELL_H) {
      const topRow = stage.rowAtFeet(fy);
      if (stage.inBounds(col, topRow) && stage.hasFloor(col, topRow)) return true;
      if (RK.Physics.isSupported(stage, stage.centerX(lCol), fy, bw)) return true;
      if (RK.Physics.isSupported(stage, stage.centerX(rCol), fy, bw)) return true;
    }
    return false;
  }

  /** 列 col の足場高さ y から下へ降り、下の足場へ接続している有効な梯子か */
  function canClimbDownAt(stage, col, y, bw) {
    if (y % C.CELL_H !== 0) return false;
    const rowBelow = stage.rowAtFeet(y + 1);
    if (!stage.inBounds(col, rowBelow) || !isLadderId(stage.idAt(col, rowBelow))) return false;
    const span = RK.Physics.ladderSpan(stage, col, y + 1);
    if (!span || span.bottom < y + C.CELL_H) return false;

    // 1段下〜下端のいずれかの床高さで、降りて立てる足場が存在するか
    const lCol = stage.wrapCol(col - 1);
    const rCol = stage.wrapCol(col + 1);
    for (let fy = y + C.CELL_H; fy <= span.bottom; fy += C.CELL_H) {
      if (RK.Physics.isSupported(stage, stage.centerX(col), fy, bw)) return true;
      if (RK.Physics.isSupported(stage, stage.centerX(lCol), fy, bw)) return true;
      if (RK.Physics.isSupported(stage, stage.centerX(rCol), fy, bw)) return true;
    }
    return false;
  }

  /** 同じ高さの行で、チェイサーとプレイヤーの間に樽が存在するか（画面端ループなし） */
  function hasBarrelBetween(stage, row, x1, x2) {
    if (!stage.inBounds(0, row) || x1 === x2) return false;
    const minX = Math.min(x1, x2);
    const maxX = Math.max(x1, x2);
    for (let c = 0; c < stage.cols; c++) {
      if (stage.idAt(c, row) !== 'barrel') continue;
      const cx = stage.centerX(c);
      if (cx > minX && cx < maxX) return true;
    }
    return false;
  }

  /** 同じ高さの行で、チェイサーの左側（画面端ループなし）に樽が存在するか */
  function hasBarrelOnLeft(stage, row, ex) {
    if (!stage.inBounds(0, row)) return false;
    for (let c = 0; c < stage.cols; c++) {
      if (stage.idAt(c, row) !== 'barrel') continue;
      if (stage.centerX(c) < ex) return true;
    }
    return false;
  }

  /**
   * 現在の高さ y において、チェイサーから水平移動（画面端ループあり）で到達可能な列を走査する。
   * 穴に落ちるか樽に阻まれた時点でその方向の走査を打ち切る。
   */
  function findReachableCols(stage, e) {
    const startCol = stage.wrapCol(stage.colAt(e.x));
    const rightCols = new Set([startCol]);
    const leftCols = new Set([startCol]);

    // 右方向 (+1) 走査
    let cx = e.x;
    for (let step = 0; step < stage.cols; step++) {
      const curCol = stage.wrapCol(stage.colAt(cx));
      const nextCol = stage.wrapCol(curCol + 1);
      const targetX = stage.centerX(nextCol);
      let blocked = false;
      while (cx !== targetX) {
        const nx = RK.Physics.wrapX(cx + 1);
        if (RK.Physics.blockedX(stage, nx, e.y, e.w, e.h, 1)) {
          blocked = true;
          break;
        }
        cx = nx;
      }
      if (blocked) break;

      // 次の列の中心が下り梯子の直上なら到達可能（穴の上の梯子）
      if (canClimbDownAt(stage, nextCol, e.y, e.w)) {
        rightCols.add(nextCol);
      }
      if (!RK.Physics.isSupported(stage, cx, e.y, e.w)) break;
      rightCols.add(nextCol);
    }

    // 左方向 (-1) 走査
    cx = e.x;
    for (let step = 0; step < stage.cols; step++) {
      const curCol = stage.wrapCol(stage.colAt(cx));
      const nextCol = stage.wrapCol(curCol - 1);
      const targetX = stage.centerX(nextCol);
      let blocked = false;
      while (cx !== targetX) {
        const nx = RK.Physics.wrapX(cx - 1);
        if (RK.Physics.blockedX(stage, nx, e.y, e.w, e.h, -1)) {
          blocked = true;
          break;
        }
        cx = nx;
      }
      if (blocked) break;

      if (canClimbDownAt(stage, nextCol, e.y, e.w)) {
        leftCols.add(nextCol);
      }
      if (!RK.Physics.isSupported(stage, cx, e.y, e.w)) break;
      leftCols.add(nextCol);
    }

    return { rightCols, leftCols };
  }

  /**
   * プレイヤーと異なる高さにいるときの有効な梯子候補を検索し、
   * 距離最短（画面端ループ考慮なし、同距離なら左側優先）の梯子とそこへ向かう横方向を返す。
   */
  function selectTargetLadder(stage, e, needUp) {
    const { rightCols, leftCols } = findReachableCols(stage, e);
    let best = null;

    for (let c = 0; c < stage.cols; c++) {
      const canR = rightCols.has(c);
      const canL = leftCols.has(c);
      if (!canR && !canL) continue;

      const valid = needUp
        ? canClimbUpAt(stage, c, e.y, e.w)
        : canClimbDownAt(stage, c, e.y, e.w);
      if (!valid) continue;

      const tx = stage.centerX(c);
      // 距離は画面端ループを考慮せず素直な X 座標差の絶対値で比較（§4-3, §13-6）
      const dist = Math.abs(tx - e.x);

      // 最短距離優先。同距離なら左側（tx が小さい方）を優先（§4-3, §13-5）
      if (!best || dist < best.dist || (dist === best.dist && tx < best.tx)) {
        let dirX = 0;
        if (canR && canL) {
          dirX = tx < e.x ? -1 : (tx > e.x ? 1 : 0);
        } else if (canR) {
          dirX = 1;
        } else {
          dirX = -1;
        }
        best = { col: c, tx, dist, dirX };
      }
    }

    return best;
  }

  /** 横方向 dir を決定したあと、障害物チェック（§6）と梯子付近の停止処理（§7）を適用する */
  function resolveHorizontal(stage, e, desiredDir, atLadder) {
    const dir = desiredDir === 0 ? (e.facing || 1) : (desiredDir > 0 ? 1 : -1);

    if (canStepHorizontal(stage, e, dir)) {
      e.needsReeval = false;
      return { dirX: dir, dirY: 0 };
    }

    // 前方へ進めない場合は反転（§6）
    const opp = -dir;
    if (canStepHorizontal(stage, e, opp)) {
      // 梯子付近で前方に進めず反転した場合は再判定フラグを設定（§7）
      e.needsReeval = Boolean(atLadder);
      return { dirX: opp, dirY: 0 };
    }

    // 両方向とも移動できない場合はその場で停止し、再判定フラグを設定（§6, §7）
    e.needsReeval = true;
    return { dirX: 0, dirY: 0 };
  }

  /** プレイヤーと同じ高さにいるときの判断（§3） */
  function decideSameHeight(stage, e, p, atLadder) {
    let dir;
    if (p.x > e.x) dir = 1;
    else if (p.x < e.x) dir = -1;
    else dir = e.dirX !== 0 ? e.dirX : (e.facing || 1);

    // プレイヤーとの間に同じ高さの樽が存在する場合は追跡方向を反転（§3-4, §13-7）
    const row = stage.rowAtFeet(e.y);
    if (hasBarrelBetween(stage, row, e.x, p.x)) {
      dir = -dir;
    }

    return resolveHorizontal(stage, e, dir, atLadder);
  }

  /** 地上での総合的な追跡判断 */
  function evaluateGround(stage, e, p, atLadder) {
    const eRow = stage.rowAtFeet(e.y);
    const pRow = stage.rowAtFeet(p.y);

    // 1. プレイヤーと同じ高さにいる場合（§3）
    if (eRow === pRow) {
      return decideSameHeight(stage, e, p, atLadder);
    }

    // 2. プレイヤーと異なる高さにいる場合（§4）
    const needUp = p.y < e.y;
    const curCol = stage.wrapCol(stage.colAt(e.x));

    // §4-1. 現在位置から利用できる有効な梯子がある場合、その梯子を優先利用
    if (e.x === stage.centerX(curCol)) {
      if (needUp && canClimbUpAt(stage, curCol, e.y, e.w)) {
        e.needsReeval = false;
        return { dirX: 0, dirY: -1 };
      }
      if (!needUp && canClimbDownAt(stage, curCol, e.y, e.w)) {
        e.needsReeval = false;
        return { dirX: 0, dirY: 1 };
      }
    }

    // §4-2, §4-3. 到達可能な別の有効梯子を検索
    const target = selectTargetLadder(stage, e, needUp);
    if (target && target.dirX !== 0) {
      return resolveHorizontal(stage, e, target.dirX, atLadder);
    }

    // §5. 有効な梯子が存在しない場合：左側に同じ高さの樽があれば右、それ以外は左（プレイヤー位置は使わない）
    const fallbackDir = hasBarrelOnLeft(stage, eRow, e.x) ? 1 : -1;
    return resolveHorizontal(stage, e, fallbackDir, atLadder);
  }

  /** 梯子上（'ladder_floor'）での判断（§4-1） */
  function evaluateLadder(stage, e, p) {
    const eRow = stage.rowAtFeet(e.y);
    const pRow = stage.rowAtFeet(p.y);
    const checkY = e.dirY > 0 ? e.y + 1 : e.y;
    const span = RK.Physics.ladderSpan(stage, e.ladderCol, checkY) || RK.Physics.ladderSpan(stage, e.ladderCol, e.y);

    // プレイヤーと同じ高さに到達した場合、足場があれば横移動へ移行（§3）
    if (eRow === pRow && RK.Physics.isSupported(stage, e.x, e.y, e.w)) {
      return decideSameHeight(stage, e, p, true);
    }

    // まだプレイヤーと異なる高さにいる場合、現在の梯子で目標方向へ進めるなら維持（§4-1）
    if (span) {
      if (p.y < e.y && e.y > span.top) {
        return { dirX: 0, dirY: -1 };
      }
      if (p.y > e.y && e.y < span.bottom) {
        return { dirX: 0, dirY: 1 };
      }
    }

    // 梯子の端に達してそれ以上目標方向へ進めない場合、足場があれば地上判断へ切り替え
    if (RK.Physics.isSupported(stage, e.x, e.y, e.w)) {
      return evaluateGround(stage, e, p, true);
    }

    return null;
  }

  /** チェイサーAI エントリポイント */
  function decide(e, event, game) {
    const stage = game.stage;
    const p = game.player;
    if (!p) return null;

    // 梯子昇降中の床高さ到達イベント
    if (e.mode === 'ladder') {
      if (event === 'ladder_floor') {
        return evaluateLadder(stage, e, p);
      }
      return null;
    }

    // 異常落下着地直後はスタン終了（'stun_end'）まで再判定しない（§9）
    if (e.wasAbnormalFall && event !== 'stun_end') {
      return null;
    }

    // 障害物にぶつかった場合の反転・停止処理（§6, §7）
    if (event === 'blocked') {
      const col = stage.wrapCol(stage.colAt(e.x));
      const atLadder = isAtLadderTriggerCell(stage, col, e.y);
      const curDir = e.dirX !== 0 ? e.dirX : (e.facing || 1);
      return resolveHorizontal(stage, e, -curDir, atLadder);
    }

    // セル中心到達時は「梯子のマス」「梯子の直上のマス」または「再判定フラグ」がある場合のみ再判定（§2, §7）
    if (event === 'cell_center') {
      const col = stage.wrapCol(stage.colAt(e.x));
      const atLadder = isAtLadderTriggerCell(stage, col, e.y);
      if (!atLadder && !e.needsReeval) {
        return null; // プレイヤー移動・高さ変化だけでは再判定しない（不変条件2, 3）
      }
      return evaluateGround(stage, e, p, atLadder);
    }

    // ゲーム開始（'spawn'）・通常落下着地（'land'）・異常落下スタン終了（'stun_end'）
    if (event === 'spawn' || event === 'land' || (event === 'stun_end' && e.wasAbnormalFall)) {
      const col = stage.wrapCol(stage.colAt(e.x));
      const atLadder = isAtLadderTriggerCell(stage, col, e.y);
      return evaluateGround(stage, e, p, atLadder);
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
