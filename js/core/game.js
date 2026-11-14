/* ===== ゲーム本体（状態の入れ物 + 1tickの進め方 + 破壊連鎖） =====
 * Stage を作り、アクターを生成し、update で1tick進める。描画も入力デバイスも知らない。
 * ステップ8b-4:
 *   - ハンマーヒット共通処理（壁3種 W/w/V のダメージ＆完全破壊時の相互異常落下、壊せる梯子 L の0.2s連鎖破壊）
 *   - 梯子崩壊開始時の敵「降りかけ引き返し」と、各マス消滅時の落下/床着地判定
 */
(function (w) {
  const RK = (w.RK = w.RK || {});
  const C = RK.CONFIG;

  /** stageData = { name, floor[], objects[] } */
  function create(stageData) {
    const stage = RK.Stage.parse(stageData.name, stageData);
    stage.runnerDir = (stageData.runnerDir === -1 || stageData.runnerDir === 'left') ? -1 : 1;
    const pSpawn = stage.spawns.find((s) => s.id === 'player');
    const player = pSpawn ? RK.Player.create(stage, pSpawn) : null;

    const enemies = [];
    if (RK.Enemy) {
      stage.spawns.forEach((s) => {
        if (RK.Enemy.isEnemyId(s.id)) enemies.push(RK.Enemy.create(stage, s));
      });
    }

    const actors = [];
    if (player) actors.push(player);
    enemies.forEach((e) => actors.push(e));

    const game = {
      stage,
      player,
      enemies,
      actors,
      tick: 0,
      rngState: 0x5f3759df,
      ladderCollapses: [],   // { col, upRow, downRow, timer }
    };
    if (RK.Enemy) {
      enemies.forEach((e) => RK.Enemy.triggerAI(e, 'spawn', game));
    }
    return game;
  }

  function isWallId(id) {
    return id === 'wall_a' || id === 'wall_b' || id === 'wall_c';
  }

  /**
   * 壊れた梯子マス (col, destroyedRow) が消滅した瞬間、その梯子に捕まっていたアクターを判定する。
   * - 原作の「梯子の連なりの一番下に足場が設置される」挙動の再現:
   *   消滅したマスのすぐ下にまだ 'ladder' が残っている、またはその高さに足場があれば地面に着地（'ground'）し、
   *   敵の場合は普段の着地トリガー（'land'）が発動する。
   * - それ以外で捕まっていた梯子部分が消滅した場合は異常落下する。
   */
  function checkActorsOnDestroyedLadderCell(game, col, destroyedRow) {
    const stage = game.stage;
    const actors = game.actors || [];

    for (let i = 0; i < actors.length; i++) {
      const a = actors[i];
      if (a.mode !== 'ladder' || a.ladderCol !== col) continue;

      const actorRow = stage.rowAtFeet(a.y);
      const span = RK.Physics.ladderSpan(stage, col, a.y);
      const lostHold = (actorRow === destroyedRow) || !span;
      if (!lostHold) continue;

      const hasLadderDirectlyBelow =
        stage.inBounds(col, destroyedRow + 1) && stage.idAt(col, destroyedRow + 1) === 'ladder';
      const hasGroundSupport = RK.Physics.isSupported(stage, a.x, a.y, a.w);

      if (hasLadderDirectlyBelow || hasGroundSupport) {
        a.mode = 'ground';
        a.ladderCol = -1;
        a.climbAccum = 0;
        if (a.id === 'player') {
          a.stepDir = 0;
          a.stepTick = C.PLAYER_TAP_FRAMES;
        } else if (RK.Enemy) {
          a.dirY = 0;
          a.wasAbnormalFall = false;
          RK.Enemy.triggerAI(a, 'land', game);
        }
      } else {
        if (a.id === 'player') {
          RK.Player.startAbnormalFall(a);
        } else if (RK.Enemy) {
          RK.Enemy.startAbnormalFall(a);
        }
      }
    }
  }

  /**
   * 壊せる梯子(L)の崩壊を開始する（叩いた位置から始まり、0.2s間隔で上下へ1マスずつ消える）。
   * 崩壊開始時、上から降りかけの敵は引き返し、深く降りすぎていた敵はそのまま降りる。
   */
  function startLadderCollapse(game, col, hitRow) {
    const stage = game.stage;
    if (!stage.inBounds(col, hitRow) || stage.idAt(col, hitRow) !== 'ladder') return;

    // 崩壊前の梯子上端を取得（敵の降りかけ引き返し判定用）
    const origSpan = RK.Physics.ladderSpan(stage, col, stage.surfaceY(hitRow));
    const origTop = origSpan ? origSpan.top : hitRow * C.CELL_H;

    // 叩かれたマスを即座に消滅させる
    stage.setId(col, hitRow, 'empty');

    // 上下に連なる 'ladder' があれば連鎖崩壊キューへ追加
    const hasUp = stage.inBounds(col, hitRow - 1) && stage.idAt(col, hitRow - 1) === 'ladder';
    const hasDown = stage.inBounds(col, hitRow + 1) && stage.idAt(col, hitRow + 1) === 'ladder';
    if (hasUp || hasDown) {
      game.ladderCollapses.push({
        col,
        upRow: hitRow - 1,
        downRow: hitRow + 1,
        timer: C.LADDER_COLLAPSE_INTERVAL_FRAMES,
      });
    }

    // 細かい要素: 敵が降りかけ（床から梯子を使い始めたとき）の梯子が壊れ始めたとき、敵は引き返す
    if (game.enemies) {
      for (let i = 0; i < game.enemies.length; i++) {
        const e = game.enemies[i];
        if (e.mode === 'ladder' && e.ladderCol === col && e.dirY > 0) {
          const depth = e.y - origTop;
          if (depth >= 0 && depth < C.LADDER_RETREAT_DOTS && stage.hasFloor(col, Math.floor(origTop / C.CELL_H) - 1)) {
            e.dirY = -1;
          }
        }
      }
    }

    checkActorsOnDestroyedLadderCell(game, col, hitRow);
  }

  /** 進行中の梯子連鎖崩壊を1tick進める */
  function updateLadderCollapses(game) {
    if (!game.ladderCollapses || game.ladderCollapses.length === 0) return;
    const stage = game.stage;

    for (let i = game.ladderCollapses.length - 1; i >= 0; i--) {
      const c = game.ladderCollapses[i];
      c.timer--;
      if (c.timer > 0) continue;

      let progressed = false;

      if (stage.inBounds(c.col, c.upRow) && stage.idAt(c.col, c.upRow) === 'ladder') {
        const r = c.upRow;
        stage.setId(c.col, r, 'empty');
        checkActorsOnDestroyedLadderCell(game, c.col, r);
        c.upRow = r - 1;
        if (stage.inBounds(c.col, c.upRow) && stage.idAt(c.col, c.upRow) === 'ladder') {
          progressed = true;
        }
      }

      if (stage.inBounds(c.col, c.downRow) && stage.idAt(c.col, c.downRow) === 'ladder') {
        const r = c.downRow;
        stage.setId(c.col, r, 'empty');
        checkActorsOnDestroyedLadderCell(game, c.col, r);
        c.downRow = r + 1;
        if (stage.inBounds(c.col, c.downRow) && stage.idAt(c.col, c.downRow) === 'ladder') {
          progressed = true;
        }
      }

      if (progressed) {
        c.timer = C.LADDER_COLLAPSE_INTERVAL_FRAMES;
      } else {
        game.ladderCollapses.splice(i, 1);
      }
    }
  }

  /**
   * ハンマーがセル (col, row) を叩いたときの共通処理（プレイヤー・親方共通）。
   * - 爆弾(B)・扉(D)・鉄柱(I)・壊せない梯子(H)は壊せない。
   * - 壁(W/w/V)を完全に破壊したとき、相手（プレイヤー⇔親方）がその壁の前に立っていたら異常落下させる。
   * - 壊せる梯子(L)を叩いたときは連鎖崩壊を開始する。
   */
  function hitCellByHammer(game, attacker, col, row) {
    const stage = game.stage;
    if (!stage.inBounds(col, row)) return { hit: false, destroyed: false };

    const id = stage.idAt(col, row);
    if (isWallId(id)) {
      const res = stage.damageCell(col, row, 1);
      if (res.destroyed && attacker) {
        if (attacker.id === 'foreman' && game.player) {
          const p = game.player;
          if (p.mode !== 'abnormal_fall' && stage.wrapCol(stage.colAt(p.x)) === col && stage.rowAtFeet(p.y) === row) {
            RK.Player.startAbnormalFall(p);
          }
        } else if (attacker.id === 'player' && game.enemies) {
          for (let i = 0; i < game.enemies.length; i++) {
            const e = game.enemies[i];
            if (e.id === 'foreman' && e.mode !== 'abnormal_fall' && stage.wrapCol(stage.colAt(e.x)) === col && stage.rowAtFeet(e.y) === row) {
              RK.Enemy.startAbnormalFall(e);
            }
          }
        }
      }
      return res;
    }

    if (id === 'ladder') {
      startLadderCollapse(game, col, row);
      return { hit: true, destroyed: true, hp: 0 };
    }

    return { hit: false, destroyed: false, hp: 0 };
  }

  /** 1tick 進める。input は RK.Input の poll() の結果 */
  function update(game, input) {
    game.tick++;
    updateLadderCollapses(game);
    if (game.player) RK.Player.update(game.player, input, game.stage, game);
    if (RK.Enemy && game.enemies) {
      for (let i = 0; i < game.enemies.length; i++) {
        RK.Enemy.update(game.enemies[i], game);
      }
    }
  }

  RK.Game = Object.freeze({
    create,
    update,
    hitCellByHammer,
    startLadderCollapse,
  });
})(window);
