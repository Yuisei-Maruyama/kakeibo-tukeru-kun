"use client";

import * as React from "react";
import {
  Banknote,
  CalendarDays,
  Camera,
  ChartNoAxesCombined,
  CheckCircle2,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  CircleHelp,
  ClipboardList,
  Clock3,
  Edit3,
  Home,
  ImagePlus,
  JapaneseYen,
  LineChart,
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
  DashboardReceiptNoteConfirmation,
  ReceiptNoteCategory,
} from "@/types/dashboard";

type DraftExpense = Omit<Expense, "id" | "category"> & {
  category: ExpenseCategory | "";
};
type AppCalendarEvent = DashboardData["calendarEvents"][number];
type AppSubscription = DashboardData["subscriptions"][number];
type DraftSubscription = Pick<
  AppSubscription,
  "payerName" | "serviceName" | "amount" | "startDate" | "intervalLabel"
>;
type DraftRent = NonNullable<DashboardData["rent"]>;
type ExpenseCategoryFilter = "all" | ExpenseCategory;
type ReportMode = "history" | "summary";
type ReceiptNoteFilter = "all" | ReceiptNoteCategory;
type ReceiptNoteConfirmation = {
  confirmedBy: string;
  date: string;
  checked: boolean;
};
type ReceiptNoteUser = {
  id: string;
  name: string;
};
type ReceiptNoteRow = {
  key: string;
  id?: string;
  category: ReceiptNoteCategory;
  user: ReceiptNoteUser;
  amount: number;
  received: boolean;
  isManual: boolean;
};
type ReceiptNoteCategorySummary = {
  value: ReceiptNoteCategory;
  label: string;
  description: string;
  rows: ReceiptNoteRow[];
  total: number;
  receivedCount: number;
};
type ReceiptNoteDraft = {
  category: ReceiptNoteCategory;
  userName: string;
  amount: number;
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
type ReceiptNoteConfirmationMutationResult = {
  confirmation: DashboardReceiptNoteConfirmation;
};
type CommandTile =
  | { label: string; command: string; icon: React.ElementType; reportMode?: never; action?: never }
  | { label: string; reportMode: ReportMode; icon: React.ElementType; command?: never; action?: never }
  | { label: string; action: "subscriptions"; icon: React.ElementType; command?: never; reportMode?: never };

const categories: ExpenseCategory[] = ["外食費用", "買い物費用", "旅行費用"];

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
    description: "買い物費用のユーザー別合計",
    expenseCategory: "買い物費用",
  },
  {
    value: "travelSettlement",
    label: "旅行費用精算",
    description: "旅行費用のユーザー別合計",
    expenseCategory: "旅行費用",
  },
  {
    value: "other",
    label: "その他",
    description: "タイトルと金額を自由に設定",
  },
];

const receiptNoteFilters: { value: ReceiptNoteFilter; label: string }[] = [
  { value: "all", label: "すべて" },
  { value: "diningSaving", label: "外食" },
  { value: "shoppingSettlement", label: "買い物" },
  { value: "travelSettlement", label: "旅行" },
  { value: "other", label: "その他" },
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
  date: todayInputValue(),
  category: "",
  payer: "@自分",
  amount: 1280,
  storeName: "手動入力",
  memo: "",
});

const defaultSubscriptionDraft = (): DraftSubscription => ({
  payerName: "@自分",
  serviceName: "サブスク名",
  amount: 1000,
  startDate: todayInputValue(),
  intervalLabel: "毎月",
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

function createReceiptNoteConfirmations(
  date: string,
): Record<ReceiptNoteCategory, ReceiptNoteConfirmation> {
  return {
    diningSaving: { confirmedBy: "", date, checked: false },
    shoppingSettlement: { confirmedBy: "", date, checked: false },
    travelSettlement: { confirmedBy: "", date, checked: false },
    other: { confirmedBy: "", date, checked: false },
  };
}

function createReceiptNoteConfirmationsFromDashboard(
  confirmations: DashboardReceiptNoteConfirmation[],
  fallbackDate: string,
) {
  const result = createReceiptNoteConfirmations(fallbackDate);

  for (const confirmation of confirmations) {
    result[confirmation.category] = {
      confirmedBy: confirmation.confirmedBy,
      date: confirmation.date || fallbackDate,
      checked: confirmation.checked,
    };
  }

  return result;
}

function createReceiptNoteKey(category: ReceiptNoteCategory, userName: string) {
  return `${category}:${userName}`;
}

function createReceiptExpenseKey(category: ExpenseCategory, userName: string) {
  return `${category}:${userName}`;
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
    participants: "@自分",
    title: "会議",
    date: todayInputValue(),
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
  const [receiptNoteFilter, setReceiptNoteFilter] =
    React.useState<ReceiptNoteFilter>("all");
  const [receiptNoteAmounts, setReceiptNoteAmounts] = React.useState<
    Record<string, number>
  >({});
  const [receiptNoteChecks, setReceiptNoteChecks] = React.useState<
    Record<string, boolean>
  >({});
  const [receiptNoteUserNames, setReceiptNoteUserNames] = React.useState<
    Record<string, string>
  >({});
  const [receiptNoteRowCategories, setReceiptNoteRowCategories] = React.useState<
    Record<string, ReceiptNoteCategory>
  >({});
  const [receiptNoteDeletedKeys, setReceiptNoteDeletedKeys] = React.useState<
    Record<string, boolean>
  >({});
  const [savedReceiptNotes, setSavedReceiptNotes] = React.useState<
    DashboardReceiptNote[]
  >([]);
  const [receiptNoteDraft, setReceiptNoteDraft] = React.useState<ReceiptNoteDraft>({
    category: "diningSaving",
    userName: "",
    amount: 0,
  });
  const [receiptNoteConfirmations, setReceiptNoteConfirmations] = React.useState<
    Record<ReceiptNoteCategory, ReceiptNoteConfirmation>
  >(() => createReceiptNoteConfirmations(todayInputValue()));
  const [showSaveToast, setShowSaveToast] = React.useState(false);
  const saveToastTimerRef = React.useRef<number | null>(null);
  const cameraInputRef = React.useRef<HTMLInputElement | null>(null);

  const celebrateSave = React.useCallback(() => {
    setShowSaveToast(true);
    if (saveToastTimerRef.current) {
      window.clearTimeout(saveToastTimerRef.current);
    }
    saveToastTimerRef.current = window.setTimeout(() => {
      setShowSaveToast(false);
    }, 3500);
  }, []);

  React.useEffect(() => {
    return () => {
      if (saveToastTimerRef.current) {
        window.clearTimeout(saveToastTimerRef.current);
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
        setReceiptNoteConfirmations(
          createReceiptNoteConfirmationsFromDashboard(
            data.receiptNoteConfirmations,
            todayInputValue(),
          ),
        );

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

      results.push(expense);
    }

    return results;
  }, [expenseCategoryFilter, expenseDateFilter, expenses]);
  const homeMonthLabel = formatYearMonthLabel(dashboard?.month ?? dashboardMonth);
  const hasLiveDashboardData = dashboard?.source === "live" || dashboardUsers.length > 0;
  const visibleDashboardUsers =
    dashboard?.source === "live" ? dashboard.users : dashboardUsers;
  const liveDiningBalance = visibleDashboardUsers.length
    ? visibleDashboardUsers.reduce((sum, user) => sum + user.diningBalance, 0)
    : Math.max(budget - totals.dining, 0);
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
    const savedReceiptNoteKeys = new Set<string>();

    for (const receiptNote of savedReceiptNotes) {
      savedReceiptNoteKeys.add(`${receiptNote.category}:${receiptNote.userId}`);
      savedReceiptNoteKeys.add(`${receiptNote.category}:${receiptNote.userName}`);

      if (!receiptNote.isActive) {
        continue;
      }

      rows.push({
        key: receiptNote.id,
        id: receiptNote.id,
        category: receiptNote.category,
        user: {
          id: receiptNote.userId,
          name: receiptNoteUserNames[receiptNote.id] ?? receiptNote.userName,
        },
        amount: receiptNoteAmounts[receiptNote.id] ?? receiptNote.amount,
        received: receiptNoteChecks[receiptNote.id] ?? receiptNote.received,
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

    for (const category of receiptNoteCategories) {
      // その他など支出カテゴリーに紐付かないものは自動集計行を作らない
      if (!category.expenseCategory) {
        continue;
      }

      for (const user of receiptNoteUsers) {
        const key = createReceiptNoteKey(category.value, user.name);
        if (
          receiptNoteDeletedKeys[key] ||
          savedReceiptNoteKeys.has(`${category.value}:${user.id}`) ||
          savedReceiptNoteKeys.has(`${category.value}:${user.name}`)
        ) {
          continue;
        }

        const categoryExpenseKey = createReceiptExpenseKey(
          category.expenseCategory,
          user.name,
        );
        const defaultAmount =
          category.value === "diningSaving"
            ? Math.max(
                diningBalanceMap.get(user.name) ??
                  budget - (expenseAmountMap.get(categoryExpenseKey) ?? 0),
                0,
              )
            : expenseAmountMap.get(categoryExpenseKey) ?? 0;
        const userName = receiptNoteUserNames[key] ?? user.name;

        rows.push({
          key,
          category: receiptNoteRowCategories[key] ?? category.value,
          user: {
            id: user.id,
            name: userName,
          },
          amount: receiptNoteAmounts[key] ?? defaultAmount,
          received: receiptNoteChecks[key] ?? false,
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
        receivedCount: categoryRows.filter((row) => row.received).length,
      };
    });
  }, [
    budget,
    expenses,
    receiptNoteAmounts,
    receiptNoteChecks,
    receiptNoteDeletedKeys,
    receiptNoteRowCategories,
    receiptNoteUserNames,
    receiptNoteUsers,
    savedReceiptNotes,
    visibleDashboardUsers,
  ]);

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
      setToast("レシート画像を選択してください");
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
      setToast(error instanceof Error ? error.message : "画像登録に失敗しました");
    } finally {
      setIsAnalyzingImage(false);
    }
  }

  async function submitExpense() {
    if (!draftExpense.date || !draftExpense.storeName.trim()) {
      setToast("日付と内容を入力してください");
      return;
    }

    if (!draftExpense.category) {
      setToast("カテゴリーを選択してください");
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
      setToast(error instanceof Error ? error.message : "支出の保存に失敗しました");
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
      setToast(error instanceof Error ? error.message : "支出の削除に失敗しました");
    } finally {
      setIsMutating(false);
    }
  }

  async function updateExpense(before: Expense, after: Expense) {
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
      setToast(error instanceof Error ? error.message : "支出の更新に失敗しました");
    } finally {
      setIsMutating(false);
    }
  }

  async function addSchedule() {
    if (!schedule.title.trim() || !schedule.date) {
      setToast("予定の内容と日付を入力してください");
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
          title: "会議",
          startTime: "",
          endTime: "",
        }));
        setToast(result.message);
        celebrateSave();
      });
    } catch (error) {
      setToast(error instanceof Error ? error.message : "予定の保存に失敗しました");
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
      setToast(error instanceof Error ? error.message : "予定の更新に失敗しました");
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
      setToast(error instanceof Error ? error.message : "予定の削除に失敗しました");
    } finally {
      setIsMutating(false);
    }
  }

  async function addSubscription() {
    if (!subscriptionDraft.serviceName.trim()) {
      setToast("サブスク名を入力してください");
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
      setToast(error instanceof Error ? error.message : "サブスクの保存に失敗しました");
    } finally {
      setIsMutating(false);
    }
  }

  async function updateSubscription(
    before: AppSubscription,
    after: AppSubscription,
  ) {
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
      setToast(error instanceof Error ? error.message : "サブスクの更新に失敗しました");
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
      setToast(error instanceof Error ? error.message : "サブスクの削除に失敗しました");
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
      setToast(error instanceof Error ? error.message : "家賃の保存に失敗しました");
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
      setToast(error instanceof Error ? error.message : "家賃の削除に失敗しました");
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
      setToast(error instanceof Error ? error.message : "予算変更に失敗しました");
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
    patch: Partial<Pick<ReceiptNoteRow, "category" | "amount" | "received">> & {
      userName?: string;
      isActive?: boolean;
    } = {},
  ) {
    const payload = {
      month: dashboardMonth,
      category: patch.category ?? row.category,
      userName: patch.userName ?? row.user.name,
      amount: patch.amount ?? row.amount,
      received: patch.received ?? row.received,
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
    const isOther = receiptNoteDraft.category === "other";
    const userName = isOther
      ? receiptNoteDraft.userName.trim()
      : receiptNoteDraft.userName.trim() || receiptNoteUsers[0]?.name || "@自分";
    if (!userName || !Number.isFinite(receiptNoteDraft.amount)) {
      setToast(
        isOther ? "タイトルと金額を入力してください" : "ユーザーと金額を入力してください",
      );
      return;
    }

    setIsMutating(true);

    try {
      const result = await requestJson<ReceiptNoteMutationResult>(
        "/api/receipt-notes",
        {
          method: "POST",
          body: JSON.stringify({
            month: dashboardMonth,
            category: receiptNoteDraft.category,
            userName,
            amount: receiptNoteDraft.amount,
            received: false,
            source: "manual",
          }),
        },
      );

      applySavedReceiptNote(result.receiptNote);
      setReceiptNoteFilter(receiptNoteDraft.category);
      setReceiptNoteDraft((current) => ({
        ...current,
        amount: 0,
      }));
      setToast(result.message);
      celebrateSave();
    } catch (error) {
      setToast(error instanceof Error ? error.message : "受領ノートの保存に失敗しました");
    } finally {
      setIsMutating(false);
    }
  }

  function draftReceiptNoteAmount(rowKey: string, amount: number) {
    setReceiptNoteAmounts((current) => ({
      ...current,
      [rowKey]: Number.isFinite(amount) ? Math.max(amount, 0) : 0,
    }));
  }

  function draftReceiptNoteUserName(rowKey: string, userName: string) {
    setReceiptNoteUserNames((current) => ({
      ...current,
      [rowKey]: userName,
    }));
  }

  async function updateReceiptNoteAmount(row: ReceiptNoteRow, amount: number) {
    const nextAmount = Number.isFinite(amount) ? Math.max(amount, 0) : 0;
    setReceiptNoteAmounts((current) => ({
      ...current,
      [row.key]: nextAmount,
    }));
    setIsMutating(true);

    try {
      await saveReceiptNoteRow(row, { amount: nextAmount });
      celebrateSave();
    } catch (error) {
      setToast(error instanceof Error ? error.message : "受領ノートの更新に失敗しました");
    } finally {
      setIsMutating(false);
    }
  }

  async function updateReceiptNoteCheck(row: ReceiptNoteRow, checked: boolean) {
    setReceiptNoteChecks((current) => ({
      ...current,
      [row.key]: checked,
    }));
    setIsMutating(true);

    try {
      await saveReceiptNoteRow(row, { received: checked });
      celebrateSave();
    } catch (error) {
      setToast(error instanceof Error ? error.message : "受領ノートの更新に失敗しました");
    } finally {
      setIsMutating(false);
    }
  }

  async function updateReceiptNoteRowCategory(
    row: ReceiptNoteRow,
    category: ReceiptNoteCategory,
  ) {
    setReceiptNoteRowCategories((current) => ({
      ...current,
      [row.key]: category,
    }));
    setReceiptNoteFilter(category);
    setIsMutating(true);

    try {
      await saveReceiptNoteRow(row, { category });
      celebrateSave();
    } catch (error) {
      setToast(error instanceof Error ? error.message : "受領ノートの更新に失敗しました");
    } finally {
      setIsMutating(false);
    }
  }

  async function updateReceiptNoteUserName(row: ReceiptNoteRow, userName: string) {
    setReceiptNoteUserNames((current) => ({
      ...current,
      [row.key]: userName,
    }));
    setIsMutating(true);

    try {
      await saveReceiptNoteRow(row, { userName });
      celebrateSave();
    } catch (error) {
      setToast(error instanceof Error ? error.message : "受領ノートの更新に失敗しました");
    } finally {
      setIsMutating(false);
    }
  }

  async function deleteReceiptNoteRow(row: ReceiptNoteRow) {
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
      setToast(error instanceof Error ? error.message : "受領ノートの削除に失敗しました");
    } finally {
      setIsMutating(false);
    }
  }

  async function updateReceiptNoteConfirmation(
    category: ReceiptNoteCategory,
    patch: Partial<ReceiptNoteConfirmation>,
  ) {
    const nextConfirmation = {
      ...receiptNoteConfirmations[category],
      ...patch,
    };
    const confirmedBy =
      nextConfirmation.confirmedBy ||
      receiptNoteUsers[1]?.name ||
      receiptNoteUsers[0]?.name ||
      "@自分";
    setReceiptNoteConfirmations((current) => ({
      ...current,
      [category]: {
        ...nextConfirmation,
        confirmedBy,
      },
    }));
    setIsMutating(true);

    try {
      const result = await requestJson<ReceiptNoteConfirmationMutationResult>(
        "/api/receipt-notes/confirmations",
        {
          method: "PUT",
          body: JSON.stringify({
            month: dashboardMonth,
            category,
            confirmedBy,
            date: nextConfirmation.date,
            checked: nextConfirmation.checked,
          }),
        },
      );
      setReceiptNoteConfirmations((current) => ({
        ...current,
        [result.confirmation.category]: {
          confirmedBy: result.confirmation.confirmedBy,
          date: result.confirmation.date,
          checked: result.confirmation.checked,
        },
      }));
      setToast(result.message);
      celebrateSave();
    } catch (error) {
      setToast(
        error instanceof Error
          ? error.message
          : "受領ノートの全体確認保存に失敗しました",
      );
    } finally {
      setIsMutating(false);
    }
  }

  if (isInitializing) {
    return (
      <main className="chalkboard grid min-h-dvh place-items-center text-foreground">
        <div className="flex flex-col items-center gap-3">
          <YadonSpinner className="size-12" />
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
              <div className="grid size-10 shrink-0 place-items-center rounded-md bg-primary text-primary-foreground shadow-ledger">
                <ReceiptText className="size-5" aria-hidden="true" />
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
          </div>
        </section>

        <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
          {activeTab === "home" ? (
          <TabsContent value="home">
            <div className="grid gap-4">
              <section className="chalk-frame bg-card p-4 shadow-ledger">
                <div className="flex min-w-0 items-start justify-between gap-3">
                  <div>
                    <p className="text-sm font-semibold text-muted-foreground">
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
                    <p className="text-xs font-bold text-muted-foreground">
                      対象月
                    </p>
                    <h2 className="truncate text-xl font-black tracking-normal">
                      {homeMonthLabel}
                    </h2>
                  </div>
                  <Badge variant={hasLiveDashboardData ? "default" : "outline"}>
                    {hasLiveDashboardData ? "実データ" : "プレビュー"}
                  </Badge>
                </div>
                <DiningBalanceCard users={visibleDashboardUsers} />
                <MetricCard
                  label="買い物合計"
                  value={formatCurrency(totals.shopping)}
                  icon={Banknote}
                  tone="coin"
                />
                <MetricCard
                  label="旅行費用"
                  value={formatCurrency(totals.travel)}
                  icon={LineChart}
                  tone="blue"
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
                          <ImagePlus className="size-10 text-primary" aria-hidden="true" />
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
                  <CardTitle>履歴取得</CardTitle>
                  <CardDescription>月指定</CardDescription>
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
                        <div className="grid gap-3 sm:grid-cols-[1fr_auto] sm:items-end">
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
                          <Button
                            type="button"
                            variant="outline"
                            className="sm:h-12"
                            disabled={!expenseDateFilter}
                            onClick={() => setExpenseDateFilter("")}
                          >
                            <XCircle aria-hidden="true" />
                            解除
                          </Button>
                        </div>
                        <p className="text-sm font-semibold text-muted-foreground">
                          {filteredExpenses.length}件を表示中
                        </p>
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
                            <div className="rounded-md border bg-background/70 p-4 text-sm text-muted-foreground">
                              条件に一致する支出はありません
                            </div>
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
                  <CardTitle>予定登録</CardTitle>
                  <CardDescription>Google カレンダー連携</CardDescription>
                </CardHeader>
                <CardContent className="grid gap-4">
                  <div className="grid gap-4 sm:grid-cols-2">
                    <Field label="参加者" htmlFor="schedule-participants">
                      <Input
                        id="schedule-participants"
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
                  <CardTitle>Firestore</CardTitle>
                  <CardDescription>ユーザー・固定費</CardDescription>
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
                      <p className="text-sm text-muted-foreground">
                        実データ未取得
                      </p>
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
                        min={0}
                        value={subscriptionDraft.amount}
                        onChange={(event) =>
                          setSubscriptionDraft((current) => ({
                            ...current,
                            amount: Number(event.target.value),
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
                    <p className="text-sm text-muted-foreground">
                      サブスクは未取得または未登録です
                    </p>
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
              confirmations={receiptNoteConfirmations}
              users={receiptNoteUsers}
              monthLabel={homeMonthLabel}
              draft={receiptNoteDraft}
              disabled={isMutating}
              onFilterChange={setReceiptNoteFilter}
              onDraftChange={setReceiptNoteDraft}
              onAddRow={addReceiptNoteRow}
              onAmountDraftChange={draftReceiptNoteAmount}
              onAmountChange={updateReceiptNoteAmount}
              onReceivedChange={updateReceiptNoteCheck}
              onCategoryChange={updateReceiptNoteRowCategory}
              onUserDraftChange={draftReceiptNoteUserName}
              onUserChange={updateReceiptNoteUserName}
              onDeleteRow={deleteReceiptNoteRow}
              onConfirmationChange={updateReceiptNoteConfirmation}
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
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src="/yadon-save.gif"
                alt=""
                aria-hidden="true"
                className="size-14 object-contain [image-rendering:pixelated]"
              />
              <p className="text-glow font-bold">保存が完了したよ！</p>
            </div>
          </div>
        ) : null}
      </div>
    </main>
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
  confirmations,
  users,
  monthLabel,
  draft,
  disabled,
  onFilterChange,
  onDraftChange,
  onAddRow,
  onAmountDraftChange,
  onAmountChange,
  onReceivedChange,
  onCategoryChange,
  onUserDraftChange,
  onUserChange,
  onDeleteRow,
  onConfirmationChange,
}: {
  filter: ReceiptNoteFilter;
  summaries: ReceiptNoteCategorySummary[];
  confirmations: Record<ReceiptNoteCategory, ReceiptNoteConfirmation>;
  users: ReceiptNoteUser[];
  monthLabel: string;
  draft: ReceiptNoteDraft;
  disabled: boolean;
  onFilterChange: (value: ReceiptNoteFilter) => void;
  onDraftChange: React.Dispatch<React.SetStateAction<ReceiptNoteDraft>>;
  onAddRow: () => void;
  onAmountDraftChange: (rowKey: string, amount: number) => void;
  onAmountChange: (row: ReceiptNoteRow, amount: number) => void;
  onReceivedChange: (row: ReceiptNoteRow, checked: boolean) => void;
  onCategoryChange: (row: ReceiptNoteRow, category: ReceiptNoteCategory) => void;
  onUserDraftChange: (rowKey: string, userName: string) => void;
  onUserChange: (row: ReceiptNoteRow, userName: string) => void;
  onDeleteRow: (row: ReceiptNoteRow) => void;
  onConfirmationChange: (
    category: ReceiptNoteCategory,
    patch: Partial<ReceiptNoteConfirmation>,
  ) => void;
}) {
  const visibleSummaries =
    filter === "all"
      ? summaries
      : summaries.filter((summary) => summary.value === filter);
  const totalAmount = summaries.reduce((sum, summary) => sum + summary.total, 0);
  const rowCount = summaries.reduce((sum, summary) => sum + summary.rows.length, 0);
  const receivedCount = summaries.reduce(
    (sum, summary) => sum + summary.receivedCount,
    0,
  );
  const confirmedCategoryCount = receiptNoteCategories.filter(
    (category) => confirmations[category.value].checked,
  ).length;

  return (
    <div className="grid gap-4">
      <section className="chalk-frame bg-card p-4 shadow-ledger">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-sm font-semibold text-muted-foreground">対象月</p>
            <h2 className="mt-1 truncate text-2xl font-black leading-tight">
              {monthLabel}
            </h2>
          </div>
          <Badge variant="outline">
            {confirmedCategoryCount}/{receiptNoteCategories.length} 全体確認
          </Badge>
        </div>
        <div className="mt-4 grid grid-cols-3 gap-2">
          <div className="min-w-0 rounded-md border bg-background/70 p-3">
            <p className="text-xs font-bold text-muted-foreground">設定額</p>
            <p className="mt-1 truncate text-lg font-black">
              {formatCurrency(totalAmount)}
            </p>
          </div>
          <div className="min-w-0 rounded-md border bg-background/70 p-3">
            <p className="text-xs font-bold text-muted-foreground">受領</p>
            <p className="mt-1 truncate text-lg font-black">
              {receivedCount}/{rowCount}
            </p>
          </div>
          <div className="min-w-0 rounded-md border bg-background/70 p-3">
            <p className="text-xs font-bold text-muted-foreground">確認者</p>
            <p className="mt-1 truncate text-lg font-black">
              {users.length ? `${users.length}人` : "未取得"}
            </p>
          </div>
        </div>
      </section>

      <Card>
        <CardHeader>
          <CardTitle>明細を追加</CardTitle>
          <CardDescription>カテゴリー・ユーザー・金額</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4">
          <div className="grid gap-4 sm:grid-cols-3">
            <Field label="カテゴリー" htmlFor="receipt-note-add-category">
              <ReceiptNoteCategorySelect
                id="receipt-note-add-category"
                value={draft.category}
                disabled={disabled}
                onChange={(category) =>
                  onDraftChange((current) => ({ ...current, category }))
                }
              />
            </Field>
            {draft.category === "other" ? (
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
            ) : (
              <Field label="ユーザー" htmlFor="receipt-note-add-user">
                <ReceiptNoteUserSelect
                  id="receipt-note-add-user"
                  users={users}
                  value={draft.userName || users[0]?.name || ""}
                  disabled={disabled}
                  onChange={(userName) =>
                    onDraftChange((current) => ({ ...current, userName }))
                  }
                />
              </Field>
            )}
            <Field label="金額" htmlFor="receipt-note-add-amount">
              <Input
                id="receipt-note-add-amount"
                type="number"
                min={0}
                inputMode="numeric"
                value={draft.amount}
                disabled={disabled}
                onChange={(event) =>
                  onDraftChange((current) => ({
                    ...current,
                    amount: Number(event.target.value),
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
        <TabsList aria-label="受領完了ノートのカテゴリー" className="grid w-full grid-cols-5">
          {receiptNoteFilters.map((item) => (
            <TabsTrigger
              key={item.value}
              value={item.value}
              className="px-1 text-[0.68rem] sm:text-xs"
            >
              {item.label}
            </TabsTrigger>
          ))}
        </TabsList>
        <TabsContent value={filter} className="mt-0 grid gap-4">
          {visibleSummaries.map((summary) => (
            <ReceiptNoteCategoryCard
              key={summary.value}
              summary={summary}
              confirmation={confirmations[summary.value]}
              users={users}
              disabled={disabled}
              onAmountDraftChange={onAmountDraftChange}
              onAmountChange={onAmountChange}
              onReceivedChange={onReceivedChange}
              onCategoryChange={onCategoryChange}
              onUserDraftChange={onUserDraftChange}
              onUserChange={onUserChange}
              onDeleteRow={onDeleteRow}
              onConfirmationChange={onConfirmationChange}
            />
          ))}
        </TabsContent>
      </Tabs>
    </div>
  );
}

function ReceiptNoteCategorySelect({
  id,
  value,
  disabled = false,
  onChange,
}: {
  id: string;
  value: ReceiptNoteCategory;
  disabled?: boolean;
  onChange: (value: ReceiptNoteCategory) => void;
}) {
  return (
    <select
      id={id}
      value={value}
      disabled={disabled}
      onChange={(event) => onChange(event.target.value as ReceiptNoteCategory)}
      className="chalk-select h-12 w-full min-w-0 max-w-full rounded-md border border-input bg-card px-3 py-2 text-base shadow-sm md:text-sm"
    >
      {receiptNoteCategories.map((category) => (
        <option key={category.value} value={category.value}>
          {category.label}
        </option>
      ))}
    </select>
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
      {users.length ? (
        users.map((user) => (
          <option key={user.id} value={user.name}>
            {user.name}
          </option>
        ))
      ) : (
        <option value="">未取得</option>
      )}
    </select>
  );
}

function ReceiptNoteCategoryCard({
  summary,
  confirmation,
  users,
  disabled,
  onAmountDraftChange,
  onAmountChange,
  onReceivedChange,
  onCategoryChange,
  onUserDraftChange,
  onUserChange,
  onDeleteRow,
  onConfirmationChange,
}: {
  summary: ReceiptNoteCategorySummary;
  confirmation: ReceiptNoteConfirmation;
  users: ReceiptNoteUser[];
  disabled: boolean;
  onAmountDraftChange: (rowKey: string, amount: number) => void;
  onAmountChange: (row: ReceiptNoteRow, amount: number) => void;
  onReceivedChange: (row: ReceiptNoteRow, checked: boolean) => void;
  onCategoryChange: (row: ReceiptNoteRow, category: ReceiptNoteCategory) => void;
  onUserDraftChange: (rowKey: string, userName: string) => void;
  onUserChange: (row: ReceiptNoteRow, userName: string) => void;
  onDeleteRow: (row: ReceiptNoteRow) => void;
  onConfirmationChange: (
    category: ReceiptNoteCategory,
    patch: Partial<ReceiptNoteConfirmation>,
  ) => void;
}) {
  const confirmedBy =
    users.find((user) => user.name === confirmation.confirmedBy)?.name ??
    users[1]?.name ??
    users[0]?.name ??
    "";
  // 開いている明細行のキー（同時に 1 行のみ展開）
  const [expandedKey, setExpandedKey] = React.useState<string | null>(null);
  // 全体確認セクションの開閉状態
  const [confirmationExpanded, setConfirmationExpanded] = React.useState(false);
  const allReceived =
    summary.rows.length > 0 && summary.receivedCount === summary.rows.length;

  return (
    <Card>
      <CardHeader>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <CardTitle>{summary.label}</CardTitle>
            <CardDescription>{summary.description}</CardDescription>
          </div>
          <div className="flex shrink-0 flex-wrap items-center justify-end gap-2">
            <Badge variant="outline">{formatCurrency(summary.total)}</Badge>
            {summary.rows.length > 0 ? (
              <Badge variant={allReceived ? "default" : "outline"}>
                {summary.receivedCount}/{summary.rows.length} 受領
              </Badge>
            ) : null}
            {confirmation.checked ? (
              <Badge variant="default">確認済み</Badge>
            ) : null}
          </div>
        </div>
      </CardHeader>
      <CardContent className="grid gap-4">
        <fieldset className="grid gap-3">
          <legend className="sr-only">{summary.label}の受領明細</legend>
          {summary.rows.map((row, index) => (
            <ReceiptNoteRowItem
              key={row.key}
              row={row}
              summaryValue={summary.value}
              index={index}
              users={users}
              disabled={disabled}
              expanded={expandedKey === row.key}
              onToggle={() =>
                setExpandedKey((current) =>
                  current === row.key ? null : row.key,
                )
              }
              onAmountDraftChange={onAmountDraftChange}
              onAmountChange={onAmountChange}
              onReceivedChange={onReceivedChange}
              onCategoryChange={onCategoryChange}
              onUserDraftChange={onUserDraftChange}
              onUserChange={onUserChange}
              onDeleteRow={onDeleteRow}
            />
          ))}
          {summary.rows.length === 0 ? (
            <div className="rounded-md border bg-background/70 p-4 text-sm text-muted-foreground">
              このカテゴリーの明細はありません
            </div>
          ) : null}
        </fieldset>

        <fieldset className="grid gap-3 rounded-md border bg-background/70 p-3">
          <legend className="sr-only">{summary.label}の全体確認</legend>
          <div className="flex min-w-0 items-center gap-3">
            <input
              type="checkbox"
              checked={confirmation.checked}
              disabled={disabled}
              aria-label={`${summary.label}を全体確認済みにする`}
              onChange={(event) =>
                onConfirmationChange(summary.value, {
                  checked: event.target.checked,
                  confirmedBy,
                })
              }
              className="chalk-checkbox size-5 shrink-0"
            />
            <button
              type="button"
              className="flex min-h-11 min-w-0 flex-1 items-center gap-2 text-left"
              aria-expanded={confirmationExpanded}
              aria-controls={`${summary.value}-confirmation-panel`}
              onClick={() => setConfirmationExpanded((current) => !current)}
            >
              <span className="shrink-0 font-semibold">全体確認</span>
              {confirmation.checked ? (
                <span className="min-w-0 flex-1 truncate text-sm text-primary">
                  {confirmedBy} / {confirmation.date}
                </span>
              ) : null}
              <AccordionChevron
                expanded={confirmationExpanded}
                className="ml-auto"
              />
            </button>
          </div>
          {confirmationExpanded ? (
            <div
              id={`${summary.value}-confirmation-panel`}
              className="grid gap-3 border-t border-dashed pt-3 sm:grid-cols-2"
            >
              <Field label="確認者" htmlFor={`${summary.value}-confirmed-by`}>
                <ReceiptNoteUserSelect
                  id={`${summary.value}-confirmed-by`}
                  name={`${summary.value}-confirmed-by`}
                  users={users}
                  value={confirmedBy}
                  disabled={disabled}
                  onChange={(value) =>
                    onConfirmationChange(summary.value, { confirmedBy: value })
                  }
                />
              </Field>
              <Field label="確認日" htmlFor={`${summary.value}-confirmed-date`}>
                <Input
                  id={`${summary.value}-confirmed-date`}
                  name={`${summary.value}-confirmed-date`}
                  type="date"
                  value={confirmation.date}
                  disabled={disabled}
                  onChange={(event) =>
                    onConfirmationChange(summary.value, {
                      date: event.target.value,
                    })
                  }
                />
              </Field>
            </div>
          ) : null}
        </fieldset>
      </CardContent>
    </Card>
  );
}

function AccordionChevron({
  expanded,
  className,
}: {
  expanded: boolean;
  className?: string;
}) {
  return (
    <ChevronDown
      className={cn(
        "size-4 shrink-0 text-muted-foreground transition-transform",
        expanded && "rotate-180",
        className,
      )}
      aria-hidden="true"
    />
  );
}

function ReceiptNoteRowItem({
  row,
  summaryValue,
  index,
  users,
  disabled,
  expanded,
  onToggle,
  onAmountDraftChange,
  onAmountChange,
  onReceivedChange,
  onCategoryChange,
  onUserDraftChange,
  onUserChange,
  onDeleteRow,
}: {
  row: ReceiptNoteRow;
  summaryValue: ReceiptNoteCategory;
  index: number;
  users: ReceiptNoteUser[];
  disabled: boolean;
  expanded: boolean;
  onToggle: () => void;
  onAmountDraftChange: (rowKey: string, amount: number) => void;
  onAmountChange: (row: ReceiptNoteRow, amount: number) => void;
  onReceivedChange: (row: ReceiptNoteRow, checked: boolean) => void;
  onCategoryChange: (row: ReceiptNoteRow, category: ReceiptNoteCategory) => void;
  onUserDraftChange: (rowKey: string, userName: string) => void;
  onUserChange: (row: ReceiptNoteRow, userName: string) => void;
  onDeleteRow: (row: ReceiptNoteRow) => void;
}) {
  const panelId = `${summaryValue}-${index}-receipt-panel`;

  return (
    <div
      className={cn(
        "grid gap-3 rounded-md border p-3 transition-colors",
        row.received ? "border-primary/45 bg-primary/10" : "bg-background/70",
      )}
    >
      {/* サマリー行 */}
      <div className="flex min-w-0 items-center gap-3">
        <input
          type="checkbox"
          className="chalk-checkbox size-5 shrink-0"
          checked={row.received}
          disabled={disabled}
          aria-label={`${row.user.name} を受領完了にする`}
          onChange={(event) => onReceivedChange(row, event.target.checked)}
        />
        <button
          type="button"
          className="flex min-h-11 min-w-0 flex-1 items-center gap-2 text-left"
          aria-expanded={expanded}
          aria-controls={panelId}
          onClick={onToggle}
        >
          <span className="min-w-0 flex-1 truncate font-semibold">
            {row.user.name}
          </span>
          {row.isManual ? <Badge variant="outline">追加</Badge> : null}
          <span className="shrink-0 font-bold tabular-nums">
            {formatCurrency(row.amount)}
          </span>
          <AccordionChevron expanded={expanded} />
        </button>
      </div>
      {/* 編集パネル */}
      {expanded ? (
        <div
          id={panelId}
          className="grid gap-3 border-t border-dashed pt-3"
        >
          <div className="grid gap-3 sm:grid-cols-3">
            <Field
              label="カテゴリー"
              htmlFor={`${summaryValue}-${index}-receipt-category`}
            >
              <ReceiptNoteCategorySelect
                id={`${summaryValue}-${index}-receipt-category`}
                value={row.category}
                disabled={disabled}
                onChange={(category) => onCategoryChange(row, category)}
              />
            </Field>
            {row.category === "other" ? (
              <Field
                label="タイトル"
                htmlFor={`${summaryValue}-${index}-receipt-title`}
              >
                <Input
                  id={`${summaryValue}-${index}-receipt-title`}
                  name={`${summaryValue}-${index}-receipt-title`}
                  value={row.user.name}
                  disabled={disabled}
                  onChange={(event) =>
                    onUserDraftChange(row.key, event.target.value)
                  }
                  onBlur={(event) => onUserChange(row, event.target.value)}
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
                  value={row.user.name}
                  disabled={disabled}
                  onChange={(userName) => onUserChange(row, userName)}
                />
              </Field>
            )}
            <Field
              label="設定額"
              htmlFor={`${summaryValue}-${index}-receipt-amount`}
            >
              <Input
                id={`${summaryValue}-${index}-receipt-amount`}
                name={`${summaryValue}-${index}-receipt-amount`}
                type="number"
                min={0}
                inputMode="numeric"
                value={row.amount}
                disabled={disabled}
                onChange={(event) =>
                  onAmountDraftChange(row.key, Number(event.target.value))
                }
                onBlur={(event) =>
                  onAmountChange(row, Number(event.target.value))
                }
              />
            </Field>
          </div>
          <Button
            type="button"
            variant="destructive"
            disabled={disabled}
            onClick={() => onDeleteRow(row)}
          >
            <ButtonIcon busy={disabled} icon={Trash2} />
            削除
          </Button>
        </div>
      ) : null}
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
      <div className="rounded-md border bg-background/70 p-4 text-sm text-muted-foreground">
        Calendar イベントは未取得または未登録です
      </div>
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
  icon: Icon,
  tone,
}: {
  label: string;
  value: string;
  icon: React.ElementType;
  tone: "green" | "coin" | "blue";
}) {
  return (
    <Card>
      <CardContent className="flex items-center gap-4 p-5">
        <div
          className={cn(
            "grid size-12 place-items-center rounded-md",
            tone === "green" && "bg-ledger-mint text-primary",
            tone === "coin" && "bg-secondary text-ledger-coin",
            tone === "blue" && "bg-accent/10 text-accent",
          )}
        >
          <Icon className="size-6" aria-hidden="true" />
        </div>
        <div className="min-w-0">
          <p className="text-sm font-semibold text-muted-foreground">{label}</p>
          <p className="text-glow truncate text-2xl font-black tracking-normal">{value}</p>
        </div>
      </CardContent>
    </Card>
  );
}

function DiningBalanceCard({ users }: { users: DashboardData["users"] }) {
  const totalBalance = users.reduce((sum, user) => sum + user.diningBalance, 0);

  return (
    <Card>
      <CardContent className="grid gap-4 p-5">
        <div className="flex items-center gap-4">
          <div className="grid size-12 shrink-0 place-items-center rounded-md bg-ledger-mint text-primary">
            <WalletCards className="size-6" aria-hidden="true" />
          </div>
          <div className="min-w-0">
            <p className="text-sm font-semibold text-muted-foreground">外食残高</p>
            <p className="text-glow truncate text-2xl font-black tracking-normal">
              {users.length ? formatCurrency(totalBalance) : "未取得"}
            </p>
          </div>
        </div>
        <div className="grid gap-2">
          {users.length ? (
            users.map((user) => (
              <div
                key={user.id}
                className="flex min-w-0 items-center justify-between gap-3 rounded-md border bg-background/70 px-3 py-2"
              >
                <div className="flex min-w-0 items-center gap-2">
                  <UserRound className="size-4 shrink-0 text-primary" aria-hidden="true" />
                  <span className="min-w-0 truncate font-semibold">{user.displayName}</span>
                </div>
                <span className="text-glow shrink-0 font-black tabular-nums">
                  {formatCurrency(user.diningBalance)}
                </span>
              </div>
            ))
          ) : (
            <div className="rounded-md border bg-background/70 px-3 py-2 text-sm font-semibold text-muted-foreground">
              実データ未取得
            </div>
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
        未設定
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
        <CardTitle>手動追加</CardTitle>
        <CardDescription>支出・旅行費用</CardDescription>
      </CardHeader>
      <CardContent className="grid gap-4">
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="支払い者" htmlFor="payer">
            <Input
              id="payer"
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
                onChange((current) => ({
                  ...current,
                  category: value,
                  storeName:
                    value === "旅行費用" && current.storeName === "手動入力"
                      ? "旅行費用"
                      : current.storeName,
                }))
              }
            />
          </Field>
          <Field label="金額" htmlFor="amount">
            <Input
              id="amount"
              type="number"
              min={0}
              inputMode="numeric"
              value={draft.amount}
              onChange={(event) =>
                onChange((current) => ({
                  ...current,
                  amount: Number(event.target.value),
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
