#!/bin/bash
set -e

# =============================================================================
# 家計簿LINE Bot - デプロイスクリプト
# =============================================================================

# 設定
PROJECT_ID="${PROJECT_ID:-your-gcp-project-id}"
REGION="${REGION:-asia-northeast1}"
FUNCTIONS_DIR="./functions"

# 色付き出力
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

log_info() {
    echo -e "${GREEN}[INFO]${NC} $1"
}

log_warn() {
    echo -e "${YELLOW}[WARN]${NC} $1"
}

log_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

# 使用方法
usage() {
    echo "Usage: $0 [command]"
    echo ""
    echo "Commands:"
    echo "  all           全てデプロイ (functions + scheduler)"
    echo "  functions     Cloud Functions のみデプロイ"
    echo "  scheduler     Cloud Scheduler のみ設定"
    echo "  webhook       Webhook ハンドラーのみデプロイ"
    echo "  report        スケジューラーハンドラーのみデプロイ"
    echo "  schedule      予定通知ハンドラーのみデプロイ"
    echo "  calendar-sync カレンダー同期ハンドラーのみデプロイ"
    echo "  subscriptions サブスク自動登録ハンドラーのみデプロイ"
    echo "  rent          家賃自動登録ハンドラーのみデプロイ"
    echo ""
    echo "Environment Variables:"
    echo "  PROJECT_ID  GCP プロジェクトID (default: kakeibo-line-bot)"
    echo "  REGION      デプロイリージョン (default: asia-northeast1)"
    exit 1
}

# プロジェクト確認
check_project() {
    log_info "プロジェクト確認: ${PROJECT_ID}"
    gcloud config set project "${PROJECT_ID}"
}

# Webhook ハンドラーのデプロイ
deploy_webhook() {
    log_info "Webhook ハンドラーをデプロイ中..."

    gcloud functions deploy webhook \
        --gen2 \
        --runtime=nodejs20 \
        --region="${REGION}" \
        --source="${FUNCTIONS_DIR}" \
        --entry-point=webhook \
        --trigger-http \
        --allow-unauthenticated \
        --memory=512MB \
        --timeout=60s \
        --max-instances=10 \
        --min-instances=0 \
        --set-env-vars=TZ=Asia/Tokyo \
        --set-secrets="LINE_CHANNEL_SECRET=LINE_CHANNEL_SECRET:latest,LINE_CHANNEL_ACCESS_TOKEN=LINE_CHANNEL_ACCESS_TOKEN:latest,GEMINI_API_KEY=GEMINI_API_KEY:latest,GOOGLE_CALENDAR_ID=GOOGLE_CALENDAR_ID:latest"

    log_info "Webhook ハンドラーのデプロイ完了"

    # URL を表示
    WEBHOOK_URL="https://${REGION}-${PROJECT_ID}.cloudfunctions.net/webhook"
    log_info "Webhook URL: ${WEBHOOK_URL}"
    echo ""
    log_warn "LINE Developers Console で Webhook URL を設定してください"
}

# スケジューラーハンドラーのデプロイ
deploy_report() {
    log_info "スケジューラーハンドラーをデプロイ中..."

    gcloud functions deploy scheduledReport \
        --gen2 \
        --runtime=nodejs20 \
        --region="${REGION}" \
        --source="${FUNCTIONS_DIR}" \
        --entry-point=scheduledReport \
        --trigger-http \
        --no-allow-unauthenticated \
        --memory=256MB \
        --timeout=120s \
        --max-instances=2 \
        --min-instances=0 \
        --set-env-vars=TZ=Asia/Tokyo \
        --set-secrets="LINE_CHANNEL_ACCESS_TOKEN=LINE_CHANNEL_ACCESS_TOKEN:latest,GOOGLE_CALENDAR_ID=GOOGLE_CALENDAR_ID:latest"

    log_info "スケジューラーハンドラーのデプロイ完了"
}

# 毎朝の予定通知ハンドラーのデプロイ
deploy_daily_schedule() {
    log_info "予定通知ハンドラーをデプロイ中..."

    gcloud functions deploy dailyScheduleNotification \
        --gen2 \
        --runtime=nodejs20 \
        --region="${REGION}" \
        --source="${FUNCTIONS_DIR}" \
        --entry-point=dailyScheduleNotification \
        --trigger-http \
        --no-allow-unauthenticated \
        --memory=256MB \
        --timeout=60s \
        --max-instances=2 \
        --min-instances=0 \
        --set-env-vars=TZ=Asia/Tokyo \
        --set-secrets="LINE_CHANNEL_ACCESS_TOKEN=LINE_CHANNEL_ACCESS_TOKEN:latest,GOOGLE_CALENDAR_ID=GOOGLE_CALENDAR_ID:latest"

    log_info "予定通知ハンドラーのデプロイ完了"
}

# カレンダー同期ハンドラーのデプロイ
deploy_calendar_sync() {
    log_info "カレンダー同期ハンドラーをデプロイ中..."

    gcloud functions deploy calendarSync \
        --gen2 \
        --runtime=nodejs20 \
        --region="${REGION}" \
        --source="${FUNCTIONS_DIR}" \
        --entry-point=calendarSync \
        --trigger-http \
        --no-allow-unauthenticated \
        --memory=256MB \
        --timeout=120s \
        --max-instances=2 \
        --min-instances=0 \
        --set-env-vars=TZ=Asia/Tokyo \
        --set-secrets="GOOGLE_CALENDAR_ID=GOOGLE_CALENDAR_ID:latest"

    log_info "カレンダー同期ハンドラーのデプロイ完了"
}

# サブスク自動登録ハンドラーのデプロイ
deploy_monthly_subscriptions() {
    log_info "サブスク自動登録ハンドラーをデプロイ中..."

    gcloud functions deploy monthlySubscriptions \
        --gen2 \
        --runtime=nodejs20 \
        --region="${REGION}" \
        --source="${FUNCTIONS_DIR}" \
        --entry-point=monthlySubscriptions \
        --trigger-http \
        --no-allow-unauthenticated \
        --memory=256MB \
        --timeout=120s \
        --max-instances=2 \
        --min-instances=0 \
        --set-env-vars=TZ=Asia/Tokyo \
        --set-secrets="LINE_CHANNEL_ACCESS_TOKEN=LINE_CHANNEL_ACCESS_TOKEN:latest,GOOGLE_CALENDAR_ID=GOOGLE_CALENDAR_ID:latest"

    log_info "サブスク自動登録ハンドラーのデプロイ完了"
}

# 家賃自動登録ハンドラーのデプロイ
deploy_monthly_rent() {
    log_info "家賃自動登録ハンドラーをデプロイ中..."

    gcloud functions deploy monthlyRent \
        --gen2 \
        --runtime=nodejs20 \
        --region="${REGION}" \
        --source="${FUNCTIONS_DIR}" \
        --entry-point=monthlyRent \
        --trigger-http \
        --no-allow-unauthenticated \
        --memory=256MB \
        --timeout=120s \
        --max-instances=2 \
        --min-instances=0 \
        --set-env-vars=TZ=Asia/Tokyo \
        --set-secrets="LINE_CHANNEL_ACCESS_TOKEN=LINE_CHANNEL_ACCESS_TOKEN:latest,GOOGLE_CALENDAR_ID=GOOGLE_CALENDAR_ID:latest"

    log_info "家賃自動登録ハンドラーのデプロイ完了"
}

# Cloud Functions デプロイ
deploy_functions() {
    log_info "Cloud Functions をデプロイ中..."
    deploy_webhook
    deploy_report
    deploy_daily_schedule
    deploy_calendar_sync
    deploy_monthly_subscriptions
    deploy_monthly_rent
    log_info "全ての Cloud Functions デプロイ完了"
}

# サービスアカウント作成
create_scheduler_service_account() {
    local SA_NAME="scheduler-invoker"
    local SA_EMAIL="${SA_NAME}@${PROJECT_ID}.iam.gserviceaccount.com"

    # サービスアカウントが存在するか確認
    if gcloud iam service-accounts describe "${SA_EMAIL}" &>/dev/null; then
        log_info "サービスアカウント ${SA_NAME} は既に存在します" >&2
    else
        log_info "サービスアカウント ${SA_NAME} を作成中..." >&2
        gcloud iam service-accounts create "${SA_NAME}" \
            --display-name="Cloud Scheduler Invoker" >&2
    fi

    # Cloud Functions (2nd gen) の呼び出し権限を付与
    log_info "Cloud Functions の呼び出し権限を付与中..." >&2
    gcloud functions add-invoker-policy-binding scheduledReport \
        --region="${REGION}" \
        --member="serviceAccount:${SA_EMAIL}" \
        --quiet >&2 || true

    gcloud functions add-invoker-policy-binding dailyScheduleNotification \
        --region="${REGION}" \
        --member="serviceAccount:${SA_EMAIL}" \
        --quiet >&2 || true

    gcloud functions add-invoker-policy-binding calendarSync \
        --region="${REGION}" \
        --member="serviceAccount:${SA_EMAIL}" \
        --quiet >&2 || true

    gcloud functions add-invoker-policy-binding monthlySubscriptions \
        --region="${REGION}" \
        --member="serviceAccount:${SA_EMAIL}" \
        --quiet >&2 || true

    gcloud functions add-invoker-policy-binding monthlyRent \
        --region="${REGION}" \
        --member="serviceAccount:${SA_EMAIL}" \
        --quiet >&2 || true

    echo "${SA_EMAIL}"
}

# Cloud Scheduler 設定
setup_scheduler() {
    log_info "Cloud Scheduler を設定中..."

    local SA_EMAIL
    SA_EMAIL=$(create_scheduler_service_account)
    local FUNCTION_URL="https://${REGION}-${PROJECT_ID}.cloudfunctions.net/scheduledReport"

    # 15日の集計ジョブ
    log_info "15日の集計ジョブを設定中..."

    # デバッグ情報を出力
    log_info "Function URL: ${FUNCTION_URL}"
    log_info "Service Account: ${SA_EMAIL}"
    log_info "Region: ${REGION}"

    # 既存ジョブを削除（存在する場合）
    if gcloud scheduler jobs describe kakeibo-mid-month-report --location="${REGION}" &>/dev/null; then
        log_info "既存ジョブを削除中..."
        gcloud scheduler jobs delete kakeibo-mid-month-report \
            --location="${REGION}" \
            --quiet
    fi

    # 新規作成（詳細なエラー情報を取得）
    log_info "ジョブを作成中..."
    gcloud scheduler jobs create http kakeibo-mid-month-report \
        --location="${REGION}" \
        --schedule="0 9 15 * *" \
        --time-zone="Asia/Tokyo" \
        --uri="${FUNCTION_URL}" \
        --http-method=POST \
        --headers="Content-Type=application/json" \
        --message-body='{"reportType":"mid-month"}' \
        --oidc-service-account-email="${SA_EMAIL}" \
        --oidc-token-audience="${FUNCTION_URL}" \
        --description="毎月15日9:00に前半（1〜15日）の支出集計レポートをLINEに送信"

    # 月末の集計ジョブ（毎月最終日）
    log_info "月末の集計ジョブを設定中..."
    # Cloud Scheduler は "L" をサポートしないため、28-31日に実行して月末かチェック

    # 既存ジョブを削除（存在する場合）
    if gcloud scheduler jobs describe kakeibo-end-month-report --location="${REGION}" &>/dev/null; then
        log_info "既存ジョブを削除中..."
        gcloud scheduler jobs delete kakeibo-end-month-report \
            --location="${REGION}" \
            --quiet
    fi

    # 新規作成
    gcloud scheduler jobs create http kakeibo-end-month-report \
        --location="${REGION}" \
        --schedule="0 9 28-31 * *" \
        --time-zone="Asia/Tokyo" \
        --uri="${FUNCTION_URL}" \
        --http-method=POST \
        --headers="Content-Type=application/json" \
        --message-body='{"reportType":"end-month"}' \
        --oidc-service-account-email="${SA_EMAIL}" \
        --oidc-token-audience="${FUNCTION_URL}" \
        --description="毎月末9:00に後半（16〜月末）の支出集計・月間精算レポートをLINEに送信"

    # 毎朝7:00の予定通知ジョブ
    log_info "毎朝の予定通知ジョブを設定中..."
    local FUNCTION_URL_SCHEDULE="https://${REGION}-${PROJECT_ID}.cloudfunctions.net/dailyScheduleNotification"

    # 既存ジョブを削除（存在する場合）
    if gcloud scheduler jobs describe kakeibo-daily-schedule-notification --location="${REGION}" &>/dev/null; then
        log_info "既存ジョブを削除中..."
        gcloud scheduler jobs delete kakeibo-daily-schedule-notification \
            --location="${REGION}" \
            --quiet
    fi

    # 新規作成（毎朝7:00に実行）
    gcloud scheduler jobs create http kakeibo-daily-schedule-notification \
        --location="${REGION}" \
        --schedule="0 7 * * *" \
        --time-zone="Asia/Tokyo" \
        --uri="${FUNCTION_URL_SCHEDULE}" \
        --http-method=POST \
        --headers="Content-Type=application/json" \
        --message-body='{"type":"daily-schedule"}' \
        --oidc-service-account-email="${SA_EMAIL}" \
        --oidc-token-audience="${FUNCTION_URL_SCHEDULE}" \
        --description="毎朝7:00に当日のGoogleカレンダー予定をLINEに通知"

    # 毎月1日のサブスク自動登録ジョブ
    log_info "サブスク自動登録ジョブを設定中..."
    local FUNCTION_URL_SUBSCRIPTIONS="https://${REGION}-${PROJECT_ID}.cloudfunctions.net/monthlySubscriptions"

    # 既存ジョブを削除（存在する場合）
    if gcloud scheduler jobs describe kakeibo-monthly-subscriptions --location="${REGION}" &>/dev/null; then
        log_info "既存ジョブを削除中..."
        gcloud scheduler jobs delete kakeibo-monthly-subscriptions \
            --location="${REGION}" \
            --quiet
    fi

    # 新規作成（毎月1日9:00に実行）
    gcloud scheduler jobs create http kakeibo-monthly-subscriptions \
        --location="${REGION}" \
        --schedule="0 9 1 * *" \
        --time-zone="Asia/Tokyo" \
        --uri="${FUNCTION_URL_SUBSCRIPTIONS}" \
        --http-method=POST \
        --headers="Content-Type=application/json" \
        --message-body='{"type":"monthly-subscriptions"}' \
        --oidc-service-account-email="${SA_EMAIL}" \
        --oidc-token-audience="${FUNCTION_URL_SUBSCRIPTIONS}" \
        --description="毎月1日9:00に登録済みサブスクを自動でカレンダー・支出に登録"

    # 毎月1日の家賃自動登録ジョブ
    log_info "家賃自動登録ジョブを設定中..."
    local FUNCTION_URL_RENT="https://${REGION}-${PROJECT_ID}.cloudfunctions.net/monthlyRent"

    # 既存ジョブを削除（存在する場合）
    if gcloud scheduler jobs describe kakeibo-monthly-rent --location="${REGION}" &>/dev/null; then
        log_info "既存ジョブを削除中..."
        gcloud scheduler jobs delete kakeibo-monthly-rent \
            --location="${REGION}" \
            --quiet
    fi

    # 新規作成（毎月1日9:00に実行）
    gcloud scheduler jobs create http kakeibo-monthly-rent \
        --location="${REGION}" \
        --schedule="0 9 1 * *" \
        --time-zone="Asia/Tokyo" \
        --uri="${FUNCTION_URL_RENT}" \
        --http-method=POST \
        --headers="Content-Type=application/json" \
        --message-body='{"type":"monthly-rent"}' \
        --oidc-service-account-email="${SA_EMAIL}" \
        --oidc-token-audience="${FUNCTION_URL_RENT}" \
        --description="毎月1日9:00に家賃を月末日付でカレンダーに自動登録"

    log_info "Cloud Scheduler 設定完了"
    echo ""
    log_info "設定されたジョブ:"
    gcloud scheduler jobs list --location="${REGION}" --filter="name:kakeibo"
}

# メイン処理
main() {
    if [ $# -eq 0 ]; then
        usage
    fi

    check_project

    case "$1" in
        all)
            deploy_functions
            setup_scheduler
            ;;
        functions)
            deploy_functions
            ;;
        scheduler)
            setup_scheduler
            ;;
        webhook)
            deploy_webhook
            ;;
        report)
            deploy_report
            ;;
        schedule)
            deploy_daily_schedule
            ;;
        calendar-sync)
            deploy_calendar_sync
            ;;
        subscriptions)
            deploy_monthly_subscriptions
            ;;
        rent)
            deploy_monthly_rent
            ;;
        *)
            log_error "不明なコマンド: $1"
            usage
            ;;
    esac

    echo ""
    log_info "完了しました"
}

main "$@"
