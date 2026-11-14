# Rerikuru 開発コンテキスト

> **引き継ぎ用の唯一の正。** 新規チャットではこのファイルだけで作業を開始できる。
> 作業完了時は「進捗」「未決事項」「変更ログ」「API早見表」を更新して全文出力すること。
> 仕様書（`仕様書.txt`）と食い違う場合は **このファイル（確定した設計決定）が優先**。

---

## 0. いまの状態
- **概要**: ファミコン時代の固定画面2Dアクションパズル（ハンマーで壊し、敵の挙動を利用してクリア）の再構築。HTML + Canvas + 素のJS（ES Modules不使用、`window.RK` 名前空間、`index.html` 直開きで動作）。
- **実装済み（ステップ0〜8b-4）**:
  - 256×216（16列×9行）の2レイヤー描画（`floor` / `objects`）、整数倍拡大、グリッド線表示（Gキー）。親方（`foreman`）は物レイヤー（壁など）より裏側に描画。
  - 固定60Hzループ、キーボード・擬似スティック・ハンマーボタンの入力統一（ラッチ対応）。
  - プレイヤーの左右移動（チョン押し＋連続移動）、画面端の左右ループ（端をまたぐ体の足場・樽判定、両側描画）。
  - 樽の横衝突（樽のみ通れない。壁は背景側のため通れる）、1ドットでも足場に乗れば立てる判定、通常落下（`mode: 'fall'`）。
  - 梯子の昇降（乗る・昇り降り・途中から左右に降りる・落下中に上入力でつかまる。**A: 下から上入力で乗り、梯子の真上に床があるときのみ床をすり抜けて上の床に乗れる。B: 床の上から下入力で、真下の梯子に床をすり抜けて乗れる（敵と同じ）**。上が穴のてっぺんでは足場列へ横に入れない）。梯子昇降速度は上下共通・キャラ個別定数＋サブピクセル累積対応済み。
  - ハンマー攻撃と壁3種・壊せる梯子 `L` の破壊（歩行可能な `ground` 状態でのみ画面奥1セルを叩き、`W`=1/`w`=2/`V`=3回で破壊、`L` は1振りで叩いた位置から0.2s間隔で上下に連鎖消滅。爆弾 `B`・扉 `D`・鉄柱 `I`・壊せない梯子 `H` は壊せない。壁破壊しきり時に相手が同セルに立っていると相互異常落下）。
  - 異常落下（`mode: 'abnormal_fall'`。途中の床や途中の段の樽を無視し、一番下の床またはその上の樽まで落下。落下中は無敵、着地で即座に無敵解除＆プレイヤーと親方は0.5秒・通常敵は1.0秒の着地硬直）。
  - 敵の共通土台（`js/entities/enemy.js`）: 敵4種（`chaser` / `runner` / `foreman` / `fast_chaser`）のスポーン、節目イベント、サブピクセル累積による整数ドット移動（地上・梯子とも）、梯子昇降（キャラ個別速度対応）、通常落下（スタンなし・加速なし・即行動再開）、異常落下（通常敵のみ速度段階上昇・最大2段階、親方は加速なし・プレイヤーと同じ0.5sスタン）。
  - Chaser & Fast Chaser AI（`js/ai/chaser.js`）、Runner AI（`js/ai/runner.js`）、**Foreman AI（`js/ai/foreman.js`）** 実装・調整完了（プレイヤー付近での定期停止抑制、ロック対象への確実な1振り目、判定範囲・周期の適正化済み）。
  - **壊せる梯子（`L`）の連鎖崩壊＆捕まりキャラ挙動（`js/core/game.js`）** 実装完了（0.2s間隔上下連鎖、崩壊開始時の敵降りかけ引き返し、消滅マスでの床着地トリガー再現および空中消滅時の異常落下）。
  - **親方挙動確認用テストステージ（`js/data/stages/stage01.js`）** 作成完了。
- **未実装**: 鉄柱 `I`・爆弾 `B`（導火線・爆発連鎖）・扉 `D`（開閉・敵の隠れ）の挙動、落下する樽、火の玉、ライフ・ゲーム進行（READY/PLAY/MISS/CLEAR）、ステージエディタ、ドット絵・サウンド。
- **次の作業**: **ステップ9**（樽の落下・鉄柱 `I`・爆弾 `B`・扉 `D` の挙動実装）。
- **テスト**: `node tests/run.js`（148件全通過）と `node tests/smoke.js`（全通過）。

## 1. 作業ルール（AI への指示）
1. **仕様にない独自ルールを勝手に追加しない。** 決める必要が出たら「未決事項」に書き、選択肢を出して聞く。暫定値を入れた場合は §9 と「進捗」に「暫定」と明記する。
2. 最優先は見た目ではなく、**ルールと挙動を正確に再現できる土台**。ドット絵・演出は後回し。
3. 1ステップずつ進め、前のステップが崩れていないことを `tests/` で確認してから次へ進む。新ルールには `tests/run.js` にテストを足す。
4. 描画はルールを持たない（状態を読むだけ）。Stage はエディタと本編で共通。敵AIは「次の方向を返すだけ」で移動処理と分離する。
5. コードを書く前に、必要な既存ファイルが手元に無ければ**先に「このファイルを貼って」と言う**（§6 の API 早見表で足りる場合は不要）。
6. 変更したファイルは**全文**で出す（差分だけにしない）。最後に `context.md` の更新版を全文で出す。
7. ES Modules は使わない（`file://` 直開きでの CORS 回避のため）。`window.RK` + 通常の `<script>` を使う。
8. 返答は日本語。

---

## 2. ゲームルール要約（仕様書基準）

### 全体・進行
- ステージは固定1画面。床・梯子・壁・樽・鉄柱・爆弾・扉で構成。
- 敵の行動は**決定的**（同じ状況・同じ乱数シードなら同じ判断）。**A\* などの汎用経路探索は使わず**ゲーム固有ルールで決める。
- 通常の左右移動は画面端で反対側へループするが、**梯子の探索距離比較は画面端で折り返さない**。
- ライフ初期値3、0でゲームオーバー。ミス条件は「通常の敵との接触 / 火の玉 / 落ちてくる樽」。**親方（Foreman）との接触だけではミスにならない**。
- 状態遷移: **READY**（約1.5秒）→ **PLAY** → **MISS**（約1.2秒後に再開）/ **CLEAR**（約2秒）。READY/MISS 中は操作も敵AIも停止。

### 敵（4種）
- **Chaser（追尾）**【実装済】: プレイヤーと**同じ高さ** → プレイヤー方向へ進み、間に同じ高さの樽があれば反転。**違う高さ** → 水平到達可能な接続済み梯子から距離最短（非ループ距離、同距離なら左優先）を選択。行き止まり梯子も登り、てっぺんの行き止まりに着いたら1段降りて通常アルゴリズムに戻る。有効な梯子が無いときは「左側に同じ高さの樽があれば右、なければ左」。障害物で反転し、梯子付近の循環時は停止＋再判定フラグ。通常落下着地時＆異常落下スタン終了時に再判定。
- **Runner（直進）**【実装済】: プレイヤーを追跡しない。初期方向（`runnerDir`、既定は右）へ直進し、樽等で進めなければ反転。梯子では初回は下優先（`null` → `1` → `-1`）、決定後は記録された `runnerVertical` を優先（不可なら反転・記録更新）。行き止まり梯子も登り、てっぺんの行き止まりに着いたら1段下がり下向き傾向（`runnerVertical = 1`）で通常アルゴリズムに従う。**縦移動直後は `horizontalNext = true` により横移動を最優先**し、横へ出られない高さなら再び縦移動する。
- **Foreman（親方）**【実装済】: ゲーム中最速（`1.1` ドット/tick）で Chaser と同じ追跡アルゴリズムで移動（加速なし）。移動開始から `4.0〜6.0s` 経つと `0.6〜1.2s` 立ち止まり、動き出す瞬間に方向転換トリガーが働く（プレイヤー至近距離では巡回小休止を抑制）。プレイヤーが壊せる梯子 `L` か壁 `W`/`w`/`V` の場所に立っており親方もそこにいるとき、対象セルをロックして `0.3〜0.8s` 立ち止まり、停止明けに最低1回は必ずハンマーを振り下ろす。さらに `1.0s` 後にプレイヤーがまだ振り判定範囲内かつ対象が残っていれば続けて振り下ろし、範囲外・対象なしになれば方向転換トリガーを発動して歩き出す。扉・爆弾・鉄柱・不可梯子の前では振らず壊せない。壁を完全に破壊した瞬間に相手（プレイヤー⇔親方）がその壁の前に立っていたら相互に異常落下させる。異常落下後のスタンはプレイヤーと同じ（0.5s）。**ステージの裏側（壁などの奥）に描画されるキャラ**。
- **Fast Chaser（高速追尾）**【実装済】: 判断ロジックは Chaser と完全共通、**速度パラメータのみ別**。
- **落下後ペナルティ**: 通常の敵は**異常落下着地後**に一定時間スタンし、速度段階が上がる（上限あり、最大2段階）。**通常落下ではスタンも加速（速度段階上昇）もしない**。プレイヤーと親方は加速しない（親方の異常落下スタンはプレイヤーと同じ0.5s）。

### オブジェクト
- **床**: 立てる面。通常落下を止める。**破壊可能オブジェクトとは独立**（壁等を壊しても床は消えない）。
- **壁**: 3種（`W` / `w` / `V`）。背景側にあるため横から通り抜けられる。耐久値あり（1 / 2 / 3）。
- **梯子**: 破壊可（`L`）と不可（`H`）。`L` はプレイヤー・親方どちらのハンマーでも1振りで叩いた位置から壊れ始め、`0.2s`（12tick）間隔で上下へ1マスずつ連鎖消滅する（横には連鎖しない）。崩壊開始時に上から降りかけ（`LADDER_RETREAT_DOTS = 12` ドット未満）の敵は引き返し、深く降りすぎていた敵はそのまま降りる。消滅時に捕まっていたキャラは、下にまだ `L` が残っている（連なり最下端足場アルゴリズム再現）または足場がある高さなら地面に着地して普段の着地トリガーが発動し、空中なら異常落下する。
- **樽**: 物理障害物。**横から通り抜けられず、上に乗れる**（上面が足場）。敵の進行方向選びにも影響。
- **鉄柱（`I`）**: 壊せる（ステップ9）。壁や樽を支えていることがあり、壊すと支えていた物が遅延後に落ちることがある。床判定とは別管理。
- **爆弾（`B`）**: ハンマーで導火線作動 → 一定時間後に爆発し、隣接オブジェクトを破壊（横へ連鎖することがある）。範囲内のキャラは異常落下等。通常のハンマー破壊対象ではない特殊物（親方のハンマーでは壊せない）。
- **扉（`D`）**: ハンマーで一定時間開く。敵が中に入って隠れることがあり、全敵が隠れたら強制的に開いて再出現（親方のハンマーでは壊せない）。
- **火の玉**: 画面端から一定間隔で出現し横移動（**反対側からは出ない**）。接触でミス。

---

## 3. 用語
| 用語 | 意味 |
|---|---|
| ドット | 論理ピクセル（座標の単位・整数）。画面は 256 × 216 ドット |
| セル | 16 × 24 ドットのマス（16列 × 9行） |
| 足場面 | 床の面。セルの下端 `y = (row+1)*24` にある厚み0の線（描画用の帯4ドットとは別） |
| 中心x / 足y | キャラ座標。足場面に立つとき `足y = 足場面のy` |
| tick | ロジックの1ステップ（1/60秒） |
| チョン | 方向を一瞬押して数ドットだけ進める移動（§7） |
| ラッチ | tick 間の「押して離した」短い入力を次の `poll()` で1回拾う仕組み |
| アクター | 動くもの（プレイヤー・敵）。`game.actors` に入る |

---

## 4. 確定した設計決定
| 項目 | 決定内容 |
|---|---|
| 画面・セル | 256 × 216（16列 × 9行）、1セル = 16 × 24（横2:縦3）。整数倍拡大＋`image-rendering: pixelated` |
| ステージ2レイヤー | `floor`（`=` / `.` のみ）と `objects`（壁・梯子・樽・アクター初期位置等）の2層構造 |
| 床の判定と描画 | 床はセル下端の**厚み0の面**（セルを占有しない）。見た目だけ下端4ドット（`FLOOR_DRAW_H`）に帯を描く |
| 座標・体と足幅 | 座標は整数ドット（グリッド吸着なし）。体は横 `x - w/2` 〜 `x + w/2 - 1`、縦 `y - h` 〜 `y - 1`（`w=12, h=24`）。横12ドットのうち**1ドットでも足場（床面・樽上面）に重なっていれば立てる** |
| 梯子のすり抜けと上端 | 梯子は上下の足場面の間をすべて `L`/`H` で埋める。**梯子の真上に床（`=`）があるときに限り床をすり抜けて昇り、上端 `y = span.top` でその床（`'ground'`）に乗れる**。上が穴（`.`）のてっぺんでは、足場のある列（床・樽上面）へ横に入れない（`blockedByFloorX`）。途中の高さでは左右に降りられ、中心から `LADDER_GRAB_DOTS`（暫定4）を超えると外れて足場があれば `'ground'`、なければ通常落下。落下中に上入力でつかまる。**床の上から下入力で、足場面の真下のセルに梯子があれば（中心から `LADDER_GRAB_DOTS` 以内）床をすり抜けて乗れる（B。確定。**梯子の真上に床があるときだけ**。穴のてっぺんの梯子には下入力では乗らない）** |
| 横方向の衝突 | **樽だけ**横から通れない（セル全体 16×24、上面は足場）。**壁（`W`/`w`/`V`）は画面奥側（背景）のため通れる**（鉄柱・扉・爆弾はステップ9で確定） |
| 壁耐久値とハンマー | `W`=1, `w`=2, `V`=3 で破壊（床は残る）。プレイヤーは歩行可能な `mode === 'ground'` のみ使用可、画面奥1セルを1回叩く（同時破壊なし）。歩行ロック `0.3s`（18tick）とクールタイム `0.3s`（18tick）を分離管理。壁破壊しきり時に相手（プレイヤー⇔親方）がその壁のセルに立っていれば相互に異常落下する |
| 壊せる梯子 `L` の破壊 | プレイヤー・親方どちらのハンマーでも1振りで叩いた位置から壊れ始め、`0.2s`（12tick）間隔で上下の `L` へ1マスずつ連鎖消滅（横へは連鎖しない）。崩壊開始時に上から降りかけ（`LADDER_RETREAT_DOTS = 12` ドット未満）の敵は引き返し、深く降りすぎていた敵はそのまま降りる。捕まっていた部分が消滅した際、下にまだ `L` が残っているか足場があれば地面に着地して普段の着地トリガーが発動し、空中なら異常落下する |
| 画面端ループ（暫定） | 中心 `x` が画面外へ出た瞬間に反対側へ移す（常に `0〜WIDTH-1`）。端をまたぐ体の足場・樽判定は反対側の列として行い、描画は両側に描く。梯子距離比較は折り返さない |
| 通常落下 vs 異常落下 | 完全に別状態として扱う。**通常落下（`fall`）**: 足場がなくなると発生し、床か樽の上面で停止（**敵も通常落下ではスタンも加速もしない。着地後すぐ行動再開**）。**異常落下（`abnormal_fall`）**: 梯子破壊・壁破壊・爆発等で発生。**途中の床や途中の段の樽をすり抜け、一番下の床（`y = HEIGHT`）または一番下の床の上の樽の上面でのみ停止**。**落下中は無敵（`invincible = true`）**・操作不可。着地した瞬間に `'ground'` へ戻り、**即座に無敵解除（`invincible = false`）**・着地硬直に入り、通常敵は速度段階（`speedBoost`）が1上がる（最大2段階。親方は加速なし・プレイヤーと同じ0.5s硬直） |
| 敵AI（全4種完了） | 決定的PRNG・整数ドット連続移動・イベント駆動（Chaser / Fast Chaser / Runner / Foreman）。Foreman は物レイヤーより裏側に描画される |

---

## 5. フォルダ構成と読み込み順

### 実在するファイル（プロジェクトルート直下）
- `index.html`: 読み込み順＝依存順の `<script>` 定義とタッチUIのDOM
- `context.md` / `仕様書.txt`: 本ファイル / 再構築仕様書原文
- `css/style.css`: 画面・擬似スティック・ハンマーボタンのスタイル
- `js/config.js`: 定数（画面・セル・移動/落下速度・キャラ別梯子速度・壁HP・クールタイム・敵・親方・梯子崩壊定数）
- `js/main.js`: 起動・配線のみ（ルールを持たない）
- `js/core/input.js`: 入力統一（スナップショット・ラッチ・キーボード接続）
- `js/core/touch.js`: 擬似スティック＋ハンマーボタン（Pointer Events）
- `js/core/loop.js`: 固定60Hzタイムステップループ
- `js/core/game.js`: ゲーム状態・Stage生成・プレイヤー/敵生成・ハンマーヒット共通処理・梯子連鎖崩壊管理
- `js/physics/terrain.js`: 足場・通常/異常落下・樽/床横衝突・梯子範囲・画面端ループ判定（純粋関数群）
- `js/entities/player.js`: プレイヤー状態・移動・落下・梯子・ハンマー・硬直制御
- `js/entities/enemy.js`: 敵共通土台（スポーン・節目イベント発火・サブピクセル移動/梯子昇降・通常/異常落下・スタン・`registerAI`）
- `js/ai/chaser.js`: Chaser & Fast Chaser の行動アルゴリズム（`RK.ChaserAI`）
- `js/ai/runner.js`: Runner の行動アルゴリズム（`RK.RunnerAI`）
- `js/ai/foreman.js`: Foreman（親方）の行動アルゴリズム（`RK.ForemanAI`）
- `js/stage/symbols.js`: ステージ記号定義・壁初期HP
- `js/stage/stage.js`: `{ floor, objects }` 解析・検証・耐久値管理・`toData()`
- `js/data/stages/stage01.js`: ステージ1定義（2レイヤー。現在は親方挙動確認用レイアウト）
- `js/render/screen.js`: Canvas初期化・整数倍拡大
- `js/render/sprites.js`: 仮スプライト描画（壁ひび割れ・異常落下点滅・スタン表示・両側描画）
- `js/render/renderer.js`: Stage とアクターの描画（親方の裏側描画対応）
- `tests/run.js` / `tests/smoke.js`: Node標準機能のみで動くロジックテスト（148件）＆偽DOM起動テスト

### 今後追加する予定のフォルダ・ファイル
- `js/objects/`（落下樽・鉄柱・爆弾・扉・火の玉）、`js/editor/`（ステージエディタ）、`js/audio/`（サウンド）

### 読み込み順（`index.html` / `tests/smoke.js` で検証）
`config` → `stage/symbols` → `stage/stage` → `data/stages/stage01` → `core/input` → `core/touch` → `core/loop` → `physics/terrain` → `entities/player` → `entities/enemy` → `ai/chaser` → `ai/runner` → `ai/foreman` → `core/game` → `render/screen` → `render/sprites` → `render/renderer` → `main`

---

## 6. API 早見表

全ファイルは `(function (w) { const RK = (w.RK = w.RK || {}); ... })(window);` で囲み、`RK.<名前>` に登録する。

### 6.1 座標と単位
- 原点は左上、**y は下向きが正**。単位は整数ドット。
- キャラは `x`（中心）、`y`（足）。セル位置は `col = stage.colAt(x)`、`row = stage.rowAtFeet(y)`（足が足場面にあるときは上のセルの行、例: `y=216 → row 8`）。

### 6.2 主要データ構造
- **Stage**（`RK.Stage.parse(name, data)` の戻り値）:
  - `name`, `cols`（16）, `rows`（9）, `floors[row][col]`（`'floor' | 'empty'`）, `cells[row][col]`（symbol id）, `hp[row][col]`（残り耐久値）, `spawns`（`[{ id, col, row }]`）, `errors`（`string[]`）, `runnerDir`（`-1 | 1`）
- **Player**（`RK.Player.create(stage, spawn)` の戻り値）:
  - `id: 'player'`, `x`, `y`, `w`（12）, `h`（24）, `facing`（`-1|1`）, `mode`（`'ground' | 'fall' | 'abnormal_fall' | 'ladder'`）, `ladderCol`, `climbAccum`, `stepDir`, `stepTick`, `hammerFrames`, `hammerLockFrames`, `hammerCooldown`, `stunFrames`, `invincible`
- **Enemy**（`RK.Enemy.create(stage, spawn)` の戻り値）:
  - `id`（`'chaser' | 'runner' | 'foreman' | 'fast_chaser'`）, `x`, `y`, `w`（12）, `h`（24）, `facing`（`-1|1`）, `dirX`（`-1|0|1`）, `dirY`（`-1|0|1`）, `mode`（`'ground' | 'fall' | 'abnormal_fall' | 'ladder'`）, `ladderCol`, `stunFrames`, `wasAbnormalFall`, `invincible`, `speedBoost`（`0..2`）, `moveAccum`, `climbAccum`, `needsReeval`, `runnerVertical`（`null | -1 | 1`）, `horizontalNext`（`boolean`）, `hammerFrames`, `pauseFrames`, `foremanPhase`, `foremanWalkTimer`, `foremanCheckTick`, `foremanLockedTarget`
- **Game**（`RK.Game.create(stageData)` の戻り値）:
  - `{ stage, player, enemies: [...], actors: [...], tick, rngState, ladderCollapses: [...] }`

### 6.3 各モジュールの公開API
| 名前 | 主なメソッド・プロパティ |
|---|---|
| `RK.CONFIG` | `CELL_W`(16) `CELL_H`(24) `COLS`(16) `ROWS`(9) `WIDTH`(256) `HEIGHT`(216) `BG_COLOR` `FLOOR_DRAW_H`(4) `TICK_HZ`(60) `PLAYER_*` `ENEMY_*` `RUNNER_SPEED`(0.9) `FAST_CHASER_SPEED`(1) `FOREMAN_SPEED`(1.1) `FOREMAN_CLIMB_SPEED`(1.1) `FOREMAN_WALK_*` `FOREMAN_PAUSE_*` `FOREMAN_SPOT_*` `FOREMAN_SWING_*` `FOREMAN_ALIGN_*` `FOREMAN_CHECK_INTERVAL`(2) `LADDER_COLLAPSE_INTERVAL_FRAMES`(12) `LADDER_RETREAT_DOTS`(12) `WALL_*_HP` `HAMMER_*` `LADDER_GRAB_DOTS` |
| `RK.Symbols` | `LAYER`（`NONE / FLOOR / OBJECT / ACTOR`）, `defs`, `byChar`, `byId` |
| `RK.Stage` | `Stage`, `parse(name, data)`。メソッド: `inBounds(c,r)` `wrapCol(c)` `idAt(c,r)` `hpAt(c,r)` `maxHpAt(c,r)` `hasFloor(c,r)` `surfaceY(r)` `colAt(x)` `rowAtFeet(y)` `centerX(c)` `setId(c,r,id)` `setFloor(c,r,v)` `damageCell(c,r,amount)` `toData()` |
| `RK.Input` | `create()` → `{ set(source, name, down), releaseAll(source), poll() }`, `attachKeyboard(input, window)`, `KEYMAP`, `NAMES` |
| `RK.Touch` | `attach(input, { stick, knob, hammer })` |
| `RK.Loop` | `createStepper(update)` → `{ advance(dtMs) }`, `start(update, render)`, `STEP_MS`, `MAX_DT`, `MAX_STEPS` |
| `RK.Player` | `create(stage, spawn)`, `update(p, input, stage, game?)`, `moveX(p, d, stage?, solidFloor?)`, `startAbnormalFall(p)` |
| `RK.Enemy` | `ENEMY_IDS`, `isEnemyId(id)`, `registerAI(id, fn(e, event, game))`, `create(stage, spawn)`, `update(e, game)`, `startFall(e)`, `startAbnormalFall(e)`, `triggerAI(e, event, game)` |
| `RK.ChaserAI` | `decide(e, event, game)`, `canClimbUpAt(stage, col, y)`, `canClimbDownAt(stage, col, y)`, `hasBarrelBetween(stage, row, x1, x2)`, `hasBarrelOnLeft(stage, row, ex)`, `selectTargetLadder(stage, e, needUp)` |
| `RK.RunnerAI` | `decide(e, event, game)`, `canClimbUpAt(stage, col, y)`, `canClimbDownAt(stage, col, y)` |
| `RK.ForemanAI` | `decide(e, event, game)`, `onTick(e, game)`, `isBreakableTargetId(id)`, `findBreakableTargetCell(stage, e, player)` |
| `RK.Physics` | `isSupported(stage, x, y, bw)`, `isAbnormalSupported(stage, x, y, bw)`, `fallTo(stage, x, bw, y, dist)`, `abnormalFallTo(stage, x, bw, y, dist)`, `ladderSpan(stage, col, y)`, `ladderColAt(stage, x, row)`, `blockedX(stage, nx, y, bw, bh, dir)`, `blockedByFloorX(stage, nx, y, bw, dir)`, `wrapX(x)` |
| `RK.Game` | `create(stageData)`, `update(game, input)`, `hitCellByHammer(game, attacker, col, row)`, `startLadderCollapse(game, col, hitRow)` |
| `RK.Screen` | `init(canvas)`, `fit()`, `ctx`, `scale` |
| `RK.Sprites` | `register(id, fn(ctx,x,y,w,h,hp?,maxHp?))`, `draw(ctx,id,x,y,w,h,hp?,maxHp?)`, `drawActor(ctx, actor)`, `drawers` |
| `RK.Renderer` | `drawStage(ctx, stage, actors?)`, `showGrid`, `drawGrid` |

### 6.4 1フレームの流れ & DOM ID
- **DOM ID**: `screen`（canvas）, `status`, `errors`, `btn-grid`, `stick`, `stick-knob`, `btn-hammer`（デバッグ用に `RK.game`, `RK.stage`, `RK.input` を公開）。
- **処理順**: 入力デバイス → `RK.Input.set` → 1/60秒ごとに `Game.update(game, input.poll())` → `updateLadderCollapses` → `Player.update` → `Enemy.update`（全敵）。
- **描画順**: 裏側アクター（親方 `foreman`） → 物（壁・梯子・樽等） → 表側アクター（プレイヤー＋他の敵＋ハンマー） → 床（足元4ドット帯） → グリッド線。

---

## 7. コード規約・ステージ記号・パラメータ

### コード規約
- 床は `Stage.hasFloor(col,row)` と `Stage.surfaceY(row)` で扱い、`cells` には入れない。
- 床・破壊可能物・梯子・樽・通常落下・異常落下はそれぞれ独立した概念・状態として扱う。
- ステージ不正は例外を投げず `stage.errors` に蓄積。乱数は `game.rngState` による決定的な PRNG を使用。

### ステージ記号（`floor` / `objects` 各16文字×9行）
- **床レイヤー**: `=` 床（セル下端の面） / `.` なし
- **物レイヤー**: `.` 空 / `W` 壁A(耐久1) / `w` 壁B(耐久2) / `V` 壁C(耐久3) / `L` 梯子(破壊可) / `H` 梯子(破壊不可) / `O` 樽 / `I` 鉄柱 / `B` 爆弾 / `D` 扉 / `P` プレイヤー(必須1つ) / `1` Chaser / `2` Runner / `3` Foreman / `4` Fast Chaser
- **stage01 ルール**: 行0,1はHUD用の空き。行2,4,6,8の下端（`y=72,120,168,216`）に足場面。テストは `stage01` の配置に依存させず `mkStage()` 等を使うこと。

### 操作感・敵パラメータ（`js/config.js`）
| 定数 | 値 | 区分・意味 |
|---|---|---|
| `PLAYER_W` / `PLAYER_H` | 12 / 24 | 確定。当たり幅・高さ |
| `PLAYER_SPEED` | 1 | 暫定。押し続け時の速さ（ドット/tick） |
| `PLAYER_TAP_DOTS` / `TAP_FRAMES` | 3 / 6 | 暫定。チョン押しで進むドット数と所要tick |
| `PLAYER_FALL_SPEED` / `ABNORMAL` | 2 / 2 | 落下速度（ドット/tick、加速なし） |
| `PLAYER_ABNORMAL_LAND_STUN_FRAMES` | 30 | 確定。異常落下着地後の硬直tick数（0.5秒。親方も共通） |
| `PLAYER_CLIMB_SPEED` | 1 | 暫定。プレイヤーの梯子昇降速度（上下共通、ドット/tick） |
| `LADDER_GRAB_DOTS` | 4 | 暫定。梯子中心からのつかまり許容範囲（ドット） |
| `LADDER_COLLAPSE_INTERVAL_FRAMES` | 12 | 確定。壊せる梯子 `L` の連鎖崩壊間隔（0.2秒 @ 60Hz） |
| `LADDER_RETREAT_DOTS` | 12 | 暫定（調整可）。梯子崩壊開始時、上から降りかけの敵が引き返す深さ上限（ドット） |
| `WALL_A_HP` / `B` / `C` | 1 / 2 / 3 | 確定。壁 `W` / `w` / `V` の初期耐久値 |
| `HAMMER_FRAMES` / `LOCK` / `COOLDOWN` | 12 / 18 / 18 | 確定。ハンマー表示・歩行ロック・クールタイム（tick） |
| `ENEMY_W` / `ENEMY_H` | 12 / 24 | 暫定。敵の当たり幅・高さ |
| `ENEMY_SPEED` / `RUNNER` / `FAST` / `FOREMAN` | 0.8 / 0.9 / 1 / 1.1 | 暫定。Chaser / Runner / Fast Chaser / Foreman の基本移動速度 |
| `ENEMY_SPEED_BOOST_STEP` | 0.2 | 暫定。異常落下経験1回あたりの速度上昇幅（最大2段階。通常落下・親方は対象外） |
| `ENEMY_CLIMB_SPEED` / `RUNNER` / `FOREMAN` / `FAST` | 1 / 1 / 1.1 / 1 | 暫定。各敵種の梯子昇降速度 |
| `ENEMY_FALL_SPEED` | 2 | 暫定。敵の落下速度（ドット/tick） |
| `ENEMY_ABNORMAL_LAND_STUN_FRAMES` | 60 | 暫定。通常敵の異常落下後スタンtick数（1.0秒。親方は30tick） |
| `FOREMAN_WALK_MIN/MAX_FRAMES` | 240 / 360 | 確定。親方の定期立ち止まりまでの移動時間（4.0〜6.0秒） |
| `FOREMAN_PAUSE_MIN/MAX_FRAMES` | 36 / 72 | 確定。親方の定期立ち止まり時間（0.6〜1.2秒） |
| `FOREMAN_SPOT_MIN/MAX_FRAMES` | 18 / 48 | 確定。親方のプレイヤー到達時停止時間（0.3〜0.8秒） |
| `FOREMAN_SWING_INTERVAL_FRAMES` | 60 | 確定。親方の振り下ろし後の待機時間（1.0秒） |
| `FOREMAN_CHECK_INTERVAL` | 2 | 調整済。接近・ハシゴ高さ合わせのチェック周期（tick） |
| `FOREMAN_ALIGN_X/Y` & `SWING_X/Y` | 12,14 / 20,18 | 調整済。位置合わせ停止範囲と振り判断範囲（ドット） |

---

## 8. 進捗
- [x] **0〜2**: 座標系（256×216、16×24セル）、2レイヤー解析・検証、仮スプライト・グリッド表示
- [x] **3〜4**: 60Hzループ、入力統一・タッチUI、左右移動（チョン＋連続）、樽横衝突、床判定・通常落下
- [x] **5〜6**: 梯子昇降（床すり抜け条件・穴てっぺん壁制限含む）、画面端左右ループ
- [x] **7**: ハンマー攻撃（`ground` のみ・画面奥1セル・同時破壊なし・ロックとクールタイム分離）と壁3種の耐久値・ひび割れ破壊（`run.js` 100件通過）
- [x] **8a**: 異常落下（`abnormal_fall`、途中の床・樽すり抜け、落下中無敵、着地で即無敵解除＆0.5秒硬直、`run.js` 105件通過）
- [x] **8b-1**: 敵の共通土台（`js/entities/enemy.js`。スポーン・節目イベント発火・移動・梯子昇降・通常/異常落下・スタン、`run.js` 113件通過）
- [x] **8b-2**: Chaser & Fast Chaser の行動アルゴリズム実装（`js/ai/chaser.js`、`run.js` 128件通過）
- [x] **8b-3**: Runner の行動アルゴリズム実装（`js/ai/runner.js`、`run.js` 138件通過）、通常落下加速廃止＆下入力梯子降り実装（`run.js` 140件通過）
- [x] **8b-4**: Foreman（親方）の個別AI・裏側描画（`js/ai/foreman.js`、`js/render/renderer.js`）、壁破壊時の相互異常落下、および壊せる梯子 `L` の0.2s連鎖破壊・敵降りかけ引き返し・床着地判定の実装・調整（`run.js` 148件通過）。親方挙動確認用 `stage01.js` 作成
- [ ] **9**: 樽（落下）・鉄柱 `I`・爆弾 `B`・扉 `D`
- [ ] **10**: 火の玉・ライフ・ゲーム進行（READY/PLAY/MISS/CLEAR）
- [ ] **11**: ステージエディタ（スマホ対応）
- [ ] **12**: ドット絵・アニメーション・サウンド

---

## 9. 未決事項（決定したら §4 へ移動）
1. **横方向の衝突（残り）**（ステップ9で決定）: 鉄柱 `I`・扉 `D`・爆弾 `B` を横に通れるか（樽は不可、壁は可で確定済み）。
2. **鉄柱 `I`・爆弾 `B`・扉 `D`・落下樽の仕様詳細**（ステップ9で実装）: 鉄柱破壊で支えていた壁・樽が落ちる遅延時間、爆弾の導火線時間・爆発範囲・横連鎖条件、扉の開放時間・敵が隠れる条件と再出現ルール。
3. **物レイヤーの重ね・床の描画順**: 壁と鉄柱の重ねが必要になった場合のレイヤー拡張、およびドット絵化時の描画順見直し。
4. **画面端ループ・はみ出し描画の見え方**: 中心 `x` 基準での反転タイミングやキャンバス外はみ出しの見え方を実機確認して調整。
5. **暫定パラメータの最終調整**: §7 の移動・落下・梯子速度、敵速度・スタン時間、梯子降りかけ引き返し深さ（`LADDER_RETREAT_DOTS`）、スティック形式を実機プレイで調整。

---

## 10. 引き継ぎ・テスト手順 & 変更ログ
- **新規チャット開始時のプロンプト例**:
  > 添付の context.md を読んで、「進捗」の次のステップ（9）から続けて。既存のコードが必要なファイルは先に言って。作業後は context.md を更新して全文を出して。
- **完了時確認**: プロジェクトフォルダに上書き後、`node tests/run.js` と `node tests/smoke.js` を実行して全件パスすることを確認する。
- **変更ログ**:
  - ステップ0〜8b-3完了（`tests/run.js` 140件・`tests/smoke.js` 17件全通過）。
  - ステップ8b-4完了・調整: `js/ai/foreman.js`（プレイヤー至近距離での定期立ち止まり抑制、ロック対象への確実な1振り目追加）、`js/config.js`（親方判定範囲・チェック周期調整）、`js/core/game.js`・`js/entities/player.js`・`js/entities/enemy.js`・`js/render/renderer.js`・`index.html`・`tests/run.js` 更新（148件全通過）。親方挙動確認用 `js/data/stages/stage01.js` 作成。
