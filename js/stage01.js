/* 16列 x 7行。床の行(=)の間に1行の通路がある。梯子は床の行に開ける。 */
(function (w) {
  const RK = (w.RK = w.RK || {});
  RK.StageData = RK.StageData || {};
  RK.StageData.stage01 = {
    name: 'STAGE 01',
    rows: [
      '................',
      '..W...B....W..1.',
      '====L=======H===',
      '..O...W...D....2',
      '====H=======L===',
      '.P...4..w.O.I..V',
      '================',
    ],
  };
})(window);
