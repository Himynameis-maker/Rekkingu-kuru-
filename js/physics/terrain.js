/* ===== 地形判定（足場・樽）=====
 * 「どこに立てるか」「横に進めるか」を答えるだけ。状態は持たない（Player などが使う）。
 * Stage（床レイヤー・物レイヤー）を読むだけで、描画にも入力にも依存しない。
 *
 * 体の占めるドット（幅 bw、中心 x）:
 *   横: x - bw/2 〜 x + bw/2 - 1   （bw=12 なら 12 ドット。右端は含まない）
 *   縦: y - bh 〜 y - 1            （足 y のドットは体に含まない。足場面は線なので）
 *
 * 足場になるもの（確定。context.md §4）:
 *   - 床: セル(c,r)の下端の面 y = (r+1)*CELL_H。
 *   - 樽: セル(c,r)の上面 y = r*CELL_H。
 *   足の幅のうち 1 ドットでも足場に重なっていれば立てる。
 * 横にぶつかるもの: 樽だけ（確定）。樽の当たりはセル全体（16 x 24）とする（暫定）。
 *   すでに樽に重なっているときは、外へ向かう動きを止めない（抜けられなくなるのを防ぐ）。
 * 画面下端（y = HEIGHT）は常に足場として扱う（暫定。床の無いステージで無限に落ちないための安全策）。
 */
(function (w) {
  const RK = (w.RK = w.RK || {});
  const C = RK.CONFIG;
  const H = C.CELL_H;
  const BARREL = 'barrel';

  /** 足を y に置いた体が、x の位置で足場に乗っているか */
  function isSupported(stage, x, y, bw) {
    if (y >= C.HEIGHT) return true;          // 画面下端（暫定）
    if (y % H !== 0) return false;           // 足場面は H の倍数の高さにしか無い
    const row = y / H;                       // この y は「row の上端」かつ「row-1 の下端」
    const c0 = stage.colAt(x - bw / 2);
    const c1 = stage.colAt(x + bw / 2 - 1);
    for (let c = c0; c <= c1; c++) {
      if (stage.hasFloor(c, row - 1)) return true;         // 上のセルの下端 = 床
      if (stage.idAt(c, row) === BARREL) return true;      // 下のセルの樽の上面
    }
    return false;
  }

  /**
   * 足 y から dist ドット下へ落ちる。途中に足場があればそこで止まる（高速でも通り抜けない）。
   * 戻り値: { y: 落ちた後の足y, landed: 足場で止まったか }
   */
  function fallTo(stage, x, bw, y, dist) {
    if (dist <= 0) return { y, landed: false };
    const target = y + dist;
    for (let m = (Math.floor(y / H) + 1) * H; m <= target; m += H) {
      if (isSupported(stage, x, m, bw)) return { y: m, landed: true };
    }
    return { y: target, landed: false };
  }

  /**
   * 体の高さの範囲にある、col 列のセルに樽があるか（y は足）
   */
  function barrelInColumn(stage, col, y, bh) {
    const rowTop = Math.floor((y - bh) / H);
    const rowBottom = Math.floor((y - 1) / H);
    for (let r = rowTop; r <= rowBottom; r++) {
      if (stage.idAt(col, r) === BARREL) return true;
    }
    return false;
  }

  /**
   * 体を nx（新しい中心x）へ 1 ドット動かす一歩が、樽にぶつかるか。dir = -1/1。
   * ぶつかる = 先頭のドット列が、体の高さの範囲にある樽セルの列へ「新しく入る」一歩。
   * すでに先頭の列が樽の中にあるとき（出現位置や、将来 樽が落ちてきた場合）は止めず、外へ抜けられるようにする。
   */
  function blockedX(stage, nx, y, bw, bh, dir) {
    const lead = (x) => stage.colAt(dir > 0 ? x + bw / 2 - 1 : x - bw / 2);
    const newCol = lead(nx);
    if (!barrelInColumn(stage, newCol, y, bh)) return false;
    return !barrelInColumn(stage, lead(nx - dir), y, bh);   // いま既に樽の列なら通す
  }

  RK.Physics = Object.freeze({ isSupported, fallTo, blockedX });
})(window);
