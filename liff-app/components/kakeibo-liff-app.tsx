"use client";

import * as React from "react";
import {
  Banknote,
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
  LineChart,
  ListChecks,
  Loader2,
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
import type { DashboardData } from "@/types/dashboard";

type DraftExpense = Omit<Expense, "id">;
type AppCalendarEvent = DashboardData["calendarEvents"][number];
type AppSubscription = DashboardData["subscriptions"][number];
type DraftSubscription = Pick<
  AppSubscription,
  "payerName" | "serviceName" | "amount" | "startDate" | "intervalLabel"
>;
type DraftRent = NonNullable<DashboardData["rent"]>;
type ExpenseCategoryFilter = "all" | ExpenseCategory;
type ReportMode = "history" | "summary";
type ApiResponse<T> = {
  status: "ok" | "error";
  message: string;
} & T;
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
  category: "外食費用",
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
        setToast(data.message);
        setCalendarEvents(data.calendarEvents);
        setSubscriptions(data.subscriptions);
        setRent(data.rent);
        setRentDraft(data.rent ?? defaultRentDraft());

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
  const liveDiningBalance =
    dashboard?.source === "live"
      ? dashboard.users.reduce((sum, user) => sum + user.diningBalance, 0)
      : Math.max(budget - totals.dining, 0);

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
        expense?: Expense;
      };

      if (!response.ok || result.status === "error" || !result.expense) {
        throw new Error(result.message);
      }

      React.startTransition(() => {
        setExpenses((current) => [result.expense!, ...current]);
        setDashboard(null);
        setReceiptFile(null);
        setReceiptImageUrl(null);
        setToast(result.message);
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

    setIsMutating(true);

    try {
      const result = await requestJson<{ expense: Expense; diningBalance?: number }>(
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
        setDashboard(null);
        setDraftExpense(defaultDraft());
        setReportMode("history");
        setActiveTab("history");
        setToast(result.message);
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
      const result = await requestJson<{ expense: Expense; diningBalance?: number }>(
        `/api/expenses/${encodeURIComponent(expense.id)}`,
        {
          method: "DELETE",
        },
      );

      React.startTransition(() => {
        setExpenses((current) => current.filter((item) => item.id !== expense.id));
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
      const result = await requestJson<{ expense: Expense; diningBalance?: number }>(
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
        setDashboard(null);
        setToast(result.message);
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
      });
    } catch (error) {
      setToast(error instanceof Error ? error.message : "予算変更に失敗しました");
    } finally {
      setIsMutating(false);
    }
  }

  return (
    <main className="ledger-grid min-h-dvh bg-background px-3 pb-[calc(6.75rem+env(safe-area-inset-bottom))] pt-[env(safe-area-inset-top)] text-foreground">
      <div className="mx-auto flex w-full max-w-md flex-col gap-4">
        <header className="sticky top-0 z-30 -mx-3 border-b bg-background/95 px-3 py-2 backdrop-blur-xl">
          <div className="mx-auto flex w-full max-w-md items-center justify-between gap-2">
            <div className="flex min-w-0 items-center gap-2">
              <div className="grid size-10 shrink-0 place-items-center rounded-md bg-primary text-primary-foreground shadow-ledger">
                <ReceiptText className="size-5" aria-hidden="true" />
              </div>
              <div className="min-w-0">
                <h1 className="truncate text-lg font-black leading-tight tracking-normal">
                  家計ぼっと
                </h1>
              </div>
            </div>

            <div className="flex shrink-0 items-center gap-2">
              <Button
                type="button"
                variant="outline"
                size="icon"
                className="size-10"
                aria-label="データを更新"
                disabled={isLoadingDashboard}
                onClick={() => void loadDashboard()}
              >
                {isLoadingDashboard ? (
                  <Loader2 className="animate-spin" aria-hidden="true" />
                ) : (
                  <RefreshCw aria-hidden="true" />
                )}
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
          className="rounded-md border bg-card/95 px-4 py-3 text-sm shadow-ledger"
        >
          <div className="flex items-start gap-2">
            <CheckCircle2 className="size-4 text-primary" aria-hidden="true" />
            <div className="min-w-0">
              <p className="break-words font-semibold">{toast}</p>
              <p className="mt-1 text-xs text-muted-foreground">
                {isInitializing ? "LIFFを確認中" : liffSession.message}
              </p>
            </div>
          </div>
        </section>

        <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
          {activeTab === "home" ? (
          <TabsContent value="home">
            <div className="grid gap-4">
              <section className="rounded-lg border bg-card p-4 shadow-ledger">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-sm font-semibold text-muted-foreground">
                      今すぐ記録
                    </p>
                    <h2 className="mt-1 text-2xl font-black leading-tight">
                      レシートを撮るだけ
                    </h2>
                  </div>
                  <Badge variant={dashboard?.source === "live" ? "default" : "outline"}>
                    {dashboard?.source === "live" ? "実データ" : "プレビュー"}
                  </Badge>
                </div>
                <div className="mt-4 grid grid-cols-3 gap-2">
                  <Button
                    type="button"
                    className="h-16 flex-col gap-1 px-2 text-xs active:scale-[0.98] [&_svg]:size-5"
                    onClick={() => setActiveTab("add")}
                  >
                    <Camera className="size-5" aria-hidden="true" />
                    撮影
                  </Button>
                  <Button
                    type="button"
                    variant="secondary"
                    className="h-16 flex-col gap-1 px-2 text-xs active:scale-[0.98] [&_svg]:size-5"
                    onClick={() => setActiveTab("add")}
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
              </section>

              <section className="grid gap-3">
                <MetricCard
                  label="外食残高"
                  value={formatCurrency(liveDiningBalance)}
                  icon={WalletCards}
                  tone="green"
                />
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
                        <tile.icon aria-hidden="true" />
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
                <CardContent className="grid gap-4 lg:grid-cols-[1fr_1.2fr]">
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
                          className="text-glow flex h-12 min-w-0 items-center justify-center rounded-md border border-input bg-card px-3 text-base font-bold shadow-[inset_0_0_18px_rgba(45,212,191,0.05)]"
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
                      {isAnalyzingImage ? (
                        <Loader2 className="animate-spin" aria-hidden="true" />
                      ) : (
                        <Camera aria-hidden="true" />
                      )}
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
                      {isLoadingDashboard && reportMode === "history" ? (
                        <Loader2 className="animate-spin" aria-hidden="true" />
                      ) : (
                        <ClipboardList aria-hidden="true" />
                      )}
                      履歴
                    </Button>
                    <Button
                      type="button"
                      variant={reportMode === "summary" ? "default" : "outline"}
                      disabled={isLoadingDashboard}
                      onClick={() => showReport("summary")}
                    >
                      {isLoadingDashboard && reportMode === "summary" ? (
                        <Loader2 className="animate-spin" aria-hidden="true" />
                      ) : (
                        <ChartNoAxesCombined aria-hidden="true" />
                      )}
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
                <CardContent>
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
                    <CalendarDays aria-hidden="true" />
                    予定登録
                  </Button>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle>Calendar</CardTitle>
                  <CardDescription>Google Calendar の予定</CardDescription>
                </CardHeader>
                <CardContent>
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
                <CardContent className="grid gap-4">
                  <div className="grid gap-3">
                    {(dashboard?.users ?? []).map((user) => (
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
                    {dashboard?.users.length === 0 ? (
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
                    <WalletCards aria-hidden="true" />
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
                    <Plus aria-hidden="true" />
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
                      <JapaneseYen aria-hidden="true" />
                      更新
                    </Button>
                    <Button
                      type="button"
                      variant="destructive"
                      disabled={isMutating}
                      onClick={() => void clearRent()}
                    >
                      <Trash2 aria-hidden="true" />
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
                <CardContent className="grid gap-3 sm:grid-cols-2">
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

          <TabsList
            aria-label="主要ナビゲーション"
            className="fixed inset-x-0 bottom-0 z-40 mx-auto grid w-full max-w-md grid-cols-5 gap-1 rounded-none border-t bg-card/95 px-3 pb-[calc(0.75rem+env(safe-area-inset-bottom))] pt-2 shadow-[0_-18px_40px_rgba(18,61,53,0.14)] backdrop-blur-xl"
          >
            {navigationItems.map((item) => (
              <TabsTrigger
                key={item.value}
                value={item.value}
                className="min-h-14 flex-col gap-1 rounded-md border border-transparent px-1 py-2 text-[0.68rem] leading-none transition-[background-color,border-color,box-shadow,color,transform] active:scale-[0.98] data-[state=active]:border-primary/45 data-[state=active]:bg-primary/10 data-[state=active]:text-primary data-[state=active]:shadow-[0_0_18px_rgba(45,212,191,0.28),inset_0_0_16px_rgba(45,212,191,0.10)] data-[state=active]:[text-shadow:0_0_12px_rgba(45,212,191,0.90)] data-[state=active]:[&_svg]:scale-110 data-[state=active]:[&_svg]:drop-shadow-[0_0_8px_rgba(45,212,191,0.95)] [&_svg]:size-5 [&_svg]:transition-[filter,transform]"
              >
                <item.icon className="mr-0 size-5" aria-hidden="true" />
                <span>{item.label}</span>
              </TabsTrigger>
            ))}
          </TabsList>
        </Tabs>
      </div>
    </main>
  );
}

function DataLine({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <span className="text-muted-foreground">{label}</span>
      <span className="truncate font-semibold">{value}</span>
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
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="truncate font-bold">{event.title}</h3>
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
                    <Send aria-hidden="true" />
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
            <Trash2 aria-hidden="true" />
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
  value: ExpenseCategory;
  onChange: (value: ExpenseCategory) => void;
}) {
  return (
    <select
      id={id}
      value={value}
      onChange={(event) => onChange(event.target.value as ExpenseCategory)}
      className="h-12 w-full min-w-0 max-w-full rounded-md border border-input bg-card px-3 py-2 text-base shadow-sm md:text-sm"
    >
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
          <Send aria-hidden="true" />
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
      <div className="flex items-start justify-between gap-3">
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
                  <Send aria-hidden="true" />
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
          <Trash2 aria-hidden="true" />
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
    <article className="grid gap-3 rounded-lg border bg-background/65 p-4 sm:grid-cols-[1fr_auto] sm:items-center">
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
                  <Send aria-hidden="true" />
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
          <Trash2 aria-hidden="true" />
        </Button>
      </div>
    </article>
  );
}
