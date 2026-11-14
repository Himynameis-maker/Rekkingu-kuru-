/* ===== ゲーム本体（状態の入れ物 + 1tickの進め方） =====
 * Stage を作り、アクターを生成し、update で1tick進める。描画も入力デバイスも知らない。
 * 将来ここに 状態機械(READY/PLAY/MISS/CLEAR)、ライフ を足す。
 */
(function (w) {
  const RK = (w.RK = w.RK || {});

  /** stageData = { name, floor[], objects[] } */
  function create(stageData) {
    const stage = RK.Stage.parse(stageData.name, stageData);
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

    const game = { stage, player, enemies, actors, tick: 0 };
    if (RK.Enemy) {
      enemies.forEach((e) => RK.Enemy.triggerAI(e, 'spawn', game));
    }
    return game;
  }

  /** 1tick 進める。input は RK.Input の poll() の結果 */
  function update(game, input) {
    game.tick++;
    if (game.player) RK.Player.update(game.player, input, game.stage);
    if (RK.Enemy && game.enemies) {
      for (let i = 0; i < game.enemies.length; i++) {
        RK.Enemy.update(game.enemies[i], game);
      }
    }
  }

  RK.Game = Object.freeze({ create, update });
})(window);
