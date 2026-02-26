# 家計簿つけるくん (Kakeibo Tukeru-kun)

> LINE Bot + Google Calendar で家計を自動管理するシステム

A LINE Bot-based household expense management system integrated with Google Calendar and AI-powered receipt analysis.

---

## Overview

**家計簿つけるくん** は、同棲カップル向けの家計管理 LINE Bot です。
レシートの写真を LINE に送るだけで、AI が自動解析し Google カレンダーに記録。月ごとの精算レポートも自動送信します。

### Key Features

| 機能 | 説明 |
|------|------|
| **AI レシート解析** | レシート画像を送信 → Gemini API が自動解析 → Google カレンダーに登録 |
| **残高リアルタイム表示** | 支出登録のたびに外食費の残高を即時計算 |
| **定期レポート自動送信** | 毎月15日・月末に集計レポートを LINE グループに送信 |
| **予定通知** | 毎朝 7:00 にその日の Google カレンダー予定を通知 |
| **サブスク自動登録** | 毎月1日に登録済みサブスクを自動でカレンダーに記録 |
| **家賃自動登録** | 毎月1日に家賃を月末日付でカレンダーに自動登録 |
| **テキストコマンド** | `@追加`, `@残高`, `@レポート` など 20 以上のコマンド対応 |
| **対話形式入力** | ステップバイステップの対話で支出・予定を登録 |

---

## Architecture

```
LINE App ←→ LINE Messaging API ←→ Cloud Functions (webhook)
                                         ├── Gemini API (画像解析)
                                         ├── Google Calendar API (予定管理)
                                         ├── Firestore (データ保存)
                                         └── Secret Manager (認証情報)

Cloud Scheduler → Cloud Functions (定期実行)
  ├── scheduledReport         (集計レポート)
  ├── dailyScheduleNotification (予定通知)
  ├── calendarSync            (カレンダー同期)
  ├── monthlySubscriptions    (サブスク登録)
  └── monthlyRent             (家賃登録)
```

---

## Tech Stack

| カテゴリ | 技術 |
|---------|------|
| **Runtime** | Node.js 20 (ES Modules) |
| **Language** | TypeScript 5.3 |
| **Infrastructure** | Google Cloud Functions (2nd gen) |
| **Database** | Cloud Firestore |
| **AI** | Google Gemini API (`@google/genai`) |
| **Messaging** | LINE Messaging API (`@line/bot-sdk`) |
| **Calendar** | Google Calendar API (`googleapis`) |
| **Scheduler** | Cloud Scheduler |
| **Secrets** | Secret Manager |
| **Bundler** | esbuild |

---

## Project Structure

```
kakeibo-tukeru-kun/
├── functions/
│   ├── src/
│   │   ├── index.ts              # Cloud Functions エントリーポイント
│   │   ├── handlers/
│   │   │   ├── webhook.ts        # LINE Webhook ハンドラー
│   │   │   ├── conversation.ts   # 対話フロー制御
│   │   │   └── scheduler.ts      # 定期実行ハンドラー
│   │   ├── services/
│   │   │   ├── firestore.ts      # Firestore 操作
│   │   │   ├── line.ts           # LINE メッセージ送信
│   │   │   ├── calendar.ts       # Google Calendar 操作
│   │   │   └── gemini.ts         # Gemini AI 画像解析
│   │   ├── types/index.ts        # 型定義
│   │   └── utils/                # ユーティリティ
│   ├── package.json
│   └── tsconfig.json
├── scripts/
│   ├── setup.sh                  # GCP 初期設定スクリプト
│   └── deploy.sh                 # デプロイスクリプト
├── docs/                         # ドキュメント
│   ├── 01_requirements.md        # 要件定義
│   ├── 02_system_design.md       # システム設計
│   ├── 03_api_specification.md   # API 仕様書
│   ├── 04_setup_guide.md         # セットアップガイド
│   ├── 05_cost_management.md     # コスト管理
│   └── 06_makefile_reference.md  # Makefile リファレンス
└── Makefile                      # ビルド・デプロイコマンド
```

---

## Getting Started

### Prerequisites

- [Node.js](https://nodejs.org/) v20+
- [Google Cloud CLI](https://cloud.google.com/sdk/docs/install)
- [LINE Developers アカウント](https://developers.line.biz/)
- GCP プロジェクト (課金有効化済み)

### 1. Clone & Install

```bash
git clone https://github.com/Yuisei-Maruyama/kakeibo-tukeru-kun.git
cd kakeibo-tukeru-kun
make install
```

### 2. GCP Setup

```bash
# PROJECT_ID を自分のプロジェクトIDに置き換え
export PROJECT_ID=your-gcp-project-id

# 全ての初期設定を実行（プロジェクト作成 → API有効化 → Firestore作成 → シークレット登録）
make setup
```

### 3. Secrets Registration

以下のシークレットを Secret Manager に登録します（`make setup-secrets` で対話的に設定）:

| シークレット名 | 説明 |
|---------------|------|
| `LINE_CHANNEL_SECRET` | LINE チャネルシークレット |
| `LINE_CHANNEL_ACCESS_TOKEN` | LINE チャネルアクセストークン |
| `GOOGLE_CALENDAR_ID` | Google カレンダー ID |
| `GEMINI_API_KEY` | Gemini API キー |

### 4. Build & Deploy

```bash
make build    # TypeScript ビルド
make deploy   # Cloud Functions + Cloud Scheduler をデプロイ
```

### 5. LINE Webhook Setup

デプロイ後に表示される Webhook URL を LINE Developers Console に設定:

```bash
make url  # Webhook URL を表示
```

---

## Commands

### 情報表示

| コマンド | 説明 |
|---------|------|
| `@ヘルプ` | コマンド一覧を表示 |
| `@残高` | 外食費の残高を表示 |
| `@履歴` | 直近10件の支出を表示 |
| `@レポート` | 集計レポートを表示 |

### 支出管理

| コマンド | 説明 | 例 |
|---------|------|-----|
| `@追加` | 対話形式で支出を登録 | `@追加` |
| `@追加 {カテゴリー} {名前} {金額}` | 一括入力 | `@追加 外食費用 田中 1280` |
| `@削除` | 対話形式で支出を削除 | `@削除` |

### 予定管理

| コマンド | 説明 | 例 |
|---------|------|-----|
| `@予定` | 対話形式で予定を登録 | `@予定` |
| `@予定 {名前} {内容} {日付}` | 一括入力 | `@予定 田中 会議 12/15` |

### 設定

| コマンド | 説明 |
|---------|------|
| `@予算 {金額}` | 外食予算を変更 |
| `@初期設定` | 外食担当者の初期設定 |
| `@サブスク追加` | サブスク（定期支払い）を登録 |
| `@家賃追加` | 家賃情報を登録 |

> 全コマンドの詳細は [docs/01_requirements.md](docs/01_requirements.md) を参照

---

## Makefile Commands

```bash
make help              # 全コマンド一覧を表示

# 開発
make install           # 依存関係インストール
make build             # TypeScript ビルド
make dev               # ローカル開発サーバー

# デプロイ
make deploy            # 全てデプロイ
make deploy-webhook    # Webhook のみデプロイ

# ログ・監視
make logs              # Webhook ログ表示
make status            # デプロイ状況確認
make cost              # コスト確認

# 緊急対応
make emergency-stop    # 全 Cloud Functions を削除
make pause-scheduler   # スケジューラー一時停止
```

> 全コマンドの詳細は [docs/06_makefile_reference.md](docs/06_makefile_reference.md) を参照

---

## Documentation

| ドキュメント | 内容 |
|-------------|------|
| [要件定義](docs/01_requirements.md) | 機能仕様・コマンド仕様・対話フロー |
| [システム設計](docs/02_system_design.md) | アーキテクチャ・データモデル |
| [API 仕様書](docs/03_api_specification.md) | エンドポイント・リクエスト/レスポンス |
| [セットアップガイド](docs/04_setup_guide.md) | 環境構築手順 |
| [コスト管理](docs/05_cost_management.md) | GCP 無料枠・課金管理 |
| [Makefile リファレンス](docs/06_makefile_reference.md) | Make コマンド一覧 |

---

## License

This project is for personal use.
