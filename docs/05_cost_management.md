# コスト管理・利用制限ガイド

このドキュメントでは、家計簿LINE Botの運用コストを最小限に抑えるための設定方法を説明します。

## 1. 想定コスト概算

### 1.1 月間利用想定

| 項目 | 想定量 |
|------|--------|
| レシート送信回数 | 100回/月（2人で1日1-2回） |
| 定期レポート | 2回/月（15日・月末） |
| 毎朝の予定通知 | 30回/月（毎日7:00） |
| カレンダー同期 | 30回/月（毎日3:00） |
| サブスク自動登録 | 1回/月（毎月1日9:00） |
| 家賃自動登録 | 1回/月（毎月1日9:00） |
| テキストコマンド | 30回/月 |

### 1.2 各サービスの料金

| サービス | 無料枠 | 超過時の料金 | 想定月額 |
|----------|--------|--------------|----------|
| **Cloud Functions** | 200万回/月 | $0.40/100万回 | **$0**（無料枠内） |
| **Firestore** | 読取5万/日、書込2万/日 | $0.06/10万読取 | **$0**（無料枠内） |
| **Gemini API** | 15 RPM、100万トークン/月 | $0.075/100万トークン | **$0**（無料枠内） |
| **Cloud Scheduler** | 3ジョブまで無料 | $0.10/ジョブ/月 | **$0.30**（6ジョブ、3ジョブ超過分） |
| **Secret Manager** | 6シークレット無料 | $0.06/シークレット | **$0**（4シークレット） |
| **LINE Messaging API** | 200通/月（無料プラン） | 有料プランへ移行 | **$0**（無料枠内） |

### 1.3 想定月額コスト

**通常利用（100回/月程度）: 約¥50/月**

Cloud Scheduler の超過分（3ジョブ × $0.10 ≒ ¥45）のみ発生します。その他はすべて無料枠内で運用可能です。

---

## 2. GCP 予算アラート設定

予期せぬ課金を防ぐため、予算アラートを設定します。

### 2.1 コンソールから設定

1. [GCP 予算とアラート](https://console.cloud.google.com/billing/budgets) にアクセス
2. 「予算を作成」をクリック
3. 以下を設定:
   - 予算名: `家計簿Bot月額予算`
   - 予算額: `¥500`（または任意の金額）
   - アラートのしきい値: 50%、90%、100%

### 2.2 gcloudコマンドで設定

```bash
# 請求先アカウントIDを取得
gcloud billing accounts list

# 予算を作成（BILLING_ACCOUNT_IDを置き換え）
gcloud billing budgets create \
  --billing-account=BILLING_ACCOUNT_ID \
  --display-name="家計簿Bot月額予算" \
  --budget-amount=500JPY \
  --threshold-rule=percent=0.5 \
  --threshold-rule=percent=0.9 \
  --threshold-rule=percent=1.0
```

### 2.3 Makefileに追加済みのコマンド

```bash
# 予算設定（対話形式）
make setup-budget
```

---

## 3. API クォータ・制限設定

### 3.1 Cloud Functions の同時実行数制限

```bash
# 最大インスタンス数を制限（コスト抑制）
gcloud functions deploy webhook \
  --max-instances=5 \
  ...
```

既存のデプロイスクリプトには `--max-instances=10` を追加済みです。

### 3.2 Gemini API の利用制限

Google AI Studio で制限を設定:

1. [Google AI Studio](https://aistudio.google.com/) にアクセス
2. 「API Keys」→ 対象のキーを選択
3. 「Edit API key」で制限を設定:
   - **Requests per minute**: 15（デフォルト）
   - **Requests per day**: 1,500（推奨設定）

### 3.3 Firestore セキュリティルール

不正アクセスによる大量読み書きを防止:

```javascript
// firestore.rules
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    // サービスアカウントからのみアクセス可能
    match /{document=**} {
      allow read, write: if false; // クライアントからの直接アクセス禁止
    }
  }
}
```

---

## 4. LINE Messaging API プラン

### 4.1 プラン比較

| プラン | 月額 | 無料メッセージ | 追加メッセージ |
|--------|------|----------------|----------------|
| コミュニケーション | ¥0 | 200通 | 不可 |
| ライト | ¥5,000 | 5,000通 | ¥不可 |
| スタンダード | ¥15,000 | 30,000通 | ¥3/通〜 |

### 4.2 推奨設定

2人で使用する家計簿Botの場合:

- **コミュニケーションプラン（無料）** で十分
- 月200通 = 1日あたり約6-7通
- レシート送信+返答で2通消費

**注意**: 無料枠を超えるとメッセージが送信できなくなります。

### 4.3 メッセージ数の確認方法

1. [LINE Official Account Manager](https://manager.line.biz/) にアクセス
2. 対象のアカウントを選択
3. 「分析」→「メッセージ通数」で確認

---

## 5. コスト最適化のベストプラクティス

### 5.1 Cloud Functions

| 設定 | 推奨値 | 効果 |
|------|--------|------|
| メモリ | 256MB〜512MB | メモリ課金を抑制 |
| タイムアウト | 60秒 | 無限ループ防止 |
| 最大インスタンス | 5〜10 | スパイク時のコスト抑制 |
| 最小インスタンス | 0 | アイドル時のコスト削減 |

### 5.2 Gemini API

| 最適化 | 方法 |
|--------|------|
| モデル選択 | `gemini-1.5-flash`（高速・低コスト） |
| 画像サイズ | 送信前にリサイズ（1024px以下推奨） |
| プロンプト | 簡潔に記述（トークン削減） |
| キャッシュ | 同一画像の重複解析を防止 |

### 5.3 Firestore

| 最適化 | 方法 |
|--------|------|
| インデックス | 必要最小限に設定 |
| クエリ | 取得件数を制限（limit使用） |
| バッチ処理 | 複数書き込みはバッチで実行 |

---

## 6. 監視・アラート設定

### 6.1 Cloud Monitoring でアラート作成

```bash
# エラー率アラート（5%超過で通知）
gcloud alpha monitoring policies create \
  --display-name="Cloud Functions エラー率" \
  --condition-display-name="エラー率 > 5%" \
  --condition-filter='resource.type="cloud_function" AND metric.type="cloudfunctions.googleapis.com/function/execution_count" AND metric.labels.status!="ok"'
```

### 6.2 推奨アラート

| アラート | しきい値 | 目的 |
|----------|----------|------|
| 予算アラート | 50%, 90%, 100% | 課金超過防止 |
| エラー率 | > 5% | 異常検知 |
| レイテンシ | > 10秒 | パフォーマンス監視 |
| 呼び出し回数 | > 1000回/日 | 異常利用検知 |

---

## 7. 緊急時の対応

### 7.1 課金が急増した場合

```bash
# 1. Cloud Functions を無効化（全6エンドポイント）
gcloud functions delete webhook --region=asia-northeast1 --quiet
gcloud functions delete scheduledReport --region=asia-northeast1 --quiet
gcloud functions delete dailyScheduleNotification --region=asia-northeast1 --quiet
gcloud functions delete calendarSync --region=asia-northeast1 --quiet
gcloud functions delete monthlySubscriptions --region=asia-northeast1 --quiet
gcloud functions delete monthlyRent --region=asia-northeast1 --quiet

# 2. または、プロジェクト全体を停止
gcloud projects update PROJECT_ID --no-enable-billing
```

### 7.2 Makefileコマンド

```bash
# 緊急停止
make emergency-stop

# 再開
make deploy
```

---

## 8. 月次コストチェックリスト

毎月確認すべき項目:

- [ ] [GCP 請求レポート](https://console.cloud.google.com/billing) で課金額確認
- [ ] [Cloud Functions 指標](https://console.cloud.google.com/functions) で呼び出し回数確認
- [ ] [LINE メッセージ通数](https://manager.line.biz/) で残り通数確認
- [ ] [Gemini API 使用量](https://aistudio.google.com/) で使用トークン確認

---

## 9. 参考リンク

- [GCP 料金計算ツール](https://cloud.google.com/products/calculator)
- [Cloud Functions 料金](https://cloud.google.com/functions/pricing)
- [Firestore 料金](https://cloud.google.com/firestore/pricing)
- [Gemini API 料金](https://ai.google.dev/pricing)
- [LINE Messaging API 料金](https://www.linebiz.com/jp/service/line-official-account/plan/)
