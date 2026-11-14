/* ===== 全体定数 =====
 * 座標の単位は「論理ピクセル（1ドット）」の整数。
 * 1セル = 横16 x 縦24 ドット（横2 : 縦3）。
 * 縦横比を変えるときは CELL_H（と、必要なら ROWS）だけ直す。
 * 例: 縦をもっと細くしたければ CELL_H=28, ROWS=8 など。ステージデータの行数も合わせる。
 *
 * 【操作感の調整はここ】プレイヤーの移動は PLAYER_SPEED / PLAYER_TAP_DOTS / PLAYER_TAP_FRAMES の3つ。
 * 落ちる速さは PLAYER_FALL_SPEED / PLAYER_ABNORMAL_FALL_SPEED。梯子は PLAYER_CLIMB_SPEED / LADDER_GRAB_DOTS。
 */
(function (w) {
  const RK = (w.RK = w.RK || {});
  const CELL_W = 16;
  const CELL_H = 24;
  const COLS = 16;
  const ROWS = 9;

  RK.CONFIG = Object.freeze({
    CELL_W, CELL_H, COLS, ROWS,
    WIDTH: CELL_W * COLS,   // 256
    HEIGHT: CELL_H * ROWS,  // 216
    BG_COLOR: '#000000',
    FLOOR_DRAW_H: 4,        // 床の見た目の厚み(ドット)。論理上の厚みは0。セル下端に描く

    // --- ゲームループ ---
    TICK_HZ: 60,            // ロジックは固定 60Hz。描画は別（ブラウザのフレームごと）

    // --- プレイヤー（ステップ3の暫定値。操作感を見て調整する） ---
    PLAYER_W: 12,           // 当たり幅(ドット)。偶数にする（中心xが整数のため）
    PLAYER_H: 24,           // 当たり高さ。= CELL_H（1セルに収める）
    PLAYER_SPEED: 1,        // 押し続けたときの速さ。1tickあたり進むドット数（整数）
    PLAYER_TAP_DOTS: 3,     // 「チョン押し」で進むドット数（押した瞬間に確定。途中で離しても最後まで進む）
    PLAYER_TAP_FRAMES: 6,   // チョンの動きにかけるtick数。この間押し続けていたら、その後は連続移動
                            // 推奨: PLAYER_TAP_DOTS <= PLAYER_TAP_FRAMES * PLAYER_SPEED（加速が滑らかになる）

    // --- 通常落下（ステップ4。暫定値） ---
    PLAYER_FALL_SPEED: 2,   // 通常落下の速さ。1tickあたり下へ進むドット数（整数・加速なし）。24ドット(1セル)を12tick

    // --- 異常落下（ステップ8a。確定） ---
    PLAYER_ABNORMAL_FALL_SPEED: 2,      // 異常落下の速さ。通常落下と同じ（1tickあたり2ドット）
    PLAYER_ABNORMAL_LAND_STUN_FRAMES: 30, // 異常落下の着地後に動けないtick数（0.5秒 @ 60Hz。変更可能）

    // --- 梯子（ステップ5。暫定値） ---
    PLAYER_CLIMB_SPEED: 1,  // 梯子の昇り降りの速さ。1tickあたりのドット数（整数）。24ドット(1セル)を24tick
    LADDER_GRAB_DOTS: 4,    // 梯子の中心から何ドット以内なら乗れる/つかまれる/つかまっていられるか（中心x のずれ）。乗ったら中心へスナップ。これを超えて横へ離れると梯子から外れて落ちる

    // --- 壁の耐久値（ステップ7。確定） ---
    WALL_A_HP: 1,           // 壁A (W): 1回叩くと破壊
    WALL_B_HP: 2,           // 壁B (w): 2回叩くと破壊
    WALL_C_HP: 3,           // 壁C (V): 3回叩くと破壊

    // --- ハンマー（ステップ7。確定） ---
    HAMMER_FRAMES: 12,          // ハンマーを表示するtick数
    HAMMER_LOCK_FRAMES: 18,     // ハンマーを振ったあと、歩行など他の行動を受け付けないtick数（0.3秒 @ 60Hz）
    HAMMER_COOLDOWN_FRAMES: 18, // ハンマーを振ったあと、次のハンマーを振れるまでのtick数（0.3秒 @ 60Hz）
  });
})(window);
