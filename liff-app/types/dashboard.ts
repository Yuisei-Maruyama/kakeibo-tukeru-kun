export type DashboardExpenseCategory =
  | "外食費用"
  | "買い物費用"
  | "旅行費用"
  | "家賃費用";

export type DashboardUser = {
  id: string;
  displayName: string;
  diningBalance: number;
  groupId: string;
};

export type DashboardExpense = {
  id: string;
  userId: string;
  userName: string;
  amount: number;
  category: DashboardExpenseCategory;
  storeName: string;
  memo?: string;
  date: string;
  calendarEventId?: string;
};

export type DashboardCalendarEvent = {
  id: string;
  title: string;
  date: string;
  timeLabel: string;
  type: "expense" | "schedule" | "rent" | "other";
  colorId?: string;
  description?: string;
};

export type DashboardSubscription = {
  id: string;
  payerName: string;
  serviceName: string;
  amount: number;
  startDate: string;
  intervalLabel: string;
};

export type DashboardRent = {
  payerName: string;
  amount: number;
} | null;

export type ReceiptNoteCategory =
  | "diningSaving"
  | "shoppingSettlement"
  | "travelSettlement"
  | "other";

export type DashboardReceiptNote = {
  id: string;
  month: string;
  category: ReceiptNoteCategory;
  userId: string;
  userName: string;
  amount: number;
  // 互換ミラー: グループ全員が confirmations に存在すれば true
  received: boolean;
  // userId → 確認日（"YYYY-MM-DD"）。旧データ互換は "legacy"
  confirmations: Record<string, string>;
  source: "manual" | "summary";
  isActive: boolean;
};

export type DashboardSettings = {
  monthlyBudget: number;
  lineGroupId: string;
  calendarId: string;
  firstHalfPayerName?: string;
  secondHalfPayerName?: string;
};

export type DashboardData = {
  source: "live" | "unavailable";
  message: string;
  month: string;
  users: DashboardUser[];
  // 確認操作の主体となる認証ユーザー。認証スキップ時は null
  currentUser: { id: string; displayName: string } | null;
  expenses: DashboardExpense[];
  calendarEvents: DashboardCalendarEvent[];
  subscriptions: DashboardSubscription[];
  rent: DashboardRent;
  receiptNotes: DashboardReceiptNote[];
  settings: DashboardSettings;
  totals: {
    dining: number;
    shopping: number;
    travel: number;
    total: number;
  };
};
