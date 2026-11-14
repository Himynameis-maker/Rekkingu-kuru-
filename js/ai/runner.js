/* ===== ランナー行動アルゴリズム（ステップ8b-3） =====
 * 仕様書 §1〜§13 に基づく決定的な巡回AI。
 *   - プレイヤーの位置・方向・高さを一切使用しない。
 *   - 優先順位:
 *       1. 縦移動直後の横移動優先処理（horizontalNext === true のとき横移動を最優先）
 *       2. 梯子を使った上下移動（初回は下優先、以後は runnerVertical を優先し不可なら反転）
 *       3. 梯子が使えない場合の横移動（現在方向 → 障害物等で不可なら反転）
 *       4. 移動できる方向がない場合は停止
 *   - 行き止まり梯子も登り、てっぺんの行き止まりに着いたら1段下がって下向き傾向（runnerVertical = 1）で通常アルゴリズムに従う。
 */
(function (w) {
  const RK = (w.RK = w.RK || {});
  const C = RK.CONFIG;

  function isLadderId(id) {
    return id === 'ladder' || id === 'ladder_solid';
  }

  /** 横方向 dir (-1 | 1) へ移動可能か（梯子中は足場がある場合のみ横へ降りられる） */
  function canMoveHorizontal(stage, e, dir) {
    if (!dir) return false;
    if (e.mode === 'ladder' && !RK.Physics.isSupported(stage, e.x, e.y, e.w)) {
      return false;
    }
    const nx = RK.Physics.wrapX(e.x + dir);
    return !RK.Physics.blockedX(stage, nx, e.y, e.w, e.h, dir);
  }

  /** 横方向を試行し、移動可能ならその方向を返す（現在方向 → 反転方向） */
  function tryHorizontalMove(stage, e) {
    const dir = e.dirX !== 0 ? e.dirX : (e.facing || 1);
    if (canMoveHorizontal(stage, e, dir)) return dir;
    const opp = -dir;
    if (canMoveHorizontal(stage, e, opp)) return opp;
    return 0;
  }

  /** 列 col の高さ y から上へ登れる有効な梯子か（行き止まり梯子も含む） */
  function canClimbUpAt(stage, col, y) {
    if (y % C.CELL_H !== 0) return false;
    const row = stage.rowAtFeet(y);
    if (!stage.inBounds(col, row) || !isLadderId(stage.idAt(col, row))) return false;
    const span = RK.Physics.ladderSpan(stage, col, y);
    return !!span && span.top <= y - C.CELL_H;
  }

  /** 列 col の高さ y から下へ降りられる有効な梯子か */
  function canClimbDownAt(stage, col, y) {
    if (y % C.CELL_H !== 0) return false;
    const rowBelow = stage.rowAtFeet(y + 1);
    if (!stage.inBounds(col, rowBelow) || !isLadderId(stage.idAt(col, rowBelow))) return false;
    const span = RK.Physics.ladderSpan(stage, col, y + 1);
    return !!span && span.bottom >= y + C.CELL_H;
  }

  /** 縦方向 dy (-1: 上 / 1: 下) へ移動可能か */
  function canMoveVertical(stage, e, dy) {
    const col = e.mode === 'ladder' ? e.ladderCol : stage.wrapCol(stage.colAt(e.x));
    return dy > 0
      ? canClimbDownAt(stage, col, e.y)
      : canClimbUpAt(stage, col, e.y);
  }

  /** 梯子を登り切っててっぺんの行き止まり（足場がなく横に出られない）に着いたか */
  function isAtLadderDeadEnd(stage, e) {
    if (e.mode !== 'ladder' || e.dirY >= 0) return false;
    const span = RK.Physics.ladderSpan(stage, e.ladderCol, e.y);
    if (!span || e.y > span.top) return false;
    return !RK.Physics.isSupported(stage, e.x, e.y, e.w);
  }

  /** ランナーの4段階優先順位に基づいて次の行動を決定する（§3〜§7） */
  function evaluateRunner(stage, e) {
    // 1. 縦移動直後の横移動優先処理（§4）
    if (e.horizontalNext) {
      e.horizontalNext = false;
      const hDir = tryHorizontalMove(stage, e);
      if (hDir !== 0) {
        e.needsReeval = false;
        return { dirX: hDir, dirY: 0 };
      }
      // 横移動できない場合は停止せず次の梯子判定へ進む（§4-4）
    }

    // 2. 梯子を使った上下移動（§5）
    const order = e.runnerVertical === null
      ? [1, -1] // 初回は下方向優先（§5-1）
      : [e.runnerVertical, -e.runnerVertical]; // 設定後は現在優先方向 → 反対方向（§5-2）

    for (let i = 0; i < order.length; i++) {
      const dy = order[i];
      if (canMoveVertical(stage, e, dy)) {
        e.runnerVertical = dy;
        e.horizontalNext = true;
        e.needsReeval = false;
        return { dirX: 0, dirY: dy };
      }
    }

    // 3. 梯子が使えない場合の横移動（§6）
    const hDir = tryHorizontalMove(stage, e);
    if (hDir !== 0) {
      e.needsReeval = false;
      return { dirX: hDir, dirY: 0 };
    }

    // 4. 移動できる方向がない場合は停止（§3-4, §6-4）
    e.needsReeval = true;
    return { dirX: 0, dirY: 0 };
  }

  /** ランナーAI エントリポイント */
  function decide(e, event, game) {
    const stage = game.stage;

    // スポーン時: ステージ設定の初期左右方向から進み始める（§2）
    if (event === 'spawn') {
      const initDir = stage.runnerDir === -1 || stage.runnerDir === 'left' ? -1 : 1;
      e.dirX = initDir;
      e.facing = initDir;
      e.runnerVertical = null;
      e.horizontalNext = false;

      if (canMoveHorizontal(stage, e, initDir)) {
        e.needsReeval = false;
        return { dirX: initDir, dirY: 0 };
      }
      if (canMoveHorizontal(stage, e, -initDir)) {
        e.needsReeval = false;
        return { dirX: -initDir, dirY: 0 };
      }
      e.needsReeval = true;
      return { dirX: 0, dirY: 0 };
    }

    // 障害物にぶつかった場合: 反転または停止（§6）
    if (event === 'blocked') {
      const hDir = tryHorizontalMove(stage, e);
      e.needsReeval = (hDir === 0);
      return { dirX: hDir, dirY: 0 };
    }

    // 梯子の行き止まりに着いた場合: 1段下に下がり、下向き傾向(runnerVertical=1)で通常アルゴリズムに従う
    if (event === 'ladder_floor' && isAtLadderDeadEnd(stage, e)) {
      if (canMoveVertical(stage, e, 1)) {
        e.runnerVertical = 1;
        e.horizontalNext = true;
        e.needsReeval = false;
        return { dirX: 0, dirY: 1 };
      }
    }

    // セル中心到達・梯子床高さ到達・着地・スタン終了
    if (
      event === 'cell_center' ||
      event === 'ladder_floor' ||
      event === 'land' ||
      event === 'stun_end'
    ) {
      return evaluateRunner(stage, e);
    }

    return null;
  }

  RK.RunnerAI = Object.freeze({
    decide,
    canClimbUpAt,
    canClimbDownAt,
  });

  if (RK.Enemy) {
    RK.Enemy.registerAI('runner', decide);
  }
})(window);
