# Makefile コマンドリファレンス

このドキュメントでは、家計簿LINE Botの操作に使用できる全てのMakeコマンドを説明します。

## クイックスタート

```bash
# コマンド一覧を表示
make help

# 初期セットアップ（初回のみ）
make setup

# デプロイ
make deploy

# 状況確認
make status
```

---

## 1. セットアップ系コマンド

GCPプロジェクトの初期設定に使用します。

| コマンド | 説明 |
|----------|------|
| `make setup` | 全ての初期設定を一括実行 |
| `make setup-init` | GCPプロジェクトを作成 |
| `make setup-apis` | 必要なAPIを有効化 |
| `make setup-firestore` | Firestoreデータベースを作成 |
| `make setup-secrets` | Secret Managerにシークレットを登録 |
| `make setup-budget` | 予算アラートを設定 |

### 使用例

```bash
# 初回セットアップ（対話形式で進行）
make setup

# 予算アラートのみ設定（500円で警告など）
make setup-budget
```

---

## 2. デプロイ系コマンド

Cloud FunctionsとCloud Schedulerのデプロイに使用します。

| コマンド | 説明 |
|----------|------|
| `make deploy` | 全てデプロイ（Functions + Scheduler） |
| `make deploy-functions` | Cloud Functionsのみデプロイ |
| `make deploy-scheduler` | Cloud Schedulerのみ設定 |
| `make deploy-webhook` | Webhookハンドラーのみデプロイ |
| `make deploy-report` | レポートハンドラーのみデプロイ |
| `make deploy-calendar-sync` | カレンダー同期ハンドラーのみデプロイ |

### 使用例

```bash
# 全てデプロイ
make deploy

# コード修正後、Webhookだけ更新
make deploy-webhook

# カレンダー同期ハンドラーだけ更新
make deploy-calendar-sync

# スケジューラーの設定だけ変更
make deploy-scheduler
```

### 環境変数でカスタマイズ

```bash
# 別プロジェクトにデプロイ
PROJECT_ID=my-other-project make deploy

# 別リージョンを指定
REGION=us-central1 make deploy

# 両方指定
PROJECT_ID=my-project REGION=us-central1 make deploy
```

---

## 3. 開発系コマンド

ローカル開発時に使用します。

| コマンド | 説明 |
|----------|------|
| `make install` | npm依存関係をインストール |
| `make build` | TypeScriptをビルド |
| `make dev` | ローカル開発サーバーを起動 |
| `make lint` | Lintを実行 |
| `make test` | テストを実行 |
| `make clean` | ビルド成果物を削除 |

### 使用例

```bash
# 開発開始時
make install
make dev

# デプロイ前の確認
make lint
make test
make build
```

---

## 4. ログ・監視系コマンド

運用中のログ確認に使用します。

| コマンド | 説明 |
|----------|------|
| `make logs` | Webhookのログを表示（最新50件） |
| `make logs-report` | レポートハンドラーのログを表示 |
| `make logs-tail` | ログをリアルタイム表示 |
| `make status` | デプロイ状況を確認 |

### 使用例

```bash
# エラー調査
make logs

# デプロイ後の動作確認
make status
make logs-tail
```

### 出力例（`make status`）

```
📊 Cloud Functions 状況:
NAME             STATE   UPDATE_TIME
webhook          ACTIVE  2024-12-03T10:00:00Z
scheduledReport  ACTIVE  2024-12-03T10:00:00Z

⏰ Cloud Scheduler 状況:
NAME                      STATE    SCHEDULE
kakeibo-mid-month-report  ENABLED  0 9 15 * *
kakeibo-end-month-report  ENABLED  0 9 28-31 * *
```

---

## 5. コスト管理系コマンド

課金の確認・制御に使用します。

| コマンド | 説明 |
|----------|------|
| `make cost` | コスト確認用リンクを表示 |
| `make setup-budget` | 予算アラートを設定 |
| `make emergency-stop` | 緊急停止（全Functionsを削除） |
| `make pause-scheduler` | スケジューラーを一時停止 |
| `make resume-scheduler` | スケジューラーを再開 |

### 使用例

```bash
# 課金が心配な時
make cost
make open-billing

# 一時的に停止したい時
make pause-scheduler    # スケジューラーだけ止める

# 再開
make resume-scheduler

# 緊急時（課金が急増した場合など）
make emergency-stop     # 確認プロンプトが出る
```

### 緊急停止の流れ

```bash
$ make emergency-stop
🚨 緊急停止を実行します
   これにより全てのCloud Functionsが削除されます

本当に実行しますか？ (yes/no): yes
🛑 Cloud Functions を削除中...
✅ 緊急停止完了

再開するには: make deploy
```

---

## 6. ユーティリティ系コマンド

便利なショートカットコマンドです。

| コマンド | 説明 |
|----------|------|
| `make url` | Webhook URLを表示 |
| `make open-console` | GCPコンソールを開く |
| `make open-billing` | GCP請求画面を開く |
| `make open-line` | LINE Developersコンソールを開く |
| `make open-calendar` | Googleカレンダーを開く |

### 使用例

```bash
# LINE Webhook URL を確認
make url

# 各種コンソールを開く
make open-console   # GCP Functions
make open-billing   # 請求確認
make open-line      # LINE設定
```

### 出力例（`make url`）

```
🔗 Webhook URL:
  https://asia-northeast1-YOUR_PROJECT_ID.cloudfunctions.net/webhook

LINE Developers Console で上記URLを設定してください
```

---

## 7. 環境変数

Makefileで使用できる環境変数です。

| 変数 | デフォルト値 | 説明 |
|------|--------------|------|
| `PROJECT_ID` | `YOUR_PROJECT_ID` | GCPプロジェクトID |
| `REGION` | `asia-northeast1` | デプロイリージョン |

### 永続的に変更する場合

`.env` ファイルを作成するか、シェルの設定に追加:

```bash
# ~/.bashrc または ~/.zshrc に追加
export PROJECT_ID=my-kakeibo-project
export REGION=asia-northeast1
```

---

## 8. よくある操作フロー

### 初回セットアップ

```bash
# 1. 初期設定
make setup

# 2. 予算アラート設定
make setup-budget

# 3. デプロイ
make deploy

# 4. URL確認 → LINE Developersで設定
make url
```

### コード修正後の再デプロイ

```bash
# 1. ビルド確認
make build

# 2. Webhookだけ更新
make deploy-webhook

# 3. ログ確認
make logs
```

### トラブル発生時

```bash
# 1. 状況確認
make status
make logs

# 2. 必要に応じて一時停止
make pause-scheduler

# 3. 緊急時は全停止
make emergency-stop
```

### 月次チェック

```bash
# 1. コスト確認
make cost
make open-billing

# 2. 動作確認
make status
```

---

## 9. コマンド一覧（`make help` の出力）

```
家計簿LINE Bot - コマンド一覧
==============================

使用方法: make [コマンド]

  setup               全ての初期設定を実行（プロジェクト作成〜シークレット登録）
  setup-init          GCPプロジェクトを作成
  setup-apis          必要なAPIを有効化
  setup-firestore     Firestoreデータベースを作成
  setup-secrets       Secret Managerにシークレットを登録
  setup-budget        予算アラートを設定（課金超過防止）
  deploy              全てデプロイ（Cloud Functions + Cloud Scheduler）
  deploy-functions    Cloud Functionsのみデプロイ
  deploy-scheduler    Cloud Schedulerのみ設定
  deploy-webhook      Webhookハンドラーのみデプロイ
  deploy-report       スケジューラーハンドラーのみデプロイ
  deploy-calendar-sync カレンダー同期ハンドラーのみデプロイ
  install             依存関係をインストール
  build               TypeScriptをビルド
  dev                 ローカル開発サーバーを起動
  lint                Lintを実行
  test                テストを実行
  logs                Webhookのログを表示（最新50件）
  logs-report         スケジューラーのログを表示（最新50件）
  logs-tail           Webhookのログをリアルタイム表示
  status              デプロイ状況を確認
  url                 Webhook URLを表示
  clean               ビルド成果物を削除
  pull-cloud-functions Cloud Functionsのソースをローカルに取得
  open-console        GCPコンソールを開く
  open-billing        GCP請求ダッシュボードを開く
  open-line           LINE Developersコンソールを開く
  open-calendar       Googleカレンダーを開く
  cost                今月のコストを確認
  emergency-stop      緊急停止（全Cloud Functionsを削除）
  pause-scheduler     スケジューラーを一時停止
  resume-scheduler    スケジューラーを再開

環境変数:
  PROJECT_ID=your-gcp-project-id
  REGION=asia-northeast1

例: PROJECT_ID=my-project make deploy
```
