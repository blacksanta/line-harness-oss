# 自身のLINEアカウントを `friends` テーブルへ手動投入する

## Context

`https://line-harness.kei-01261026.workers.dev/auth/line?ref=setup` にアクセスして実機の LINE で認証したが、公式LINE（bot）側ではすでに友だち追加済みのため新規友だち追加フローは発火せず、また D1 の `friends` テーブルにも自分のレコードが存在しない、という状況。

**根本原因**：該当の LINE アカウントは Worker をデプロイする前にこの公式アカウントを友だち追加していたため、`follow` webhook イベントが発火する機会が一度も無かった（`apps/worker/src/routes/webhook.ts:89-186` の `follow` ハンドラ内で `upsertFriend` が呼ばれて初めて `friends` テーブルに INSERT される設計）。後から webhook URL を登録しても、過去の友だち分は LINE Platform から再送されないため、永久に空のまま。

**今回のスコープ**：仕組みの修正は行わず、自分1人のレコードのみ手動で `friends` テーブルへ投入する。

## 投入手順

すべて作業マシンのターミナルで実施。`<TOKEN>` は対象公式LINEの **Channel access token (long-lived)**（LINE Developers > Messaging API 設定）。

### 1. 自分の LINE userId を取得

公式LINEの follower 一覧から userId を取得：

```bash
curl -s -H "Authorization: Bearer <TOKEN>" \
  "https://api.line.me/v2/bot/followers/ids"
```

レスポンス例：`{"userIds":["U1234abcd...","U5678efgh..."],"next":"..."}`

friend が複数いて本人を特定できない場合は、各 userId に対して以下でプロフィールを引いて表示名で判別：

```bash
curl -s -H "Authorization: Bearer <TOKEN>" \
  "https://api.line.me/v2/bot/profile/<USER_ID>"
```

→ 取得した `userId` / `displayName` / `pictureUrl` を控える。

### 2. D1 名と環境を確認

Worker URL `line-harness.kei-01261026.workers.dev` は kei ユーザーが独自 Cloudflare アカウントにデプロイしたもの。`apps/worker/wrangler.toml` の構造：
- デフォルト: `database_name = "line-harness"`（kei 環境はこちらと推測）
- `[env.production]`: `database_name = "line-crm"`（blacksanta の本番用）

kei 側で実際にどちらの設定でデプロイしたかは `kei-01261026` 側にしかわからないため、本人 (= ユーザー) に確認するか、kei が使っている wrangler 設定の database_name を指定。以下では `line-harness` として例示。

### 3. `friends` テーブルへ INSERT

`friends` テーブルの全カラム（schema.sql + migrations 001/002/003/004/008/022/023 で確認済）：

| カラム | 値 |
|--------|-----|
| `id` | 新規 UUID（下記コマンドで `lower(hex(randomblob(...)))` を使い生成） |
| `line_user_id` | 手順1で取得した `U...` |
| `display_name` | プロフィールの表示名 |
| `picture_url` | プロフィール画像URL（無ければ NULL） |
| `status_message` | NULL |
| `is_following` | `1` |
| `user_id` | NULL（後続フローで自動 link されるので未設定でOK） |
| `score` | `0` |
| `created_at` / `updated_at` | JST の現在時刻 |
| `metadata` | `'{}'`（NOT NULL DEFAULT '{}'） |
| `ref_code` | `'setup'`（今回 ref=setup でアクセスしたため）or NULL |
| `line_account_id` | 単一アカウント運用なら NULL でも可。`SELECT id FROM line_accounts;` で channel_id に対応する id を確認して入れるのが理想 |
| `ig_igsid` | NULL |
| `first_tracked_link_id` | NULL |

実行コマンド（`--remote` 必須、ローカル D1 ではなく本番 D1 に書き込み）：

```bash
cd apps/worker

npx wrangler d1 execute line-harness --remote --command "
INSERT INTO friends (
  id, line_user_id, display_name, picture_url, status_message,
  is_following, score, created_at, updated_at, metadata, ref_code
) VALUES (
  lower(hex(randomblob(4))) || '-' || lower(hex(randomblob(2))) || '-4' ||
  substr(lower(hex(randomblob(2))),2) || '-' ||
  substr('89ab', abs(random()) % 4 + 1, 1) ||
  substr(lower(hex(randomblob(2))),2) || '-' || lower(hex(randomblob(6))),
  '<USER_ID>',
  '<DISPLAY_NAME>',
  '<PICTURE_URL_or_NULL>',
  NULL,
  1,
  0,
  strftime('%Y-%m-%dT%H:%M:%f', 'now', '+9 hours'),
  strftime('%Y-%m-%dT%H:%M:%f', 'now', '+9 hours'),
  '{}',
  'setup'
);
"
```

> `<USER_ID>` / `<DISPLAY_NAME>` / `<PICTURE_URL_or_NULL>` を実値に差し替え。`picture_url` が無いなら `NULL`（クォート無し）に。
> もし kei 側が `--env production` で動かしているなら `--env production` を追加。
> DB 名が違うなら `line-harness` を実際の名前に。

### 4. 投入確認

```bash
npx wrangler d1 execute line-harness --remote --command \
  "SELECT id, line_user_id, display_name, is_following, ref_code, created_at FROM friends WHERE line_user_id='<USER_ID>';"
```

1行返れば成功。

## Verification

1. **DB 直接確認**：上記 SELECT で自分のレコードが見える。
2. **管理画面で確認**：line-harness の admin 画面（`/admin/friends` 等、UIがあれば）に該当 friend が表示される。
3. **再度 `/auth/line?ref=setup`** にアクセス：今度は `/auth/callback` で `upsertFriend` が UPDATE 分岐に入り (`packages/db/src/friends.ts:106-154`)、`display_name` / `picture_url` がプロフィール最新値で更新され、`user_id` が新規 user に link される（`apps/worker/src/routes/liff.ts:686-716`）。
4. **以後のメッセージ送受信**：webhook `message` ハンドラ (`apps/worker/src/routes/webhook.ts:273-464`) で `getFriendByLineUserId` がヒットするようになり、`auto_replies` / `scenarios` が正しく発火するようになる。

## 影響範囲

- 書き込みファイル：**なし**（リポジトリのコード変更なし）
- 書き込み D1：`friends` テーブルへ 1 行 INSERT のみ
- 関連テーブルへの副作用：なし（後続の `/auth/callback` 訪問で users / friends.user_id が自動補完される）
