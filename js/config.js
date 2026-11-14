/* ===== 全体定数 =====
 * 座標の単位は「論理ピクセル（1ドット）」の整数。
 * 1セル = 横16 x 縦24 ドット（横2 : 縦3）。
 * 縦横比を変えるときは CELL_H（と、必要なら ROWS）だけ直す。
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
    PLAYER_ABNORMAL_FALL_SPEED: 2,        // 異常落下の速さ。通常落下と同じ（1tickあたり2ドット）
    PLAYER_ABNORMAL_LAND_STUN_FRAMES: 30, // 異常落下の着地後に動けないtick数（0.5秒 @ 60Hz。変更可能）

    // --- 梯子（ステップ5・8b-4） ---
    PLAYER_CLIMB_SPEED: 1,              // プレイヤーの梯子昇降速度（上下共通、ドット/tick。小数値も可）
    LADDER_GRAB_DOTS: 4,                // 梯子の中心から何ドット以内なら乗れる/つかまれる/つかまっていられるか（中心x のずれ）
    LADDER_COLLAPSE_INTERVAL_FRAMES: 12,// 壊せる梯子(L)の連鎖崩壊間隔（0.2秒 @ 60Hz）
    LADDER_RETREAT_DOTS: 12,            // 梯子崩壊開始時、上から降りかけの敵が引き返す上限深さ（ドット。直しやすいよう定数化）

    // --- 壁の耐久値（ステップ7。確定） ---
    WALL_A_HP: 1,           // 壁A (W): 1回叩くと破壊
    WALL_B_HP: 2,           // 壁B (w): 2回叩くと破壊
    WALL_C_HP: 3,           // 壁C (V): 3回叩くと破壊

    // --- ハンマー（ステップ7。確定） ---
    HAMMER_FRAMES: 12,          // ハンマーを表示するtick数
    HAMMER_LOCK_FRAMES: 18,     // ハンマーを振ったあと、歩行など他の行動を受け付けないtick数（0.3秒 @ 60Hz）
    HAMMER_COOLDOWN_FRAMES: 18, // ハンマーを振ったあと、次のハンマーを振れるまでのtick数（0.3秒 @ 60Hz）

    // --- 敵共通（ステップ8b。暫定値） ---
    ENEMY_W: 12,                         // 敵の当たり幅(ドット)
    ENEMY_H: 24,                         // 敵の当たり高さ(ドット)
    ENEMY_SPEED: 0.8,                    // Chaser の基本移動速度（ドット/tick。仕様比率 3.2 : 3.6 : 4 に準拠。暫定）
    RUNNER_SPEED: 0.9,                   // Runner の基本移動速度（ドット/tick。暫定）
    FAST_CHASER_SPEED: 1,                // Fast Chaser の移動速度（ドット/tick。暫定）
    FOREMAN_SPEED: 1.1,                  // Foreman（親方）の移動速度（ドット/tick。ゲーム中最速、加速なし）
    ENEMY_SPEED_BOOST_STEP: 0.2,         // 異常落下経験1回あたりの速度上昇幅（最大2段階。通常落下・親方は対象外）
    ENEMY_CLIMB_SPEED: 1,                // Chaser の梯子昇降速度（上下共通、ドット/tick。小数値も可）
    RUNNER_CLIMB_SPEED: 1,               // Runner の梯子昇降速度（上下共通、ドット/tick。小数値も可）
    FOREMAN_CLIMB_SPEED: 1.1,            // Foreman の梯子昇降速度（上下共通、ドット/tick。小数値も可）
    FAST_CHASER_CLIMB_SPEED: 1,          // Fast Chaser の梯子昇降速度（上下共通、ドット/tick。小数値も可）
    ENEMY_FALL_SPEED: 2,                 // 敵の落下速度（ドット/tick）
    ENEMY_ABNORMAL_LAND_STUN_FRAMES: 60, // 敵の異常落下後のスタンtick数（1.0秒 @ 60Hz。親方はプレイヤーと同じ30tick）

    // --- 親方（Foreman）専用パラメータ（ステップ8b-4） ---
    FOREMAN_WALK_MIN_FRAMES: 240,        // 立ち止まりまでの最小移動時間（4.0秒 @ 60Hz）
    FOREMAN_WALK_MAX_FRAMES: 360,        // 立ち止まりまでの最大移動時間（6.0秒 @ 60Hz）
    FOREMAN_PAUSE_MIN_FRAMES: 36,        // 定期立ち止まりの最小時間（0.6秒 @ 60Hz）
    FOREMAN_PAUSE_MAX_FRAMES: 72,        // 定期立ち止まりの最大時間（1.2秒 @ 60Hz）
    FOREMAN_SPOT_MIN_FRAMES: 18,         // プレイヤーグリッド到達時の停止最小時間（0.3秒 @ 60Hz）
    FOREMAN_SPOT_MAX_FRAMES: 48,         // プレイヤーグリッド到達時の停止最大時間（0.8秒 @ 60Hz）
    FOREMAN_SWING_INTERVAL_FRAMES: 60,   // 振り下ろし後から次の振り/トリガー判定までの時間（1.0秒 @ 60Hz）
    FOREMAN_CHECK_INTERVAL: 2,           // 接近・ハシゴ高さ合わせのチェック周期（tick）
    FOREMAN_ALIGN_X_RANGE: 12,           // 位置合わせ立ち止まりの横判定範囲（ドット）
    FOREMAN_ALIGN_Y_RANGE: 14,           // 位置合わせ立ち止まりの縦判定範囲（ドット）
    FOREMAN_SWING_X_RANGE: 20,           // 振り判断の横判定範囲（ドット。位置合わせより広め）
    FOREMAN_SWING_Y_RANGE: 18            // 振り判断の縦判定範囲（ドット）
  });
})(window);
