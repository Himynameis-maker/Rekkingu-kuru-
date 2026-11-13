/* ===== ステージデータ =====
 * { floor: string[], objects: string[] } -> Stage。描画・AI・物理には依存しない。
 * エディタもゲーム本編もこの Stage をそのまま使う。
 *
 * 2枚のレイヤー（どちらも COLS x ROWS）
 *  - floor   : '=' はそのセルの「下端」にある厚み0の足場面。セルは占有しない。
 *              足場面の y 座標 = (row + 1) * CELL_H。キャラの足はここに乗る。
 *  - objects : 壁・梯子・樽など（1セル1つ）とアクターのスポーン位置。
 */
(function (w) {
  const RK = (w.RK = w.RK || {});
  const { LAYER, byChar, byId } = RK.Symbols;
  const { COLS, ROWS, CELL_W, CELL_H } = RK.CONFIG;

  class Stage {
    constructor(name, cols, rows) {
      this.name = name;
      this.cols = cols;
      this.rows = rows;
      this.floors = [];  // floors[row][col] = 'floor' | 'empty'
      this.cells = [];   // cells[row][col] = 物の symbol id（アクターは 'empty'）
      this.spawns = [];  // { id, col, row }
      this.errors = [];  // 文字列。空なら正常
    }

    inBounds(col, row) {
      return col >= 0 && col < this.cols && row >= 0 && row < this.rows;
    }

    /** 左右ループ付きの列番号（通常移動用。梯子探索には使わない） */
    wrapCol(col) {
      return ((col % this.cols) + this.cols) % this.cols;
    }

    /** 物レイヤー。範囲外は 'empty'。col を wrap するかは呼び出し側が決める */
    idAt(col, row) {
      return this.inBounds(col, row) ? this.cells[row][col] : 'empty';
    }

    /** そのセルの下端に足場面があるか（範囲外は false） */
    hasFloor(col, row) {
      return this.inBounds(col, row) && this.floors[row][col] === 'floor';
    }

    /** row の下端（足場面）の y 座標 */
    surfaceY(row) {
      return (row + 1) * CELL_H;
    }

    /** x座標（ドット）が何列目か。ループはしない（範囲外は負やcols以上になる） */
    colAt(x) {
      return Math.floor(x / CELL_W);
    }

    /** 足の y 座標から「体が入っているセルの行」を返す。足がちょうど足場面(行の下端)にあるとき、その行を返す */
    rowAtFeet(y) {
      return Math.floor((y - 1) / CELL_H);
    }

    /** col 列の中心 x 座標 */
    centerX(col) {
      return col * CELL_W + CELL_W / 2;
    }

    setId(col, row, id) {
      if (this.inBounds(col, row)) this.cells[row][col] = id;
    }

    setFloor(col, row, on) {
      if (this.inBounds(col, row)) this.floors[row][col] = on ? 'floor' : 'empty';
    }

    /** 記号文字列に書き戻す（エディタ保存用） */
    toData() {
      const floor = this.floors.map((r) => r.map((id) => byId[id].ch).join(''));
      const objects = this.cells.map((r) => r.map((id) => byId[id].ch).join(''));
      this.spawns.forEach((s) => {
        const line = objects[s.row].split('');
        line[s.col] = byId[s.id].ch;
        objects[s.row] = line.join('');
      });
      return { floor, objects };
    }
  }

  /** 1レイヤーを走査。サイズ不正・未定義記号は stage.errors に積む（例外は投げない） */
  function scan(stage, label, rows, onCell) {
    if (rows.length !== ROWS) stage.errors.push(`${label}: 行数が ${ROWS} ではありません（${rows.length}）`);
    for (let r = 0; r < ROWS; r++) {
      const line = rows[r] || '';
      if (line.length !== COLS) stage.errors.push(`${label} ${r + 1}行目: 幅が ${COLS} ではありません（${line.length}）`);
      for (let c = 0; c < COLS; c++) {
        const ch = line[c] === undefined ? '.' : line[c];
        const def = byChar[ch];
        if (!def) { stage.errors.push(`${label} ${r + 1}行${c + 1}列: 未定義の記号 '${ch}'`); continue; }
        onCell(def, c, r);
      }
    }
  }

  function parse(name, data) {
    const stage = new Stage(name, COLS, ROWS);
    for (let r = 0; r < ROWS; r++) {
      stage.floors.push(new Array(COLS).fill('empty'));
      stage.cells.push(new Array(COLS).fill('empty'));
    }

    scan(stage, '床レイヤー', data.floor || [], (def, c, r) => {
      if (def.layer === LAYER.FLOOR) stage.floors[r][c] = 'floor';
      else if (def.layer !== LAYER.NONE) stage.errors.push(`床レイヤー ${r + 1}行${c + 1}列: '${def.ch}' は置けません（'=' か '.' のみ）`);
    });

    scan(stage, '物レイヤー', data.objects || [], (def, c, r) => {
      if (def.layer === LAYER.FLOOR) stage.errors.push(`物レイヤー ${r + 1}行${c + 1}列: 床 '=' は床レイヤーに書いてください`);
      else if (def.layer === LAYER.ACTOR) stage.spawns.push({ id: def.id, col: c, row: r });
      else stage.cells[r][c] = def.id;
    });

    const players = stage.spawns.filter((s) => s.id === 'player').length;
    if (players !== 1) stage.errors.push(`プレイヤー(P)は1つ必要です（${players}）`);
    return stage;
  }

  RK.Stage = Object.freeze({ Stage, parse });
})(window);
