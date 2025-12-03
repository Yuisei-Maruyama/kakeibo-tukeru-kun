#!/bin/bash
set -e

# =============================================================================
# 家計簿LINE Bot - 初期セットアップスクリプト
# =============================================================================

# 設定
PROJECT_ID="${PROJECT_ID:-kakeibo-line-bot}"
REGION="${REGION:-asia-northeast1}"

# 色付き出力
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
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

log_step() {
    echo -e "${CYAN}[STEP]${NC} $1"
}

# 使用方法
usage() {
    echo "Usage: $0 [command]"
    echo ""
    echo "Commands:"
    echo "  init        GCP プロジェクトの初期設定"
    echo "  apis        必要な API を有効化"
    echo "  firestore   Firestore データベースを作成"
    echo "  secrets     Secret Manager にシークレットを登録"
    echo "  all         全ての初期設定を実行"
    echo ""
    echo "Environment Variables:"
    echo "  PROJECT_ID  GCP プロジェクトID (default: kakeibo-line-bot)"
    echo "  REGION      リージョン (default: asia-northeast1)"
    exit 1
}

# プロジェクト初期化
init_project() {
    log_step "GCP プロジェクトを初期化中..."

    # プロジェクトが存在するか確認
    if gcloud projects describe "${PROJECT_ID}" &>/dev/null; then
        log_info "プロジェクト ${PROJECT_ID} は既に存在します"
    else
        log_info "プロジェクト ${PROJECT_ID} を作成中..."
        gcloud projects create "${PROJECT_ID}" --name="家計簿LINE Bot"
    fi

    gcloud config set project "${PROJECT_ID}"
    log_info "プロジェクト初期化完了"

    echo ""
    log_warn "課金を有効にしてください:"
    echo "  https://console.cloud.google.com/billing/linkedaccount?project=${PROJECT_ID}"
}

# API 有効化
enable_apis() {
    log_step "必要な API を有効化中..."

    local APIS=(
        "cloudfunctions.googleapis.com"
        "cloudscheduler.googleapis.com"
        "firestore.googleapis.com"
        "secretmanager.googleapis.com"
        "calendar-json.googleapis.com"
        "aiplatform.googleapis.com"
        "cloudbuild.googleapis.com"
        "run.googleapis.com"
    )

    for api in "${APIS[@]}"; do
        log_info "有効化中: ${api}"
        gcloud services enable "${api}" --quiet
    done

    log_info "API 有効化完了"
}

# Firestore 作成
setup_firestore() {
    log_step "Firestore を設定中..."

    # Firestore が存在するか確認
    if gcloud firestore databases describe --database="(default)" &>/dev/null 2>&1; then
        log_info "Firestore は既に存在します"
    else
        log_info "Firestore をネイティブモードで作成中..."
        gcloud firestore databases create --location="${REGION}" --quiet
    fi

    log_info "Firestore 設定完了"
}

# シークレット登録
setup_secrets() {
    log_step "Secret Manager にシークレットを登録..."

    echo ""
    log_warn "以下の情報を入力してください"
    echo ""

    # LINE_CHANNEL_SECRET
    read -p "LINE Channel Secret: " LINE_CHANNEL_SECRET
    if [ -n "${LINE_CHANNEL_SECRET}" ]; then
        echo -n "${LINE_CHANNEL_SECRET}" | gcloud secrets create LINE_CHANNEL_SECRET --data-file=- 2>/dev/null || \
        echo -n "${LINE_CHANNEL_SECRET}" | gcloud secrets versions add LINE_CHANNEL_SECRET --data-file=-
        log_info "LINE_CHANNEL_SECRET を登録しました"
    fi

    # LINE_CHANNEL_ACCESS_TOKEN
    read -p "LINE Channel Access Token: " LINE_CHANNEL_ACCESS_TOKEN
    if [ -n "${LINE_CHANNEL_ACCESS_TOKEN}" ]; then
        echo -n "${LINE_CHANNEL_ACCESS_TOKEN}" | gcloud secrets create LINE_CHANNEL_ACCESS_TOKEN --data-file=- 2>/dev/null || \
        echo -n "${LINE_CHANNEL_ACCESS_TOKEN}" | gcloud secrets versions add LINE_CHANNEL_ACCESS_TOKEN --data-file=-
        log_info "LINE_CHANNEL_ACCESS_TOKEN を登録しました"
    fi

    # GEMINI_API_KEY
    read -p "Gemini API Key: " GEMINI_API_KEY
    if [ -n "${GEMINI_API_KEY}" ]; then
        echo -n "${GEMINI_API_KEY}" | gcloud secrets create GEMINI_API_KEY --data-file=- 2>/dev/null || \
        echo -n "${GEMINI_API_KEY}" | gcloud secrets versions add GEMINI_API_KEY --data-file=-
        log_info "GEMINI_API_KEY を登録しました"
    fi

    # GOOGLE_CALENDAR_ID
    read -p "Google Calendar ID (xxx@group.calendar.google.com): " GOOGLE_CALENDAR_ID
    if [ -n "${GOOGLE_CALENDAR_ID}" ]; then
        echo -n "${GOOGLE_CALENDAR_ID}" | gcloud secrets create GOOGLE_CALENDAR_ID --data-file=- 2>/dev/null || \
        echo -n "${GOOGLE_CALENDAR_ID}" | gcloud secrets versions add GOOGLE_CALENDAR_ID --data-file=-
        log_info "GOOGLE_CALENDAR_ID を登録しました"
    fi

    log_info "シークレット登録完了"
}

# 全ての初期設定
setup_all() {
    init_project
    echo ""
    log_warn "課金を有効にしてから続行してください"
    read -p "続行しますか? (y/N): " confirm
    if [ "$confirm" != "y" ] && [ "$confirm" != "Y" ]; then
        log_error "中断しました"
        exit 1
    fi
    echo ""
    enable_apis
    echo ""
    setup_firestore
    echo ""
    setup_secrets
}

# メイン処理
main() {
    if [ $# -eq 0 ]; then
        usage
    fi

    case "$1" in
        init)
            init_project
            ;;
        apis)
            enable_apis
            ;;
        firestore)
            setup_firestore
            ;;
        secrets)
            setup_secrets
            ;;
        all)
            setup_all
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
