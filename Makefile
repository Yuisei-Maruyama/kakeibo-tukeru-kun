# =============================================================================
# 家計簿LINE Bot - Makefile
# =============================================================================

# 設定
PROJECT_ID ?= kakeibo-line-bot
REGION ?= asia-northeast1

# 環境変数をエクスポート
export PROJECT_ID
export REGION

# 色付き出力
.PHONY: help
help: ## ヘルプを表示
	@echo ""
	@echo "家計簿LINE Bot - コマンド一覧"
	@echo "=============================="
	@echo ""
	@echo "使用方法: make [コマンド]"
	@echo ""
	@grep -E '^[a-zA-Z_-]+:.*?## .*$$' $(MAKEFILE_LIST) | awk 'BEGIN {FS = ":.*?## "}; {printf "  \033[36m%-20s\033[0m %s\n", $$1, $$2}'
	@echo ""
	@echo "環境変数:"
	@echo "  PROJECT_ID=$(PROJECT_ID)"
	@echo "  REGION=$(REGION)"
	@echo ""
	@echo "例: PROJECT_ID=my-project make deploy"
	@echo ""

# =============================================================================
# セットアップ
# =============================================================================

.PHONY: setup
setup: ## 全ての初期設定を実行（プロジェクト作成〜シークレット登録）
	@./scripts/setup.sh all

.PHONY: setup-init
setup-init: ## GCPプロジェクトを作成
	@./scripts/setup.sh init

.PHONY: setup-apis
setup-apis: ## 必要なAPIを有効化
	@./scripts/setup.sh apis

.PHONY: setup-firestore
setup-firestore: ## Firestoreデータベースを作成
	@./scripts/setup.sh firestore

.PHONY: setup-secrets
setup-secrets: ## Secret Managerにシークレットを登録
	@./scripts/setup.sh secrets

.PHONY: setup-budget
setup-budget: ## 予算アラートを設定（課金超過防止）
	@echo "💰 予算アラートを設定します..."
	@echo ""
	@echo "請求先アカウント一覧:"
	@gcloud billing accounts list --format="table(name,displayName)"
	@echo ""
	@read -p "請求先アカウントID (例: 012345-ABCDEF-012345): " BILLING_ID; \
	read -p "月額予算 (円、例: 500): " BUDGET_AMOUNT; \
	gcloud billing budgets create \
		--billing-account=$$BILLING_ID \
		--display-name="家計簿Bot月額予算" \
		--budget-amount=$${BUDGET_AMOUNT}JPY \
		--threshold-rule=percent=0.5 \
		--threshold-rule=percent=0.9 \
		--threshold-rule=percent=1.0 && \
	echo "✅ 予算アラート設定完了（$$BUDGET_AMOUNT円、50%/90%/100%で通知）"

# =============================================================================
# デプロイ
# =============================================================================

.PHONY: deploy
deploy: ## 全てデプロイ（Cloud Functions + Cloud Scheduler）
	@./scripts/deploy.sh all

.PHONY: deploy-functions
deploy-functions: ## Cloud Functionsのみデプロイ
	@./scripts/deploy.sh functions

.PHONY: deploy-scheduler
deploy-scheduler: ## Cloud Schedulerのみ設定
	@./scripts/deploy.sh scheduler

.PHONY: deploy-webhook
deploy-webhook: ## Webhookハンドラーのみデプロイ
	@./scripts/deploy.sh webhook

.PHONY: deploy-report
deploy-report: ## スケジューラーハンドラーのみデプロイ
	@./scripts/deploy.sh report

.PHONY: deploy-calendar-sync
deploy-calendar-sync: ## カレンダー同期ハンドラーのみデプロイ
	@./scripts/deploy.sh calendar-sync

# =============================================================================
# 開発
# =============================================================================

.PHONY: install
install: ## 依存関係をインストール
	@echo "📦 依存関係をインストール中..."
	@cd functions && npm install
	@echo "✅ インストール完了"

.PHONY: build
build: ## TypeScriptをビルド
	@echo "🔨 ビルド中..."
	@cd functions && npm run build
	@echo "✅ ビルド完了"

.PHONY: dev
dev: ## ローカル開発サーバーを起動
	@echo "🚀 開発サーバーを起動中..."
	@cd functions && npm run dev

.PHONY: lint
lint: ## Lintを実行
	@cd functions && npm run lint

.PHONY: test
test: ## テストを実行
	@cd functions && npm test

# =============================================================================
# ログ・監視
# =============================================================================

.PHONY: logs
logs: ## Webhookのログを表示（最新50件）
	@gcloud functions logs read webhook --region=$(REGION) --limit=50

.PHONY: logs-report
logs-report: ## スケジューラーのログを表示（最新50件）
	@gcloud functions logs read scheduledReport --region=$(REGION) --limit=50

.PHONY: logs-tail
logs-tail: ## Webhookのログをリアルタイム表示
	@gcloud functions logs read webhook --region=$(REGION) --limit=10 --freshness=1m

# =============================================================================
# ユーティリティ
# =============================================================================

.PHONY: status
status: ## デプロイ状況を確認
	@echo "📊 Cloud Functions 状況:"
	@gcloud functions list --filter="name:webhook OR name:scheduledReport" --format="table(name,state,updateTime)" 2>/dev/null || echo "  (未デプロイ)"
	@echo ""
	@echo "⏰ Cloud Scheduler 状況:"
	@gcloud scheduler jobs list --location=$(REGION) --filter="name:kakeibo" --format="table(name,state,schedule)" 2>/dev/null || echo "  (未設定)"

.PHONY: url
url: ## Webhook URLを表示
	@echo "🔗 Webhook URL:"
	@echo "  https://$(REGION)-$(PROJECT_ID).cloudfunctions.net/webhook"
	@echo ""
	@echo "LINE Developers Console で上記URLを設定してください"

.PHONY: clean
clean: ## ビルド成果物を削除
	@echo "🧹 クリーンアップ中..."
	@rm -rf functions/dist functions/node_modules
	@echo "✅ クリーンアップ完了"

.PHONY: open-console
open-console: ## GCPコンソールを開く
	@open "https://console.cloud.google.com/functions/list?project=$(PROJECT_ID)"

.PHONY: open-line
open-line: ## LINE Developersコンソールを開く
	@open "https://developers.line.biz/console/"

.PHONY: open-calendar
open-calendar: ## Googleカレンダーを開く
	@open "https://calendar.google.com/"

.PHONY: open-billing
open-billing: ## GCP請求ダッシュボードを開く
	@open "https://console.cloud.google.com/billing?project=$(PROJECT_ID)"

# =============================================================================
# コスト管理
# =============================================================================

.PHONY: cost
cost: ## 今月のコストを確認
	@echo "💰 コスト確認"
	@echo "============="
	@echo ""
	@echo "📊 GCP 請求ダッシュボード:"
	@echo "  https://console.cloud.google.com/billing?project=$(PROJECT_ID)"
	@echo ""
	@echo "📈 Cloud Functions 呼び出し回数:"
	@gcloud functions describe webhook --region=$(REGION) --format="value(serviceConfig.uri)" 2>/dev/null && \
	echo "  (詳細は GCP コンソールで確認)" || echo "  (未デプロイ)"

.PHONY: emergency-stop
emergency-stop: ## 緊急停止（全Cloud Functionsを削除）
	@echo "🚨 緊急停止を実行します"
	@echo "   これにより全てのCloud Functionsが削除されます"
	@echo ""
	@read -p "本当に実行しますか？ (yes/no): " confirm; \
	if [ "$$confirm" = "yes" ]; then \
		echo "🛑 Cloud Functions を削除中..."; \
		gcloud functions delete webhook --region=$(REGION) --quiet 2>/dev/null || true; \
		gcloud functions delete scheduledReport --region=$(REGION) --quiet 2>/dev/null || true; \
		echo "✅ 緊急停止完了"; \
		echo ""; \
		echo "再開するには: make deploy"; \
	else \
		echo "❌ キャンセルしました"; \
	fi

.PHONY: pause-scheduler
pause-scheduler: ## スケジューラーを一時停止
	@echo "⏸️  Cloud Scheduler を一時停止中..."
	@gcloud scheduler jobs pause kakeibo-mid-month-report --location=$(REGION) 2>/dev/null || true
	@gcloud scheduler jobs pause kakeibo-end-month-report --location=$(REGION) 2>/dev/null || true
	@echo "✅ スケジューラー一時停止完了"

.PHONY: resume-scheduler
resume-scheduler: ## スケジューラーを再開
	@echo "▶️  Cloud Scheduler を再開中..."
	@gcloud scheduler jobs resume kakeibo-mid-month-report --location=$(REGION) 2>/dev/null || true
	@gcloud scheduler jobs resume kakeibo-end-month-report --location=$(REGION) 2>/dev/null || true
	@echo "✅ スケジューラー再開完了"

# =============================================================================
# デフォルト
# =============================================================================

.DEFAULT_GOAL := help
