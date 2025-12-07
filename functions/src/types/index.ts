import { Timestamp } from '@google-cloud/firestore';

/**
 * カテゴリー種別
 */
export type Category = '外食費用' | '買い物費用';

/**
 * レポート種別
 */
export type ReportType = 'mid-month' | 'end-month';

/**
 * ユーザー情報
 */
export interface User {
  id: string;                    // LINE User ID
  displayName: string;           // LINE表示名
  groupId: string;               // 所属グループID
  isActive: boolean;             // アクティブ状態
  diningBalance: number;         // 外食費用の残金（デフォルト: 50000）
  balanceResetAt: Timestamp;     // 残金リセット日時
  createdAt: Timestamp;          // 作成日時
  updatedAt: Timestamp;          // 更新日時
}

/**
 * 支出情報
 */
export interface Expense {
  id: string;                    // 自動生成ID
  userId: string;                // LINE User ID
  userName: string;              // ユーザー表示名
  amount: number;                // 金額
  category: Category;            // カテゴリー
  storeName: string;             // 店舗名
  date: Timestamp;               // レシートの日付
  imageUrl?: string;             // 画像保存先（オプション）
  calendarEventId?: string;      // Google Calendar イベントID
  createdAt: Timestamp;          // 作成日時
}

/**
 * 設定情報
 */
export interface Settings {
  id: 'global';                  // 固定ID
  monthlyBudget: number;         // 月額予算（1人あたり）
  lineGroupId: string;           // LINE グループID
  calendarId: string;            // Google Calendar ID
  firstHalfPayerId: string;      // 前半担当者（1日〜15日）
  secondHalfPayerId: string;     // 後半担当者（16日〜月末）
  updatedAt: Timestamp;          // 更新日時
}

/**
 * Gemini APIの解析結果
 */
export interface GeminiAnalysisResult {
  date: string;                  // YYYY-MM-DD形式
  amount: number;                // 金額
  category: Category;            // カテゴリー
  storeName: string;             // 店舗名
  items?: string[];              // 商品リスト（オプション）
  error?: string;                // エラーメッセージ
  reason?: string;               // エラー理由
}

/**
 * 集計レポートデータ
 */
export interface ReportData {
  period: {
    start: string;               // YYYY-MM-DD
    end: string;                 // YYYY-MM-DD
  };
  diningExpenses: UserExpenses[];     // 外食費用
  shoppingExpenses: UserExpenses[];   // 買い物費用
  currentPayer?: string;         // 現在の外食担当者名
  monthlySummary?: MonthlySummary;    // 月間サマリー（月末のみ）
}

/**
 * ユーザー別支出
 */
export interface UserExpenses {
  userId: string;
  userName: string;
  total: number;
  balance?: number;              // 外食残高（外食費用のみ）
}

/**
 * 月間サマリー
 */
export interface MonthlySummary {
  diningSavings: UserSavings[];       // 外食費用の貯金
  shoppingSettlement: Settlement;     // 買い物費用の精算
}

/**
 * ユーザー別貯金情報
 */
export interface UserSavings {
  userId: string;
  userName: string;
  used: number;                  // 使用額
  savings: number;               // 貯金額
}

/**
 * 精算情報
 */
export interface Settlement {
  users: Array<{
    userId: string;
    userName: string;
    total: number;
  }>;
  difference: number;            // 差額
  refundFrom?: string;           // 返金する人
  refundTo?: string;             // 返金される人
  refundAmount: number;          // 返金額
}

/**
 * カレンダーイベント作成パラメータ
 */
export interface CalendarEventParams {
  summary: string;
  description: string;
  date: string;                  // YYYY-MM-DD
  colorId: string;
}
