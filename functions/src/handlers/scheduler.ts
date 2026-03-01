import { Request, Response } from '@google-cloud/functions-framework';
import { Timestamp } from '@google-cloud/firestore';
import { getAllUsers, getExpensesSummary, getSettings, resetAllDiningBalances, getExpenseByCalendarEventId, getUserIdByDisplayName, saveExpense, updateDiningBalance, getUser, getAllActiveSubscriptions, getRent, updateExpense, findExpenseWithoutCalendarEventId, getExpensesByDateRange, deleteExpenseById } from '../services/firestore.js';
import { pushMessage, createReportMessage } from '../services/line.js';
import { getTodaySchedules, getMonthlyExpenseEvents, createCalendarEvent } from '../services/calendar.js';
import { ReportData, ReportType, UserExpenses, MonthlySummary, Category } from '../types/index.js';
import { getJSTYear, getJSTMonth, getJSTDate, getJSTInfo, isCurrentMonthJST } from '../utils/date.js';

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
 * レポート期間を取得（UTC基準）
 */
export function getReportPeriod(date: Date, reportType: ReportType): { start: Date; end: Date } {
  const year = date.getUTCFullYear();
  const month = date.getUTCMonth();

  if (reportType === 'mid-month') {
    // 1日〜15日
    return {
      start: new Date(Date.UTC(year, month, 1, 0, 0, 0, 0)),
      end: new Date(Date.UTC(year, month, 15, 23, 59, 59, 999)),
    };
  } else {
    // 16日〜月末
    return {
      start: new Date(Date.UTC(year, month, 16, 0, 0, 0, 0)),
      end: new Date(Date.UTC(year, month + 1, 0, 23, 59, 59, 999)),
    };
  }
}

/**
 * 月末かどうかを判定（UTC基準）
 */
function isLastDayOfMonth(date: Date): boolean {
  const year = date.getUTCFullYear();
  const month = date.getUTCMonth();
  const day = date.getUTCDate();
  // 翌日が次の月かどうかをチェック
  const lastDayOfMonth = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
  return day === lastDayOfMonth;
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
  const travelExpenses: UserExpenses[] = [];

  // レポート期間が今月かどうかを判定（今月でなければ残高を表示しない）
  const jstNow = new Date(Date.now() + 9 * 60 * 60 * 1000);
  const isCurrentMonth =
    startDate.getUTCFullYear() === jstNow.getUTCFullYear() &&
    startDate.getUTCMonth() === jstNow.getUTCMonth();

  for (const user of users) {
    const userExpenses = expensesSummary.get(user.id);

    // 外食費用（今月のみ残高を表示）
    const diningTotal = userExpenses?.get('外食費用') || 0;
    diningExpenses.push({
      userId: user.id,
      userName: user.displayName,
      total: diningTotal,
      balance: isCurrentMonth ? user.diningBalance : undefined,
    });

    // 買い物費用
    const shoppingTotal = userExpenses?.get('買い物費用') || 0;
    shoppingExpenses.push({
      userId: user.id,
      userName: user.displayName,
      total: shoppingTotal,
    });

    // 旅行費用
    const travelTotal = userExpenses?.get('旅行費用') || 0;
    travelExpenses.push({
      userId: user.id,
      userName: user.displayName,
      total: travelTotal,
    });
  }

  // 現在の外食担当者を判定（UTC基準）
  let currentPayer: string | undefined;
  if (settings) {
    const day = startDate.getUTCDate();
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
    travelExpenses,
    currentPayer,
  };

  // 月末の場合は月間サマリーを追加（expensesSummaryを再利用）
  if (reportType === 'end-month') {
    reportData.monthlySummary = generateMonthlySummary(users, settings?.monthlyBudget || 50000, expensesSummary);
  }

  return reportData;
}

/**
 * 月間サマリーを生成
 * @param users ユーザー情報
 * @param monthlyBudget 月間予算
 * @param expensesSummary 支出サマリー（generateReportDataから渡される）
 */
function generateMonthlySummary(
  users: Array<{ id: string; displayName: string; diningBalance: number }>,
  monthlyBudget: number,
  expensesSummary: Map<string, Map<Category, number>>
): MonthlySummary {
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

  // 旅行費用の精算を計算
  const travelTotals = users.map(user => {
    const userExpenses = expensesSummary.get(user.id);
    const travelTotal = userExpenses?.get('旅行費用') || 0;

    return {
      userId: user.id,
      userName: user.displayName,
      total: travelTotal,
    };
  });

  // ユーザーが2人未満の場合は精算なし
  if (users.length < 2) {
    return {
      diningSavings,
      shoppingSettlement: {
        users: shoppingTotals,
        difference: 0,
        refundAmount: 0,
      },
      travelSettlement: {
        users: travelTotals,
        difference: 0,
        refundAmount: 0,
      },
    };
  }

  // 買い物費用の精算額を計算
  const shoppingAmounts = shoppingTotals.map(u => u.total);
  const shoppingDifference = Math.abs(shoppingAmounts[0] - shoppingAmounts[1]);
  const shoppingRefundAmount = Math.round(shoppingDifference / 2);

  let shoppingRefundFrom: string | undefined;
  let shoppingRefundTo: string | undefined;

  if (shoppingRefundAmount > 0) {
    if (shoppingAmounts[0] < shoppingAmounts[1]) {
      shoppingRefundFrom = shoppingTotals[0].userName;
      shoppingRefundTo = shoppingTotals[1].userName;
    } else {
      shoppingRefundFrom = shoppingTotals[1].userName;
      shoppingRefundTo = shoppingTotals[0].userName;
    }
  }

  // 旅行費用の精算額を計算
  const travelAmounts = travelTotals.map(u => u.total);
  const travelDifference = Math.abs(travelAmounts[0] - travelAmounts[1]);
  const travelRefundAmount = Math.round(travelDifference / 2);

  let travelRefundFrom: string | undefined;
  let travelRefundTo: string | undefined;

  if (travelRefundAmount > 0) {
    if (travelAmounts[0] < travelAmounts[1]) {
      travelRefundFrom = travelTotals[0].userName;
      travelRefundTo = travelTotals[1].userName;
    } else {
      travelRefundFrom = travelTotals[1].userName;
      travelRefundTo = travelTotals[0].userName;
    }
  }

  return {
    diningSavings,
    shoppingSettlement: {
      users: shoppingTotals,
      difference: shoppingDifference,
      refundFrom: shoppingRefundFrom,
      refundTo: shoppingRefundTo,
      refundAmount: shoppingRefundAmount,
    },
    travelSettlement: {
      users: travelTotals,
      difference: travelDifference,
      refundFrom: travelRefundFrom,
      refundTo: travelRefundTo,
      refundAmount: travelRefundAmount,
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
    });

    const settings = await getSettings();
    console.log('Settings retrieved:', {
      hasSettings: !!settings,
      hasLineGroupId: !!(settings?.lineGroupId),
    });

    if (!settings || !settings.lineGroupId) {
      const errorMsg = 'Settings not found or lineGroupId not set';
      console.error(errorMsg, {
        settings: settings ? 'exists' : 'null',
        hasLineGroupId: !!(settings?.lineGroupId),
      });
      res.status(500).json({
        error: 'Settings not configured',
      });
      return;
    }

    // JST（日本時間）で今日の日付を取得
    const jstInfo = getJSTInfo();
    const today = getJSTDate();
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
    });
  }
}

/**
 * 日付をフォーマット（YYYY-MM-DD、UTC基準）
 */
function formatDate(date: Date): string {
  const year = date.getUTCFullYear();
  const month = String(date.getUTCMonth() + 1).padStart(2, '0');
  const day = String(date.getUTCDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

/**
 * Googleカレンダー同期ハンドラー
 * Googleカレンダーの当月の支出イベントをFirestoreに同期
 * 既存イベントは内容が変更されていれば更新する
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
    let updatedCount = 0;
    let skippedCount = 0;
    let errorCount = 0;
    let deletedCount = 0;

    // 各イベントをFirestoreに同期
    for (const event of expenseEvents) {
      try {
        // カレンダーイベントIDで既存の支出を取得
        const existingExpense = await getExpenseByCalendarEventId(event.eventId);

        if (existingExpense) {
          // 既存イベントがある場合、内容が変更されているかチェック
          const hasChanges =
            existingExpense.amount !== event.amount ||
            existingExpense.userName !== event.userName ||
            existingExpense.category !== event.category ||
            existingExpense.storeName !== event.storeName;

          if (hasChanges) {
            // ユーザー名からユーザーIDを取得
            const userId = await getUserIdByDisplayName(event.userName);
            if (!userId) {
              console.warn(`User not found for update: ${event.userName}`);
              errorCount++;
              continue;
            }

            // 外食費用の残高調整（現在の月の支出のみ）
            if ((existingExpense.category === '外食費用' || event.category === '外食費用') && isCurrentMonthJST(event.date)) {
              const oldUserId = existingExpense.userId;
              const oldUser = await getUser(oldUserId);

              // 旧カテゴリーが外食費用なら残高を戻す
              if (existingExpense.category === '外食費用' && oldUser) {
                const restoredBalance = oldUser.diningBalance + existingExpense.amount;
                await updateDiningBalance(oldUserId, restoredBalance);
                console.log(`Restored dining balance for ${existingExpense.userName}: +${existingExpense.amount}`);
              }

              // 新カテゴリーが外食費用なら残高を引く
              if (event.category === '外食費用') {
                const newUser = await getUser(userId);
                if (newUser) {
                  const newBalance = newUser.diningBalance - event.amount;
                  await updateDiningBalance(userId, newBalance);
                  console.log(`Updated dining balance for ${event.userName}: -${event.amount}`);
                }
              }
            }

            // 支出を更新
            await updateExpense(existingExpense.id!, {
              userId,
              userName: event.userName,
              amount: event.amount,
              category: event.category,
              storeName: event.storeName,
              date: Timestamp.fromDate(new Date(event.date)),
            });

            console.log(`Updated event: ${event.eventId} - ${event.userName} ¥${event.amount}`);
            updatedCount++;
          } else {
            console.log(`Event unchanged: ${event.eventId}`);
            skippedCount++;
          }
          continue;
        }

        // 新規イベントの場合
        // ユーザー名からユーザーIDを取得
        const userId = await getUserIdByDisplayName(event.userName);
        if (!userId) {
          console.warn(`User not found: ${event.userName}`);
          errorCount++;
          continue;
        }

        // 手動入力済みの支出（calendarEventIdなし）が存在するかチェック
        const manualExpense = await findExpenseWithoutCalendarEventId(
          userId,
          new Date(event.date),
          event.amount,
          event.category
        );

        if (manualExpense) {
          // 手動入力済みの支出にcalendarEventIdを紐付けるだけ（残高は減算しない）
          await updateExpense(manualExpense.id!, {
            calendarEventId: event.eventId,
          });
          console.log(`Linked calendar event to manual expense: ${event.eventId} - ${event.userName} ¥${event.amount}`);
          skippedCount++; // 紐付けのみなのでskippedとしてカウント
          continue;
        }

        // 完全に新規のイベント：Firestoreに保存
        await saveExpense({
          userId,
          userName: event.userName,
          amount: event.amount,
          category: event.category,
          storeName: event.storeName,
          date: Timestamp.fromDate(new Date(event.date)),
          calendarEventId: event.eventId,
        });

        // 外食費用かつ現在の月の場合のみ残高を更新
        if (event.category === '外食費用' && isCurrentMonthJST(event.date)) {
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

    // カレンダーにないFirestoreの支出を削除
    console.log('Checking for deleted calendar events...');

    // カレンダーイベントIDのセットを作成
    const calendarEventIds = new Set(expenseEvents.map(e => e.eventId));

    // Firestoreから当月の支出を取得（calendarEventIdが存在するもののみ）
    const startDate = new Date(Date.UTC(year, month - 1, 1, 0, 0, 0, 0));
    const endDate = new Date(Date.UTC(year, month, 0, 23, 59, 59, 999));
    const firestoreExpenses = await getExpensesByDateRange(startDate, endDate);

    // カレンダーイベントIDを持つがカレンダーに存在しない支出を削除
    for (const expense of firestoreExpenses) {
      if (expense.calendarEventId && !calendarEventIds.has(expense.calendarEventId)) {
        try {
          console.log(`Deleting expense (calendar event removed): ${expense.calendarEventId} - ${expense.userName} ¥${expense.amount}`);

          // 外食費用かつ現在の月の場合のみ残高を戻す
          const expenseDate = expense.date.toDate();
          const expenseDateStr = `${expenseDate.getUTCFullYear()}-${String(expenseDate.getUTCMonth() + 1).padStart(2, '0')}-${String(expenseDate.getUTCDate()).padStart(2, '0')}`;
          if (expense.category === '外食費用' && isCurrentMonthJST(expenseDateStr)) {
            const user = await getUser(expense.userId);
            if (user) {
              const restoredBalance = user.diningBalance + expense.amount;
              await updateDiningBalance(expense.userId, restoredBalance);
              console.log(`Restored dining balance for ${expense.userName}: +${expense.amount}`);
            }
          }

          // 支出を削除
          await deleteExpenseById(expense.id!);
          deletedCount++;
        } catch (error) {
          console.error(`Failed to delete expense ${expense.id}:`, error);
          errorCount++;
        }
      }
    }

    console.log(`Calendar sync completed: ${syncedCount} synced, ${updatedCount} updated, ${skippedCount} skipped, ${deletedCount} deleted, ${errorCount} errors`);

    res.status(200).json({
      status: 'ok',
      synced: syncedCount,
      updated: updatedCount,
      skipped: skippedCount,
      deleted: deletedCount,
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
 * 指定月の配送/支払い日を計算（UTC基準）
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

  // 開始日を正規化（時間部分を除去、UTC基準）
  const start = new Date(Date.UTC(startDate.getUTCFullYear(), startDate.getUTCMonth(), startDate.getUTCDate()));
  const end = new Date(Date.UTC(monthEnd.getUTCFullYear(), monthEnd.getUTCMonth(), monthEnd.getUTCDate()));

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
    // 月単位の計算（UTC基準）
    let currentYear = start.getUTCFullYear();
    let currentMonth = start.getUTCMonth();
    const startDay = start.getUTCDate();

    // 開始日から対象月の範囲内の日付を計算
    while (true) {
      // 該当月の日付を生成（日付が存在しない場合は月末に調整、UTC基準）
      const daysInMonth = new Date(Date.UTC(currentYear, currentMonth + 1, 0)).getUTCDate();
      const day = Math.min(startDay, daysInMonth);
      const current = new Date(Date.UTC(currentYear, currentMonth, day));

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
      if (currentYear > end.getUTCFullYear() + 1) {
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
