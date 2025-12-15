# API仕様書 - LINE × Google カレンダー 家計簿管理システム

## 1. Cloud Functions エンドポイント

### 1.1 LINE Webhook Handler

**エンドポイント:** `POST /webhook`

**説明:** LINE からの Webhook イベントを受け取り処理する

**リクエストヘッダー:**
```
Content-Type: application/json
X-Line-Signature: {signature}
```

**リクエストボディ:**
```json
{
  "destination": "xxxxxxxxxx",
  "events": [
    {
      "type": "message",
      "message": {
        "type": "image",
        "id": "354718705033693859",
        "contentProvider": {
          "type": "line"
        }
      },
      "timestamp": 1625665242211,
      "source": {
        "type": "group",
        "groupId": "Ca56f94637c...",
        "userId": "U4af4980629..."
      },
      "replyToken": "757913772c4646b784d4b7ce46d12671"
    }
  ]
}
```

**レスポンス:**
```json
{
  "status": "ok"
}
```

**処理フロー:**
1. 署名検証
2. イベントタイプの判定
3. 画像メッセージの場合 → 画像解析処理へ
4. テキストメッセージの場合 → コマンド処理へ

---

### 1.2 Scheduled Report Handler

**エンドポイント:** `POST /scheduledReport`

**説明:** Cloud Scheduler から呼び出され、半月ごとの集計レポートを送信

**リクエストボディ:**
```json
{
  "reportType": "mid-month" | "end-month"
}
```

**レスポンス:**
```json
{
  "status": "ok",
  "reportSent": true,
  "period": {
    "start": "2024-12-01",
    "end": "2024-12-15"
  }
}
```

---

### 1.3 Daily Schedule Notification Handler

**エンドポイント:** `POST /dailyScheduleNotification`

**説明:** Cloud Scheduler から呼び出され、毎朝7:00に当日の予定を通知

**リクエストボディ:**
```json
{
  "type": "daily-schedule"
}
```

**レスポンス:**
```json
{
  "status": "ok",
  "schedulesFound": 3,
  "notificationSent": true
}
```

**処理内容:**
- Googleカレンダーから当日の予定（colorId:10 または タイトルに「予定」を含む）を取得
- ユーザーごとに予定をまとめてLINEグループに通知
- 予定がない場合は通知しない

---

### 1.4 Calendar Sync Handler

**エンドポイント:** `POST /calendarSync`

**説明:** Cloud Scheduler から呼び出され、毎日深夜3:00にGoogleカレンダーの支出イベントをFirestoreに同期

**リクエストボディ:**
```json
{
  "type": "calendar-sync"
}
```

**レスポンス:**
```json
{
  "status": "ok",
  "synced": 5,
  "skipped": 10,
  "errors": 0
}
```

**処理内容:**
- Googleカレンダーから当月の支出イベントを取得
- タイトルをパースしてカテゴリー・ユーザー名・金額を抽出
- Firestoreに未登録のイベントのみ追加
- 外食費用の場合は残高を更新

---

### 1.5 Monthly Subscriptions Handler

**エンドポイント:** `POST /monthlySubscriptions`

**説明:** Cloud Scheduler から呼び出され、毎月1日にサブスク（定期支払い）を自動登録

**リクエストボディ:**
```json
{
  "type": "monthly-subscriptions"
}
```

**レスポンス:**
```json
{
  "status": "ok",
  "registered": 3,
  "subscriptions": [
    { "name": "Netflix", "amount": 1490, "date": "2024-12-15" }
  ]
}
```

**処理内容:**
- 登録されているサブスク情報を取得
- 各サブスクの開始日と間隔から、当月の該当日付を算出
- 該当日がある場合、「買い物費用」としてFirestore・Googleカレンダーに登録
- LINEグループに登録完了を通知

---

### 1.6 Monthly Rent Handler

**エンドポイント:** `POST /monthlyRent`

**説明:** Cloud Scheduler から呼び出され、毎月1日に家賃を月末日に自動登録

**リクエストボディ:**
```json
{
  "type": "monthly-rent"
}
```

**レスポンス:**
```json
{
  "status": "ok",
  "registered": true,
  "date": "2024-12-31",
  "amount": 120000
}
```

**処理内容:**
- 登録されている家賃情報を取得
- 当月の月末日を算出
- 「家賃費用」としてGoogleカレンダーに登録（Firestoreには保存しない＝精算対象外）
- LINEグループに登録完了を通知

---

## 2. 内部サービス仕様

### 2.1 画像解析サービス (Gemini API)

**プロンプト:**
```
以下のレシート/支払い画面の画像を解析し、JSON形式で情報を抽出してください。

出力形式:
{
  "date": "YYYY-MM-DD",
  "amount": 金額（数値）,
  "category": "カテゴリー名",
  "storeName": "店舗名",
  "items": ["商品1", "商品2"]
}

【カテゴリーの判定ルール】
店舗名から以下の2つのカテゴリーに分類してください:

■ 外食費用
  - レストラン、飲食店、個人店での食事
  - 例: イタリアンレストラン、ラーメン屋、居酒屋、カフェ、ファミレス、牛丼チェーン

■ 買い物費用
  - スーパー、コンビニ、ドラッグストア等での購入
  - 例: イオン、セブンイレブン、ローソン、ファミリーマート、マツモトキヨシ、業務スーパー

判定のポイント:
- 店舗名に「レストラン」「食堂」「屋」「亭」「庵」などが含まれる → 外食費用
- 店舗名に「スーパー」「マート」「ストア」「コンビニ」などが含まれる → 買い物費用
- 迷った場合は店舗の主な業態で判断

画像が不鮮明または解析できない場合は:
{
  "error": "解析できませんでした",
  "reason": "理由"
}
```

**レスポンス例（外食費用）:**
```json
{
  "date": "2024-12-03",
  "amount": 1280,
  "category": "外食費用",
  "storeName": "サイゼリヤ 渋谷店",
  "items": ["ミラノ風ドリア", "ドリンクバー"]
}
```

**レスポンス例（買い物費用）:**
```json
{
  "date": "2024-12-03",
  "amount": 2500,
  "category": "買い物費用",
  "storeName": "セブンイレブン 渋谷店",
  "items": ["おにぎり", "お茶", "サンドイッチ", "洗剤"]
}
```

---

### 2.2 Google Calendar API 連携

**イベント作成リクエスト:**
```javascript
const event = {
  calendarId: 'xxx@group.calendar.google.com',
  requestBody: {
    summary: '[外食費用]  田中　￥1,280',
    description: `店舗: サイゼリヤ 渋谷店
商品: ミラノ風ドリア, ドリンクバー
登録元: LINE家計簿Bot`,
    start: {
      date: '2024-12-03'
    },
    end: {
      date: '2024-12-03'
    },
    colorId: '4'  // カテゴリー別に色分け
  }
};
```

**カテゴリー別カラーID:**
| カテゴリー | colorId | 色 | 用途 |
|------------|---------|------|------|
| 外食費用 | 4 | コーラルピンク | レストラン・飲食店 |
| 買い物費用 | 7 | シアン | スーパー・コンビニ |
| 家賃費用 | 5 | バナナ（黄色） | 月末家賃 |
| 予定 | 10 | バジル（緑） | スケジュール |

---

### 2.3 LINE Reply Message API

**残高返答メッセージ:**
```javascript
{
  replyToken: 'xxx',
  messages: [
    {
      type: 'text',
      text: `✅ 登録しました！
📝 外食費用: ￥1,280（田中）
🏪 サイゼリヤ 渋谷店
📅 2024/12/03

💰 今月の残高: ￥48,720`
    }
  ]
}
```

**集計レポートメッセージ:**
```javascript
{
  to: 'GROUP_ID',
  messages: [
    {
      type: 'text',
      text: `📊 家計簿レポート（12/1〜12/15）

【支払い者別】
田中: ￥25,000
鈴木: ￥18,500

【カテゴリー別】
🍽️ 外食費用: ￥20,000
🛒 買い物費用: ￥23,500

💰 合計: ￥43,500
💵 残り予算: ￥6,500`
    }
  ]
}
```

---

## 3. テキストコマンド仕様

ユーザーがトークルームに `@` から始まるテキストを送信した場合のコマンド処理。
全角 `＠` と半角 `@` の両方に対応。

### 3.1 情報表示コマンド

| コマンド | 説明 | 例 |
|----------|------|-----|
| `@ヘルプ` | 利用可能なコマンド一覧を表示 | @ヘルプ |
| `@残高` | 各ユーザーの外食残高を表示 | @残高 |
| `@履歴` | 直近10件の支出を表示 | @履歴 |
| `@レポート [{前半\|後半}]` | 集計レポートを表示（引数省略時は現在の日付で自動判定） | @レポート<br>@レポート 前半<br>@レポート 後半 |

### 3.2 支出管理コマンド

| コマンド | 説明 | 例 |
|----------|------|-----|
| `@追加` | 対話形式で支出を登録 | @追加 |
| `@追加 {カテゴリー} {支払い者名} {金額} [{日付}]` | 一括入力で支出を追加 | @追加 外食費用 田中 1280<br>@追加 外食費用 @自分 1280<br>@追加 外食費用 田中 1280 12/1 |
| `@削除` | 対話形式で支出を削除 | @削除 |
| `@削除 {日付} {金額}` | 指定日付・金額の支出を削除 | @削除 12/3 1280 |

### 3.3 予定管理コマンド

| コマンド | 説明 | 例 |
|----------|------|-----|
| `@予定` | 対話形式で予定を登録 | @予定 |
| `@予定 {ユーザー名} {予定内容} [{日付}] [{開始時間}] [{終了時間}]` | 一括入力で予定を登録 | @予定 田中 会議<br>@予定 @自分 会議<br>@予定 田中 会議 12/15<br>@予定 田中 会議 12/15 14:30 16:00 |

### 3.4 設定コマンド

| コマンド | 説明 | 例 |
|----------|------|-----|
| `@予算 {金額}` | 両ユーザーの外食予算を一括変更 | @予算 60000 |
| `@初期設定` | 外食担当者を対話形式で設定（前半・後半担当） | @初期設定 |
| `@設定変更` | 外食担当者を対話形式で変更 | @設定変更 |

### 3.5 サブスク管理コマンド

| コマンド | 説明 | 例 |
|----------|------|-----|
| `@サブスク一覧` | 登録済みサブスク（定期支払い）の一覧を表示 | @サブスク一覧 |
| `@サブスク追加` | サブスクを対話形式で新規登録 | @サブスク追加 |
| `@サブスク変更` | サブスクを対話形式で変更 | @サブスク変更 |
| `@サブスク削除` | サブスクを対話形式で削除 | @サブスク削除 |

### 3.6 家賃管理コマンド

| コマンド | 説明 | 例 |
|----------|------|-----|
| `@家賃追加` | 家賃情報を対話形式で登録 | @家賃追加 |
| `@家賃変更` | 家賃情報を対話形式で変更 | @家賃変更 |

### 3.7 その他コマンド

| コマンド | 説明 | 例 |
|----------|------|-----|
| `@キャンセル` | 対話形式入力をキャンセル | @キャンセル |

---

## 4. 対話形式入力仕様

### 4.1 対話セッション

- 有効期限: 10分（expiresAt でタイムアウト管理）
- 1ユーザーにつき1セッションのみ保持
- `@キャンセル` でいつでもキャンセル可能

### 4.2 対話タイプ一覧

| タイプ | コマンド | ステップ |
|--------|---------|---------|
| `add_expense` | @追加 | category → payer_name → amount → date |
| `add_schedule` | @予定 | participant_count → user_name → schedule_content → date → start_time → end_time |
| `delete_expense` | @削除 | delete_category → delete_user_name → delete_date → delete_amount |
| `initial_setup` | @初期設定 | first_half_payer → second_half_payer |
| `change_settings` | @設定変更 | first_half_payer → second_half_payer |
| `add_subscription` | @サブスク追加 | subscription_payer → subscription_service → subscription_amount → subscription_start_date → subscription_interval_unit → subscription_interval_value |
| `delete_subscription` | @サブスク削除 | subscription_select |
| `edit_subscription` | @サブスク変更 | subscription_edit_select → subscription_edit_field → subscription_edit_value |
| `add_rent` | @家賃追加 | rent_payer → rent_amount |
| `edit_rent` | @家賃変更 | rent_edit_field → rent_edit_value |

### 4.3 特殊入力

| 入力 | 動作 |
|------|------|
| `@自分` | 送信者の LINE 表示名に置換 |
| `@メンション` | メンションされたユーザーの表示名を取得 |
| `今日` | 今日の日付に置換 |
| `なし` | 時間指定の省略（終日予定） |

---

## 5. エラーレスポンス

### 5.1 画像解析エラー

```javascript
{
  type: 'text',
  text: `❌ 画像を解析できませんでした

考えられる原因:
• 画像が不鮮明
• レシートや支払い画面ではない
• 文字が読み取れない

📸 もう一度、鮮明な画像を送信してください`
}
```

### 5.2 API エラー

```javascript
{
  type: 'text',
  text: `⚠️ 一時的なエラーが発生しました

しばらく待ってから再度お試しください。
問題が続く場合は管理者にお問い合わせください。`
}
```

### 5.3 コマンドエラー

```javascript
{
  type: 'text',
  text: `❌ 不明なコマンドです

詳しくは @ヘルプ で確認してください`
}
```

---

## 6. レート制限

| API | 制限 |
|-----|------|
| LINE Messaging API | 1,000 リクエスト/分 |
| Gemini API | 15 RPM（無料枠）、100万トークン/月 |
| Google Calendar API | 1,000,000 リクエスト/日 |
