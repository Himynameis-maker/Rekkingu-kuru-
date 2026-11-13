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
 *
 * 左右ループ（ステップ6）: 画面の左端と右端はつながっている。体のドットが画面の外（x < 0 や x >= WIDTH）に
 *   はみ出していても、反対側の列として扱う（足場も樽も、はみ出した分は反対側の列で判定する）。
 *   中心 x が画面の外へ出たら反対側へ移す処理は player.js（wrapX を使う）。梯子の探索は端で折り返さない（縦だけ）。
 *
 * 梯子のてっぺん（確定）: 穴の上に出た梯子の上端(y = span.top)では、床のある列（足場になる列）へは横に入れない。
 *   足が床につっかえて届かない扱い。blockedByFloorX が「その一歩が足場のある列へ新しく入るか」を答える。床は動かない物なので、
 *   樽の blockedX と同じ形の「入れないマス」として扱う。床の無い列（穴が広いとき）へは動けて、梯子の範囲を出れば落ちる。
 *
 * 梯子（ステップ5）: 物レイヤーの 'ladder' / 'ladder_solid' の縦に連なったセル。
 *   span = { top, bottom }。top = 一番上のセルの上端 y（= 上の足場面の高さ）、bottom = 一番下のセルの下端 y（= 下の足場面の高さ）。
 *   乗れる/つかまれる/つかまっていられるのは、梯子の中心から LADDER_GRAB_DOTS ドット以内（暫定）。梯子は床ではない（足場にならない）。
 */
(function (w) {
  const RK = (w.RK = w.RK || {});
  const C = RK.CONFIG;
  const H = C.CELL_H;
  const BARREL = 'barrel';

  /** 横位置 x を 0 〜 WIDTH-1 に収める（画面の左右はつながっている）。負の値も正しく扱う */
  function wrapX(x) { return ((x % C.WIDTH) + C.WIDTH) % C.WIDTH; }

  /** 列番号を 0 〜 COLS-1 に収める。-1 → 最後の列、COLS → 0列目 */
  function wrapCol(c) { return ((c % C.COLS) + C.COLS) % C.COLS; }

  /** ドットの横位置 dot（画面の外でもよい）がある列。画面の端でつながっている */
  function colOfDot(dot) { return wrapCol(Math.floor(dot / C.CELL_W)); }

  /** 列 c が、足の高さ y で足場になるか（床: 上のセルの下端の面 / 樽: 下のセルの上面）。画面下端は常に足場（暫定） */
  function supportsColumn(stage, c, y) {
    if (y >= C.HEIGHT) return true;          // 画面下端（暫定）
    if (y % H !== 0) return false;           // 足場面は H の倍数の高さにしか無い
    const row = y / H;                       // この y は「row の上端」かつ「row-1 の下端」
    if (stage.hasFloor(c, row - 1)) return true;           // 上のセルの下端 = 床
    return stage.idAt(c, row) === BARREL;                  // 下のセルの樽の上面
  }

  /** 足を y に置いた体が、x の位置で足場に乗っているか。体が画面の端をまたいでいてもよい */
  function isSupported(stage, x, y, bw) {
    if (y >= C.HEIGHT) return true;          // 画面下端（暫定）
    if (y % H !== 0) return false;           // 足場面は H の倍数の高さにしか無い
    const first = Math.floor((x - bw / 2) / C.CELL_W);       // 画面の外なら負や COLS 以上になる
    const last = Math.floor((x + bw / 2 - 1) / C.CELL_W);
    for (let k = first; k <= last; k++) {
      if (supportsColumn(stage, wrapCol(k), y)) return true;
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
    const lead = (x) => colOfDot(dir > 0 ? x + bw / 2 - 1 : x - bw / 2);   // 画面の端をまたいでも反対側の列になる
    const newCol = lead(nx);
    if (!barrelInColumn(stage, newCol, y, bh)) return false;
    return !barrelInColumn(stage, lead(nx - dir), y, bh);   // いま既に樽の列なら通す
  }

  /**
   * 梯子のてっぺん用。体を nx（新しい中心x）へ 1 ドット動かす一歩が、足場のある列（足の高さ y で床か樽の上面がある列）へ
   * 「新しく入る」か。dir = -1/1。入るなら true（動けない）。
   * すでに先頭の列が足場のある列なら止めない（blockedX と同じ考え方。抜けられなくなるのを防ぐ）。画面の端をまたいでも反対側の列で判定。
   */
  function blockedByFloorX(stage, nx, y, bw, dir) {
    const lead = (x) => colOfDot(dir > 0 ? x + bw / 2 - 1 : x - bw / 2);
    if (!supportsColumn(stage, lead(nx), y)) return false;
    return !supportsColumn(stage, lead(nx - dir), y);
  }

  function isLadderId(id) { return id === 'ladder' || id === 'ladder_solid'; }

  /**
   * col 列の梯子の範囲。y は足の高さ。梯子のセルの途中・上端(足場面)・下端のどこでも同じ範囲を返す。
   * その高さに梯子が無ければ null。梯子の探索は縦だけ（左右の画面端は関係ない）。
   */
  function ladderSpan(stage, col, y) {
    let r = Math.floor((y - 1) / H);                         // 足があるセル（足場面ちょうどなら、その上のセル）
    if (!isLadderId(stage.idAt(col, r))) r = Math.floor(y / H); // 梯子の上端にいるとき: すぐ下のセル
    if (!isLadderId(stage.idAt(col, r))) return null;
    let t = r; let b = r;
    while (isLadderId(stage.idAt(col, t - 1))) t--;
    while (isLadderId(stage.idAt(col, b + 1))) b++;
    return { top: t * H, bottom: (b + 1) * H };
  }

  /** x の位置の列の、row 行目に梯子があり、中心から LADDER_GRAB_DOTS 以内なら その列番号。無ければ -1 */
  function ladderColAt(stage, x, row) {
    const xw = wrapX(x);
    const col = stage.colAt(xw);
    if (!isLadderId(stage.idAt(col, row))) return -1;
    return Math.abs(xw - stage.centerX(col)) <= C.LADDER_GRAB_DOTS ? col : -1;
  }

  RK.Physics = Object.freeze({ isSupported, fallTo, blockedX, blockedByFloorX, ladderSpan, ladderColAt, wrapX });
})(window);
