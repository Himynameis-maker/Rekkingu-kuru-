/* ===== ステージデータ =====
 * 文字列配列 → Stage オブジェクト。描画・AI・物理には依存しない。
 * エディタもゲーム本編もこの Stage をそのまま使う。
 */
(function (w) {
  const RK = (w.RK = w.RK || {});
  const { LAYER, byChar } = RK.Symbols;
  const { COLS, ROWS } = RK.CONFIG;

  class Stage {
    constructor(name, cols, rows) {
      this.name = name;
      this.cols = cols;
      this.rows = rows;
      this.cells = [];   // cells[row][col] = symbol id（アクターは 'empty'）
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

    /** 範囲外は 'empty'。col を wrap するかは呼び出し側が決める */
    idAt(col, row) {
      return this.inBounds(col, row) ? this.cells[row][col] : 'empty';
    }

    setId(col, row, id) {
      if (this.inBounds(col, row)) this.cells[row][col] = id;
    }

    /** 記号文字列に書き戻す（エディタ保存用） */
    toRows() {
      const out = this.cells.map((r) => r.map((id) => RK.Symbols.byId[id].ch).join(''));
      this.spawns.forEach((s) => {
        const line = out[s.row].split('');
        line[s.col] = RK.Symbols.byId[s.id].ch;
        out[s.row] = line.join('');
      });
      return out;
    }
  }

  /** rows: string[]。形式が不正でも例外は投げず stage.errors に積む */
  function parse(name, rows) {
    const stage = new Stage(name, COLS, ROWS);
    if (rows.length !== ROWS) stage.errors.push(`行数が ${ROWS} ではありません（${rows.length}）`);

    for (let r = 0; r < ROWS; r++) {
      const line = rows[r] || '';
      if (line.length !== COLS) stage.errors.push(`${r + 1}行目の幅が ${COLS} ではありません（${line.length}）`);
      const cellRow = [];
      for (let c = 0; c < COLS; c++) {
        const ch = line[c] === undefined ? '.' : line[c];
        const def = byChar[ch];
        if (!def) {
          stage.errors.push(`${r + 1}行${c + 1}列: 未定義の記号 '${ch}'`);
          cellRow.push('empty');
        } else if (def.layer === LAYER.ACTOR) {
          stage.spawns.push({ id: def.id, col: c, row: r });
          cellRow.push('empty');
        } else {
          cellRow.push(def.id);
        }
      }
      stage.cells.push(cellRow);
    }

    const players = stage.spawns.filter((s) => s.id === 'player').length;
    if (players !== 1) stage.errors.push(`プレイヤー(P)は1つ必要です（${players}）`);
    return stage;
  }

  RK.Stage = Object.freeze({ Stage, parse });
})(window);
