import { Request, Response } from '@google-cloud/functions-framework';
import { getAllUsers, getExpensesSummary, getSettings, resetAllDiningBalances } from '../services/firestore.js';
import { pushMessage, createReportMessage } from '../services/line.js';
import { ReportData, ReportType, UserExpenses, MonthlySummary } from '../types/index.js';

/**
 * 定期レポートハンドラー
 */
export async function handleScheduledReport(req: Request, res: Response): Promise<void> {
  try {
    const accessToken = process.env.LINE_CHANNEL_ACCESS_TOKEN || '';
    const settings = await getSettings();

    if (!settings || !settings.lineGroupId) {
      console.error('Settings not found or lineGroupId not set');
      res.status(500).json({ error: 'Settings not configured' });
      return;
    }

    const reportType: ReportType = req.body?.reportType || 'mid-month';
    const now = new Date();

    // レポート期間を決定
    const period = getReportPeriod(now, reportType);

    // 支出データを集計
    const reportData = await generateReportData(period.start, period.end, reportType);

    // レポートメッセージを生成
    const message = createReportMessage(reportData);

    // LINEグループにプッシュ通知
    await pushMessage(settings.lineGroupId, message, accessToken);

    // 月末レポートの場合は月次リセットを実行
    if (reportType === 'end-month' && isLastDayOfMonth(now)) {
      await resetAllDiningBalances(settings.monthlyBudget);
      console.log('Monthly balance reset completed');
    }

    res.status(200).json({
      status: 'ok',
      reportSent: true,
      period: {
        start: formatDate(period.start),
        end: formatDate(period.end),
      },
    });
  } catch (error) {
    console.error('Scheduled report error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
}

/**
 * レポート期間を取得
 */
function getReportPeriod(date: Date, reportType: ReportType): { start: Date; end: Date } {
  const year = date.getFullYear();
  const month = date.getMonth();

  if (reportType === 'mid-month') {
    // 1日〜15日
    return {
      start: new Date(year, month, 1),
      end: new Date(year, month, 15, 23, 59, 59, 999),
    };
  } else {
    // 16日〜月末
    return {
      start: new Date(year, month, 16),
      end: new Date(year, month + 1, 0, 23, 59, 59, 999),
    };
  }
}

/**
 * 月末かどうかを判定
 */
function isLastDayOfMonth(date: Date): boolean {
  const tomorrow = new Date(date);
  tomorrow.setDate(date.getDate() + 1);
  return tomorrow.getMonth() !== date.getMonth();
}

/**
 * レポートデータを生成
 */
async function generateReportData(
  startDate: Date,
  endDate: Date,
  reportType: ReportType
): Promise<ReportData> {
  const users = await getAllUsers();
  const settings = await getSettings();
  const expensesSummary = await getExpensesSummary(startDate, endDate);

  // ユーザー別・カテゴリー別の支出を集計
  const diningExpenses: UserExpenses[] = [];
  const shoppingExpenses: UserExpenses[] = [];

  for (const user of users) {
    const userExpenses = expensesSummary.get(user.id);

    // 外食費用
    const diningTotal = userExpenses?.get('外食費用') || 0;
    diningExpenses.push({
      userId: user.id,
      userName: user.displayName,
      total: diningTotal,
      balance: user.diningBalance,
    });

    // 買い物費用
    const shoppingTotal = userExpenses?.get('買い物費用') || 0;
    shoppingExpenses.push({
      userId: user.id,
      userName: user.displayName,
      total: shoppingTotal,
    });
  }

  // 現在の外食担当者を判定
  let currentPayer: string | undefined;
  if (settings) {
    const day = startDate.getDate();
    if (day <= 15) {
      const payerUser = users.find(u => u.id === settings.firstHalfPayerId);
      currentPayer = payerUser?.displayName;
    } else {
      const payerUser = users.find(u => u.id === settings.secondHalfPayerId);
      currentPayer = payerUser?.displayName;
    }
  }

  const reportData: ReportData = {
    period: {
      start: formatDate(startDate),
      end: formatDate(endDate),
    },
    diningExpenses,
    shoppingExpenses,
    currentPayer,
  };

  // 月末の場合は月間サマリーを追加
  if (reportType === 'end-month') {
    reportData.monthlySummary = await generateMonthlySummary(users, settings?.monthlyBudget || 50000);
  }

  return reportData;
}

/**
 * 月間サマリーを生成
 */
async function generateMonthlySummary(
  users: Array<{ id: string; displayName: string; diningBalance: number }>,
  monthlyBudget: number
): Promise<MonthlySummary> {
  const now = new Date();
  const year = now.getFullYear();
  const month = now.getMonth();
  const monthStart = new Date(year, month, 1);
  const monthEnd = new Date(year, month + 1, 0, 23, 59, 59, 999);

  // 月間の支出を取得
  const expensesSummary = await getExpensesSummary(monthStart, monthEnd);

  // 外食費用の貯金額を計算
  const diningSavings = users.map(user => {
    const userExpenses = expensesSummary.get(user.id);
    const diningUsed = userExpenses?.get('外食費用') || 0;
    const savings = monthlyBudget - diningUsed;

    return {
      userId: user.id,
      userName: user.displayName,
      used: diningUsed,
      savings,
    };
  });

  // 買い物費用の精算を計算
  const shoppingTotals = users.map(user => {
    const userExpenses = expensesSummary.get(user.id);
    const shoppingTotal = userExpenses?.get('買い物費用') || 0;

    return {
      userId: user.id,
      userName: user.displayName,
      total: shoppingTotal,
    };
  });

  // 精算額を計算
  const amounts = shoppingTotals.map(u => u.total);
  const difference = Math.abs(amounts[0] - amounts[1]);
  const refundAmount = Math.round(difference / 2);

  let refundFrom: string | undefined;
  let refundTo: string | undefined;

  if (refundAmount > 0) {
    if (amounts[0] < amounts[1]) {
      refundFrom = shoppingTotals[0].userName;
      refundTo = shoppingTotals[1].userName;
    } else {
      refundFrom = shoppingTotals[1].userName;
      refundTo = shoppingTotals[0].userName;
    }
  }

  return {
    diningSavings,
    shoppingSettlement: {
      users: shoppingTotals,
      difference,
      refundFrom,
      refundTo,
      refundAmount,
    },
  };
}

/**
 * 日付をフォーマット（YYYY-MM-DD）
 */
function formatDate(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}
