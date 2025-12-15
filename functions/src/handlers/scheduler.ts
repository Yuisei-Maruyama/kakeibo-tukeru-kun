import { Request, Response } from '@google-cloud/functions-framework';
import { Timestamp } from '@google-cloud/firestore';
import { getAllUsers, getExpensesSummary, getSettings, resetAllDiningBalances, expenseExistsByCalendarEventId, getUserIdByDisplayName, saveExpense, updateDiningBalance, getUser, getAllActiveSubscriptions, getRent } from '../services/firestore.js';
import { pushMessage, createReportMessage } from '../services/line.js';
import { getTodaySchedules, getMonthlyExpenseEvents, createCalendarEvent } from '../services/calendar.js';
import { ReportData, ReportType, UserExpenses, MonthlySummary } from '../types/index.js';
import { getJSTYear, getJSTMonth, getJSTInfo } from '../utils/date.js';

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

    // JST（日本時間）で現在日時を取得
    const jstInfo = getJSTInfo();
    console.log(`Generating ${reportType} report (JST: ${jstInfo.formatted})`);

    const now = new Date(); // getReportPeriodで使用（内部でJST変換）

    // 月末レポートは月末の最終日のみ実行（28-31日スケジュールからの呼び出し対応）
    if (reportType === 'end-month' && !isLastDayOfMonth(now)) {
      console.log('Skipping end-month report: not the last day of month');
      res.status(200).json({ status: 'skipped', reason: 'Not the last day of month' });
      return;
    }

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
export function getReportPeriod(date: Date, reportType: ReportType): { start: Date; end: Date } {
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
export async function generateReportData(
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
 * 毎朝の予定通知ハンドラー
 */
export async function handleDailyScheduleNotification(_req: Request, res: Response): Promise<void> {
  try {
    const accessToken = process.env.LINE_CHANNEL_ACCESS_TOKEN || '';
    const calendarId = process.env.GOOGLE_CALENDAR_ID || '';

    console.log('Daily schedule notification started');
    console.log('Environment variables check:', {
      hasAccessToken: !!accessToken,
      hasCalendarId: !!calendarId,
      calendarIdPrefix: calendarId ? calendarId.substring(0, 10) + '...' : 'undefined'
    });

    const settings = await getSettings();
    console.log('Settings retrieved:', {
      hasSettings: !!settings,
      hasLineGroupId: !!(settings?.lineGroupId),
      lineGroupIdPrefix: settings?.lineGroupId ? settings.lineGroupId.substring(0, 10) + '...' : 'undefined'
    });

    if (!settings || !settings.lineGroupId) {
      const errorMsg = 'Settings not found or lineGroupId not set';
      console.error(errorMsg, {
        settings: settings ? 'exists' : 'null',
        lineGroupId: settings?.lineGroupId || 'not set'
      });
      res.status(500).json({
        error: 'Settings not configured',
        details: errorMsg
      });
      return;
    }

    // JST（日本時間）で今日の日付を取得
    const jstInfo = getJSTInfo();
    const today = new Date(); // カレンダーAPIに渡すためのDate（内部でJST変換される）
    console.log(`Fetching schedules for: ${jstInfo.formatted} (JST)`);

    const schedules = await getTodaySchedules(calendarId, today);
    console.log(`Found ${schedules.length} schedules for today`);

    if (schedules.length === 0) {
      console.log('No schedules for today - skipping notification');
      res.status(200).json({ status: 'ok', message: 'No schedules' });
      return;
    }

    // 予定メッセージを生成
    let message = `📅 本日の予定 (${jstInfo.month}/${jstInfo.day})\n\n`;
    schedules.forEach((schedule, index) => {
      message += `${index + 1}. 👤 ${schedule.userName}\n`;
      message += `   📝 ${schedule.content}\n\n`;
    });

    console.log('Sending notification to LINE group');
    // LINEグループに送信
    await pushMessage(settings.lineGroupId, message, accessToken);

    console.log('Daily schedule notification sent successfully');
    res.status(200).json({
      status: 'ok',
      schedules: schedules.length,
      date: today.toISOString()
    });
  } catch (error) {
    console.error('Daily schedule notification error:', error);
    const errorMsg = error instanceof Error ? error.message : '不明なエラー';
    const errorStack = error instanceof Error ? error.stack : '';
    console.error('Error details:', {
      message: errorMsg,
      stack: errorStack?.substring(0, 500)
    });
    res.status(500).json({
      error: 'Internal server error',
      details: errorMsg
    });
  }
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

/**
 * Googleカレンダー同期ハンドラー
 * Googleカレンダーの当月の支出イベントをFirestoreに同期
 */
export async function handleCalendarSync(_req: Request, res: Response): Promise<void> {
  try {
    const calendarId = process.env.GOOGLE_CALENDAR_ID || '';

    if (!calendarId) {
      console.error('GOOGLE_CALENDAR_ID not set');
      res.status(500).json({ error: 'Calendar ID not configured' });
      return;
    }

    // JST（日本時間）で年月を取得
    const year = getJSTYear();
    const month = getJSTMonth();
    const jstInfo = getJSTInfo();

    console.log(`Starting calendar sync for ${year}/${month} (JST: ${jstInfo.formatted})`);

    // Googleカレンダーから当月の支出イベントを取得
    const expenseEvents = await getMonthlyExpenseEvents(calendarId, year, month);

    let syncedCount = 0;
    let skippedCount = 0;
    let errorCount = 0;

    // 各イベントをFirestoreに同期
    for (const event of expenseEvents) {
      try {
        // カレンダーイベントIDで既存チェック
        const exists = await expenseExistsByCalendarEventId(event.eventId);
        if (exists) {
          console.log(`Event already exists: ${event.eventId}`);
          skippedCount++;
          continue;
        }

        // ユーザー名からユーザーIDを取得
        const userId = await getUserIdByDisplayName(event.userName);
        if (!userId) {
          console.warn(`User not found: ${event.userName}`);
          errorCount++;
          continue;
        }

        // Firestoreに保存
        await saveExpense({
          userId,
          userName: event.userName,
          amount: event.amount,
          category: event.category,
          storeName: event.storeName,
          date: Timestamp.fromDate(new Date(event.date)),
          calendarEventId: event.eventId,
        });

        // 外食費用の場合は残高を更新
        if (event.category === '外食費用') {
          const user = await getUser(userId);
          if (user) {
            const newBalance = user.diningBalance - event.amount;
            await updateDiningBalance(userId, newBalance);
            console.log(`Updated dining balance for ${event.userName}: ${newBalance}`);
          }
        }

        console.log(`Synced event: ${event.eventId} - ${event.userName} ¥${event.amount}`);
        syncedCount++;
      } catch (error) {
        console.error(`Failed to sync event ${event.eventId}:`, error);
        errorCount++;
      }
    }

    console.log(`Calendar sync completed: ${syncedCount} synced, ${skippedCount} skipped, ${errorCount} errors`);

    res.status(200).json({
      status: 'ok',
      synced: syncedCount,
      skipped: skippedCount,
      errors: errorCount,
      total: expenseEvents.length,
    });
  } catch (error) {
    console.error('Calendar sync error:', error);
    const errorMsg = error instanceof Error ? error.message : '不明なエラー';
    res.status(500).json({
      error: 'Internal server error',
      details: errorMsg,
    });
  }
}

/**
 * 月初めサブスク自動登録ハンドラー
 * 毎月1日に実行し、その月のサブスクを全て登録する
 */
export async function handleMonthlySubscriptions(req: Request, res: Response): Promise<void> {
  try {
    const calendarId = process.env.GOOGLE_CALENDAR_ID || '';
    const accessToken = process.env.LINE_CHANNEL_ACCESS_TOKEN || '';

    if (!calendarId) {
      console.error('GOOGLE_CALENDAR_ID not set');
      res.status(500).json({ error: 'Calendar ID not configured' });
      return;
    }

    const settings = await getSettings();
    if (!settings || !settings.lineGroupId) {
      console.error('Settings not found or lineGroupId not set');
      res.status(500).json({ error: 'Settings not configured' });
      return;
    }

    // JST（日本時間）で年月を取得
    const year = getJSTYear();
    const month = getJSTMonth();
    const jstInfo = getJSTInfo();

    console.log(`Starting monthly subscription registration for ${year}/${month} (JST: ${jstInfo.formatted})`);

    // 全アクティブなサブスクを取得
    const subscriptions = await getAllActiveSubscriptions();

    if (subscriptions.length === 0) {
      console.log('No active subscriptions found');
      res.status(200).json({ status: 'ok', registered: 0, message: 'No active subscriptions' });
      return;
    }

    // 対象月の範囲を計算
    const monthStart = new Date(year, month - 1, 1);
    const monthEnd = new Date(year, month, 0); // 月末日

    let registeredCount = 0;
    let errorCount = 0;
    const registeredItems: string[] = [];

    // 各サブスクの該当日を計算して登録
    for (const subscription of subscriptions) {
      try {
        // 該当月の配送/支払い日を算出
        const deliveryDates = calculateDeliveryDatesForMonth(
          subscription.startDate.toDate(),
          subscription.intervalUnit,
          subscription.intervalValue,
          monthStart,
          monthEnd
        );

        if (deliveryDates.length === 0) {
          console.log(`No delivery dates in ${year}/${month} for subscription: ${subscription.serviceName}`);
          continue;
        }

        // 各日付に対して登録
        for (const deliveryDate of deliveryDates) {
          const day = deliveryDate.getDate();
          const dateStr = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;

          // カレンダーに登録（カテゴリーは「買い物費用」固定）
          const calendarEventId = await createCalendarEvent(
            calendarId,
            subscription.payerName,
            subscription.amount,
            '買い物費用',
            subscription.serviceName, // 支払い内容をstoreNameとして使用
            dateStr
          );

          // Firestoreに保存
          await saveExpense({
            userId: subscription.payerUserId,
            userName: subscription.payerName,
            amount: subscription.amount,
            category: '買い物費用',
            storeName: subscription.serviceName,
            date: Timestamp.fromDate(deliveryDate),
            calendarEventId,
          });

          console.log(`Registered subscription: ${subscription.serviceName} - ${subscription.payerName} ¥${subscription.amount} on ${dateStr}`);
          registeredItems.push(`${subscription.serviceName}（${subscription.payerName}・¥${subscription.amount.toLocaleString()}・${month}/${day}）`);
          registeredCount++;
        }
      } catch (error) {
        console.error(`Failed to register subscription ${subscription.id}:`, error);
        errorCount++;
      }
    }

    // LINEに通知を送信
    if (registeredCount > 0) {
      let message = `🔄 サブスク自動登録完了\n`;
      message += `━━━━━━━━━━━━━━━\n\n`;
      message += `${year}年${month}月分のサブスクを登録しました\n\n`;

      registeredItems.forEach(item => {
        message += `✅ ${item}\n`;
      });

      if (errorCount > 0) {
        message += `\n⚠️ ${errorCount}件の登録に失敗しました`;
      }

      await pushMessage(settings.lineGroupId, message, accessToken);
    }

    console.log(`Monthly subscription registration completed: ${registeredCount} registered, ${errorCount} errors`);

    res.status(200).json({
      status: 'ok',
      registered: registeredCount,
      errors: errorCount,
      total: subscriptions.length,
    });
  } catch (error) {
    console.error('Monthly subscription registration error:', error);
    const errorMsg = error instanceof Error ? error.message : '不明なエラー';
    res.status(500).json({
      error: 'Internal server error',
      details: errorMsg,
    });
  }
}

/**
 * 指定月の配送/支払い日を計算
 * @param startDate 開始日
 * @param intervalUnit 間隔単位（week / month）
 * @param intervalValue 間隔数値
 * @param monthStart 対象月の開始日
 * @param monthEnd 対象月の終了日
 * @returns 対象月に該当する配送日の配列
 */
function calculateDeliveryDatesForMonth(
  startDate: Date,
  intervalUnit: 'week' | 'month',
  intervalValue: number,
  monthStart: Date,
  monthEnd: Date
): Date[] {
  const deliveryDates: Date[] = [];

  // 開始日を正規化（時間部分を除去）
  const start = new Date(startDate.getFullYear(), startDate.getMonth(), startDate.getDate());
  const end = new Date(monthEnd.getFullYear(), monthEnd.getMonth(), monthEnd.getDate());

  // 開始日が対象月より後の場合は空配列を返す
  if (start > end) {
    return deliveryDates;
  }

  if (intervalUnit === 'week') {
    // 週単位の計算
    const msPerDay = 24 * 60 * 60 * 1000;
    const intervalDays = intervalValue * 7;

    // 開始日から対象月の範囲内の日付を計算
    let current = new Date(start);

    // 対象月より前の日付は、対象月に入るまでスキップ
    while (current < monthStart) {
      current = new Date(current.getTime() + intervalDays * msPerDay);
    }

    // 対象月内の日付を収集
    while (current <= end) {
      deliveryDates.push(new Date(current));
      current = new Date(current.getTime() + intervalDays * msPerDay);
    }
  } else {
    // 月単位の計算
    let currentYear = start.getFullYear();
    let currentMonth = start.getMonth();
    const startDay = start.getDate();

    // 開始日から対象月の範囲内の日付を計算
    while (true) {
      // 該当月の日付を生成（日付が存在しない場合は月末に調整）
      const daysInMonth = new Date(currentYear, currentMonth + 1, 0).getDate();
      const day = Math.min(startDay, daysInMonth);
      const current = new Date(currentYear, currentMonth, day);

      // 対象月を過ぎたら終了
      if (current > end) {
        break;
      }

      // 対象月内であれば追加
      if (current >= monthStart && current <= end) {
        deliveryDates.push(current);
      }

      // 次の配送月に進む
      currentMonth += intervalValue;
      if (currentMonth >= 12) {
        currentYear += Math.floor(currentMonth / 12);
        currentMonth = currentMonth % 12;
      }

      // 無限ループ防止（開始日が対象月より前で、intervalValueが大きすぎる場合）
      if (currentYear > end.getFullYear() + 1) {
        break;
      }
    }
  }

  return deliveryDates;
}

/**
 * 月初め家賃自動登録ハンドラー
 * 毎月1日に実行し、その月の月末に家賃を登録する
 */
export async function handleMonthlyRent(req: Request, res: Response): Promise<void> {
  try {
    const calendarId = process.env.GOOGLE_CALENDAR_ID || '';
    const accessToken = process.env.LINE_CHANNEL_ACCESS_TOKEN || '';

    if (!calendarId) {
      console.error('GOOGLE_CALENDAR_ID not set');
      res.status(500).json({ error: 'Calendar ID not configured' });
      return;
    }

    const settings = await getSettings();
    if (!settings || !settings.lineGroupId) {
      console.error('Settings not found or lineGroupId not set');
      res.status(500).json({ error: 'Settings not configured' });
      return;
    }

    // JST（日本時間）で年月を取得
    const year = getJSTYear();
    const month = getJSTMonth();
    const jstInfo = getJSTInfo();

    console.log(`Starting monthly rent registration for ${year}/${month} (JST: ${jstInfo.formatted})`);

    // 家賃情報を取得
    const rent = await getRent();

    if (!rent) {
      console.log('No rent information found, skipping');
      res.status(200).json({ status: 'ok', registered: 0, message: 'No rent information' });
      return;
    }

    // 月末日を計算
    const lastDayOfMonth = new Date(year, month, 0).getDate();
    const lastDay = new Date(year, month - 1, lastDayOfMonth);
    const dateStr = `${year}-${String(month).padStart(2, '0')}-${String(lastDayOfMonth).padStart(2, '0')}`;

    // カレンダーに登録（カテゴリーは「家賃費用」）
    const calendarEventId = await createCalendarEvent(
      calendarId,
      rent.payerName,
      rent.amount,
      '家賃費用',
      '家賃',
      dateStr
    );

    // Firestoreには保存しない（家賃は精算対象外のため）
    // カレンダーのみに登録

    console.log(`Registered rent: ${rent.payerName} ¥${rent.amount} on ${dateStr}`);

    // LINEに通知を送信
    const message = `🏠 家賃自動登録完了
━━━━━━━━━━━━━━━

${year}年${month}月分の家賃を登録しました

✅ 家賃費用（${rent.payerName}・¥${rent.amount.toLocaleString()}・${month}/${lastDayOfMonth}）`;

    await pushMessage(settings.lineGroupId, message, accessToken);

    console.log('Monthly rent registration completed');

    res.status(200).json({
      status: 'ok',
      registered: 1,
      date: dateStr,
    });
  } catch (error) {
    console.error('Monthly rent registration error:', error);
    const errorMsg = error instanceof Error ? error.message : '不明なエラー';
    res.status(500).json({
      error: 'Internal server error',
      details: errorMsg,
    });
  }
}
