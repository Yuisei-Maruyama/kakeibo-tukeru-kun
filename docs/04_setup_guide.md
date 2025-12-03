# 環境構築手順書 - LINE × Google カレンダー 家計簿管理システム

## 1. 前提条件

- Google Cloud アカウント
- LINE Developers アカウント
- Node.js 20 以上
- gcloud CLI インストール済み

---

## 2. Google Cloud プロジェクトのセットアップ

### 2.1 Makefileによる初期設定（推奨）

```bash
# コマンド一覧を表示
make help

# 全ての初期設定を一括実行
make setup

# または個別に実行
make setup-init       # プロジェクト作成
make setup-apis       # API 有効化
make setup-firestore  # Firestore 作成
make setup-secrets    # シークレット登録
```

### 2.2 手動セットアップ（参考）

<details>
<summary>手動でコマンドを実行する場合</summary>

**プロジェクト作成:**

```bash
# プロジェクト作成
gcloud projects create kakeibo-line-bot --name="家計簿LINE Bot"

# プロジェクトを選択
gcloud config set project kakeibo-line-bot

# 課金を有効化（GCPコンソールで実施）
```

**API 有効化:**

```bash
# 必要なAPIを有効化
gcloud services enable \
  cloudfunctions.googleapis.com \
  cloudscheduler.googleapis.com \
  firestore.googleapis.com \
  secretmanager.googleapis.com \
  calendar-json.googleapis.com \
  aiplatform.googleapis.com \
  cloudbuild.googleapis.com \
  run.googleapis.com
```

**Firestore データベース作成:**

```bash
# Firestore をネイティブモードで作成
gcloud firestore databases create --location=asia-northeast1
```

</details>

---

## 3. LINE Developers 設定

### 3.1 チャネル作成

1. [LINE Developers Console](https://developers.line.biz/) にアクセス
2. 「プロバイダー」を作成（または既存を選択）
3. 「新規チャネル作成」→「Messaging API」を選択
4. 以下を入力:
   - チャネル名: 家計簿Bot
   - チャネル説明: LINE家計簿管理システム
   - 大業種: 個人
   - 小業種: 個人（その他）

### 3.2 チャネル設定

1. 「Messaging API設定」タブで:
   - Webhook URL: `https://asia-northeast1-{PROJECT_ID}.cloudfunctions.net/webhook`
   - Webhookの利用: ON
   - 応答メッセージ: OFF
   - あいさつメッセージ: OFF

2. 「チャネル基本設定」から取得:
   - チャネルシークレット

3. 「Messaging API設定」から取得:
   - チャネルアクセストークン（長期）を発行

---

## 4. Google Calendar 設定

### 4.1 専用カレンダー作成

1. [Google Calendar](https://calendar.google.com/) にアクセス
2. 「他のカレンダー」→「新しいカレンダーを作成」
3. カレンダー名: `家計簿`
4. 作成後、「設定と共有」から「カレンダーID」をメモ

### 4.2 サービスアカウント作成

```bash
# サービスアカウント作成
gcloud iam service-accounts create kakeibo-calendar \
  --display-name="家計簿カレンダー用"

# キーファイル生成
gcloud iam service-accounts keys create ./service-account-key.json \
  --iam-account=kakeibo-calendar@kakeibo-line-bot.iam.gserviceaccount.com
```

### 4.3 カレンダー共有設定

1. Google Calendar の「設定と共有」を開く
2. 「特定のユーザーとの共有」で:
   - サービスアカウントのメールアドレスを追加
   - 権限: 「変更および共有の管理権限」

---

## 5. Gemini API 設定

### 5.1 API キー取得

1. [Google AI Studio](https://aistudio.google.com/) にアクセス
2. 「Get API Key」→「Create API Key」
3. プロジェクト `kakeibo-line-bot` を選択
4. 生成された API キーをメモ

---

## 6. Secret Manager 設定

```bash
# LINE チャネルシークレット
echo -n "YOUR_LINE_CHANNEL_SECRET" | \
gcloud secrets create LINE_CHANNEL_SECRET --data-file=-

# LINE チャネルアクセストークン
echo -n "YOUR_LINE_CHANNEL_ACCESS_TOKEN" | \
gcloud secrets create LINE_CHANNEL_ACCESS_TOKEN --data-file=-

# Gemini API キー
echo -n "YOUR_GEMINI_API_KEY" | \
gcloud secrets create GEMINI_API_KEY --data-file=-

# Google Calendar ID
echo -n "YOUR_CALENDAR_ID@group.calendar.google.com" | \
gcloud secrets create GOOGLE_CALENDAR_ID --data-file=-
```

---

## 7. プロジェクトのセットアップ

### 7.1 ディレクトリ構成

```
kakeibo/
├── docs/                    # ドキュメント
├── functions/               # Cloud Functions
│   ├── src/
│   │   ├── index.ts        # エントリーポイント
│   │   ├── handlers/
│   │   │   ├── webhook.ts  # LINE Webhook
│   │   │   └── scheduler.ts # 定期実行
│   │   ├── services/
│   │   │   ├── gemini.ts   # Gemini API
│   │   │   ├── calendar.ts # Google Calendar
│   │   │   ├── firestore.ts # データベース
│   │   │   └── line.ts     # LINE API
│   │   └── types/
│   │       └── index.ts    # 型定義
│   ├── package.json
│   └── tsconfig.json
└── README.md
```

### 7.2 初期化

```bash
# functions ディレクトリ作成
mkdir -p functions/src/{handlers,services,types}
cd functions

# package.json 初期化
npm init -y

# 依存関係インストール
npm install \
  @google-cloud/functions-framework \
  @google-cloud/firestore \
  @google-cloud/secret-manager \
  @google/generative-ai \
  googleapis \
  @line/bot-sdk

# 開発依存関係
npm install -D \
  typescript \
  @types/node \
  esbuild
```

### 7.3 tsconfig.json

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "NodeNext",
    "moduleResolution": "NodeNext",
    "outDir": "./dist",
    "rootDir": "./src",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "forceConsistentCasingInFileNames": true
  },
  "include": ["src/**/*"],
  "exclude": ["node_modules"]
}
```

---

## 8. デプロイ

デプロイは `scripts/` ディレクトリのスクリプトで簡単に実行できます。

### 8.1 Makefileによるデプロイ（推奨）

```bash
# 全てデプロイ（Cloud Functions + Cloud Scheduler）
make deploy

# Cloud Functions のみデプロイ
make deploy-functions

# Cloud Scheduler のみ設定
make deploy-scheduler

# Webhook ハンドラーのみデプロイ
make deploy-webhook

# スケジューラーハンドラーのみデプロイ
make deploy-report
```

**環境変数でカスタマイズ:**
```bash
# プロジェクトIDとリージョンを指定
PROJECT_ID=my-project REGION=us-central1 make deploy
```

**その他の便利なコマンド:**
```bash
make status        # デプロイ状況を確認
make url           # Webhook URLを表示
make logs          # ログを表示
make open-console  # GCPコンソールを開く
```

### 8.2 手動デプロイ（参考）

<details>
<summary>手動でコマンドを実行する場合</summary>

**Cloud Functions デプロイ:**

```bash
# Webhook ハンドラー
gcloud functions deploy webhook \
  --gen2 \
  --runtime=nodejs20 \
  --region=asia-northeast1 \
  --source=./functions \
  --entry-point=webhook \
  --trigger-http \
  --allow-unauthenticated \
  --set-secrets=LINE_CHANNEL_SECRET=LINE_CHANNEL_SECRET:latest,LINE_CHANNEL_ACCESS_TOKEN=LINE_CHANNEL_ACCESS_TOKEN:latest,GEMINI_API_KEY=GEMINI_API_KEY:latest,GOOGLE_CALENDAR_ID=GOOGLE_CALENDAR_ID:latest

# スケジューラーハンドラー
gcloud functions deploy scheduledReport \
  --gen2 \
  --runtime=nodejs20 \
  --region=asia-northeast1 \
  --source=./functions \
  --entry-point=scheduledReport \
  --trigger-http \
  --no-allow-unauthenticated \
  --set-secrets=LINE_CHANNEL_ACCESS_TOKEN=LINE_CHANNEL_ACCESS_TOKEN:latest,GOOGLE_CALENDAR_ID=GOOGLE_CALENDAR_ID:latest
```

**Cloud Scheduler 設定:**

```bash
# サービスアカウント作成
gcloud iam service-accounts create scheduler-invoker \
  --display-name="Cloud Scheduler Invoker"

# 権限付与
gcloud functions add-iam-policy-binding scheduledReport \
  --region=asia-northeast1 \
  --member="serviceAccount:scheduler-invoker@kakeibo-line-bot.iam.gserviceaccount.com" \
  --role="roles/cloudfunctions.invoker"

# 15日の集計ジョブ
gcloud scheduler jobs create http kakeibo-mid-month-report \
  --location=asia-northeast1 \
  --schedule="0 9 15 * *" \
  --time-zone="Asia/Tokyo" \
  --uri="https://asia-northeast1-kakeibo-line-bot.cloudfunctions.net/scheduledReport" \
  --http-method=POST \
  --headers="Content-Type=application/json" \
  --message-body='{"reportType":"mid-month"}' \
  --oidc-service-account-email="scheduler-invoker@kakeibo-line-bot.iam.gserviceaccount.com"

# 月末の集計ジョブ（28-31日に実行し、月末かどうかを関数内でチェック）
gcloud scheduler jobs create http kakeibo-end-month-report \
  --location=asia-northeast1 \
  --schedule="0 9 28-31 * *" \
  --time-zone="Asia/Tokyo" \
  --uri="https://asia-northeast1-kakeibo-line-bot.cloudfunctions.net/scheduledReport" \
  --http-method=POST \
  --headers="Content-Type=application/json" \
  --message-body='{"reportType":"end-month"}' \
  --oidc-service-account-email="scheduler-invoker@kakeibo-line-bot.iam.gserviceaccount.com"
```

</details>

---

## 9. 初期データ設定

### 9.1 Firestore 初期設定

Firestore に以下の初期データを投入:

```javascript
// settings コレクション
{
  id: "global",
  monthlyBudget: 50000,
  calendarId: "YOUR_CALENDAR_ID@group.calendar.google.com"
}
```

**注意:** 以下の項目は**自動設定**されるため、手動登録は不要です:

| 項目 | 自動設定タイミング |
|------|-------------------|
| `lineGroupId` | Bot がグループに招待され、最初のメッセージを受信した時 |
| `users` | 各ユーザーが初めて画像を送信した時に自動登録 |

### 9.2 ユーザー自動登録の仕組み

ユーザーが初めて画像を送信すると、以下の情報が自動的に登録されます:

```javascript
// users コレクション（自動作成）
{
  id: "U1234567890abcdef",        // LINE User ID
  displayName: "田中",            // LINEの表示名
  groupId: "C1234567890abcdef",  // グループID
  isActive: true,
  createdAt: "2024-12-03T10:00:00Z"
}
```

これにより、事前にユーザー情報を調べて登録する必要がなくなります。

---

## 10. 動作確認

### 10.1 チェックリスト

- [ ] LINE Bot をグループに招待
- [ ] テスト画像（レシート）を送信
- [ ] 返答メッセージが来ることを確認
- [ ] Google Calendar にイベントが登録されることを確認
- [ ] Firestore にデータが保存されることを確認

### 10.2 ログ確認

```bash
# Cloud Functions のログを確認
gcloud functions logs read webhook --region=asia-northeast1 --limit=50
```

---

## 11. トラブルシューティング

| 症状 | 原因 | 対処 |
|------|------|------|
| Webhook が反応しない | URL が間違っている | LINE Developers で Webhook URL を確認 |
| 署名エラー | シークレットが間違っている | Secret Manager の値を確認 |
| カレンダー登録失敗 | 権限不足 | サービスアカウントの共有設定を確認 |
| 画像解析失敗 | API キーが無効 | Gemini API キーを再発行 |

---

## 12. 参考リンク

- [LINE Messaging API ドキュメント](https://developers.line.biz/ja/docs/messaging-api/)
- [Google Calendar API ドキュメント](https://developers.google.com/calendar/api/guides/overview)
- [Gemini API ドキュメント](https://ai.google.dev/docs)
- [Cloud Functions ドキュメント](https://cloud.google.com/functions/docs)
