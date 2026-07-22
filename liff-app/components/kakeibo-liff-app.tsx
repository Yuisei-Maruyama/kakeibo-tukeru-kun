"use client";

import * as React from "react";
import {
  CalendarDays,
  Camera,
  ChartNoAxesCombined,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  CircleHelp,
  ClipboardList,
  Clock3,
  Edit3,
  Home,
  ImagePlus,
  JapaneseYen,
  ListChecks,
  Plus,
  ReceiptText,
  RefreshCw,
  Send,
  Settings,
  Trash2,
  UserRound,
  WalletCards,
  XCircle,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { LoadingOverlay } from "@/components/ui/loading-overlay";
import { YadonSpinner } from "@/components/ui/yadon-spinner";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import {
  closeLiffWindow,
  getLiffIdToken,
  initializeLiff,
  sendLineTextMessages,
  type LiffSession,
} from "@/lib/liff-client";
import {
  type Expense,
  type ExpenseCategory,
  cn,
  formatCurrency,
  formatShortDate,
  todayInputValue,
} from "@/lib/utils";
import type {
  DashboardData,
  DashboardReceiptNote,
  ReceiptNoteCategory,
} from "@/types/dashboard";

type DraftExpense = Omit<Expense, "id" | "category" | "amount"> & {
  category: ExpenseCategory | "";
  amount: number | "";
};
type AppCalendarEvent = DashboardData["calendarEvents"][number];
type AppSubscription = DashboardData["subscriptions"][number];
type DraftSubscription = Pick<
  AppSubscription,
  "payerName" | "serviceName" | "startDate" | "intervalLabel"
> & { amount: number | "" };
type DraftRent = NonNullable<DashboardData["rent"]>;
type ExpenseCategoryFilter = "all" | ExpenseCategory;
type ReportMode = "history" | "summary";
type ReceiptNoteFilter = "unconfirmed" | "confirmed";
type ReceiptNoteUser = {
  id: string;
  name: string;
};
// 確認状況の表示に使うグループメンバー（確認判定は表示名でなく id で行う）
type ReceiptNoteGroupUser = {
  id: string;
  displayName: string;
};
type ReceiptNoteRow = {
  key: string;
  id?: string;
  category: ReceiptNoteCategory;
  user: ReceiptNoteUser;
  amount: number;
  // userId → 確認日（"YYYY-MM-DD"）または旧データ互換の "legacy"
  confirmations: Record<string, string>;
  isManual: boolean;
};
type ReceiptNoteCategorySummary = {
  value: ReceiptNoteCategory;
  label: string;
  description: string;
  rows: ReceiptNoteRow[];
  total: number;
};
type ReceiptNoteDraft = {
  // 手動追加は「その他」固定なのでカテゴリーは持たず、タイトル（userName）で管理する
  userName: string;
  amount: number | "";
  // 追加先の対象月。空文字は「表示中の月に追従」を意味する
  month: string;
};
type ApiResponse<T> = {
  status: "ok" | "error";
  message: string;
} & T;
type ExpenseMutationResult = {
  expense: Expense;
  diningBalance?: number;
  users: DashboardData["users"];
};
type ReceiptNoteMutationResult = {
  receiptNote: DashboardReceiptNote;
};
type CommandTile =
  | { label: string; command: string; icon: React.ElementType; reportMode?: never; action?: never }
  | { label: string; reportMode: ReportMode; icon: React.ElementType; command?: never; action?: never }
  | { label: string; action: "subscriptions"; icon: React.ElementType; command?: never; reportMode?: never };

const categories: ExpenseCategory[] = ["外食費用", "買い物費用", "旅行費用"];

// 受領ノートの月切替セレクターで遡れる最古の月（この月から当月まで）
const RECEIPT_NOTE_START_MONTH = "2026-06";

const expenseCategoryFilters: { value: ExpenseCategoryFilter; label: string }[] = [
  { value: "all", label: "すべて" },
  { value: "外食費用", label: "外食" },
  { value: "買い物費用", label: "買い物" },
  { value: "旅行費用", label: "旅行" },
];

const receiptNoteCategories: {
  value: ReceiptNoteCategory;
  label: string;
  description: string;
  expenseCategory?: ExpenseCategory;
}[] = [
  {
    value: "diningSaving",
    label: "外食貯金",
    description: "外食残高から算出",
    expenseCategory: "外食費用",
  },
  {
    value: "shoppingSettlement",
    label: "買い物費用精算",
    description: "支払額が少ない側が差額の半分を返金",
    expenseCategory: "買い物費用",
  },
  {
    value: "travelSettlement",
    label: "旅行費用精算",
    description: "支払額が少ない側が差額の半分を返金",
    expenseCategory: "旅行費用",
  },
  {
    value: "other",
    label: "その他",
    description: "タイトルと金額を自由に設定",
  },
];

const initialExpenses: Expense[] = [
  {
    id: "expense-1",
    date: "2026-06-29",
    category: "外食費用",
    payer: "田中",
    amount: 1280,
    storeName: "サイゼリヤ",
  },
  {
    id: "expense-2",
    date: "2026-06-28",
    category: "買い物費用",
    payer: "鈴木",
    amount: 3420,
    storeName: "イオン",
  },
  {
    id: "expense-3",
    date: "2026-06-24",
    category: "旅行費用",
    payer: "田中",
    amount: 15000,
    storeName: "新幹線代",
  },
];

const defaultDraft = (): DraftExpense => ({
  date: "",
  category: "",
  payer: "",
  amount: "",
  storeName: "",
  memo: "",
});

const defaultSubscriptionDraft = (): DraftSubscription => ({
  payerName: "",
  serviceName: "",
  amount: "",
  startDate: "",
  intervalLabel: "",
});

const defaultRentDraft = (): DraftRent => ({
  payerName: "@自分",
  amount: 0,
});

const commandTiles: CommandTile[] = [
  { label: "ヘルプ", command: "@ヘルプ", icon: CircleHelp },
  { label: "省略", command: "@省略", icon: ListChecks },
  { label: "残高", command: "@残高", icon: WalletCards },
  { label: "集計", reportMode: "summary", icon: ChartNoAxesCombined },
  { label: "履歴", reportMode: "history", icon: ClipboardList },
  { label: "サブスク", action: "subscriptions", icon: RefreshCw },
  { label: "初期設定", command: "@初期設定", icon: UserRound },
  { label: "設定変更", command: "@設定変更", icon: Settings },
  { label: "キャンセル", command: "@キャンセル", icon: XCircle },
];

const navigationItems = [
  { value: "home", label: "ホーム", icon: Home },
  { value: "add", label: "追加", icon: Plus },
  { value: "history", label: "履歴", icon: ReceiptText },
  { value: "plans", label: "予定", icon: CalendarDays },
  { value: "settings", label: "設定", icon: Settings },
];

function runAfterInitialPaint(callback: () => void) {
  const idleWindow = window as Window & {
    requestIdleCallback?: (callback: () => void, options?: { timeout: number }) => number;
    cancelIdleCallback?: (handle: number) => void;
  };

  if (idleWindow.requestIdleCallback) {
    const handle = idleWindow.requestIdleCallback(callback, { timeout: 1200 });
    return () => idleWindow.cancelIdleCallback?.(handle);
  }

  const handle = window.setTimeout(callback, 120);
  return () => window.clearTimeout(handle);
}

function formatYearMonthLabel(value: string) {
  const [year, month] = value.split("-").map(Number);
  if (!year || !month) {
    return "表示月";
  }

  return `${year}年${month}月`;
}

function shiftYearMonth(value: string, offset: number) {
  const [year, month] = value.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1 + offset, 1));
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}`;
}

/**
 * 受領ノート・ホームの月切替セレクターで使う対象月の選択肢を生成する。
 * 開始月（RECEIPT_NOTE_START_MONTH）から当月まで 1 ヶ月ずつ遡った降順で並べる。
 * @param currentSelection 現在選択中の対象月（"YYYY-MM"）。範囲外なら選択肢に補完して select が空にならないようにする
 * @returns 降順に並んだ対象月（"YYYY-MM"）の配列
 */
function buildReceiptNoteMonthOptions(currentSelection: string) {
  const months: string[] = [];
  let cursor = todayInputValue().slice(0, 7);
  while (cursor >= RECEIPT_NOTE_START_MONTH) {
    months.push(cursor);
    cursor = shiftYearMonth(cursor, -1);
  }
  if (currentSelection && !months.includes(currentSelection)) {
    months.push(currentSelection);
    months.sort((a, b) => b.localeCompare(a));
  }
  return months;
}

function normalizeYearMonthInput(value: string) {
  const [year, month] = value.trim().split(/[/-]/).map(Number);
  if (!year || !month || month < 1 || month > 12) {
    return null;
  }

  return `${year}-${String(month).padStart(2, "0")}`;
}

function toReportMonthInput(value: string) {
  const [year, month] = value.split("-").map(Number);
  return `${year}/${month}`;
}

// 確認日（"YYYY-MM-DD"）を M/D 形式（先頭ゼロなし）で表示する
function formatConfirmationDate(date: string) {
  const [, month, day] = date.split("-");
  if (!month || !day) {
    return date;
  }
  return `${Number(month)}/${Number(day)}`;
}

// 行の確認情報にログイン中ユーザーの楽観更新を重ねる（override=null で確認解除）
function mergeRowConfirmations(
  base: Record<string, string>,
  override: string | null | undefined,
  currentUserId: string | undefined,
) {
  if (override === undefined || !currentUserId) {
    return base;
  }
  const next = { ...base };
  if (override === null) {
    delete next[currentUserId];
  } else {
    next[currentUserId] = override;
  }
  return next;
}

function createReceiptNoteKey(
  month: string,
  category: ReceiptNoteCategory,
  userName: string,
) {
  return `${month}:${category}:${userName}`;
}

function createReceiptExpenseKey(category: ExpenseCategory, userName: string) {
  return `${category}:${userName}`;
}

// レコードから指定キーを取り除く（存在しなければ元のまま返す）
function omitRecordKey<T>(record: Record<string, T>, key: string) {
  if (!(key in record)) {
    return record;
  }
  const next = { ...record };
  delete next[key];
  return next;
}

// 楽観更新の巻き戻し用。変更前が未設定ならキーを削除し、値があれば元へ戻す
function restoreRecordKey<T>(
  record: Record<string, T>,
  key: string,
  value: T | undefined,
) {
  if (value === undefined) {
    return omitRecordKey(record, key);
  }
  return { ...record, [key]: value };
}

function addReceiptNoteUser(
  users: Map<string, ReceiptNoteUser>,
  id: string,
  name: string,
) {
  const trimmedName = name.trim();
  if (!trimmedName || users.has(trimmedName)) {
    return;
  }

  users.set(trimmedName, { id, name: trimmedName });
}

async function requestJson<T>(
  path: string,
  init: Omit<RequestInit, "headers"> & { headers?: HeadersInit } = {},
) {
  const idToken = getLiffIdToken();
  const headers = new Headers(init.headers);
  headers.set("content-type", "application/json");

  if (idToken) {
    headers.set("Authorization", `Bearer ${idToken}`);
  }

  const response = await fetch(path, {
    ...init,
    headers,
  });
  const result = (await response.json()) as ApiResponse<T>;

  if (!response.ok || result.status === "error") {
    throw new Error(result.message);
  }

  return result;
}

export function KakeiboLiffApp() {
  const [liffSession, setLiffSession] = React.useState<LiffSession>({
    status: "preview",
    message: "LIFF 初期化前",
    profile: null,
    canSendMessages: false,
  });
  const [isInitializing, setIsInitializing] = React.useState(true);
  const [isSending, setIsSending] = React.useState(false);
  const [activeTab, setActiveTab] = React.useState("home");
  const [addMode, setAddMode] = React.useState<"image" | "manual">("image");
  const [toast, setToast] = React.useState("フォームで既存 bot コマンドを送信できます");
  const [dashboard, setDashboard] = React.useState<DashboardData | null>(null);
  const [dashboardMonth, setDashboardMonth] = React.useState(() =>
    todayInputValue().slice(0, 7),
  );
  const [isLoadingDashboard, setIsLoadingDashboard] = React.useState(false);
  const [isMutating, setIsMutating] = React.useState(false);
  const [expenses, setExpenses] = React.useState<Expense[]>(initialExpenses);
  const [dashboardUsers, setDashboardUsers] = React.useState<DashboardData["users"]>([]);
  const [draftExpense, setDraftExpense] = React.useState<DraftExpense>(defaultDraft);
  const [receiptImageUrl, setReceiptImageUrl] = React.useState<string | null>(null);
  const [receiptFile, setReceiptFile] = React.useState<File | null>(null);
  const [isAnalyzingImage, setIsAnalyzingImage] = React.useState(false);
  const [schedule, setSchedule] = React.useState({
    participants: "",
    title: "",
    date: "",
    startTime: "",
    endTime: "",
  });
  const [budget, setBudget] = React.useState(50000);
  const [calendarEvents, setCalendarEvents] = React.useState<AppCalendarEvent[]>([]);
  const [subscriptions, setSubscriptions] = React.useState<AppSubscription[]>([]);
  const [rent, setRent] = React.useState<DraftRent | null>(null);
  const [subscriptionDraft, setSubscriptionDraft] =
    React.useState<DraftSubscription>(defaultSubscriptionDraft);
  const [rentDraft, setRentDraft] = React.useState<DraftRent>(defaultRentDraft);
  const [reportMonth, setReportMonth] = React.useState(() =>
    toReportMonthInput(todayInputValue().slice(0, 7)),
  );
  const [reportMode, setReportMode] = React.useState<ReportMode>("history");
  const [expenseCategoryFilter, setExpenseCategoryFilter] =
    React.useState<ExpenseCategoryFilter>("all");
  const [expenseDateFilter, setExpenseDateFilter] = React.useState("");
  const [expensePayerFilter, setExpensePayerFilter] = React.useState("");
  const [receiptNoteFilter, setReceiptNoteFilter] =
    React.useState<ReceiptNoteFilter>("unconfirmed");
  const [receiptNoteAmounts, setReceiptNoteAmounts] = React.useState<
    Record<string, number>
  >({});
  // 行キー → 楽観適用した自分の確認日（"YYYY-MM-DD"）。null は確認解除を表す
  const [receiptNoteConfirmOverrides, setReceiptNoteConfirmOverrides] =
    React.useState<Record<string, string | null>>({});
  const [receiptNoteUserNames, setReceiptNoteUserNames] = React.useState<
    Record<string, string>
  >({});
  const [receiptNoteDeletedKeys, setReceiptNoteDeletedKeys] = React.useState<
    Record<string, boolean>
  >({});
  const [savedReceiptNotes, setSavedReceiptNotes] = React.useState<
    DashboardReceiptNote[]
  >([]);
  const [receiptNoteDraft, setReceiptNoteDraft] = React.useState<ReceiptNoteDraft>({
    userName: "",
    amount: "",
    month: "",
  });
  // ログイン中ユーザー（null = プレビュー / 認証スキップ。確認操作は不可）
  const [currentUser, setCurrentUser] =
    React.useState<DashboardData["currentUser"]>(null);
  const [showSaveToast, setShowSaveToast] = React.useState(false);
  const [errorToast, setErrorToast] = React.useState<string | null>(null);
  const saveToastTimerRef = React.useRef<number | null>(null);
  const errorToastTimerRef = React.useRef<number | null>(null);
  const cameraInputRef = React.useRef<HTMLInputElement | null>(null);

  const celebrateSave = React.useCallback(() => {
    setShowSaveToast(true);
    setErrorToast(null);
    if (saveToastTimerRef.current) {
      window.clearTimeout(saveToastTimerRef.current);
    }
    saveToastTimerRef.current = window.setTimeout(() => {
      setShowSaveToast(false);
    }, 3500);
  }, []);

  // 登録エラーを画面下部に目立つ形で表示する
  const showError = React.useCallback((message: string) => {
    setToast(message);
    setErrorToast(message);
    setShowSaveToast(false);
    if (errorToastTimerRef.current) {
      window.clearTimeout(errorToastTimerRef.current);
    }
    errorToastTimerRef.current = window.setTimeout(() => {
      setErrorToast(null);
    }, 4000);
  }, []);

  React.useEffect(() => {
    return () => {
      if (saveToastTimerRef.current) {
        window.clearTimeout(saveToastTimerRef.current);
      }
      if (errorToastTimerRef.current) {
        window.clearTimeout(errorToastTimerRef.current);
      }
    };
  }, []);

  React.useEffect(() => {
    let mounted = true;

    initializeLiff().then((session) => {
      if (!mounted) {
        return;
      }

      setLiffSession(session);
      setIsInitializing(false);
      setToast(session.message);
    });

    return () => {
      mounted = false;
    };
  }, []);

  const loadDashboard = React.useCallback(async () => {
    setIsLoadingDashboard(true);

    try {
      const idToken = getLiffIdToken();
      const response = await fetch(`/api/dashboard?month=${dashboardMonth}`, {
        headers: idToken
          ? {
              Authorization: `Bearer ${idToken}`,
            }
          : {},
      });
      const data = (await response.json()) as DashboardData;

      React.startTransition(() => {
        setDashboard(data);
        setDashboardUsers(data.users);
        setToast(data.message);
        setCalendarEvents(data.calendarEvents);
        setSubscriptions(data.subscriptions);
        setRent(data.rent);
        setRentDraft(data.rent ?? defaultRentDraft());
        setSavedReceiptNotes(data.receiptNotes);
        setCurrentUser(data.currentUser);

        if (data.source === "live") {
          setBudget(data.settings.monthlyBudget);
          setExpenses(
            data.expenses
              .filter((expense) =>
                categories.includes(expense.category as ExpenseCategory),
              )
              .map((expense) => ({
                id: expense.id,
                date: expense.date,
                category: expense.category as ExpenseCategory,
                payer: expense.userName,
                amount: expense.amount,
                storeName: expense.storeName,
                memo: expense.memo ?? "",
              })),
          );
        }
      });
    } catch (error) {
      setToast(error instanceof Error ? error.message : "データ取得に失敗しました");
    } finally {
      setIsLoadingDashboard(false);
    }
  }, [dashboardMonth]);

  React.useEffect(() => {
    if (isInitializing) {
      return;
    }

    return runAfterInitialPaint(() => {
      void loadDashboard();
    });
  }, [isInitializing, loadDashboard]);

  React.useEffect(() => {
    return () => {
      if (receiptImageUrl) {
        URL.revokeObjectURL(receiptImageUrl);
      }
    };
  }, [receiptImageUrl]);

  const totals = React.useMemo(
    () =>
      expenses.reduce(
        (acc, expense) => {
          if (expense.category === "外食費用") {
            acc.dining += expense.amount;
          } else if (expense.category === "買い物費用") {
            acc.shopping += expense.amount;
          } else if (expense.category === "旅行費用") {
            acc.travel += expense.amount;
          }

          acc.total += expense.amount;
          return acc;
        },
        { dining: 0, shopping: 0, travel: 0, total: 0 },
      ),
    [expenses],
  );
  const filteredExpenses = React.useMemo(() => {
    const results: Expense[] = [];

    for (const expense of expenses) {
      if (
        expenseCategoryFilter !== "all" &&
        expense.category !== expenseCategoryFilter
      ) {
        continue;
      }

      if (expenseDateFilter && expense.date !== expenseDateFilter) {
        continue;
      }

      if (expensePayerFilter && expense.payer !== expensePayerFilter) {
        continue;
      }

      results.push(expense);
    }

    return results;
  }, [expenseCategoryFilter, expenseDateFilter, expensePayerFilter, expenses]);
  const hasLiveDashboardData = dashboard?.source === "live" || dashboardUsers.length > 0;
  const visibleDashboardUsers =
    dashboard?.source === "live" ? dashboard.users : dashboardUsers;
  const liveDiningBalance = visibleDashboardUsers.length
    ? visibleDashboardUsers.reduce((sum, user) => sum + user.diningBalance, 0)
    : Math.max(budget - totals.dining, 0);
  const homeMonthOptions = React.useMemo(
    () => buildReceiptNoteMonthOptions(dashboardMonth),
    [dashboardMonth],
  );
  // 外食残高カードは対象月に追従する。当月はライブ残高、過去月はその月の
  // アクティブな外食貯金ノートを優先し、なければ「予算 − その月の外食費用合計」で算出する
  const diningBalance = React.useMemo(() => {
    const isCurrentMonth = dashboardMonth === todayInputValue().slice(0, 7);
    const diningExpenseByPayer = new Map<string, number>();
    for (const expense of expenses) {
      if (expense.category !== "外食費用") {
        continue;
      }
      diningExpenseByPayer.set(
        expense.payer,
        (diningExpenseByPayer.get(expense.payer) ?? 0) + expense.amount,
      );
    }
    const entries = visibleDashboardUsers.map((user) => {
      if (isCurrentMonth) {
        return { id: user.id, displayName: user.displayName, amount: user.diningBalance };
      }
      const savedNote = savedReceiptNotes.find(
        (note) =>
          note.category === "diningSaving" &&
          note.isActive &&
          // 受領ノート側の照合（userId または userName 一致）と揃える
          (note.userId === user.id || note.userName === user.displayName),
      );
      return {
        id: user.id,
        displayName: user.displayName,
        amount: savedNote
          ? savedNote.amount
          : budget - (diningExpenseByPayer.get(user.displayName) ?? 0),
      };
    });
    const caption = isCurrentMonth
      ? "現在の残高"
      : `${formatYearMonthLabel(dashboardMonth)} 時点の実績`;
    return { entries, caption };
  }, [budget, dashboardMonth, expenses, savedReceiptNotes, visibleDashboardUsers]);
  // 支払い者フィルターの選択肢: ダッシュボードの表示名を先頭に、履歴の payer で未収録のものを出現順で追加
  const expensePayerOptions = React.useMemo(() => {
    const options: string[] = [];

    for (const user of visibleDashboardUsers) {
      if (user.displayName && !options.includes(user.displayName)) {
        options.push(user.displayName);
      }
    }

    for (const expense of expenses) {
      if (expense.payer && !options.includes(expense.payer)) {
        options.push(expense.payer);
      }
    }

    return options;
  }, [expenses, visibleDashboardUsers]);
  // ホームの買い物・旅行合計に表示するユーザー別内訳（対象月の支出を支払い者ごとに集計）
  const categorySpendingEntries = React.useMemo(() => {
    const buildEntries = (category: ExpenseCategory) => {
      const amounts = new Map<string, number>();
      for (const user of visibleDashboardUsers) {
        amounts.set(user.displayName, 0);
      }
      for (const expense of expenses) {
        if (expense.category !== category) {
          continue;
        }
        amounts.set(
          expense.payer,
          (amounts.get(expense.payer) ?? 0) + expense.amount,
        );
      }
      return Array.from(amounts, ([displayName, amount]) => ({
        displayName,
        amount,
      }));
    };
    return {
      shopping: buildEntries("買い物費用"),
      travel: buildEntries("旅行費用"),
    };
  }, [expenses, visibleDashboardUsers]);
  const receiptNoteUsers = React.useMemo(() => {
    const userMap = new Map<string, ReceiptNoteUser>();

    for (const user of visibleDashboardUsers) {
      addReceiptNoteUser(userMap, user.id, user.displayName);
    }

    for (const expense of expenses) {
      addReceiptNoteUser(userMap, `expense-${expense.payer}`, expense.payer);
    }

    if (userMap.size === 0) {
      addReceiptNoteUser(userMap, "preview-self", "@自分");
      addReceiptNoteUser(userMap, "preview-partner", "@相手");
    }

    return Array.from(userMap.values()).slice(0, 2);
  }, [expenses, visibleDashboardUsers]);
  const receiptNoteSummaries = React.useMemo(() => {
    const expenseAmountMap = new Map<string, number>();
    const diningBalanceMap = new Map<string, number>();
    const rows: ReceiptNoteRow[] = [];
    // 外食貯金の自動行抑止に使う「アクティブな保存済みノート」だけのキー
    const activeReceiptNoteKeys = new Set<string>();
    // 自動集計由来（source: summary）の保存済みノートがあるカテゴリー。
    // 精算カテゴリーはこの集合にある月は再導出しない（削除済みノートの復活防止を含む）
    const summaryNoteCategories = new Set<ReceiptNoteCategory>();

    for (const receiptNote of savedReceiptNotes) {
      if (receiptNote.source !== "manual") {
        summaryNoteCategories.add(receiptNote.category);
      }

      if (!receiptNote.isActive) {
        continue;
      }

      activeReceiptNoteKeys.add(`${receiptNote.category}:${receiptNote.userId}`);
      activeReceiptNoteKeys.add(`${receiptNote.category}:${receiptNote.userName}`);

      rows.push({
        key: receiptNote.id,
        id: receiptNote.id,
        category: receiptNote.category,
        user: {
          id: receiptNote.userId,
          name: receiptNoteUserNames[receiptNote.id] ?? receiptNote.userName,
        },
        amount: receiptNoteAmounts[receiptNote.id] ?? receiptNote.amount,
        confirmations: mergeRowConfirmations(
          receiptNote.confirmations ?? {},
          receiptNoteConfirmOverrides[receiptNote.id],
          currentUser?.id,
        ),
        isManual: receiptNote.source === "manual",
      });
    }

    for (const expense of expenses) {
      const key = createReceiptExpenseKey(expense.category, expense.payer);
      expenseAmountMap.set(key, (expenseAmountMap.get(key) ?? 0) + expense.amount);
    }

    for (const user of visibleDashboardUsers) {
      diningBalanceMap.set(user.displayName, user.diningBalance);
    }

    // 外食貯金の残高（users.diningBalance）は「現在」の値のため過去月では使わない
    const isCurrentMonth = dashboardMonth === todayInputValue().slice(0, 7);

    for (const category of receiptNoteCategories) {
      // その他カテゴリーは家賃の自動行だけを導出する（明細追加の手動行は保存済みノート側で表現される）
      if (!category.expenseCategory) {
        if (category.value !== "other" || !rent || rent.amount <= 0) {
          continue;
        }
        // 実体化済み・削除済み（source: summary のノートが存在する月）は再導出しない
        if (summaryNoteCategories.has(category.value)) {
          continue;
        }
        const key = createReceiptNoteKey(dashboardMonth, category.value, "家賃代");
        if (receiptNoteDeletedKeys[key]) {
          continue;
        }
        rows.push({
          key,
          category: category.value,
          user: {
            id: "rent",
            name: receiptNoteUserNames[key] ?? "家賃代",
          },
          amount: receiptNoteAmounts[key] ?? rent.amount,
          confirmations: mergeRowConfirmations(
            {},
            receiptNoteConfirmOverrides[key],
            currentUser?.id,
          ),
          isManual: false,
        });
        continue;
      }

      const isDiningSaving = category.value === "diningSaving";

      // 買い物・旅行の精算は @集計 と同じく「支払額が少ない側が差額の半分を返金する」1 行にする
      if (!isDiningSaving) {
        // 保存済みの自動集計ノートがその月の精算を表現しているときは再導出しない
        if (
          receiptNoteUsers.length < 2 ||
          summaryNoteCategories.has(category.value)
        ) {
          continue;
        }

        const [firstUser, secondUser] = receiptNoteUsers;
        const firstTotal =
          expenseAmountMap.get(
            createReceiptExpenseKey(category.expenseCategory, firstUser.name),
          ) ?? 0;
        const secondTotal =
          expenseAmountMap.get(
            createReceiptExpenseKey(category.expenseCategory, secondUser.name),
          ) ?? 0;
        const refundAmount = Math.round(Math.abs(firstTotal - secondTotal) / 2);

        // 支払額が同額なら精算不要（@集計の「精算の必要はありません」と同じ）
        if (refundAmount === 0) {
          continue;
        }

        const payer = firstTotal < secondTotal ? firstUser : secondUser;
        const key = createReceiptNoteKey(dashboardMonth, category.value, payer.name);
        if (receiptNoteDeletedKeys[key]) {
          continue;
        }

        rows.push({
          key,
          category: category.value,
          user: {
            id: payer.id,
            name: receiptNoteUserNames[key] ?? payer.name,
          },
          amount: receiptNoteAmounts[key] ?? refundAmount,
          confirmations: mergeRowConfirmations(
            {},
            receiptNoteConfirmOverrides[key],
            currentUser?.id,
          ),
          isManual: false,
        });
        continue;
      }

      // 外食貯金はユーザーごとに行を作る
      for (const user of receiptNoteUsers) {
        const key = createReceiptNoteKey(dashboardMonth, category.value, user.name);
        // 外食貯金は 0 円・マイナスでも常時表示するため、アクティブな保存済みノートが
        // あるときだけ抑止する（論理削除済みノート・削除済みキーでは抑止しない）
        if (
          activeReceiptNoteKeys.has(`${category.value}:${user.id}`) ||
          activeReceiptNoteKeys.has(`${category.value}:${user.name}`)
        ) {
          continue;
        }

        const categoryExpenseKey = createReceiptExpenseKey(
          category.expenseCategory,
          user.name,
        );
        // 当月は現在残高を、過去月は「予算 − その月の外食支出合計」を初期額にする（負値も通す）
        const fallbackDiningSaving =
          budget - (expenseAmountMap.get(categoryExpenseKey) ?? 0);
        const defaultAmount = isCurrentMonth
          ? diningBalanceMap.get(user.name) ?? fallbackDiningSaving
          : fallbackDiningSaving;
        const userName = receiptNoteUserNames[key] ?? user.name;

        rows.push({
          key,
          category: category.value,
          user: {
            id: user.id,
            name: userName,
          },
          amount: receiptNoteAmounts[key] ?? defaultAmount,
          confirmations: mergeRowConfirmations(
            {},
            receiptNoteConfirmOverrides[key],
            currentUser?.id,
          ),
          isManual: false,
        });
      }
    }

    return receiptNoteCategories.map<ReceiptNoteCategorySummary>((category) => {
      const categoryRows = rows.filter((row) => row.category === category.value);

      return {
        value: category.value,
        label: category.label,
        description: category.description,
        rows: categoryRows,
        total: categoryRows.reduce((sum, row) => sum + row.amount, 0),
      };
    });
  }, [
    budget,
    currentUser,
    dashboardMonth,
    expenses,
    receiptNoteAmounts,
    receiptNoteConfirmOverrides,
    receiptNoteDeletedKeys,
    receiptNoteUserNames,
    receiptNoteUsers,
    rent,
    savedReceiptNotes,
    visibleDashboardUsers,
  ]);
  // 確認状況の表示・判定に使うグループメンバー（visibleDashboardUsers の id で判定する）
  const receiptNoteGroupUsers = React.useMemo<ReceiptNoteGroupUser[]>(
    () =>
      visibleDashboardUsers.map((user) => ({
        id: user.id,
        displayName: user.displayName,
      })),
    [visibleDashboardUsers],
  );

  async function sendCommands(commands: string[], successMessage: string) {
    setIsSending(true);

    try {
      if (liffSession.canSendMessages) {
        await sendLineTextMessages(commands);
        setToast(successMessage);
        return;
      }

      await navigator.clipboard.writeText(commands.join("\n"));
      setToast("コマンドをコピーしました");
    } catch (error) {
      setToast(error instanceof Error ? error.message : "送信に失敗しました");
    } finally {
      setIsSending(false);
    }
  }

  function handleCommandTile(tile: CommandTile) {
    if (tile.reportMode) {
      setActiveTab("history");
      showReport(tile.reportMode);
      return;
    }

    if (tile.action === "subscriptions") {
      setActiveTab("settings");
      setToast("サブスク一覧をアプリ内に表示します");
      return;
    }

    void sendCommands([tile.command], `${tile.label} を送信しました`);
  }

  function showReport(mode: ReportMode) {
    const normalizedMonth = normalizeYearMonthInput(reportMonth);
    if (!normalizedMonth) {
      setToast("対象年月は 2026/6 の形式で入力してください");
      return;
    }

    setReportMode(mode);
    setReportMonth(toReportMonthInput(normalizedMonth));
    setToast(
      `${formatYearMonthLabel(normalizedMonth)}の${
        mode === "history" ? "履歴" : "集計"
      }をアプリ内に表示します`,
    );

    if (normalizedMonth === dashboardMonth) {
      void loadDashboard();
      return;
    }

    setDashboardMonth(normalizedMonth);
  }

  // ホーム・受領ノートの月セレクターから対象月を切り替える（既存のダッシュボード読み込み経路に乗せる）
  function changeDashboardMonth(month: string) {
    if (month === dashboardMonth) {
      void loadDashboard();
      return;
    }

    setDashboardMonth(month);
  }

  function selectReceiptFile(file: File | undefined) {
    if (!file) {
      return;
    }

    if (receiptImageUrl) {
      URL.revokeObjectURL(receiptImageUrl);
    }

    setReceiptFile(file);
    setReceiptImageUrl(URL.createObjectURL(file));
    setToast(`${file.name} を選択しました`);
  }

  async function submitReceiptImage() {
    if (!receiptFile) {
      showError("レシート画像を選択してください");
      return;
    }

    setIsAnalyzingImage(true);

    try {
      const formData = new FormData();
      formData.append("image", receiptFile);
      const idToken = getLiffIdToken();
      const response = await fetch("/api/expenses/from-image", {
        method: "POST",
        headers: idToken
          ? {
              Authorization: `Bearer ${idToken}`,
            }
          : {},
        body: formData,
      });
      const result = (await response.json()) as {
        status: "ok" | "error";
        message: string;
        users?: DashboardData["users"];
        expense?: Expense;
      };

      if (!response.ok || result.status === "error" || !result.expense) {
        throw new Error(result.message);
      }

      React.startTransition(() => {
        setExpenses((current) => [result.expense!, ...current]);
        setDashboardUsers(result.users ?? dashboardUsers);
        setDashboard(null);
        setReceiptFile(null);
        setReceiptImageUrl(null);
        setToast(result.message);
        celebrateSave();
      });
    } catch (error) {
      showError(error instanceof Error ? error.message : "画像登録に失敗しました");
    } finally {
      setIsAnalyzingImage(false);
    }
  }

  async function submitExpense() {
    if (!draftExpense.date || !draftExpense.storeName.trim()) {
      showError("日付と内容を入力してください");
      return;
    }

    if (!draftExpense.category) {
      showError("カテゴリーを選択してください");
      return;
    }

    const expenseAmount = Number(draftExpense.amount);
    if (
      draftExpense.amount === "" ||
      !Number.isFinite(expenseAmount) ||
      expenseAmount <= 0
    ) {
      showError("金額は 1 円以上で入力してください");
      return;
    }

    setIsMutating(true);

    try {
      const result = await requestJson<ExpenseMutationResult>(
        "/api/expenses",
        {
          method: "POST",
          body: JSON.stringify({
            ...draftExpense,
            amount: Number(draftExpense.amount),
          }),
        },
      );

      React.startTransition(() => {
        setExpenses((current) =>
          [result.expense, ...current].sort((a, b) => b.date.localeCompare(a.date)),
        );
        setDashboardUsers(result.users);
        setDashboard(null);
        setDraftExpense(defaultDraft());
        setReportMode("history");
        setActiveTab("history");
        setToast(result.message);
        celebrateSave();
      });
    } catch (error) {
      showError(error instanceof Error ? error.message : "支出の保存に失敗しました");
    } finally {
      setIsMutating(false);
    }
  }

  async function deleteExpense(expense: Expense) {
    setIsMutating(true);

    try {
      const result = await requestJson<ExpenseMutationResult>(
        `/api/expenses/${encodeURIComponent(expense.id)}`,
        {
          method: "DELETE",
        },
      );

      React.startTransition(() => {
        setExpenses((current) => current.filter((item) => item.id !== expense.id));
        setDashboardUsers(result.users);
        setDashboard(null);
        setToast(result.message);
      });
    } catch (error) {
      showError(error instanceof Error ? error.message : "支出の削除に失敗しました");
    } finally {
      setIsMutating(false);
    }
  }

  async function updateExpense(before: Expense, after: Expense) {
    if (!after.date || !after.storeName.trim()) {
      showError("日付と内容を入力してください");
      return;
    }

    if (!after.category) {
      showError("カテゴリーを選択してください");
      return;
    }

    const expenseAmount = Number(after.amount);
    if (!Number.isFinite(expenseAmount) || expenseAmount <= 0) {
      showError("金額は 1 円以上で入力してください");
      return;
    }

    setIsMutating(true);

    try {
      const result = await requestJson<ExpenseMutationResult>(
        `/api/expenses/${encodeURIComponent(before.id)}`,
        {
          method: "PATCH",
          body: JSON.stringify({
            ...after,
            amount: Number(after.amount),
          }),
        },
      );

      React.startTransition(() => {
        setExpenses((current) =>
          current
            .map((item) => (item.id === before.id ? result.expense : item))
            .sort((a, b) => b.date.localeCompare(a.date)),
        );
        setDashboardUsers(result.users);
        setDashboard(null);
        setToast(result.message);
        celebrateSave();
      });
    } catch (error) {
      showError(error instanceof Error ? error.message : "支出の更新に失敗しました");
    } finally {
      setIsMutating(false);
    }
  }

  async function addSchedule() {
    if (!schedule.title.trim() || !schedule.date) {
      showError("予定の内容と日付を入力してください");
      return;
    }

    setIsMutating(true);

    try {
      const result = await requestJson<{ event: AppCalendarEvent }>(
        "/api/calendar-events",
        {
          method: "POST",
          body: JSON.stringify(schedule),
        },
      );

      React.startTransition(() => {
        setCalendarEvents((current) =>
          [result.event, ...current].sort((a, b) => a.date.localeCompare(b.date)),
        );
        setSchedule((current) => ({
          ...current,
          title: "",
          startTime: "",
          endTime: "",
        }));
        setToast(result.message);
        celebrateSave();
      });
    } catch (error) {
      showError(error instanceof Error ? error.message : "予定の保存に失敗しました");
    } finally {
      setIsMutating(false);
    }
  }

  async function updateSchedule(before: AppCalendarEvent, after: AppCalendarEvent) {
    setIsMutating(true);

    try {
      const result = await requestJson<{ event: AppCalendarEvent }>(
        `/api/calendar-events/${encodeURIComponent(before.id)}`,
        {
          method: "PATCH",
          body: JSON.stringify(after),
        },
      );

      React.startTransition(() => {
        setCalendarEvents((current) =>
          current
            .map((event) => (event.id === before.id ? result.event : event))
            .sort((a, b) => a.date.localeCompare(b.date)),
        );
        setToast(result.message);
        celebrateSave();
      });
    } catch (error) {
      showError(error instanceof Error ? error.message : "予定の更新に失敗しました");
    } finally {
      setIsMutating(false);
    }
  }

  async function deleteSchedule(event: AppCalendarEvent) {
    setIsMutating(true);

    try {
      const result = await requestJson<Record<string, never>>(
        `/api/calendar-events/${encodeURIComponent(event.id)}`,
        {
          method: "DELETE",
        },
      );

      React.startTransition(() => {
        setCalendarEvents((current) => current.filter((item) => item.id !== event.id));
        setToast(result.message);
      });
    } catch (error) {
      showError(error instanceof Error ? error.message : "予定の削除に失敗しました");
    } finally {
      setIsMutating(false);
    }
  }

  async function addSubscription() {
    if (!subscriptionDraft.serviceName.trim()) {
      showError("サブスク名を入力してください");
      return;
    }

    const subscriptionAmount = Number(subscriptionDraft.amount);
    if (
      subscriptionDraft.amount === "" ||
      !Number.isFinite(subscriptionAmount) ||
      subscriptionAmount <= 0
    ) {
      showError("金額は 1 円以上で入力してください");
      return;
    }

    if (!subscriptionDraft.startDate) {
      showError("開始日を入力してください");
      return;
    }

    setIsMutating(true);

    try {
      const result = await requestJson<{ subscription: AppSubscription }>(
        "/api/subscriptions",
        {
          method: "POST",
          body: JSON.stringify({
            ...subscriptionDraft,
            amount: Number(subscriptionDraft.amount),
          }),
        },
      );

      React.startTransition(() => {
        setSubscriptions((current) =>
          [result.subscription, ...current].sort((a, b) =>
            a.startDate.localeCompare(b.startDate),
          ),
        );
        setSubscriptionDraft(defaultSubscriptionDraft());
        setToast(result.message);
        celebrateSave();
      });
    } catch (error) {
      showError(error instanceof Error ? error.message : "サブスクの保存に失敗しました");
    } finally {
      setIsMutating(false);
    }
  }

  async function updateSubscription(
    before: AppSubscription,
    after: AppSubscription,
  ) {
    if (!after.serviceName.trim()) {
      showError("サブスク名を入力してください");
      return;
    }

    const subscriptionAmount = Number(after.amount);
    if (!Number.isFinite(subscriptionAmount) || subscriptionAmount <= 0) {
      showError("金額は 1 円以上で入力してください");
      return;
    }

    if (!after.startDate) {
      showError("開始日を入力してください");
      return;
    }

    setIsMutating(true);

    try {
      const result = await requestJson<{ subscription: AppSubscription }>(
        `/api/subscriptions/${encodeURIComponent(before.id)}`,
        {
          method: "PATCH",
          body: JSON.stringify({
            ...after,
            amount: Number(after.amount),
          }),
        },
      );

      React.startTransition(() => {
        setSubscriptions((current) =>
          current
            .map((subscription) =>
              subscription.id === before.id ? result.subscription : subscription,
            )
            .sort((a, b) => a.startDate.localeCompare(b.startDate)),
        );
        setToast(result.message);
        celebrateSave();
      });
    } catch (error) {
      showError(error instanceof Error ? error.message : "サブスクの更新に失敗しました");
    } finally {
      setIsMutating(false);
    }
  }

  async function deleteSubscription(subscription: AppSubscription) {
    setIsMutating(true);

    try {
      const result = await requestJson<{ subscription: AppSubscription }>(
        `/api/subscriptions/${encodeURIComponent(subscription.id)}`,
        {
          method: "DELETE",
        },
      );

      React.startTransition(() => {
        setSubscriptions((current) =>
          current.filter((item) => item.id !== subscription.id),
        );
        setToast(result.message);
      });
    } catch (error) {
      showError(error instanceof Error ? error.message : "サブスクの削除に失敗しました");
    } finally {
      setIsMutating(false);
    }
  }

  async function updateRent() {
    setIsMutating(true);

    try {
      const result = await requestJson<{ rent: DraftRent }>("/api/rent", {
        method: "PUT",
        body: JSON.stringify({
          ...rentDraft,
          amount: Number(rentDraft.amount),
        }),
      });

      React.startTransition(() => {
        setRent(result.rent);
        setRentDraft(result.rent);
        setToast(result.message);
        celebrateSave();
      });
    } catch (error) {
      showError(error instanceof Error ? error.message : "家賃の保存に失敗しました");
    } finally {
      setIsMutating(false);
    }
  }

  async function clearRent() {
    setIsMutating(true);

    try {
      const result = await requestJson<Record<string, never>>("/api/rent", {
        method: "DELETE",
      });

      React.startTransition(() => {
        setRent(null);
        setRentDraft(defaultRentDraft());
        setToast(result.message);
      });
    } catch (error) {
      showError(error instanceof Error ? error.message : "家賃の削除に失敗しました");
    } finally {
      setIsMutating(false);
    }
  }

  async function updateBudget() {
    setIsMutating(true);

    try {
      const result = await requestJson<{
        monthlyBudget: number;
        users: DashboardData["users"];
      }>("/api/settings/budget", {
        method: "PUT",
        body: JSON.stringify({
          monthlyBudget: Number(budget),
        }),
      });

      React.startTransition(() => {
        setBudget(result.monthlyBudget);
        setDashboardUsers(result.users);
        setDashboard((current) =>
          current
            ? {
                ...current,
                users: result.users,
                settings: {
                  ...current.settings,
                  monthlyBudget: result.monthlyBudget,
                },
              }
            : current,
        );
        setToast(result.message);
        celebrateSave();
      });
    } catch (error) {
      showError(error instanceof Error ? error.message : "予算変更に失敗しました");
    } finally {
      setIsMutating(false);
    }
  }

  function applySavedReceiptNote(receiptNote: DashboardReceiptNote) {
    setSavedReceiptNotes((current) => {
      const exists = current.some((item) => item.id === receiptNote.id);
      if (exists) {
        return current.map((item) =>
          item.id === receiptNote.id ? receiptNote : item,
        );
      }

      return [...current, receiptNote];
    });
  }

  async function saveReceiptNoteRow(
    row: ReceiptNoteRow,
    patch: Partial<Pick<ReceiptNoteRow, "amount">> & {
      userName?: string;
      isActive?: boolean;
    } = {},
  ) {
    const payload = {
      month: dashboardMonth,
      category: row.category,
      userName: patch.userName ?? row.user.name,
      amount: patch.amount ?? row.amount,
      source: row.isManual ? "manual" : "summary",
      isActive: patch.isActive ?? true,
    };
    const result = row.id
      ? await requestJson<ReceiptNoteMutationResult>(
          `/api/receipt-notes/${encodeURIComponent(row.id)}`,
          {
            method: "PATCH",
            body: JSON.stringify(payload),
          },
        )
      : await requestJson<ReceiptNoteMutationResult>("/api/receipt-notes", {
          method: "POST",
          body: JSON.stringify(payload),
        });

    applySavedReceiptNote(result.receiptNote);
    setToast(result.message);
    return result.receiptNote;
  }

  async function addReceiptNoteRow() {
    const userName = receiptNoteDraft.userName.trim();
    if (!userName) {
      showError("タイトルを入力してください");
      return;
    }

    const amount = Number(receiptNoteDraft.amount);
    if (
      receiptNoteDraft.amount === "" ||
      !Number.isFinite(amount) ||
      amount <= 0
    ) {
      showError("金額は 1 円以上で入力してください");
      return;
    }

    // 空文字は「表示中の月に追従」を意味するので、未選択なら表示中の月に追加する
    const targetMonth = receiptNoteDraft.month || dashboardMonth;

    setIsMutating(true);

    try {
      const result = await requestJson<ReceiptNoteMutationResult>(
        "/api/receipt-notes",
        {
          method: "POST",
          body: JSON.stringify({
            month: targetMonth,
            category: "other",
            userName,
            amount,
            source: "manual",
          }),
        },
      );

      applySavedReceiptNote(result.receiptNote);
      // 追加した明細は未確認なので未確認タブへ切り替えて可視化する
      setReceiptNoteFilter("unconfirmed");
      setReceiptNoteDraft({ userName: "", amount: "", month: "" });
      setToast(result.message);
      celebrateSave();
      // 別の月へ追加したときは、その月へ表示を切り替えて追加分を見えるようにする
      if (targetMonth !== dashboardMonth) {
        changeDashboardMonth(targetMonth);
      }
    } catch (error) {
      showError(error instanceof Error ? error.message : "受領ノートの保存に失敗しました");
    } finally {
      setIsMutating(false);
    }
  }

  // モーダルからユーザー/タイトル・設定額をまとめて更新する（カテゴリーは変更不可）
  async function updateReceiptNoteRowDetails(
    row: ReceiptNoteRow,
    patch: { userName: string; amount: number },
  ) {
    const userName = patch.userName.trim();
    // その他行はタイトル、それ以外の行はユーザーを必須にする（カテゴリーは変更不可）
    if (row.category === "other") {
      if (!userName) {
        showError("タイトルを入力してください");
        return false;
      }
    } else if (!userName) {
      showError("ユーザーを選択してください");
      return false;
    }

    // 手動追加行は 1 円以上。自動集計行（外食貯金など）は予算超過のマイナスも許容し、
    // 有限な整数であることだけを求める
    if (row.isManual) {
      if (!Number.isFinite(patch.amount) || patch.amount < 1) {
        showError("金額は 1 円以上で入力してください");
        return false;
      }
    } else if (!Number.isInteger(patch.amount)) {
      showError("金額は整数で入力してください");
      return false;
    }

    // 変更のあったフィールドだけを差分にまとめ、全一致なら何もしない
    const nextUserName = userName !== row.user.name ? userName : undefined;
    const nextAmount = patch.amount !== row.amount ? patch.amount : undefined;
    if (nextUserName === undefined && nextAmount === undefined) {
      return true;
    }

    const diff: Partial<Pick<ReceiptNoteRow, "amount">> & {
      userName?: string;
    } = {};
    if (nextUserName !== undefined) {
      diff.userName = nextUserName;
    }
    if (nextAmount !== undefined) {
      diff.amount = nextAmount;
    }

    // 楽観更新: 変更フィールドの override を更新（巻き戻し用に変更前値を保持）
    const previousUserName = receiptNoteUserNames[row.key];
    const previousAmount = receiptNoteAmounts[row.key];
    if (nextUserName !== undefined) {
      setReceiptNoteUserNames((current) => ({
        ...current,
        [row.key]: nextUserName,
      }));
    }
    if (nextAmount !== undefined) {
      setReceiptNoteAmounts((current) => ({
        ...current,
        [row.key]: nextAmount,
      }));
    }
    setIsMutating(true);

    try {
      await saveReceiptNoteRow(row, diff);
      // 自動集計行は保存後に保存済みノートが表現するため、元スロットを抑止して override を破棄する
      if (!row.id) {
        setReceiptNoteDeletedKeys((current) => ({ ...current, [row.key]: true }));
        clearReceiptNoteRowOverrides(row.key);
      }
      celebrateSave();
      return true;
    } catch (error) {
      // 触った override をすべて巻き戻す
      if (nextUserName !== undefined) {
        setReceiptNoteUserNames((current) =>
          restoreRecordKey(current, row.key, previousUserName),
        );
      }
      if (nextAmount !== undefined) {
        setReceiptNoteAmounts((current) =>
          restoreRecordKey(current, row.key, previousAmount),
        );
      }
      showError(error instanceof Error ? error.message : "受領ノートの更新に失敗しました");
      return false;
    } finally {
      setIsMutating(false);
    }
  }

  // 自分の確認 / 確認解除。操作者はサーバー側で認証ユーザーに固定される
  async function updateReceiptNoteConfirm(row: ReceiptNoteRow, confirmed: boolean) {
    if (!currentUser) {
      return;
    }

    const previousOverride = receiptNoteConfirmOverrides[row.key];
    // 楽観更新: true なら今日の日付、false なら確認解除（null）
    setReceiptNoteConfirmOverrides((current) => ({
      ...current,
      [row.key]: confirmed ? todayInputValue() : null,
    }));
    setIsMutating(true);

    try {
      if (row.id) {
        const result = await requestJson<ReceiptNoteMutationResult>(
          `/api/receipt-notes/${encodeURIComponent(row.id)}/confirmation`,
          {
            method: "PUT",
            body: JSON.stringify({ confirmed }),
          },
        );
        applySavedReceiptNote(result.receiptNote);
        setToast(result.message);
        // サーバー値へ委ねるため override を破棄する
        setReceiptNoteConfirmOverrides((current) =>
          omitRecordKey(current, row.key),
        );
      } else {
        // 自動集計行（doc なし）は実体化と同時に自分確認する（confirmed=true のみ発生）
        const result = await requestJson<ReceiptNoteMutationResult>(
          "/api/receipt-notes",
          {
            method: "POST",
            body: JSON.stringify({
              month: dashboardMonth,
              category: row.category,
              userName: row.user.name,
              amount: row.amount,
              source: row.isManual ? "manual" : "summary",
              selfConfirmed: true,
            }),
          },
        );
        applySavedReceiptNote(result.receiptNote);
        setToast(result.message);
        // 保存済みノートが行を表現するため、元スロットを抑止して override を破棄する
        setReceiptNoteDeletedKeys((current) => ({ ...current, [row.key]: true }));
        clearReceiptNoteRowOverrides(row.key);
      }
      celebrateSave();
    } catch (error) {
      setReceiptNoteConfirmOverrides((current) =>
        restoreRecordKey(current, row.key, previousOverride),
      );
      showError(error instanceof Error ? error.message : "受領ノートの更新に失敗しました");
    } finally {
      setIsMutating(false);
    }
  }

  // 自動集計行が保存済みノートへ移った後、元スロットに残る override を全て破棄する
  function clearReceiptNoteRowOverrides(key: string) {
    setReceiptNoteAmounts((current) => omitRecordKey(current, key));
    setReceiptNoteConfirmOverrides((current) => omitRecordKey(current, key));
    setReceiptNoteUserNames((current) => omitRecordKey(current, key));
  }

  async function deleteReceiptNoteRow(row: ReceiptNoteRow) {
    const previousDeleted = receiptNoteDeletedKeys[row.key];
    setReceiptNoteDeletedKeys((current) => ({
      ...current,
      [row.key]: true,
    }));
    setIsMutating(true);

    try {
      if (row.id) {
        const result = await requestJson<ReceiptNoteMutationResult>(
          `/api/receipt-notes/${encodeURIComponent(row.id)}`,
          {
            method: "DELETE",
          },
        );
        applySavedReceiptNote(result.receiptNote);
        setToast(result.message);
        return;
      }

      const receiptNote = await saveReceiptNoteRow(row, { isActive: false });
      applySavedReceiptNote(receiptNote);
    } catch (error) {
      setReceiptNoteDeletedKeys((current) =>
        restoreRecordKey(current, row.key, previousDeleted),
      );
      showError(error instanceof Error ? error.message : "受領ノートの削除に失敗しました");
    } finally {
      setIsMutating(false);
    }
  }

  if (isInitializing) {
    return (
      <main className="chalkboard grid min-h-dvh place-items-center text-foreground">
        <div className="flex flex-col items-center gap-3">
          <YadonSpinner className="size-14" />
          <p className="text-glow text-xl">準備中…</p>
          <p className="text-sm text-muted-foreground">LIFFを確認しています</p>
        </div>
      </main>
    );
  }

  return (
    <main className="chalkboard min-h-dvh px-3 pb-[calc(6.75rem+env(safe-area-inset-bottom))] pt-[env(safe-area-inset-top)] text-foreground">
      <div className="mx-auto flex w-full max-w-md flex-col gap-4">
        <header className="sticky top-0 z-30 -mx-3 border-b bg-background/95 px-3 py-2 backdrop-blur-xl">
          <div className="mx-auto flex w-full max-w-md items-center justify-between gap-2">
            <div className="flex min-w-0 items-center gap-2">
              <div className="grid size-10 shrink-0 place-items-center rounded-md border border-yadon/60 bg-yadon/15 shadow-ledger">
                <YadonMark variant="front" className="size-11" />
              </div>
              <div className="min-w-0">
                <h1 className="truncate text-lg font-black leading-tight tracking-normal">
                  {activeTab === "receiptNote" ? "受領完了ノート" : "家計ぼっと"}
                </h1>
              </div>
            </div>

            <div className="flex shrink-0 items-center gap-2">
              <Button
                type="button"
                variant={activeTab === "receiptNote" ? "secondary" : "outline"}
                size="icon"
                className="size-10"
                aria-label="受領完了ノートを開く"
                onClick={() => setActiveTab("receiptNote")}
              >
                <CheckCircle2 aria-hidden="true" />
              </Button>
              <Button
                type="button"
                variant="outline"
                size="icon"
                className="size-10"
                aria-label="データを更新"
                disabled={isLoadingDashboard}
                onClick={() => void loadDashboard()}
              >
                <ButtonIcon busy={isLoadingDashboard} icon={RefreshCw} />
              </Button>
              <Button
                type="button"
                variant="outline"
                size="icon"
                className="size-10"
                aria-label="LIFFを閉じる"
                onClick={() => closeLiffWindow()}
              >
                <XCircle aria-hidden="true" />
              </Button>
            </div>
          </div>
        </header>

        <section
          aria-live="polite"
          className="chalk-frame bg-card/95 px-4 py-3 text-sm shadow-ledger"
        >
          <div className="flex items-start gap-2">
            <CheckCircle2 className="size-4 text-primary" aria-hidden="true" />
            <div className="min-w-0">
              <p className="break-words font-semibold">{toast}</p>
              <p className="mt-1 text-xs text-muted-foreground">
                {liffSession.message}
              </p>
            </div>
            <YadonMark
              variant="animated"
              className="ml-auto size-10 shrink-0 self-center"
            />
          </div>
        </section>

        <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
          {activeTab === "home" ? (
          <TabsContent value="home">
            <div className="grid gap-4">
              <section className="chalk-frame bg-card p-4 shadow-ledger">
                <div className="flex min-w-0 items-start justify-between gap-3">
                  <div>
                    <p className="text-sm font-semibold text-yadon">
                      今すぐ記録
                    </p>
                    <h2 className="mt-1 text-2xl font-black leading-tight">
                      レシートを撮るだけ
                    </h2>
                  </div>
                  <Badge variant={hasLiveDashboardData ? "default" : "outline"}>
                    {hasLiveDashboardData ? "実データ" : "プレビュー"}
                  </Badge>
                </div>
                <div className="mt-4 grid grid-cols-3 gap-2">
                  <Button
                    type="button"
                    className="h-16 flex-col gap-1 px-2 text-xs active:scale-[0.98] [&_svg]:size-5"
                    onClick={() => {
                      setAddMode("image");
                      cameraInputRef.current?.click();
                    }}
                  >
                    <Camera className="size-5" aria-hidden="true" />
                    撮影
                  </Button>
                  <Button
                    type="button"
                    variant="secondary"
                    className="h-16 flex-col gap-1 px-2 text-xs active:scale-[0.98] [&_svg]:size-5"
                    onClick={() => {
                      setAddMode("manual");
                      setActiveTab("add");
                    }}
                  >
                    <Plus className="size-5" aria-hidden="true" />
                    手入力
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    className="h-16 flex-col gap-1 px-2 text-xs active:scale-[0.98] [&_svg]:size-5"
                    onClick={() => setActiveTab("history")}
                  >
                    <ClipboardList className="size-5" aria-hidden="true" />
                    履歴
                  </Button>
                </div>
                <input
                  ref={cameraInputRef}
                  type="file"
                  accept="image/*"
                  capture="environment"
                  className="sr-only"
                  onChange={(event) => {
                    const file = event.target.files?.[0];
                    event.currentTarget.value = "";
                    if (!file) {
                      return;
                    }
                    selectReceiptFile(file);
                    setActiveTab("add");
                  }}
                />
              </section>

              <section className="relative grid gap-3">
                <LoadingOverlay show={isLoadingDashboard} />
                <div className="flex flex-wrap items-end justify-between gap-2 px-1">
                  <div className="min-w-0">
                    <p className="text-xs font-bold text-yadon">
                      対象月
                    </p>
                    <select
                      aria-label="ホームの対象月"
                      value={dashboardMonth}
                      disabled={isLoadingDashboard}
                      onChange={(event) => changeDashboardMonth(event.target.value)}
                      className="chalk-select mt-1 h-11 min-w-0 max-w-full rounded-md border border-input bg-card px-3 py-1 text-xl font-black tracking-normal shadow-sm"
                    >
                      {homeMonthOptions.map((option) => (
                        <option key={option} value={option}>
                          {formatYearMonthLabel(option)}
                        </option>
                      ))}
                    </select>
                  </div>
                  <Badge variant={hasLiveDashboardData ? "default" : "outline"}>
                    {hasLiveDashboardData ? "実データ" : "プレビュー"}
                  </Badge>
                </div>
                <DiningBalanceCard
                  entries={diningBalance.entries}
                  caption={diningBalance.caption}
                />
                <MetricCard
                  label="買い物合計"
                  value={formatCurrency(totals.shopping)}
                  yadon="back"
                  tone="coin"
                  entries={categorySpendingEntries.shopping}
                />
                <MetricCard
                  label="旅行費用"
                  value={formatCurrency(totals.travel)}
                  yadon="galar"
                  tone="blue"
                  entries={categorySpendingEntries.travel}
                />
              </section>

              <Card>
                <CardHeader className="pb-3">
                  <CardTitle>基本操作</CardTitle>
                  <CardDescription>アプリ表示と主要コマンド</CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="grid grid-cols-2 gap-2">
                    {commandTiles.map((tile) => (
                      <Button
                        key={tile.command ?? tile.reportMode ?? tile.action}
                        type="button"
                        variant="outline"
                        className="h-12 justify-start px-3 text-sm active:scale-[0.98] [&_svg]:size-4"
                        disabled={isSending && Boolean(tile.command)}
                        onClick={() => handleCommandTile(tile)}
                      >
                        <ButtonIcon
                          busy={isSending && Boolean(tile.command)}
                          icon={tile.icon}
                        />
                        <span className="min-w-0 truncate">{tile.label}</span>
                      </Button>
                    ))}
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle>今月のデータ</CardTitle>
                  <CardDescription>
                    Firestore / Google Calendar
                  </CardDescription>
                </CardHeader>
                <CardContent className="relative grid gap-4 lg:grid-cols-[1fr_1.2fr]">
                  <LoadingOverlay show={isLoadingDashboard} />
                  <div className="grid gap-3">
                    <div className="grid min-w-0 gap-2">
                      <Label htmlFor="dashboard-month-label">表示月</Label>
                      <div className="grid grid-cols-[3rem_1fr_3rem] gap-2">
                        <Button
                          type="button"
                          variant="outline"
                          size="icon"
                          aria-label="前月"
                          onClick={() =>
                            setDashboardMonth((current) => shiftYearMonth(current, -1))
                          }
                        >
                          <ChevronLeft aria-hidden="true" />
                        </Button>
                        <div
                          id="dashboard-month-label"
                          className="text-glow flex h-12 min-w-0 items-center justify-center rounded-md border border-input bg-card px-3 text-base font-bold shadow-chalk-inset"
                        >
                          <span className="truncate">
                            {formatYearMonthLabel(dashboardMonth)}
                          </span>
                        </div>
                        <Button
                          type="button"
                          variant="outline"
                          size="icon"
                          aria-label="翌月"
                          onClick={() =>
                            setDashboardMonth((current) => shiftYearMonth(current, 1))
                          }
                        >
                          <ChevronRight aria-hidden="true" />
                        </Button>
                      </div>
                    </div>
                    <div className="rounded-md border bg-background/70 p-4">
                      <p className="text-sm font-semibold text-muted-foreground">
                        月間支出
                      </p>
                      <p className="text-glow mt-1 text-3xl font-black">
                        {formatCurrency(totals.total)}
                      </p>
                      <div className="mt-3 grid gap-2 text-sm">
                        <DataLine label="外食" value={formatCurrency(totals.dining)} />
                        <DataLine label="買い物" value={formatCurrency(totals.shopping)} />
                        <DataLine label="旅行" value={formatCurrency(totals.travel)} />
                      </div>
                    </div>
                  </div>
                  <CalendarEventList events={calendarEvents.slice(0, 6)} />
                </CardContent>
              </Card>
            </div>
          </TabsContent>
          ) : null}

          {activeTab === "add" ? (
          <TabsContent value="add">
            <div className="grid gap-4">
              <div
                role="tablist"
                aria-label="追加方法"
                className="grid grid-cols-2 gap-2 rounded-lg border bg-card/80 p-1 shadow-ledger"
              >
                <button
                  type="button"
                  role="tab"
                  aria-selected={addMode === "image"}
                  className={cn(
                    "flex min-h-12 items-center justify-center gap-2 rounded-md px-3 text-sm font-bold transition-colors",
                    addMode === "image"
                      ? "bg-primary text-primary-foreground shadow-ledger"
                      : "text-muted-foreground",
                  )}
                  onClick={() => setAddMode("image")}
                >
                  <ImagePlus className="size-4" aria-hidden="true" />
                  画像
                </button>
                <button
                  type="button"
                  role="tab"
                  aria-selected={addMode === "manual"}
                  className={cn(
                    "flex min-h-12 items-center justify-center gap-2 rounded-md px-3 text-sm font-bold transition-colors",
                    addMode === "manual"
                      ? "bg-primary text-primary-foreground shadow-ledger"
                      : "text-muted-foreground",
                  )}
                  onClick={() => setAddMode("manual")}
                >
                  <Edit3 className="size-4" aria-hidden="true" />
                  手動
                </button>
              </div>

              {addMode === "image" ? (
                <Card>
                  <CardHeader>
                    <CardTitle>画像で追加</CardTitle>
                    <CardDescription>レシート・支払い画面</CardDescription>
                  </CardHeader>
                  <CardContent className="flex flex-col gap-4">
                    <label
                      htmlFor="receipt-image"
                      className="flex min-h-52 min-w-0 cursor-pointer flex-col items-center justify-center gap-3 overflow-hidden rounded-lg border border-dashed border-primary/50 bg-ledger-mint/45 p-4 text-center transition-colors hover:bg-ledger-mint/60 active:bg-ledger-mint/70"
                    >
                      {receiptImageUrl ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={receiptImageUrl}
                          alt="選択したレシート"
                          className="max-h-56 max-w-full rounded-md object-contain"
                        />
                      ) : (
                        <>
                          <YadonMark className="size-16" />
                          <span className="font-semibold">写真を追加</span>
                        </>
                      )}
                      <span className="text-xs font-semibold text-muted-foreground">
                        写真ライブラリ・カメラ・ファイルから選択
                      </span>
                    </label>
                    <Input
                      id="receipt-image"
                      className="sr-only"
                      type="file"
                      accept="image/*"
                      onChange={(event) => {
                        selectReceiptFile(event.target.files?.[0]);
                        event.currentTarget.value = "";
                      }}
                    />

                    <Button
                      type="button"
                      disabled={isAnalyzingImage || !receiptFile}
                      onClick={() => void submitReceiptImage()}
                    >
                      <ButtonIcon busy={isAnalyzingImage} icon={Camera} />
                      画像登録
                    </Button>
                  </CardContent>
                </Card>
              ) : (
                <ExpenseForm
                  draft={draftExpense}
                  disabled={isMutating}
                  onChange={setDraftExpense}
                  onSubmit={() => void submitExpense()}
                />
              )}
            </div>
          </TabsContent>
          ) : null}

          {activeTab === "history" ? (
          <TabsContent value="history">
            <div className="grid gap-5 lg:grid-cols-[1fr_2fr]">
              <Card>
                <CardHeader>
                  <div className="flex min-w-0 items-start justify-between gap-3">
                    <div className="min-w-0">
                      <CardTitle>履歴取得</CardTitle>
                      <CardDescription>月指定</CardDescription>
                    </div>
                    <YadonMark variant="back" className="size-11 shrink-0" />
                  </div>
                </CardHeader>
                <CardContent className="flex flex-col gap-4">
                  <Field label="対象年月" htmlFor="report-month">
                    <Input
                      id="report-month"
                      value={reportMonth}
                      onChange={(event) => setReportMonth(event.target.value)}
                      inputMode="numeric"
                    />
                  </Field>
                  <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-1">
                    <Button
                      type="button"
                      variant={reportMode === "history" ? "default" : "outline"}
                      disabled={isLoadingDashboard}
                      onClick={() => showReport("history")}
                    >
                      <ButtonIcon
                        busy={isLoadingDashboard && reportMode === "history"}
                        icon={ClipboardList}
                      />
                      履歴
                    </Button>
                    <Button
                      type="button"
                      variant={reportMode === "summary" ? "default" : "outline"}
                      disabled={isLoadingDashboard}
                      onClick={() => showReport("summary")}
                    >
                      <ButtonIcon
                        busy={isLoadingDashboard && reportMode === "summary"}
                        icon={ChartNoAxesCombined}
                      />
                      集計
                    </Button>
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle>{reportMode === "history" ? "更新・削除" : "集計"}</CardTitle>
                  <CardDescription>
                    {reportMode === "history"
                      ? dashboard?.source === "live"
                        ? "Firestore の支出履歴"
                        : "プレビュー支出"
                      : `${formatYearMonthLabel(dashboardMonth)} の支出合計`}
                  </CardDescription>
                </CardHeader>
                <CardContent className="relative">
                  <LoadingOverlay show={isLoadingDashboard} />
                  {reportMode === "history" ? (
                    <Tabs
                      value={expenseCategoryFilter}
                      onValueChange={(value) =>
                        setExpenseCategoryFilter(value as ExpenseCategoryFilter)
                      }
                      className="grid gap-4"
                    >
                      <TabsList
                        aria-label="更新・削除のカテゴリー"
                        className="grid w-full grid-cols-4"
                      >
                        {expenseCategoryFilters.map((filter) => (
                          <TabsTrigger
                            key={filter.value}
                            value={filter.value}
                            className="px-2 text-xs sm:text-sm"
                          >
                            {filter.label}
                          </TabsTrigger>
                        ))}
                      </TabsList>
                      <TabsContent
                        value={expenseCategoryFilter}
                        className="mt-0 grid gap-4"
                      >
                        <div className="grid gap-3 sm:grid-cols-[1fr_1fr_auto] sm:items-end">
                          <Field label="日付で絞り込み" htmlFor="expense-date-filter">
                            <Input
                              id="expense-date-filter"
                              type="date"
                              value={expenseDateFilter}
                              onChange={(event) =>
                                setExpenseDateFilter(event.target.value)
                              }
                            />
                          </Field>
                          <Field label="支払い者で絞り込み" htmlFor="expense-payer-filter">
                            <select
                              id="expense-payer-filter"
                              value={expensePayerFilter}
                              onChange={(event) =>
                                setExpensePayerFilter(event.target.value)
                              }
                              className="chalk-select h-12 w-full min-w-0 max-w-full rounded-md border border-input bg-card px-3 py-2 text-base shadow-sm md:text-sm"
                            >
                              <option value="">全員</option>
                              {expensePayerOptions.map((payer) => (
                                <option key={payer} value={payer}>
                                  {payer}
                                </option>
                              ))}
                            </select>
                          </Field>
                          <Button
                            type="button"
                            variant="outline"
                            className="sm:h-12"
                            disabled={!expenseDateFilter && !expensePayerFilter}
                            onClick={() => {
                              setExpenseDateFilter("");
                              setExpensePayerFilter("");
                            }}
                          >
                            <XCircle aria-hidden="true" />
                            解除
                          </Button>
                        </div>
                        <div className="flex items-center justify-between gap-3">
                          <p className="text-sm font-semibold text-muted-foreground">
                            {filteredExpenses.length}件を表示中
                          </p>
                          <p className="text-sm font-semibold text-muted-foreground">
                            外食残高{" "}
                            <span className="text-glow font-black tabular-nums">
                              {formatCurrency(liveDiningBalance)}
                            </span>
                          </p>
                        </div>
                        <div className="grid gap-3">
                          {filteredExpenses.map((expense) => (
                            <ExpenseRow
                              key={expense.id}
                              expense={expense}
                              disabled={isMutating}
                              onDelete={(item) => void deleteExpense(item)}
                              onUpdate={(before, after) => void updateExpense(before, after)}
                            />
                          ))}
                          {filteredExpenses.length === 0 ? (
                            <EmptyState variant="back">
                              条件に一致する支出はありません
                            </EmptyState>
                          ) : null}
                        </div>
                      </TabsContent>
                    </Tabs>
                  ) : (
                    <ExpenseSummary
                      totals={totals}
                      expenseCount={expenses.length}
                      monthLabel={formatYearMonthLabel(dashboardMonth)}
                    />
                  )}
                </CardContent>
              </Card>
            </div>
          </TabsContent>
          ) : null}

          {activeTab === "plans" ? (
          <TabsContent value="plans">
            <div className="grid gap-5">
              <Card>
                <CardHeader>
                  <div className="flex min-w-0 items-start justify-between gap-3">
                    <div className="min-w-0">
                      <CardTitle>予定登録</CardTitle>
                      <CardDescription>Google カレンダー連携</CardDescription>
                    </div>
                    <YadonMark variant="galar" className="size-11 shrink-0" />
                  </div>
                </CardHeader>
                <CardContent className="grid gap-4">
                  <div className="grid gap-4 sm:grid-cols-2">
                    <Field label="参加者" htmlFor="schedule-participants">
                      <Input
                        id="schedule-participants"
                        placeholder="@自分"
                        value={schedule.participants}
                        onChange={(event) =>
                          setSchedule((current) => ({
                            ...current,
                            participants: event.target.value,
                          }))
                        }
                      />
                    </Field>
                    <Field label="日付" htmlFor="schedule-date">
                      <Input
                        id="schedule-date"
                        type="date"
                        value={schedule.date}
                        onChange={(event) =>
                          setSchedule((current) => ({
                            ...current,
                            date: event.target.value,
                          }))
                        }
                      />
                    </Field>
                    <Field label="開始" htmlFor="schedule-start">
                      <Input
                        id="schedule-start"
                        type="time"
                        value={schedule.startTime}
                        onChange={(event) =>
                          setSchedule((current) => ({
                            ...current,
                            startTime: event.target.value,
                          }))
                        }
                      />
                    </Field>
                    <Field label="終了" htmlFor="schedule-end">
                      <Input
                        id="schedule-end"
                        type="time"
                        value={schedule.endTime}
                        onChange={(event) =>
                          setSchedule((current) => ({
                            ...current,
                            endTime: event.target.value,
                          }))
                        }
                      />
                    </Field>
                  </div>
                  <Field label="内容" htmlFor="schedule-title">
                    <Textarea
                      id="schedule-title"
                      placeholder="内容を明記してください"
                      value={schedule.title}
                      onChange={(event) =>
                        setSchedule((current) => ({
                          ...current,
                          title: event.target.value,
                        }))
                      }
                    />
                  </Field>
                  <Button
                    type="button"
                    disabled={isMutating}
                    onClick={() => void addSchedule()}
                  >
                    <ButtonIcon busy={isMutating} icon={CalendarDays} />
                    予定登録
                  </Button>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle>Calendar</CardTitle>
                  <CardDescription>Google Calendar の予定</CardDescription>
                </CardHeader>
                <CardContent className="relative">
                  <LoadingOverlay show={isLoadingDashboard} />
                  <CalendarEventList
                    events={calendarEvents.slice(0, 5)}
                    disabled={isMutating}
                    onDelete={(event) => void deleteSchedule(event)}
                    onUpdate={(before, after) => void updateSchedule(before, after)}
                  />
                </CardContent>
              </Card>
            </div>
          </TabsContent>
          ) : null}

          {activeTab === "settings" ? (
          <TabsContent value="settings">
            <div className="grid gap-5 lg:grid-cols-2">
              <Card>
                <CardHeader>
                  <div className="flex min-w-0 items-start justify-between gap-3">
                    <div className="min-w-0">
                      <CardTitle>Firestore</CardTitle>
                      <CardDescription>ユーザー・固定費</CardDescription>
                    </div>
                    <YadonMark variant="shiny" className="size-11 shrink-0" />
                  </div>
                </CardHeader>
                <CardContent className="relative grid gap-4">
                  <LoadingOverlay show={isLoadingDashboard} />
                  <div className="grid gap-3">
                    {visibleDashboardUsers.map((user) => (
                      <div
                        key={user.id}
                        className="flex items-center justify-between gap-3 rounded-md border bg-background/70 px-3 py-2"
                      >
                        <span className="truncate font-semibold">
                          {user.displayName}
                        </span>
                        <span className="shrink-0 text-sm text-muted-foreground">
                          {formatCurrency(user.diningBalance)}
                        </span>
                      </div>
                    ))}
                    {visibleDashboardUsers.length === 0 ? (
                      <EmptyState variant="shiny">実データ未取得</EmptyState>
                    ) : null}
                  </div>
                  <div className="rounded-md border bg-background/70 p-3 text-sm">
                    <DataLine
                      label="前半担当"
                      value={dashboard?.settings.firstHalfPayerName ?? "未設定"}
                    />
                    <DataLine
                      label="後半担当"
                      value={dashboard?.settings.secondHalfPayerName ?? "未設定"}
                    />
                    <DataLine
                      label="家賃"
                      value={
                        rent
                          ? `${rent.payerName} / ${formatCurrency(rent.amount)}`
                          : "未登録"
                      }
                    />
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle>予算</CardTitle>
                  <CardDescription>外食費用 / 人 / 月</CardDescription>
                </CardHeader>
                <CardContent className="grid gap-4">
                  <Field label="月額予算" htmlFor="budget">
                    <Input
                      id="budget"
                      type="number"
                      min={0}
                      step={1000}
                      value={budget}
                      onChange={(event) => setBudget(Number(event.target.value))}
                    />
                  </Field>
                  <Button
                    type="button"
                    disabled={isMutating}
                    onClick={() => void updateBudget()}
                  >
                    <ButtonIcon busy={isMutating} icon={WalletCards} />
                    予算変更
                  </Button>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle>担当者</CardTitle>
                  <CardDescription>前半・後半</CardDescription>
                </CardHeader>
                <CardContent className="grid gap-3 sm:grid-cols-2">
                  <Button
                    type="button"
                    onClick={() => setToast("初期設定の状態をアプリ内に表示しています")}
                  >
                    <UserRound aria-hidden="true" />
                    初期設定
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => setToast("設定内容はこの画面内で確認できます")}
                  >
                    <Settings aria-hidden="true" />
                    設定変更
                  </Button>
                  <Button
                    type="button"
                    variant="secondary"
                    onClick={() =>
                      setToast(`外食残高は ${formatCurrency(liveDiningBalance)} です`)
                    }
                  >
                    <WalletCards aria-hidden="true" />
                    残高
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => setToast("アプリ内操作をキャンセルしました")}
                  >
                    <XCircle aria-hidden="true" />
                    キャンセル
                  </Button>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle>サブスク追加</CardTitle>
                  <CardDescription>定期支払い</CardDescription>
                </CardHeader>
                <CardContent className="grid gap-4">
                  <Field label="支払い者" htmlFor="subscription-payer">
                    <Input
                      id="subscription-payer"
                      placeholder="@自分"
                      value={subscriptionDraft.payerName}
                      onChange={(event) =>
                        setSubscriptionDraft((current) => ({
                          ...current,
                          payerName: event.target.value,
                        }))
                      }
                    />
                  </Field>
                  <Field label="サービス名" htmlFor="subscription-service">
                    <Input
                      id="subscription-service"
                      value={subscriptionDraft.serviceName}
                      onChange={(event) =>
                        setSubscriptionDraft((current) => ({
                          ...current,
                          serviceName: event.target.value,
                        }))
                      }
                    />
                  </Field>
                  <div className="grid gap-4 sm:grid-cols-2">
                    <Field label="金額" htmlFor="subscription-amount">
                      <Input
                        id="subscription-amount"
                        type="number"
                        min={1}
                        inputMode="numeric"
                        value={subscriptionDraft.amount}
                        onChange={(event) =>
                          setSubscriptionDraft((current) => ({
                            ...current,
                            amount:
                              event.target.value === "" ? "" : Number(event.target.value),
                          }))
                        }
                      />
                    </Field>
                    <Field label="開始日" htmlFor="subscription-start-date">
                      <Input
                        id="subscription-start-date"
                        type="date"
                        value={subscriptionDraft.startDate}
                        onChange={(event) =>
                          setSubscriptionDraft((current) => ({
                            ...current,
                            startDate: event.target.value,
                          }))
                        }
                      />
                    </Field>
                    <Field label="間隔" htmlFor="subscription-interval">
                      <Input
                        id="subscription-interval"
                        placeholder="毎月"
                        value={subscriptionDraft.intervalLabel}
                        onChange={(event) =>
                          setSubscriptionDraft((current) => ({
                            ...current,
                            intervalLabel: event.target.value,
                          }))
                        }
                      />
                    </Field>
                  </div>
                  <Button
                    type="button"
                    disabled={isMutating}
                    onClick={() => void addSubscription()}
                  >
                    <ButtonIcon busy={isMutating} icon={Plus} />
                    追加
                  </Button>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle>家賃</CardTitle>
                  <CardDescription>月末自動登録</CardDescription>
                </CardHeader>
                <CardContent className="grid gap-4">
                  <Field label="支払い者" htmlFor="rent-payer">
                    <Input
                      id="rent-payer"
                      value={rentDraft.payerName}
                      onChange={(event) =>
                        setRentDraft((current) => ({
                          ...current,
                          payerName: event.target.value,
                        }))
                      }
                    />
                  </Field>
                  <Field label="金額" htmlFor="rent-amount">
                    <Input
                      id="rent-amount"
                      type="number"
                      min={0}
                      value={rentDraft.amount}
                      onChange={(event) =>
                        setRentDraft((current) => ({
                          ...current,
                          amount: Number(event.target.value),
                        }))
                      }
                    />
                  </Field>
                  <div className="grid gap-3 sm:grid-cols-2">
                    <Button type="button" disabled={isMutating} onClick={() => void updateRent()}>
                      <ButtonIcon busy={isMutating} icon={JapaneseYen} />
                      更新
                    </Button>
                    <Button
                      type="button"
                      variant="destructive"
                      disabled={isMutating}
                      onClick={() => void clearRent()}
                    >
                      <ButtonIcon busy={isMutating} icon={Trash2} />
                      削除
                    </Button>
                  </div>
                </CardContent>
              </Card>

              <Card className="lg:col-span-2">
                <CardHeader>
                  <CardTitle>サブスク</CardTitle>
                  <CardDescription>Firestore の定期支払い</CardDescription>
                </CardHeader>
                <CardContent className="relative grid gap-3 sm:grid-cols-2">
                  <LoadingOverlay show={isLoadingDashboard} />
                  {subscriptions.map((subscription) => (
                    <SubscriptionRow
                      key={subscription.id}
                      disabled={isMutating}
                      onDelete={(item) => void deleteSubscription(item)}
                      onUpdate={(before, after) => void updateSubscription(before, after)}
                      subscription={subscription}
                    />
                  ))}
                  {subscriptions.length === 0 ? (
                    <EmptyState variant="galar">
                      サブスクは未取得または未登録です
                    </EmptyState>
                  ) : null}
                </CardContent>
              </Card>
            </div>
          </TabsContent>
          ) : null}

          {activeTab === "receiptNote" ? (
          <TabsContent value="receiptNote">
            <ReceiptNotePage
              filter={receiptNoteFilter}
              summaries={receiptNoteSummaries}
              users={receiptNoteUsers}
              currentUser={currentUser}
              groupUsers={receiptNoteGroupUsers}
              month={dashboardMonth}
              isLoading={isLoadingDashboard}
              draft={receiptNoteDraft}
              disabled={isMutating}
              onMonthChange={changeDashboardMonth}
              onFilterChange={setReceiptNoteFilter}
              onDraftChange={setReceiptNoteDraft}
              onAddRow={addReceiptNoteRow}
              onConfirmChange={updateReceiptNoteConfirm}
              onUpdateRow={updateReceiptNoteRowDetails}
              onDeleteRow={deleteReceiptNoteRow}
            />
          </TabsContent>
          ) : null}

          <TabsList
            aria-label="主要ナビゲーション"
            className="fixed inset-x-0 bottom-0 z-40 mx-auto grid w-full max-w-md grid-cols-5 gap-1 rounded-none border-t bg-card/95 px-3 pb-[calc(0.75rem+env(safe-area-inset-bottom))] pt-2 shadow-[0_-14px_36px_rgba(0,0,0,0.45)] backdrop-blur-xl"
          >
            {navigationItems.map((item) => (
              <TabsTrigger
                key={item.value}
                value={item.value}
                className="min-h-14 min-w-0 flex-col gap-1 rounded-md border border-transparent px-1 py-2 text-[0.68rem] leading-none transition-[background-color,border-color,box-shadow,color,transform] active:scale-[0.98] data-[state=active]:border-primary/45 data-[state=active]:bg-primary/10 data-[state=active]:text-primary data-[state=active]:shadow-none data-[state=active]:[text-shadow:0_0_8px_rgba(242,217,140,0.45)] data-[state=active]:[&_svg]:scale-110 data-[state=active]:[&_svg]:drop-shadow-[0_0_4px_rgba(242,217,140,0.5)] [&_svg]:size-5 [&_svg]:transition-[filter,transform]"
              >
                <item.icon className="mr-0 size-5" aria-hidden="true" />
                <span className="w-full min-w-0 truncate text-center">{item.label}</span>
              </TabsTrigger>
            ))}
          </TabsList>
        </Tabs>

        {showSaveToast ? (
          <div
            role="status"
            aria-live="polite"
            className="fixed inset-x-0 bottom-[calc(6.5rem+env(safe-area-inset-bottom))] z-50 flex justify-center px-4"
          >
            <div className="chalk-frame flex items-center gap-3 bg-card/95 px-4 py-2 shadow-ledger">
              <YadonMark variant="save" className="size-16" />
              <p className="text-glow font-bold">保存が完了したよ！</p>
            </div>
          </div>
        ) : null}

        {errorToast ? (
          <div
            role="alert"
            className="fixed inset-x-0 bottom-[calc(6.5rem+env(safe-area-inset-bottom))] z-50 flex justify-center px-4"
          >
            <div className="flex min-w-0 items-center gap-3 rounded-lg border-2 border-destructive/70 bg-card/95 px-4 py-3 shadow-ledger">
              <XCircle className="size-6 shrink-0 text-destructive" aria-hidden="true" />
              <p className="min-w-0 break-words font-bold text-destructive">
                {errorToast}
              </p>
            </div>
          </div>
        ) : null}
      </div>
    </main>
  );
}

// マスコット（ヤドン）のドット絵画像（場所ごとにバリエーションを使い分ける）
const yadonImages = {
  save: "/yadon-save.gif",
  front: "/yadon-front.png",
  back: "/yadon-back.png",
  shiny: "/yadon-shiny.png",
  galar: "/yadon-galar.png",
  animated: "/yadon-animated.gif",
} as const;

type YadonVariant = keyof typeof yadonImages;

function YadonMark({
  variant = "save",
  className,
}: {
  variant?: YadonVariant;
  className?: string;
}) {
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={yadonImages[variant]}
      alt=""
      aria-hidden="true"
      className={cn(
        "select-none object-contain [image-rendering:pixelated]",
        className,
      )}
    />
  );
}

// ヤドン付きの空状態表示
function EmptyState({
  variant,
  children,
}: {
  variant?: YadonVariant;
  children: React.ReactNode;
}) {
  return (
    <div className="flex items-center gap-3 rounded-md border bg-background/70 p-4 text-sm text-muted-foreground">
      <YadonMark variant={variant} className="size-11 shrink-0 opacity-80" />
      <span className="min-w-0">{children}</span>
    </div>
  );
}

function ButtonIcon({
  busy,
  icon: Icon,
}: {
  busy?: boolean;
  icon: React.ElementType;
}) {
  return busy ? (
    <YadonSpinner className="size-5" />
  ) : (
    <Icon aria-hidden="true" />
  );
}

function DataLine({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <span className="shrink-0 text-muted-foreground">{label}</span>
      <span className="min-w-0 truncate font-semibold">{value}</span>
    </div>
  );
}

function ReceiptNotePage({
  filter,
  summaries,
  users,
  currentUser,
  groupUsers,
  month,
  isLoading,
  draft,
  disabled,
  onMonthChange,
  onFilterChange,
  onDraftChange,
  onAddRow,
  onConfirmChange,
  onUpdateRow,
  onDeleteRow,
}: {
  filter: ReceiptNoteFilter;
  summaries: ReceiptNoteCategorySummary[];
  users: ReceiptNoteUser[];
  currentUser: DashboardData["currentUser"];
  groupUsers: ReceiptNoteGroupUser[];
  month: string;
  isLoading: boolean;
  draft: ReceiptNoteDraft;
  disabled: boolean;
  onMonthChange: (value: string) => void;
  onFilterChange: (value: ReceiptNoteFilter) => void;
  onDraftChange: React.Dispatch<React.SetStateAction<ReceiptNoteDraft>>;
  onAddRow: () => void;
  onConfirmChange: (row: ReceiptNoteRow, confirmed: boolean) => void;
  onUpdateRow: (
    row: ReceiptNoteRow,
    patch: { userName: string; amount: number },
  ) => Promise<boolean>;
  onDeleteRow: (row: ReceiptNoteRow) => void;
}) {
  const monthOptions = React.useMemo(
    () => buildReceiptNoteMonthOptions(month),
    [month],
  );
  const groupUserIds = groupUsers.map((user) => user.id);
  const selfConfirmedOf = (row: ReceiptNoteRow) =>
    currentUser != null && row.confirmations[currentUser.id] != null;
  const bothConfirmedOf = (row: ReceiptNoteRow) =>
    groupUserIds.length > 0 &&
    groupUserIds.every((id) => row.confirmations[id] != null);

  const allRows = summaries.flatMap((summary) => summary.rows);
  const rowCount = allRows.length;
  const totalAmount = summaries.reduce((sum, summary) => sum + summary.total, 0);
  const selfConfirmedCount = allRows.filter(selfConfirmedOf).length;
  const bothConfirmedCount = allRows.filter(bothConfirmedOf).length;
  const selfProgress =
    rowCount > 0 ? Math.round((selfConfirmedCount / rowCount) * 100) : 0;
  const unconfirmedCount = rowCount - selfConfirmedCount;

  // タブ絞り込み後の行と、絞り込み前の全行を基準にしたカテゴリー統計
  const categoryCards = summaries
    .map((summary) => {
      const tabRows = summary.rows.filter((row) =>
        filter === "confirmed" ? selfConfirmedOf(row) : !selfConfirmedOf(row),
      );
      const categoryBothConfirmed = summary.rows.filter(bothConfirmedOf).length;
      return {
        summary,
        tabRows,
        bothConfirmedCount: categoryBothConfirmed,
        rowCount: summary.rows.length,
        fullyConfirmed:
          summary.rows.length > 0 &&
          categoryBothConfirmed === summary.rows.length,
      };
    })
    .filter((card) => card.tabRows.length > 0);

  return (
    <div className="relative grid gap-4">
      <LoadingOverlay show={isLoading} />
      <section className="chalk-frame bg-card p-4 shadow-ledger">
        <div className="min-w-0">
          <p className="text-sm font-semibold text-yadon">対象月</p>
          <select
            aria-label="受領ノートの対象月"
            value={month}
            disabled={disabled || isLoading}
            onChange={(event) => onMonthChange(event.target.value)}
            className="chalk-select mt-2 h-12 w-full min-w-0 max-w-full rounded-md border border-input bg-card px-3 py-2 text-xl font-black shadow-sm"
          >
            {monthOptions.map((option) => (
              <option key={option} value={option}>
                {formatYearMonthLabel(option)}
              </option>
            ))}
          </select>
        </div>
        <div className="mt-4 grid grid-cols-3 gap-2">
          <div className="min-w-0 rounded-md border bg-background/70 p-3">
            <p className="text-xs font-bold text-muted-foreground">合計額</p>
            <p className="mt-1 truncate text-lg font-black">
              {formatCurrency(totalAmount)}
            </p>
          </div>
          <div className="min-w-0 rounded-md border bg-background/70 p-3">
            <p className="text-xs font-bold text-muted-foreground">自分の確認</p>
            <p className="mt-1 truncate text-lg font-black tabular-nums">
              {selfConfirmedCount}/{rowCount}
            </p>
          </div>
          <div className="min-w-0 rounded-md border bg-background/70 p-3">
            <p className="text-xs font-bold text-muted-foreground">ふたり完了</p>
            <p className="mt-1 truncate text-lg font-black tabular-nums">
              {bothConfirmedCount}/{rowCount}
            </p>
          </div>
        </div>
        <div className="mt-4">
          <div className="flex items-center justify-between text-xs font-bold text-muted-foreground">
            <span>自分の確認</span>
            <span className="tabular-nums text-foreground">{selfProgress}%</span>
          </div>
          <div
            role="progressbar"
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={selfProgress}
            aria-label="自分の確認の進捗"
            className="mt-1.5 h-2.5 w-full overflow-hidden rounded-full border bg-background/70"
          >
            <div
              className="h-full bg-primary/70 transition-[width]"
              style={{ width: `${selfProgress}%` }}
            />
          </div>
        </div>
      </section>

      <Card>
        <CardHeader>
          <CardTitle>明細を追加</CardTitle>
          <CardDescription>対象月・タイトル・金額（カテゴリーは「その他」）</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4">
          <div className="grid gap-4 sm:grid-cols-3">
            <Field label="対象月" htmlFor="receipt-note-add-month">
              <select
                id="receipt-note-add-month"
                value={draft.month || month}
                disabled={disabled}
                onChange={(event) =>
                  onDraftChange((current) => ({
                    ...current,
                    month: event.target.value,
                  }))
                }
                className="chalk-select h-12 w-full min-w-0 max-w-full rounded-md border border-input bg-card px-3 py-2 text-base shadow-sm md:text-sm"
              >
                {monthOptions.map((option) => (
                  <option key={option} value={option}>
                    {formatYearMonthLabel(option)}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="タイトル" htmlFor="receipt-note-add-title">
              <Input
                id="receipt-note-add-title"
                value={draft.userName}
                placeholder="例: 立て替え分"
                disabled={disabled}
                onChange={(event) =>
                  onDraftChange((current) => ({
                    ...current,
                    userName: event.target.value,
                  }))
                }
              />
            </Field>
            <Field label="金額" htmlFor="receipt-note-add-amount">
              <Input
                id="receipt-note-add-amount"
                type="number"
                min={1}
                inputMode="numeric"
                placeholder="1000"
                value={draft.amount}
                disabled={disabled}
                onChange={(event) =>
                  onDraftChange((current) => ({
                    ...current,
                    amount:
                      event.target.value === ""
                        ? ""
                        : Number(event.target.value),
                  }))
                }
              />
            </Field>
          </div>
          <Button type="button" disabled={disabled} onClick={onAddRow}>
            <ButtonIcon busy={disabled} icon={Plus} />
            追加
          </Button>
        </CardContent>
      </Card>

      <Tabs
        value={filter}
        onValueChange={(value) => onFilterChange(value as ReceiptNoteFilter)}
        className="grid gap-4"
      >
        <TabsList aria-label="受領完了ノートの確認状況" className="grid w-full grid-cols-2">
          <TabsTrigger value="unconfirmed" className="gap-2">
            未確認
            <Badge variant="outline">{unconfirmedCount}</Badge>
          </TabsTrigger>
          <TabsTrigger value="confirmed" className="gap-2">
            確認済み
            <Badge variant="outline">{selfConfirmedCount}</Badge>
          </TabsTrigger>
        </TabsList>
        <TabsContent value={filter} className="mt-0 grid gap-4">
          {categoryCards.length > 0 ? (
            categoryCards.map((card) => (
              <ReceiptNoteCategoryCard
                key={card.summary.value}
                summaryValue={card.summary.value}
                label={card.summary.label}
                description={card.summary.description}
                total={card.summary.total}
                rows={card.tabRows}
                bothConfirmedCount={card.bothConfirmedCount}
                rowCount={card.rowCount}
                fullyConfirmed={card.fullyConfirmed}
                users={users}
                currentUser={currentUser}
                groupUsers={groupUsers}
                disabled={disabled}
                onConfirmChange={onConfirmChange}
                onUpdateRow={onUpdateRow}
                onDeleteRow={onDeleteRow}
              />
            ))
          ) : filter === "unconfirmed" ? (
            rowCount > 0 ? (
              <div className="chalk-frame flex flex-col items-center gap-3 bg-card p-6 text-center shadow-ledger">
                <YadonMark variant="save" className="size-24" />
                <p className="text-glow text-lg font-black">今月の確認はすべて完了！</p>
                <p className="text-sm text-muted-foreground">
                  未確認の明細はありません
                </p>
              </div>
            ) : (
              <EmptyState variant="front">今月の受領ノートはまだありません</EmptyState>
            )
          ) : (
            <EmptyState variant="front">まだ確認した明細がありません</EmptyState>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}

function ReceiptNoteUserSelect({
  id,
  name,
  users,
  value,
  disabled = false,
  onChange,
}: {
  id: string;
  name?: string;
  users: ReceiptNoteUser[];
  value: string;
  disabled?: boolean;
  onChange: (value: string) => void;
}) {
  return (
    <select
      id={id}
      name={name}
      value={value}
      disabled={disabled}
      onChange={(event) => onChange(event.target.value)}
      className="chalk-select h-12 w-full min-w-0 max-w-full rounded-md border border-input bg-card px-3 py-2 text-base shadow-sm md:text-sm"
    >
      <option value="" disabled>
        選択してください
      </option>
      {users.map((user) => (
        <option key={user.id} value={user.name}>
          {user.name}
        </option>
      ))}
    </select>
  );
}

function ReceiptNoteCategoryCard({
  summaryValue,
  label,
  description,
  total,
  rows,
  bothConfirmedCount,
  rowCount,
  fullyConfirmed,
  users,
  currentUser,
  groupUsers,
  disabled,
  onConfirmChange,
  onUpdateRow,
  onDeleteRow,
}: {
  summaryValue: ReceiptNoteCategory;
  label: string;
  description: string;
  total: number;
  rows: ReceiptNoteRow[];
  bothConfirmedCount: number;
  rowCount: number;
  fullyConfirmed: boolean;
  users: ReceiptNoteUser[];
  currentUser: DashboardData["currentUser"];
  groupUsers: ReceiptNoteGroupUser[];
  disabled: boolean;
  onConfirmChange: (row: ReceiptNoteRow, confirmed: boolean) => void;
  onUpdateRow: (
    row: ReceiptNoteRow,
    patch: { userName: string; amount: number },
  ) => Promise<boolean>;
  onDeleteRow: (row: ReceiptNoteRow) => void;
}) {
  return (
    <Card>
      <CardHeader>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <CardTitle>{label}</CardTitle>
            <CardDescription>{description}</CardDescription>
          </div>
          <div className="flex shrink-0 flex-wrap items-center justify-end gap-2">
            <Badge variant="outline">{formatCurrency(total)}</Badge>
            <Badge variant={fullyConfirmed ? "default" : "outline"}>
              {bothConfirmedCount}/{rowCount} 完了
            </Badge>
            {fullyConfirmed ? (
              <Badge variant="outline" className="border-yadon text-yadon">
                確認完了
              </Badge>
            ) : null}
          </div>
        </div>
      </CardHeader>
      <CardContent className="grid gap-4">
        <fieldset className="grid gap-3">
          <legend className="sr-only">{label}の受領明細</legend>
          {rows.map((row, index) => (
            <ReceiptNoteRowItem
              key={row.key}
              row={row}
              summaryValue={summaryValue}
              index={index}
              users={users}
              currentUser={currentUser}
              groupUsers={groupUsers}
              disabled={disabled}
              onConfirmChange={onConfirmChange}
              onUpdateRow={onUpdateRow}
              onDeleteRow={onDeleteRow}
            />
          ))}
        </fieldset>
      </CardContent>
    </Card>
  );
}

function ReceiptNoteRowItem({
  row,
  summaryValue,
  index,
  users,
  currentUser,
  groupUsers,
  disabled,
  onConfirmChange,
  onUpdateRow,
  onDeleteRow,
}: {
  row: ReceiptNoteRow;
  summaryValue: ReceiptNoteCategory;
  index: number;
  users: ReceiptNoteUser[];
  currentUser: DashboardData["currentUser"];
  groupUsers: ReceiptNoteGroupUser[];
  disabled: boolean;
  onConfirmChange: (row: ReceiptNoteRow, confirmed: boolean) => void;
  onUpdateRow: (
    row: ReceiptNoteRow,
    patch: { userName: string; amount: number },
  ) => Promise<boolean>;
  onDeleteRow: (row: ReceiptNoteRow) => void;
}) {
  const [editOpen, setEditOpen] = React.useState(false);
  const [confirmOpen, setConfirmOpen] = React.useState(false);
  const [draft, setDraft] = React.useState<{
    userName: string;
    amount: number | "";
  }>({ userName: row.user.name, amount: row.amount });

  // 行の内容が変わったら編集ドラフトを同期する
  React.useEffect(() => {
    setDraft({
      userName: row.user.name,
      amount: row.amount,
    });
  }, [row.user.name, row.amount]);

  const selfConfirmed =
    currentUser != null && row.confirmations[currentUser.id] != null;
  const bothConfirmed =
    groupUsers.length > 0 &&
    groupUsers.every((user) => row.confirmations[user.id] != null);
  const isDiningSaving = row.category === "diningSaving";
  // カテゴリーは作成後変更不可なので、編集モーダルでは表示のみに使う
  const categoryLabel =
    receiptNoteCategories.find((category) => category.value === row.category)
      ?.label ?? row.category;
  // 外食貯金の自動行・自動由来の保存行は削除しても自動行が復活するため削除ボタンを隠す
  const canDelete = !(isDiningSaving && !row.isManual);
  const isSettlement =
    row.category === "shoppingSettlement" || row.category === "travelSettlement";
  // 精算行の返金先（2 人グループの相手側）。手動追加行には表示しない
  const settlementRefundTo =
    isSettlement && !row.isManual && groupUsers.length === 2
      ? groupUsers.find((user) => user.displayName !== row.user.name)
      : undefined;
  // 確認モーダルの本文はカテゴリー別に文面を変える
  const confirmMessage = isDiningSaving
    ? row.amount > 0
      ? `外食費用を ${formatCurrency(row.amount)} 貯金しましたか？`
      : row.amount < 0
        ? `予算超過分 ${formatCurrency(Math.abs(row.amount))} を ${row.user.name} が負担することを確認しましたか？`
        : "外食貯金が 0 円であることを確認しましたか？"
    : settlementRefundTo
      ? `${row.user.name} から ${settlementRefundTo.displayName} に ${formatCurrency(row.amount)} 返金しましたか？`
      : `${row.user.name}（${formatCurrency(row.amount)}）を確認済みにしますか？`;

  return (
    <div
      className={cn(
        "grid gap-3 rounded-md border p-3 transition-colors",
        bothConfirmed ? "border-primary/60 bg-primary/15" : "bg-background/70",
      )}
    >
      {/* サマリー行 */}
      <div className="flex min-w-0 items-center gap-3">
        <input
          type="checkbox"
          className="chalk-checkbox size-5 shrink-0"
          checked={selfConfirmed}
          disabled={disabled || !currentUser}
          aria-label={`${row.user.name}を自分が確認済みにする`}
          onChange={(event) => {
            // 確認を付けるときはモーダルで確認を取り、解除は即時反映する
            if (event.target.checked) {
              setConfirmOpen(true);
            } else {
              onConfirmChange(row, false);
            }
          }}
        />
        <span className="min-w-0 flex-1 break-words font-semibold">
          {row.user.name}
        </span>
        <span
          className={cn(
            "shrink-0 font-bold tabular-nums",
            isDiningSaving && row.amount < 0 ? "text-destructive" : undefined,
          )}
        >
          {formatCurrency(row.amount)}
        </span>
        <Dialog
          open={editOpen}
          onOpenChange={(open) => {
            setEditOpen(open);
            // 開くたびに行の現在値からドラフトを作り直す（前回の編集途中の値を残さない）
            if (open) {
              setDraft({
                userName: row.user.name,
                amount: row.amount,
              });
            }
          }}
        >
          <DialogTrigger asChild>
            <Button
              type="button"
              variant="outline"
              size="icon"
              className="shrink-0"
              aria-label={`${row.user.name}の明細を編集`}
            >
              <Edit3 aria-hidden="true" />
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>明細を編集</DialogTitle>
              <DialogDescription>
                {categoryLabel}・{row.user.name}
              </DialogDescription>
            </DialogHeader>
            <div className="grid gap-4">
              {row.category === "other" ? (
                <Field
                  label="タイトル"
                  htmlFor={`${summaryValue}-${index}-receipt-title`}
                >
                  <Input
                    id={`${summaryValue}-${index}-receipt-title`}
                    value={draft.userName}
                    disabled={disabled}
                    onChange={(event) =>
                      setDraft((current) => ({
                        ...current,
                        userName: event.target.value,
                      }))
                    }
                  />
                </Field>
              ) : (
                <Field
                  label="ユーザー"
                  htmlFor={`${summaryValue}-${index}-receipt-user`}
                >
                  <ReceiptNoteUserSelect
                    id={`${summaryValue}-${index}-receipt-user`}
                    users={users}
                    value={draft.userName}
                    disabled={disabled}
                    onChange={(userName) =>
                      setDraft((current) => ({ ...current, userName }))
                    }
                  />
                </Field>
              )}
              <Field
                label="設定額"
                htmlFor={`${summaryValue}-${index}-receipt-amount`}
              >
                <Input
                  id={`${summaryValue}-${index}-receipt-amount`}
                  type="number"
                  min={row.isManual ? 1 : undefined}
                  inputMode="numeric"
                  value={draft.amount}
                  disabled={disabled}
                  onChange={(event) =>
                    setDraft((current) => ({
                      ...current,
                      amount:
                        event.target.value === ""
                          ? ""
                          : Number(event.target.value),
                    }))
                  }
                />
              </Field>
            </div>
            <DialogFooter>
              {canDelete ? (
                <DialogClose asChild>
                  <Button
                    type="button"
                    variant="destructive"
                    disabled={disabled}
                    onClick={() => onDeleteRow(row)}
                  >
                    <ButtonIcon busy={disabled} icon={Trash2} />
                    削除
                  </Button>
                </DialogClose>
              ) : null}
              <Button
                type="button"
                disabled={disabled}
                onClick={() =>
                  // バリデーションや保存に失敗したときは閉じずに入力を保持する
                  void onUpdateRow(row, {
                    userName: draft.userName,
                    amount: Number(draft.amount),
                  }).then((saved) => {
                    if (saved) {
                      setEditOpen(false);
                    }
                  })
                }
              >
                <ButtonIcon busy={disabled} icon={Send} />
                更新
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
      {/* 確認状態（グループ各メンバーの確認状況を常時表示） */}
      {groupUsers.length > 0 ? (
        <div className="flex flex-wrap items-center gap-1.5 pl-8">
          {groupUsers.map((user) => {
            const confirmedAt = row.confirmations[user.id];
            const label = currentUser?.id === user.id ? "自分" : user.displayName;
            if (confirmedAt == null) {
              return (
                <span
                  key={user.id}
                  className="inline-flex items-center rounded-full border px-2 py-0.5 text-xs text-muted-foreground"
                >
                  {label} 未確認
                </span>
              );
            }
            return (
              <span
                key={user.id}
                className="inline-flex items-center gap-1 rounded-full border border-primary/45 bg-primary/10 px-2 py-0.5 text-xs font-semibold text-primary"
              >
                ✓ {label}
                {confirmedAt !== "legacy"
                  ? ` ${formatConfirmationDate(confirmedAt)}`
                  : ""}
              </span>
            );
          })}
        </div>
      ) : null}
      {/* 外食貯金の予算超過・使い切り、精算の返金先を注記で補足する */}
      {isDiningSaving && row.amount < 0 ? (
        <p className="pl-8 text-xs font-semibold text-destructive">
          予算超過分 {formatCurrency(Math.abs(row.amount))} は {row.user.name} が負担
        </p>
      ) : isDiningSaving && row.amount === 0 ? (
        <p className="pl-8 text-xs text-muted-foreground">
          外食予算を使い切ったため今月の貯金はありません
        </p>
      ) : settlementRefundTo ? (
        <p className="pl-8 text-xs font-semibold">
          {row.user.name} が {settlementRefundTo.displayName} に{" "}
          {formatCurrency(row.amount)} を返金
        </p>
      ) : null}
      {/* チェックを付けるときはこのモーダルで確認を取ってから記録する */}
      <Dialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>受領確認</DialogTitle>
            <DialogDescription>{confirmMessage}</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <DialogClose asChild>
              <Button type="button" variant="outline">
                キャンセル
              </Button>
            </DialogClose>
            <Button
              type="button"
              disabled={disabled}
              onClick={() => {
                onConfirmChange(row, true);
                setConfirmOpen(false);
              }}
            >
              <ButtonIcon busy={disabled} icon={CheckCircle2} />
              確認する
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function CalendarEventList({
  events,
  disabled = false,
  onDelete,
  onUpdate,
}: {
  events: AppCalendarEvent[];
  disabled?: boolean;
  onDelete?: (event: AppCalendarEvent) => void;
  onUpdate?: (before: AppCalendarEvent, after: AppCalendarEvent) => void;
}) {
  if (events.length === 0) {
    return (
      <EmptyState variant="animated">
        Calendar イベントは未取得または未登録です
      </EmptyState>
    );
  }

  return (
    <div className="grid gap-3">
      {events.map((event) => (
        <CalendarEventItem
          key={event.id}
          event={event}
          disabled={disabled}
          onDelete={onDelete}
          onUpdate={onUpdate}
        />
      ))}
    </div>
  );
}

function CalendarEventItem({
  event,
  disabled,
  onDelete,
  onUpdate,
}: {
  event: AppCalendarEvent;
  disabled: boolean;
  onDelete?: (event: AppCalendarEvent) => void;
  onUpdate?: (before: AppCalendarEvent, after: AppCalendarEvent) => void;
}) {
  const [draft, setDraft] = React.useState<AppCalendarEvent>(event);
  const canEdit =
    event.type === "schedule" &&
    Boolean(onDelete && onUpdate) &&
    isManagedScheduleEvent(event);

  React.useEffect(() => {
    setDraft(event);
  }, [event]);

  return (
    <article className="grid gap-3 rounded-md border bg-background/70 p-3">
      <div className="flex min-w-0 items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="line-clamp-2 break-words font-bold">{event.title}</h3>
          <p className="mt-1 flex items-center gap-2 text-sm text-muted-foreground">
            <Clock3 className="size-4" aria-hidden="true" />
            {event.date} / {event.timeLabel}
          </p>
        </div>
        <Badge
          variant={
            event.type === "expense"
              ? "default"
              : event.type === "rent"
                ? "secondary"
                : "outline"
          }
        >
          {event.type === "expense"
            ? "支出"
            : event.type === "schedule"
              ? "予定"
              : event.type === "rent"
                ? "家賃"
                : "その他"}
        </Badge>
      </div>
      {canEdit ? (
        <div className="flex gap-2">
          <Dialog>
            <DialogTrigger asChild>
              <Button type="button" variant="outline" size="icon" aria-label="予定を更新">
                <Edit3 aria-hidden="true" />
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>予定を更新</DialogTitle>
                <DialogDescription>Google Calendar の予定内容を更新します</DialogDescription>
              </DialogHeader>
              <div className="grid gap-4">
                <Field label="内容" htmlFor={`${event.id}-event-title`}>
                  <Input
                    id={`${event.id}-event-title`}
                    value={draft.title}
                    onChange={(changeEvent) =>
                      setDraft((current) => ({
                        ...current,
                        title: changeEvent.target.value,
                      }))
                    }
                  />
                </Field>
                <Field label="日付" htmlFor={`${event.id}-event-date`}>
                  <Input
                    id={`${event.id}-event-date`}
                    type="date"
                    value={draft.date}
                    onChange={(changeEvent) =>
                      setDraft((current) => ({
                        ...current,
                        date: changeEvent.target.value,
                      }))
                    }
                  />
                </Field>
                <Field label="時間表示" htmlFor={`${event.id}-event-time`}>
                  <Input
                    id={`${event.id}-event-time`}
                    value={draft.timeLabel}
                    onChange={(changeEvent) =>
                      setDraft((current) => ({
                        ...current,
                        timeLabel: changeEvent.target.value,
                      }))
                    }
                  />
                </Field>
              </div>
              <DialogFooter>
                <DialogClose asChild>
                  <Button type="button" variant="outline">
                    戻る
                  </Button>
                </DialogClose>
                <DialogClose asChild>
                  <Button
                    type="button"
                    disabled={disabled}
                    onClick={() => onUpdate?.(event, draft)}
                  >
                    <ButtonIcon busy={disabled} icon={Send} />
                    更新
                  </Button>
                </DialogClose>
              </DialogFooter>
            </DialogContent>
          </Dialog>
          <Button
            type="button"
            variant="destructive"
            size="icon"
            aria-label="予定を削除"
            disabled={disabled}
            onClick={() => onDelete?.(event)}
          >
            <ButtonIcon busy={disabled} icon={Trash2} />
          </Button>
        </div>
      ) : null}
    </article>
  );
}

function isManagedScheduleEvent(event: AppCalendarEvent) {
  const description = event.description ?? "";
  const hasManagedSource =
    description.includes("登録元: LIFF家計ぼっと") ||
    description.includes("登録元: LINE家計簿Bot");

  return (
    (hasManagedSource && description.includes("予定:")) ||
    event.title.startsWith("[予定]")
  );
}

function MetricCard({
  label,
  value,
  yadon,
  tone,
  entries,
}: {
  label: string;
  value: string;
  yadon: YadonVariant;
  tone: "green" | "coin" | "blue";
  entries?: { displayName: string; amount: number }[];
}) {
  return (
    <Card>
      <CardContent className="grid gap-4 p-5">
        <div className="flex items-center gap-4">
          <div
            className={cn(
              "grid size-12 shrink-0 place-items-center rounded-md",
              tone === "green" && "bg-ledger-mint text-primary",
              tone === "coin" && "bg-secondary text-ledger-coin",
              tone === "blue" && "bg-accent/10 text-accent",
            )}
          >
            <YadonMark variant={yadon} className="size-11" />
          </div>
          <div className="min-w-0">
            <p className="text-sm font-semibold text-muted-foreground">{label}</p>
            <p className="text-glow truncate text-2xl font-black tracking-normal">{value}</p>
          </div>
        </div>
        {entries?.length ? (
          <div className="grid gap-2">
            {entries.map((entry) => (
              <div
                key={entry.displayName}
                className="flex min-w-0 items-center justify-between gap-3 rounded-md border bg-background/70 px-3 py-2"
              >
                <div className="flex min-w-0 items-center gap-2">
                  <UserRound className="size-4 shrink-0 text-primary" aria-hidden="true" />
                  <span className="min-w-0 truncate font-semibold">{entry.displayName}</span>
                </div>
                <span className="text-glow shrink-0 font-black tabular-nums">
                  {formatCurrency(entry.amount)}
                </span>
              </div>
            ))}
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}

function DiningBalanceCard({
  entries,
  caption,
}: {
  entries: { id: string; displayName: string; amount: number }[];
  caption: string;
}) {
  const totalBalance = entries.reduce((sum, entry) => sum + entry.amount, 0);

  return (
    <Card>
      <CardContent className="grid gap-4 p-5">
        <div className="flex items-center gap-4">
          <div className="grid size-12 shrink-0 place-items-center rounded-md bg-ledger-mint text-primary">
            <YadonMark variant="save" className="size-11" />
          </div>
          <div className="min-w-0">
            <p className="text-sm font-semibold text-muted-foreground">外食残高</p>
            <p
              className={cn(
                "text-glow truncate text-2xl font-black tracking-normal",
                entries.length && totalBalance < 0 && "text-destructive",
              )}
            >
              {entries.length ? formatCurrency(totalBalance) : "未取得"}
            </p>
            {entries.length ? (
              <p className="truncate text-xs font-semibold text-muted-foreground">
                {caption}
              </p>
            ) : null}
          </div>
        </div>
        <div className="grid gap-2">
          {entries.length ? (
            entries.map((entry) => (
              <div
                key={entry.id}
                className="flex min-w-0 items-center justify-between gap-3 rounded-md border bg-background/70 px-3 py-2"
              >
                <div className="flex min-w-0 items-center gap-2">
                  <UserRound className="size-4 shrink-0 text-primary" aria-hidden="true" />
                  <span className="min-w-0 truncate font-semibold">{entry.displayName}</span>
                </div>
                <span
                  className={cn(
                    "text-glow shrink-0 font-black tabular-nums",
                    entry.amount < 0 && "text-destructive",
                  )}
                >
                  {formatCurrency(entry.amount)}
                </span>
              </div>
            ))
          ) : (
            <EmptyState>実データ未取得</EmptyState>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

function ExpenseSummary({
  totals,
  expenseCount,
  monthLabel,
}: {
  totals: { dining: number; shopping: number; travel: number; total: number };
  expenseCount: number;
  monthLabel: string;
}) {
  return (
    <div className="grid gap-4">
      <div className="rounded-md border bg-background/70 p-4">
        <p className="text-sm font-semibold text-muted-foreground">{monthLabel}</p>
        <p className="text-glow mt-1 text-3xl font-black">
          {formatCurrency(totals.total)}
        </p>
        <p className="mt-2 text-sm font-semibold text-muted-foreground">
          {expenseCount}件の支出
        </p>
      </div>
      <div className="grid gap-3 sm:grid-cols-3">
        <div className="rounded-md border bg-background/70 p-3">
          <p className="text-sm font-semibold text-muted-foreground">外食</p>
          <p className="mt-1 truncate text-lg font-black">
            {formatCurrency(totals.dining)}
          </p>
        </div>
        <div className="rounded-md border bg-background/70 p-3">
          <p className="text-sm font-semibold text-muted-foreground">買い物</p>
          <p className="mt-1 truncate text-lg font-black">
            {formatCurrency(totals.shopping)}
          </p>
        </div>
        <div className="rounded-md border bg-background/70 p-3">
          <p className="text-sm font-semibold text-muted-foreground">旅行</p>
          <p className="mt-1 truncate text-lg font-black">
            {formatCurrency(totals.travel)}
          </p>
        </div>
      </div>
    </div>
  );
}

function Field({
  label,
  htmlFor,
  children,
}: {
  label: string;
  htmlFor: string;
  children: React.ReactNode;
}) {
  return (
    <div className="grid min-w-0 gap-2">
      <Label htmlFor={htmlFor}>{label}</Label>
      {children}
    </div>
  );
}

function CategorySelect({
  id,
  value,
  onChange,
}: {
  id: string;
  value: ExpenseCategory | "";
  onChange: (value: ExpenseCategory) => void;
}) {
  return (
    <select
      id={id}
      value={value}
      onChange={(event) => onChange(event.target.value as ExpenseCategory)}
      className="chalk-select h-12 w-full min-w-0 max-w-full rounded-md border border-input bg-card px-3 py-2 text-base shadow-sm md:text-sm"
    >
      <option value="" disabled>
        選択してください
      </option>
      {categories.map((category) => (
        <option key={category} value={category}>
          {category}
        </option>
      ))}
    </select>
  );
}

function ExpenseForm({
  draft,
  disabled,
  onChange,
  onSubmit,
}: {
  draft: DraftExpense;
  disabled: boolean;
  onChange: React.Dispatch<React.SetStateAction<DraftExpense>>;
  onSubmit: () => void;
}) {
  return (
    <Card>
      <CardHeader>
        <div className="flex min-w-0 items-start justify-between gap-3">
          <div className="min-w-0">
            <CardTitle>手動追加</CardTitle>
            <CardDescription>支出・旅行費用</CardDescription>
          </div>
          <YadonMark variant="front" className="size-11 shrink-0" />
        </div>
      </CardHeader>
      <CardContent className="grid gap-4">
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="支払い者" htmlFor="payer">
            <Input
              id="payer"
              placeholder="@自分"
              value={draft.payer}
              onChange={(event) =>
                onChange((current) => ({ ...current, payer: event.target.value }))
              }
            />
          </Field>
          <Field label="カテゴリー" htmlFor="category">
            <CategorySelect
              id="category"
              value={draft.category}
              onChange={(value) =>
                onChange((current) => ({ ...current, category: value }))
              }
            />
          </Field>
          <Field label="金額" htmlFor="amount">
            <Input
              id="amount"
              type="number"
              min={1}
              inputMode="numeric"
              placeholder="1000"
              value={draft.amount}
              onChange={(event) =>
                onChange((current) => ({
                  ...current,
                  amount:
                    event.target.value === "" ? "" : Number(event.target.value),
                }))
              }
            />
          </Field>
          <Field label="日付" htmlFor="date">
            <Input
              id="date"
              type="date"
              value={draft.date}
              onChange={(event) =>
                onChange((current) => ({ ...current, date: event.target.value }))
              }
            />
          </Field>
        </div>
        <Field label="内容" htmlFor="content">
          <Input
            id="content"
            value={draft.storeName}
            onChange={(event) =>
              onChange((current) => ({ ...current, storeName: event.target.value }))
            }
          />
        </Field>
        <Field label="メモ（任意）" htmlFor="memo">
          <Textarea
            id="memo"
            value={draft.memo ?? ""}
            onChange={(event) =>
              onChange((current) => ({ ...current, memo: event.target.value }))
            }
          />
        </Field>
        <Button type="button" disabled={disabled} onClick={onSubmit}>
          <ButtonIcon busy={disabled} icon={Send} />
          登録
        </Button>
      </CardContent>
    </Card>
  );
}

function SubscriptionRow({
  subscription,
  disabled,
  onDelete,
  onUpdate,
}: {
  subscription: AppSubscription;
  disabled: boolean;
  onDelete: (subscription: AppSubscription) => void;
  onUpdate: (before: AppSubscription, after: AppSubscription) => void;
}) {
  const [draft, setDraft] = React.useState<AppSubscription>(subscription);

  React.useEffect(() => {
    setDraft(subscription);
  }, [subscription]);

  return (
    <article className="grid gap-3 rounded-md border bg-background/70 p-4">
      <div className="flex min-w-0 items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="truncate font-bold">{subscription.serviceName}</h3>
          <p className="text-sm text-muted-foreground">
            {subscription.payerName} / {subscription.intervalLabel}
          </p>
        </div>
        <Badge variant="secondary">{formatCurrency(subscription.amount)}</Badge>
      </div>
      <div className="flex gap-2">
        <Dialog>
          <DialogTrigger asChild>
            <Button type="button" variant="outline" size="icon" aria-label="サブスクを更新">
              <Edit3 aria-hidden="true" />
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>サブスクを更新</DialogTitle>
              <DialogDescription>Firestore のサブスク内容を更新します</DialogDescription>
            </DialogHeader>
            <div className="grid gap-4">
              <Field label="支払い者" htmlFor={`${subscription.id}-subscription-payer`}>
                <Input
                  id={`${subscription.id}-subscription-payer`}
                  value={draft.payerName}
                  onChange={(event) =>
                    setDraft((current) => ({
                      ...current,
                      payerName: event.target.value,
                    }))
                  }
                />
              </Field>
              <Field label="サービス名" htmlFor={`${subscription.id}-subscription-service`}>
                <Input
                  id={`${subscription.id}-subscription-service`}
                  value={draft.serviceName}
                  onChange={(event) =>
                    setDraft((current) => ({
                      ...current,
                      serviceName: event.target.value,
                    }))
                  }
                />
              </Field>
              <Field label="金額" htmlFor={`${subscription.id}-subscription-amount`}>
                <Input
                  id={`${subscription.id}-subscription-amount`}
                  type="number"
                  min={0}
                  value={draft.amount}
                  onChange={(event) =>
                    setDraft((current) => ({
                      ...current,
                      amount: Number(event.target.value),
                    }))
                  }
                />
              </Field>
              <Field label="開始日" htmlFor={`${subscription.id}-subscription-start-date`}>
                <Input
                  id={`${subscription.id}-subscription-start-date`}
                  type="date"
                  value={draft.startDate}
                  onChange={(event) =>
                    setDraft((current) => ({
                      ...current,
                      startDate: event.target.value,
                    }))
                  }
                />
              </Field>
              <Field label="間隔" htmlFor={`${subscription.id}-subscription-interval`}>
                <Input
                  id={`${subscription.id}-subscription-interval`}
                  value={draft.intervalLabel}
                  onChange={(event) =>
                    setDraft((current) => ({
                      ...current,
                      intervalLabel: event.target.value,
                    }))
                  }
                />
              </Field>
            </div>
            <DialogFooter>
              <DialogClose asChild>
                <Button type="button" variant="outline">
                  戻る
                </Button>
              </DialogClose>
              <DialogClose asChild>
                <Button
                  type="button"
                  disabled={disabled}
                  onClick={() => onUpdate(subscription, draft)}
                >
                  <ButtonIcon busy={disabled} icon={Send} />
                  更新
                </Button>
              </DialogClose>
            </DialogFooter>
          </DialogContent>
        </Dialog>
        <Button
          type="button"
          variant="destructive"
          size="icon"
          aria-label="サブスクを削除"
          disabled={disabled}
          onClick={() => onDelete(subscription)}
        >
          <ButtonIcon busy={disabled} icon={Trash2} />
        </Button>
      </div>
    </article>
  );
}

function ExpenseRow({
  expense,
  disabled,
  onDelete,
  onUpdate,
}: {
  expense: Expense;
  disabled: boolean;
  onDelete: (expense: Expense) => void;
  onUpdate: (before: Expense, after: Expense) => void;
}) {
  const [draft, setDraft] = React.useState<Expense>(expense);

  React.useEffect(() => {
    setDraft(expense);
  }, [expense]);

  return (
    <article className="grid gap-3 rounded-lg border bg-background/70 p-4 sm:grid-cols-[1fr_auto] sm:items-center">
      <div className="min-w-0">
        <div className="mb-2 flex flex-wrap items-center gap-2">
          <Badge variant={expense.category === "外食費用" ? "default" : "secondary"}>
            {expense.category}
          </Badge>
          <span className="text-sm text-muted-foreground">
            {formatShortDate(expense.date)}
          </span>
        </div>
        <h3 className="truncate text-lg font-bold">{expense.storeName}</h3>
        <p className="text-sm text-muted-foreground">
          {expense.payer} / {formatCurrency(expense.amount)}
        </p>
        {expense.memo ? (
          <p className="mt-1 line-clamp-2 text-sm text-muted-foreground">
            {expense.memo}
          </p>
        ) : null}
      </div>
      <div className="flex gap-2">
        <Dialog>
          <DialogTrigger asChild>
            <Button type="button" variant="outline" size="icon" aria-label="更新">
              <Edit3 aria-hidden="true" />
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>支出を更新</DialogTitle>
              <DialogDescription>
                Firestore / Google Calendar の支出内容を更新します
              </DialogDescription>
            </DialogHeader>
            <div className="grid gap-4">
              <Field label="支払い者" htmlFor={`${expense.id}-payer`}>
                <Input
                  id={`${expense.id}-payer`}
                  value={draft.payer}
                  onChange={(event) =>
                    setDraft((current) => ({
                      ...current,
                      payer: event.target.value,
                    }))
                  }
                />
              </Field>
              <Field label="カテゴリー" htmlFor={`${expense.id}-category`}>
                <CategorySelect
                  id={`${expense.id}-category`}
                  value={draft.category}
                  onChange={(value) =>
                    setDraft((current) => ({ ...current, category: value }))
                  }
                />
              </Field>
              <Field label="金額" htmlFor={`${expense.id}-amount`}>
                <Input
                  id={`${expense.id}-amount`}
                  type="number"
                  min={0}
                  value={draft.amount}
                  onChange={(event) =>
                    setDraft((current) => ({
                      ...current,
                      amount: Number(event.target.value),
                    }))
                  }
                />
              </Field>
              <Field label="日付" htmlFor={`${expense.id}-date`}>
                <Input
                  id={`${expense.id}-date`}
                  type="date"
                  value={draft.date}
                  onChange={(event) =>
                    setDraft((current) => ({ ...current, date: event.target.value }))
                  }
                />
              </Field>
              <Field label="内容" htmlFor={`${expense.id}-content`}>
                <Input
                  id={`${expense.id}-content`}
                  value={draft.storeName}
                  onChange={(event) =>
                    setDraft((current) => ({
                      ...current,
                      storeName: event.target.value,
                    }))
                  }
                />
              </Field>
              <Field label="メモ（任意）" htmlFor={`${expense.id}-memo`}>
                <Textarea
                  id={`${expense.id}-memo`}
                  value={draft.memo ?? ""}
                  onChange={(event) =>
                    setDraft((current) => ({
                      ...current,
                      memo: event.target.value,
                    }))
                  }
                />
              </Field>
            </div>
            <DialogFooter>
              <DialogClose asChild>
                <Button type="button" variant="outline">
                  戻る
                </Button>
              </DialogClose>
              <DialogClose asChild>
                <Button
                  type="button"
                  disabled={disabled}
                  onClick={() => onUpdate(expense, draft)}
                >
                  <ButtonIcon busy={disabled} icon={Send} />
                  更新
                </Button>
              </DialogClose>
            </DialogFooter>
          </DialogContent>
        </Dialog>
        <Button
          type="button"
          variant="destructive"
          size="icon"
          aria-label="削除"
          disabled={disabled}
          onClick={() => onDelete(expense)}
        >
          <ButtonIcon busy={disabled} icon={Trash2} />
        </Button>
      </div>
    </article>
  );
}
