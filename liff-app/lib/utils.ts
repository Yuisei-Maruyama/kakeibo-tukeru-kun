import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export type ExpenseCategory = "外食費用" | "買い物費用" | "旅行費用";

export type Expense = {
  id: string;
  date: string;
  category: ExpenseCategory;
  payer: string;
  amount: number;
  storeName: string;
  memo?: string;
};

export type ScheduleInput = {
  participants: string;
  title: string;
  date: string;
  startTime: string;
  endTime: string;
};

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatCurrency(value: number) {
  return new Intl.NumberFormat("ja-JP", {
    style: "currency",
    currency: "JPY",
    maximumFractionDigits: 0,
  }).format(Number.isFinite(value) ? value : 0);
}

export function formatShortDate(value: string) {
  if (!value) {
    return "";
  }

  return new Intl.DateTimeFormat("ja-JP", {
    month: "2-digit",
    day: "2-digit",
  }).format(new Date(`${value}T00:00:00+09:00`));
}

export function toCommandDate(value: string) {
  if (!value) {
    return "";
  }

  const [year, month, day] = value.split("-");
  return `${Number(year)}/${Number(month)}/${Number(day)}`;
}

export function todayInputValue() {
  const now = new Date();
  const parts = new Intl.DateTimeFormat("ja-JP", {
    timeZone: "Asia/Tokyo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(now);
  const year = parts.find((part) => part.type === "year")?.value ?? "2026";
  const month = parts.find((part) => part.type === "month")?.value ?? "01";
  const day = parts.find((part) => part.type === "day")?.value ?? "01";
  return `${year}-${month}-${day}`;
}

function toCommandToken(value: string, fallback: string) {
  const normalized = value.trim().replace(/\s+/g, "・");
  return normalized || fallback;
}

export function buildAddExpenseCommand(expense: Omit<Expense, "id">) {
  const date = toCommandDate(expense.date);
  const content = toCommandToken(expense.storeName, "手動入力");
  const memo = expense.memo ? toCommandToken(expense.memo, "") : "";

  if (expense.category === "旅行費用") {
    return ["@旅行", expense.payer, expense.amount, content, date, memo]
      .filter(Boolean)
      .join(" ");
  }

  return [
    "@追加",
    expense.payer,
    expense.category,
    expense.amount,
    date,
    content,
    memo,
  ]
    .filter(Boolean)
    .join(" ");
}

export function buildDeleteExpenseCommand(expense: Omit<Expense, "id">) {
  return `@削除 ${expense.payer} ${expense.category} ${expense.amount} ${toCommandDate(
    expense.date,
  )}`.trim();
}

export function buildUpdateExpenseCommands(before: Expense, after: Expense) {
  return [buildDeleteExpenseCommand(before), buildAddExpenseCommand(after)];
}

export function buildScheduleCommand(input: ScheduleInput) {
  return [
    "@予定",
    input.participants,
    input.title,
    toCommandDate(input.date),
    input.startTime,
    input.endTime,
  ]
    .filter(Boolean)
    .join(" ");
}

export function buildBudgetCommand(value: number) {
  return `@予算 ${value}`;
}
