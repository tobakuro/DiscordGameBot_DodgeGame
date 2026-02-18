# DjangoTest側への実装依頼：ゲーム参加認証機能

## 背景

ゲームへの参加時になりすまし防止のための本人認証を追加しました。
ゲーム側（dodge-gameリポジトリ）での対応は完了しているので、
Django・Bot側で以下の実装をお願いします。

---

## Bot側に必要な実装

ユーザーがDiscordで参加コマンドを打ったとき、以下を行う：

1. そのユーザーの `discord_id`（DiscordユーザーID）と `username`（Discord表示名）を取得
2. ランダムな認証コード（例: `A3F9K2` など英数字6文字程度）を生成
3. 生成したコードをDjango DBに保存（後述のテーブル）
4. ユーザーにDMまたはチャンネルで「認証コード: `A3F9K2`（5分間有効）」と返信

---

## Django側に必要な実装

### 1. DBテーブル（モデル）

ユーザーがゲーム参加時に入力する情報は **`username` と `auth_code` の2つのみ** です。
その他のカラムはBot側が自動で設定・管理するものです。

```python
class GameAuthCode(models.Model):
    # ---- ユーザーが入力する情報 ----
    username     = models.CharField(max_length=128)  # ゲームフォームで入力
    auth_code    = models.CharField(max_length=32)   # BotのDMに届いたコードを入力

    # ---- Bot側が自動で設定・管理する情報 ----
    discord_id   = models.CharField(max_length=64)   # Botがコマンド実行者から取得
    expires_at   = models.DateTimeField()            # Botがコード生成時に設定（例: 5分後）
    used         = models.BooleanField(default=False) # 使用済みフラグ（再利用防止）
```

### 2. 新規エンドポイント `POST /api/dodge/verify/`

**認証**: 不要（ゲームサーバーから叩くため、または管理者トークン認証）

**リクエストボディ**:
```json
{
  "username": "プレイヤー1",
  "auth_code": "A3F9K2"
}
```

**レスポンス（成功 200）**:
```json
{
  "discord_id": "123456789012345678",
  "username": "プレイヤー1"
}
```

**レスポンス（失敗 400）**:
```json
{
  "message": "認証コードが無効または期限切れです。"
}
```

**バリデーションロジック**:
- `username` と `auth_code` が一致するレコードをDBで検索
- `expires_at` が現在時刻より未来であること
- `used` が `false` であること
- 上記すべて満たせば成功、レコードの `used` を `true` に更新して `discord_id` と `username` を返す
- それ以外はすべて 400 エラー

---

## ゲーム側の処理の流れ（参考）

```
ユーザーがフォームに入力
  ユーザー名 + 認証コード + ルームID
      ↓
ゲームサーバー（server.ts）が
  POST /api/dodge/verify/ {username, auth_code} を送信
      ↓ 成功（200）
  返ってきた discord_id と username でゲームに参加させる
      ↓ 失敗（400）
  ユーザーに「認証に失敗しました」と表示してブロック
```

---

## 補足・お願い

- `used = true` にすることで **同じコードの使い回しを防止** できます（推奨）
- 有効期限は **5分程度** を想定していますが、調整はお任せします
- 認証コードは **大文字英数字6文字** 程度が視認性が高くておすすめです
