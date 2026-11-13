/* ===== ゲーム本体（状態の入れ物 + 1tickの進め方） =====
 * Stage を作り、アクターを生成し、update で1tick進める。描画も入力デバイスも知らない。
 * 将来ここに 状態機械(READY/PLAY/MISS/CLEAR)、敵、ライフ を足す。
 */
(function (w) {
  const RK = (w.RK = w.RK || {});

  /** stageData = { name, floor[], objects[] } */
  function create(stageData) {
    const stage = RK.Stage.parse(stageData.name, stageData);
    const spawn = stage.spawns.find((s) => s.id === 'player');
    const player = spawn ? RK.Player.create(stage, spawn) : null; // 無ければ stage.errors に出ている
    return { stage, player, actors: player ? [player] : [], tick: 0 };
  }

  /** 1tick 進める。input は RK.Input の poll() の結果 */
  function update(game, input) {
    game.tick++;
    if (game.player) RK.Player.update(game.player, input, game.stage);
  }

  RK.Game = Object.freeze({ create, update });
})(window);
