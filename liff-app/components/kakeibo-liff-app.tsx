"use client";

import * as React from "react";
import {
  Banknote,
  CalendarDays,
  Camera,
  ChartNoAxesCombined,
  CheckCircle2,
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
  buildAddExpenseCommand,
  buildBudgetCommand,
  buildDeleteExpenseCommand,
  buildScheduleCommand,
  buildUpdateExpenseCommands,
  type Expense,
  type ExpenseCategory,
  cn,
  formatCurrency,
  formatShortDate,
  todayInputValue,
} from "@/lib/utils";
import type { DashboardData } from "@/types/dashboard";

type DraftExpense = Omit<Expense, "id">;

const categories: ExpenseCategory[] = ["外食費用", "買い物費用", "旅行費用"];

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
});

const commandTiles = [
  { label: "ヘルプ", command: "@ヘルプ", icon: CircleHelp },
  { label: "省略", command: "@省略", icon: ListChecks },
  { label: "残高", command: "@残高", icon: WalletCards },
  { label: "集計", command: "@集計", icon: ChartNoAxesCombined },
  { label: "履歴", command: "@履歴", icon: ClipboardList },
  { label: "サブスク一覧", command: "@サブスク一覧", icon: RefreshCw },
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
  const [toast, setToast] = React.useState("フォームで既存 bot コマンドを送信できます");
  const [dashboard, setDashboard] = React.useState<DashboardData | null>(null);
  const [dashboardMonth, setDashboardMonth] = React.useState(
    todayInputValue().slice(0, 7),
  );
  const [isLoadingDashboard, setIsLoadingDashboard] = React.useState(false);
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
  const [reportMonth, setReportMonth] = React.useState("2026/6");

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
  const liveDiningBalance =
    dashboard?.source === "live"
      ? dashboard.users.reduce((sum, user) => sum + user.diningBalance, 0)
      : Math.max(budget - totals.dining, 0);
  const calendarEvents = dashboard?.calendarEvents ?? [];
  const subscriptions = dashboard?.subscriptions ?? [];
  const rent = dashboard?.rent ?? null;

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
        setToast(result.message);
      });
    } catch (error) {
      setToast(error instanceof Error ? error.message : "画像登録に失敗しました");
    } finally {
      setIsAnalyzingImage(false);
    }
  }

  async function submitExpense() {
    const nextExpense = {
      ...draftExpense,
      id: `expense-${Date.now()}`,
      amount: Number(draftExpense.amount),
    };
    setExpenses((current) => [nextExpense, ...current]);
    await sendCommands([buildAddExpenseCommand(nextExpense)], "支出登録コマンドを送信しました");
  }

  async function deleteExpense(expense: Expense) {
    setExpenses((current) => current.filter((item) => item.id !== expense.id));
    await sendCommands([buildDeleteExpenseCommand(expense)], "削除コマンドを送信しました");
  }

  async function updateExpense(before: Expense, after: Expense) {
    setExpenses((current) =>
      current.map((item) => (item.id === before.id ? after : item)),
    );
    await sendCommands(
      buildUpdateExpenseCommands(before, after),
      "更新用コマンドを送信しました",
    );
  }

  return (
    <main className="ledger-grid min-h-dvh bg-background px-3 pb-[calc(6.75rem+env(safe-area-inset-bottom))] pt-[env(safe-area-inset-top)] text-foreground">
      <div className="mx-auto flex w-full max-w-md flex-col gap-4">
        <header className="sticky top-0 z-30 -mx-3 border-b bg-background/95 px-3 py-3 backdrop-blur-xl">
          <div className="mx-auto flex w-full max-w-md items-center justify-between gap-3">
            <div className="flex min-w-0 items-center gap-3">
              <div className="grid size-11 shrink-0 place-items-center rounded-md bg-primary text-primary-foreground shadow-ledger">
                <ReceiptText className="size-6" aria-hidden="true" />
              </div>
              <div className="min-w-0">
                <h1 className="truncate text-xl font-black leading-tight tracking-normal">
                  家計ぼっと LIFF
                </h1>
                <p className="truncate text-xs font-semibold text-muted-foreground">
                  {liffSession.profile?.displayName ?? "LINE 家計簿"}
                </p>
              </div>
            </div>

            <div className="flex shrink-0 items-center gap-2">
              <Badge
                variant={dashboard?.source === "live" ? "default" : "outline"}
                className="hidden min-h-8 sm:inline-flex"
              >
                {dashboard?.source === "live" ? "実データ" : "プレビュー"}
              </Badge>
              <Button
                type="button"
                variant="outline"
                size="icon"
                aria-label="データを更新"
                disabled={isLoadingDashboard}
                onClick={() => void loadDashboard()}
              >
                {isLoadingDashboard ? (
                  <Loader2 className="animate-spin" aria-hidden="true" />
                ) : (
                  <RefreshCw aria-hidden="true" />
                )}
                更新
              </Button>
              <Button
                type="button"
                variant="outline"
                size="icon"
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
                <CardHeader>
                  <CardTitle>基本操作</CardTitle>
                  <CardDescription>docs の主要コマンド</CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                    {commandTiles.map((tile) => (
                      <Button
                        key={tile.command}
                        type="button"
                        variant="outline"
                        className="h-14 justify-start"
                        disabled={isSending}
                        onClick={() =>
                          sendCommands([tile.command], `${tile.label} を送信しました`)
                        }
                      >
                        <tile.icon aria-hidden="true" />
                        <span>{tile.label}</span>
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
                    <Field label="表示月" htmlFor="dashboard-month">
                      <Input
                        id="dashboard-month"
                        type="month"
                        value={dashboardMonth}
                        onChange={(event) => setDashboardMonth(event.target.value)}
                      />
                    </Field>
                    <div className="rounded-md border bg-background/70 p-4">
                      <p className="text-sm font-semibold text-muted-foreground">
                        月間支出
                      </p>
                      <p className="mt-1 text-3xl font-black">
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
            <div className="grid gap-5 lg:grid-cols-[0.95fr_1.05fr]">
              <Card>
                <CardHeader>
                  <CardTitle>画像で追加</CardTitle>
                  <CardDescription>レシート・支払い画面</CardDescription>
                </CardHeader>
                <CardContent className="flex flex-col gap-4">
                  <label className="flex min-h-56 cursor-pointer flex-col items-center justify-center gap-3 rounded-lg border border-dashed border-primary/50 bg-ledger-mint/45 p-4 text-center transition-colors hover:bg-ledger-mint">
                    {receiptImageUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={receiptImageUrl}
                        alt="選択したレシート"
                        className="max-h-64 w-full rounded-md object-contain"
                      />
                    ) : (
                      <>
                        <ImagePlus className="size-10 text-primary" aria-hidden="true" />
                        <span className="font-semibold">写真を選択</span>
                      </>
                    )}
                    <Input
                      className="sr-only"
                      type="file"
                      accept="image/*"
                      capture="environment"
                      onChange={(event) => {
                        const file = event.target.files?.[0];
                        if (!file) {
                          return;
                        }
                        if (receiptImageUrl) {
                          URL.revokeObjectURL(receiptImageUrl);
                        }
                        setReceiptFile(file);
                        setReceiptImageUrl(URL.createObjectURL(file));
                        setToast(`${file.name} を選択しました`);
                      }}
                    />
                  </label>
                  <div className="grid gap-3 sm:grid-cols-2">
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
                    <Button
                      type="button"
                      variant="outline"
                      onClick={() =>
                        setDraftExpense((current) => ({
                          ...current,
                          storeName:
                            current.storeName === "手動入力"
                              ? "画像確認後に入力"
                              : current.storeName,
                        }))
                      }
                    >
                      <Edit3 aria-hidden="true" />
                      手動へ反映
                    </Button>
                  </div>
                </CardContent>
              </Card>

              <ExpenseForm
                draft={draftExpense}
                disabled={isSending}
                onChange={setDraftExpense}
                onSubmit={submitExpense}
              />
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
                      disabled={isSending}
                      onClick={() =>
                        sendCommands([`@履歴 ${reportMonth}`], "履歴を送信しました")
                      }
                    >
                      <ClipboardList aria-hidden="true" />
                      履歴
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      disabled={isSending}
                      onClick={() =>
                        sendCommands([`@集計 ${reportMonth}`], "集計を送信しました")
                      }
                    >
                      <ChartNoAxesCombined aria-hidden="true" />
                      集計
                    </Button>
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle>更新・削除</CardTitle>
                  <CardDescription>
                    {dashboard?.source === "live"
                      ? "Firestore の支出履歴"
                      : "支出コマンド"}
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="grid gap-3">
                    {expenses.map((expense) => (
                      <ExpenseRow
                        key={expense.id}
                        expense={expense}
                        disabled={isSending}
                        onDelete={deleteExpense}
                        onUpdate={updateExpense}
                      />
                    ))}
                  </div>
                </CardContent>
              </Card>
            </div>
          </TabsContent>
          ) : null}

          {activeTab === "plans" ? (
          <TabsContent value="plans">
            <div className="grid gap-5 lg:grid-cols-3">
              <Card className="lg:col-span-2">
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
                    disabled={isSending}
                    onClick={() =>
                      sendCommands(
                        [buildScheduleCommand(schedule)],
                        "予定登録コマンドを送信しました",
                      )
                    }
                  >
                    <CalendarDays aria-hidden="true" />
                    予定登録
                  </Button>
                </CardContent>
              </Card>

              <div className="grid gap-5">
                <Card>
                  <CardHeader>
                    <CardTitle>Calendar</CardTitle>
                    <CardDescription>表示月の予定</CardDescription>
                  </CardHeader>
                  <CardContent>
                    <CalendarEventList events={calendarEvents.slice(0, 5)} />
                  </CardContent>
                </Card>
                <ActionGroup
                  title="サブスク"
                  description="定期支払い"
                  actions={[
                    ["一覧", "@サブスク一覧", RefreshCw],
                    ["追加", "@サブスク追加", Plus],
                    ["変更", "@サブスク変更", Edit3],
                    ["削除", "@サブスク削除", Trash2],
                  ]}
                  disabled={isSending}
                  onSend={sendCommands}
                />
                <ActionGroup
                  title="家賃"
                  description="月末自動登録"
                  actions={[
                    ["追加", "@家賃追加", JapaneseYen],
                    ["変更", "@家賃変更", Edit3],
                  ]}
                  disabled={isSending}
                  onSend={sendCommands}
                />
              </div>
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
                    disabled={isSending}
                    onClick={() =>
                      sendCommands([buildBudgetCommand(budget)], "予算変更を送信しました")
                    }
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
                    disabled={isSending}
                    onClick={() => sendCommands(["@初期設定"], "初期設定を送信しました")}
                  >
                    <UserRound aria-hidden="true" />
                    初期設定
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    disabled={isSending}
                    onClick={() => sendCommands(["@設定変更"], "設定変更を送信しました")}
                  >
                    <Settings aria-hidden="true" />
                    設定変更
                  </Button>
                  <Button
                    type="button"
                    variant="secondary"
                    disabled={isSending}
                    onClick={() => sendCommands(["@残高"], "残高を送信しました")}
                  >
                    <WalletCards aria-hidden="true" />
                    残高
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    disabled={isSending}
                    onClick={() => sendCommands(["@キャンセル"], "キャンセルを送信しました")}
                  >
                    <XCircle aria-hidden="true" />
                    キャンセル
                  </Button>
                </CardContent>
              </Card>

              <Card className="lg:col-span-2">
                <CardHeader>
                  <CardTitle>サブスク</CardTitle>
                  <CardDescription>Firestore の定期支払い</CardDescription>
                </CardHeader>
                <CardContent className="grid gap-3 sm:grid-cols-2">
                  {subscriptions.map((subscription) => (
                    <div
                      key={subscription.id}
                      className="rounded-md border bg-background/70 p-4"
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <h3 className="truncate font-bold">
                            {subscription.serviceName}
                          </h3>
                          <p className="text-sm text-muted-foreground">
                            {subscription.payerName} / {subscription.intervalLabel}
                          </p>
                        </div>
                        <Badge variant="secondary">
                          {formatCurrency(subscription.amount)}
                        </Badge>
                      </div>
                    </div>
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
                className="min-h-14 flex-col gap-1 rounded-md px-1 py-2 text-[0.68rem] leading-none active:scale-[0.98] [&_svg]:size-5"
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
}: {
  events: NonNullable<DashboardData["calendarEvents"]>;
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
        <article
          key={event.id}
          className="grid gap-2 rounded-md border bg-background/70 p-3"
        >
          <div className="flex items-start justify-between gap-3">
            <h3 className="min-w-0 truncate font-bold">{event.title}</h3>
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
          <p className="flex items-center gap-2 text-sm text-muted-foreground">
            <Clock3 className="size-4" aria-hidden="true" />
            {event.date} / {event.timeLabel}
          </p>
        </article>
      ))}
    </div>
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
          <p className="truncate text-2xl font-black tracking-normal">{value}</p>
        </div>
      </CardContent>
    </Card>
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
    <div className="grid gap-2">
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
      className="h-12 w-full rounded-md border border-input bg-card px-3 py-2 text-base shadow-sm md:text-sm"
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
        <Field label="店舗・内容" htmlFor="store">
          <Input
            id="store"
            value={draft.storeName}
            onChange={(event) =>
              onChange((current) => ({ ...current, storeName: event.target.value }))
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
              <DialogDescription>削除と追加のコマンドを順番に送ります</DialogDescription>
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
              <Field label="店舗・内容" htmlFor={`${expense.id}-store`}>
                <Input
                  id={`${expense.id}-store`}
                  value={draft.storeName}
                  onChange={(event) =>
                    setDraft((current) => ({
                      ...current,
                      storeName: event.target.value,
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

function ActionGroup({
  title,
  description,
  actions,
  disabled,
  onSend,
}: {
  title: string;
  description: string;
  actions: [string, string, React.ElementType][];
  disabled: boolean;
  onSend: (commands: string[], successMessage: string) => void;
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>{title}</CardTitle>
        <CardDescription>{description}</CardDescription>
      </CardHeader>
      <CardContent className="grid gap-3">
        {actions.map(([label, command, Icon]) => (
          <Button
            key={command}
            type="button"
            variant={label === "削除" ? "destructive" : "outline"}
            disabled={disabled}
            onClick={() => onSend([command], `${label} を送信しました`)}
          >
            <Icon aria-hidden="true" />
            {label}
          </Button>
        ))}
      </CardContent>
    </Card>
  );
}
