/* ===== ステージ記号の定義（データのみ・描画や判定は持たない） =====
 * layer: none / floor / object / actor
 *  - floor  : 床レイヤー専用。セルを占有しない、セル下端の面。
 *  - object : 物レイヤー。1セルに1つ。hp があるものは耐久値を持つ。
 *  - actor  : スポーン位置を表す記号。物レイヤーに書き、パース時に stage.spawns へ移す。
 */
(function (w) {
  const RK = (w.RK = w.RK || {});
  const C = RK.CONFIG;

  const LAYER = Object.freeze({ NONE: 'none', FLOOR: 'floor', OBJECT: 'object', ACTOR: 'actor' });

  const defs = [
    { ch: '.', id: 'empty',        layer: LAYER.NONE,    name: '空' },
    { ch: '=', id: 'floor',        layer: LAYER.FLOOR,   name: '床(セル下端の厚み0の面)' },
    { ch: 'W', id: 'wall_a',       layer: LAYER.OBJECT,  name: '壁A', hp: C.WALL_A_HP },
    { ch: 'w', id: 'wall_b',       layer: LAYER.OBJECT,  name: '壁B', hp: C.WALL_B_HP },
    { ch: 'V', id: 'wall_c',       layer: LAYER.OBJECT,  name: '壁C', hp: C.WALL_C_HP },
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
