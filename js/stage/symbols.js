/* ===== ステージ記号の定義（データのみ・描画や判定は持たない） =====
 * layer: none / terrain / object / actor
 *  - actor はスポーン位置を表す記号。パース時に地形から取り除かれる。
 */
(function (w) {
  const RK = (w.RK = w.RK || {});

  const LAYER = Object.freeze({ NONE: 'none', TERRAIN: 'terrain', OBJECT: 'object', ACTOR: 'actor' });

  const defs = [
    { ch: '.', id: 'empty',        layer: LAYER.NONE,    name: '空' },
    { ch: '=', id: 'floor',        layer: LAYER.TERRAIN, name: '床' },
    { ch: 'W', id: 'wall_a',       layer: LAYER.OBJECT,  name: '壁A' },
    { ch: 'w', id: 'wall_b',       layer: LAYER.OBJECT,  name: '壁B' },
    { ch: 'V', id: 'wall_c',       layer: LAYER.OBJECT,  name: '壁C' },
    { ch: 'L', id: 'ladder',       layer: LAYER.OBJECT,  name: '梯子(破壊可)' },
    { ch: 'H', id: 'ladder_solid', layer: LAYER.OBJECT,  name: '梯子(破壊不可)' },
    { ch: 'O', id: 'barrel',       layer: LAYER.OBJECT,  name: '樽' },
    { ch: 'I', id: 'pillar',       layer: LAYER.OBJECT,  name: '鉄柱' },
    { ch: 'B', id: 'bomb',         layer: LAYER.OBJECT,  name: '爆弾' },
    { ch: 'D', id: 'door',         layer: LAYER.OBJECT,  name: '扉' },
    { ch: 'P', id: 'player',       layer: LAYER.ACTOR,   name: 'プレイヤー' },
    { ch: '1', id: 'chaser',       layer: LAYER.ACTOR,   name: 'Chaser' },
    { ch: '2', id: 'runner',       layer: LAYER.ACTOR,   name: 'Runner' },
    { ch: '3', id: 'foreman',      layer: LAYER.ACTOR,   name: 'Foreman' },
    { ch: '4', id: 'fast_chaser',  layer: LAYER.ACTOR,   name: 'Fast Chaser' },
  ];

  const byChar = {};
  const byId = {};
  defs.forEach((d) => { byChar[d.ch] = d; byId[d.id] = d; });

  RK.Symbols = Object.freeze({ LAYER, defs, byChar, byId });
})(window);
