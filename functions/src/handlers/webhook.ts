import { Request, Response } from '@google-cloud/functions-framework';
import { WebhookEvent, MessageEvent, TextEventMessage, ImageEventMessage } from '@line/bot-sdk';
import { Timestamp } from '@google-cloud/firestore';
import * as crypto from 'crypto';
import { Category, ConversationSession, ReportType } from '../types/index.js';

// Services
import { analyzeReceiptImage } from '../services/gemini.js';
import { getOrCreateUser, saveExpense, updateDiningBalance, getUser, getAllUsers, getSettings, updateSettings, deleteExpenseByDateAndAmount, getRecentExpenses, initializeLineGroupId, getConversationSession, deleteConversationSession, getUserByDisplayNamePartial, recalculateAllDiningBalances } from '../services/firestore.js';
import { createCalendarEvent, deleteCalendarEvent, createScheduleEvent, getScheduleColorForUser } from '../services/calendar.js';
import { getImageContent, replyMessage, createRegistrationMessage, createErrorMessage, createBalanceMessage, createBudgetUpdateMessage, createHistoryMessage, createDeleteMessage, createHelpMessage, createQuickHelpMessage, getUserDisplayName, createReportMessage } from '../services/line.js';
import { startAddExpenseConversation, startAddExpenseConversationWithPartialData, startAddScheduleConversation, startDeleteExpenseConversation, startDeleteExpenseConversationWithPartialData, startDeleteExpenseConversationAtDateStep, startInitialSetupConversation, startChangeSettingsConversation, handleConversationInput, startAddSubscriptionConversation, showSubscriptionList, startDeleteSubscriptionConversation, startEditSubscriptionConversation, startAddRentConversation, startEditRentConversation, startAddTravelConversation, startAddTravelConversationWithPartialData } from './conversation.js';
import { generateReportData, getReportPeriod } from './scheduler.js';
import { parseDateString, parseYearMonthString, getJSTDate, isCurrentMonthJST } from '../utils/date.js';
import { resolvePayerName } from '../utils/payer.js';

/**
 * 署名検証
 */
function validateSignature(body: string, signature: string, channelSecret: string): boolean {
  const hash = crypto
    .createHmac('SHA256', channelSecret)
    .update(body)
    .digest('base64');
  return hash === signature;
}

/**
 * LINE Webhookハンドラー
 */
export async function handleWebhook(req: Request, res: Response): Promise<void> {
  try {
    // 環境変数から取得
    const channelSecret = process.env.LINE_CHANNEL_SECRET || '';
    const accessToken = process.env.LINE_CHANNEL_ACCESS_TOKEN || '';
    const geminiApiKey = process.env.GEMINI_API_KEY || '';
    const calendarId = process.env.GOOGLE_CALENDAR_ID || '';

    // 署名検証
    // Cloud Functions v2 では rawBody が利用可能
    // rawBody がない場合は JSON.stringify を使用（フォールバック）
    const signature = req.headers['x-line-signature'] as string;
    const rawBody = (req as any).rawBody ? (req as any).rawBody.toString('utf8') : JSON.stringify(req.body);
    if (!signature || !validateSignature(rawBody, signature, channelSecret)) {
      console.error('401 Unauthorized: Invalid signature', {
        hasSignature: !!signature,
        hasRawBody: !!(req as any).rawBody,
      });
      res.status(401).send('Unauthorized');
      return;
    }

    const body = req.body;
    const events: WebhookEvent[] = body.events || [];

    // イベント処理
    for (const event of events) {
      if (event.type === 'message') {
        await handleMessageEvent(event as MessageEvent, accessToken, geminiApiKey, calendarId);
      }
    }

    res.status(200).json({ status: 'ok' });
  } catch (error) {
    console.error('Webhook error:', error);
    const errorMsg = error instanceof Error ? error.message : '不明なエラー';
    const errorStack = error instanceof Error ? error.stack : '';
    console.error('Error details:', { message: errorMsg, stack: errorStack });
    res.status(500).json({
      error: 'Internal server error',
    });
  }
}

/**
 * メッセージイベント処理
 */
async function handleMessageEvent(
  event: MessageEvent,
  accessToken: string,
  geminiApiKey: string,
  calendarId: string
): Promise<void> {
  const { replyToken, source, message } = event;

  // グループIDを取得
  if (source.type !== 'group') {
    await replyMessage(replyToken, 'このBotはグループでのみ使用できます', accessToken);
    return;
  }

  const groupId = source.groupId;
  const userId = source.userId || '';

  // グループIDを初期化（初回のみ）
  try {
    await initializeLineGroupId(groupId);
  } catch (error) {
    console.error('Failed to initialize LINE group ID:', error);
  }

  // 画像メッセージの処理
  if (message.type === 'image') {
    await handleImageMessage(message, replyToken, userId, groupId, accessToken, geminiApiKey, calendarId);
  }
  // テキストメッセージの処理
  else if (message.type === 'text') {
    await handleTextMessage(message, replyToken, userId, groupId, accessToken, calendarId);
  }
}

/**
 * 画像メッセージ処理
 */
async function handleImageMessage(
  message: ImageEventMessage,
  replyToken: string,
  userId: string,
  groupId: string,
  accessToken: string,
  geminiApiKey: string,
  calendarId: string
): Promise<void> {
  try {
    // 画像を取得
    const imageBuffer = await getImageContent(message.id, accessToken);

    // Gemini APIで解析
    const analysisResult = await analyzeReceiptImage(imageBuffer, geminiApiKey);

    // エラーチェック
    if (analysisResult.error) {
      await replyMessage(replyToken, createErrorMessage(analysisResult.reason), accessToken);
      return;
    }

    // ユーザー情報を取得・作成
    // LINEからユーザーの表示名を取得
    const userName = await getUserDisplayName(groupId, userId, accessToken);
    const user = await getOrCreateUser(userId, userName, groupId);

    // 日付をTimestampに変換
    const expenseDate = Timestamp.fromDate(new Date(analysisResult.date));

    // カレンダーに登録
    const calendarEventId = await createCalendarEvent(
      calendarId,
      user.displayName,
      analysisResult.amount,
      analysisResult.category,
      analysisResult.storeName,
      analysisResult.date,
      analysisResult.items
    );

    // Firestoreに保存
    await saveExpense({
      userId,
      userName: user.displayName,
      amount: analysisResult.amount,
      category: analysisResult.category,
      storeName: analysisResult.storeName,
      date: expenseDate,
      calendarEventId,
    });

    // 外食費用の場合は残高を更新（現在の月の支出のみ）
    let newBalance: number | undefined;
    if (analysisResult.category === '外食費用') {
      if (isCurrentMonthJST(analysisResult.date)) {
        // 現在の月の支出のみ残高を更新
        newBalance = user.diningBalance - analysisResult.amount;
        await updateDiningBalance(userId, newBalance);
      }
      // 過去の月の支出は残高に影響を与えない（集計には含まれる）
    }

    // 返信メッセージを送信
    const responseMessage = createRegistrationMessage(
      analysisResult.category,
      analysisResult.amount,
      user.displayName,
      analysisResult.storeName,
      analysisResult.date,
      newBalance
    );

    await replyMessage(replyToken, responseMessage, accessToken);
  } catch (error) {
    console.error('Image message handling error:', error);
    const errorMsg = error instanceof Error ? error.message : '不明なエラー';
    await replyMessage(
      replyToken,
      createErrorMessage(`画像処理エラー: ${errorMsg}`),
      accessToken
    );
  }
}

/**
 * テキストメッセージ処理
 */
async function handleTextMessage(
  message: TextEventMessage,
  replyToken: string,
  userId: string,
  groupId: string,
  accessToken: string,
  calendarId: string
): Promise<void> {
  const text = message.text.trim();

  // メンション情報を取得（LINEのメンション機能を使用している場合）
  const mentions = (message as any).mention?.mentionees || [];

  // 対話セッションが存在する場合は、対話処理を優先
  const session = await getConversationSession(userId);
  if (session) {
    // 対話セッション中は、@キャンセル（全角・半角）以外はすべて対話の入力として扱う
    const isCancel = text === '@キャンセル' || text === '＠キャンセル';

    if (isCancel) {
      await deleteConversationSession(userId);
      await replyMessage(replyToken, '❌ 入力をキャンセルしました', accessToken);
      return;
    }

    // @キャンセル以外はすべて対話の入力として処理
    await handleConversationInput(session, text, replyToken, userId, groupId, accessToken, calendarId, mentions);
    return;
  }

  // コマンドでない場合は無視（全角・半角の@に対応）
  if (!text.startsWith('@') && !text.startsWith('＠')) {
    return;
  }

  // 全角・半角スペースを統一（全て半角スペースに変換）
  const normalizedText = text.slice(1).trim().replace(/　/g, ' ');
  const command = normalizedText;

  // 有効なコマンドのプレフィックス一覧（ホワイトリスト）
  const validCommandPrefixes = [
    'ヘルプ',
    '残高',
    '予算',
    '履歴',
    'レポート',
    '削除',
    '追加',
    '予定',
    '初期設定',
    '設定変更',
    'サブスク一覧',
    'サブスク追加',
    'サブスク削除',
    'サブスク変更',
    '家賃追加',
    '家賃変更',
    'キャンセル',
  ];

  // コマンドが有効なプレフィックスで始まるかチェック
  const isValidCommand = validCommandPrefixes.some(prefix =>
    command === prefix || command.startsWith(prefix + ' ')
  );

  // 有効なコマンドでない場合は無視（ユーザーメンション等）
  if (!isValidCommand) {
    return;
  }

  try {

    // @ヘルプコマンド
    if (command === 'ヘルプ') {
      const message = createHelpMessage();
      await replyMessage(replyToken, message, accessToken);
    }
    // @省略コマンド
    else if (command === '省略') {
      const message = createQuickHelpMessage();
      await replyMessage(replyToken, message, accessToken);
    }
    // @残高コマンド
    else if (command === '残高') {
      await handleBalanceCommand(replyToken, accessToken);
    }
    // @予算コマンド
    else if (command.startsWith('予算 ')) {
      const amountStr = command.replace('予算 ', '').replace(/[,，]/g, '');
      const amount = parseInt(amountStr, 10);
      if (isNaN(amount) || amount <= 0) {
        await replyMessage(replyToken, '❌ 正しい金額を入力してください\n例: @予算 60000', accessToken);
        return;
      }
      await handleBudgetCommand(replyToken, amount, accessToken);
    }
    // @履歴コマンド
    else if (command === '履歴' || command.startsWith('履歴 ')) {
      const args = command.replace('履歴', '').trim();
      await handleHistoryCommand(replyToken, args, accessToken);
    }
    // @レポート/@集計コマンド
    else if (command === 'レポート' || command.startsWith('レポート ') || command === '集計' || command.startsWith('集計 ')) {
      const args = command.replace(/^(レポート|集計)\s*/, '').trim();
      await handleReportCommand(replyToken, args, accessToken);
    }
    // @削除コマンド
    else if (command.startsWith('削除')) {
      const args = command.replace('削除', '').trim();
      if (args.length === 0) {
        // 引数なし → 対話モード開始
        await startDeleteExpenseConversation(userId, groupId, replyToken, accessToken);
      } else {
        // 引数あり → 通常処理
        await handleDeleteCommand(replyToken, userId, groupId, args, accessToken, calendarId, mentions);
      }
    }
    // @追加コマンド
    else if (command.startsWith('追加')) {
      const args = command.replace('追加', '').trim();
      if (args.length === 0) {
        // 引数なし → 対話モード開始
        await startAddExpenseConversation(userId, groupId, replyToken, accessToken);
      } else {
        // 引数あり → 通常処理
        await handleAddCommand(replyToken, userId, groupId, args, accessToken, calendarId, mentions);
      }
    }
    // @予定コマンド
    else if (command.startsWith('予定')) {
      const args = command.replace('予定', '').trim();
      if (args.length === 0) {
        // 引数なし → 対話モード開始
        await startAddScheduleConversation(userId, groupId, replyToken, accessToken);
      } else {
        // 引数あり → 通常処理
        await handleScheduleCommand(replyToken, userId, groupId, args, accessToken, calendarId, mentions);
      }
    }
    // @初期設定コマンド
    else if (command === '初期設定') {
      await startInitialSetupConversation(userId, groupId, replyToken, accessToken);
    }
    // @設定変更コマンド
    else if (command === '設定変更') {
      await startChangeSettingsConversation(userId, groupId, replyToken, accessToken);
    }
    // @サブスク一覧コマンド
    else if (command === 'サブスク一覧') {
      await showSubscriptionList(groupId, replyToken, accessToken);
    }
    // @サブスク追加コマンド
    else if (command === 'サブスク追加') {
      await startAddSubscriptionConversation(userId, groupId, replyToken, accessToken);
    }
    // @サブスク削除コマンド
    else if (command === 'サブスク削除') {
      await startDeleteSubscriptionConversation(userId, groupId, replyToken, accessToken);
    }
    // @サブスク変更コマンド
    else if (command === 'サブスク変更') {
      await startEditSubscriptionConversation(userId, groupId, replyToken, accessToken);
    }
    // @家賃追加コマンド
    else if (command === '家賃追加') {
      await startAddRentConversation(userId, groupId, replyToken, accessToken);
    }
    // @家賃変更コマンド
    else if (command === '家賃変更') {
      await startEditRentConversation(userId, groupId, replyToken, accessToken);
    }
    // @旅行コマンド
    else if (command.startsWith('旅行')) {
      const args = command.replace('旅行', '').trim();
      if (args.length === 0) {
        // 引数なし → 対話モード開始
        await startAddTravelConversation(userId, groupId, replyToken, accessToken);
      } else {
        // 引数あり → ワンライナー処理
        await handleTravelCommand(replyToken, userId, groupId, args, accessToken, calendarId, mentions);
      }
    }
    // @キャンセルコマンド
    else if (command === 'キャンセル') {
      await deleteConversationSession(userId);
      await replyMessage(replyToken, '❌ 入力をキャンセルしました', accessToken);
    }
    // 不明なコマンド
    else {
      await replyMessage(
        replyToken,
        '❌ 不明なコマンドです\n\n詳しくは @ヘルプ で確認してください',
        accessToken
      );
    }
  } catch (error) {
    console.error('Text message handling error:', error);
    const errorMsg = error instanceof Error ? error.message : '不明なエラー';
    await replyMessage(
      replyToken,
      `⚠️ エラーが発生しました\n\n詳細: ${errorMsg}`,
      accessToken
    );
  }
}

/**
 * 残高コマンド処理
 */
async function handleBalanceCommand(replyToken: string, accessToken: string): Promise<void> {
  const users = await getAllUsers();
  const settings = await getSettings();

  if (!settings) {
    await replyMessage(replyToken, '❌ 設定が見つかりません', accessToken);
    return;
  }

  const userBalances = users.map(user => ({
    userName: user.displayName,
    balance: user.diningBalance,
  }));

  const message = createBalanceMessage(userBalances, settings.monthlyBudget);
  await replyMessage(replyToken, message, accessToken);
}

/**
 * 予算コマンド処理
 * 予算変更時は全ユーザーの残高を再計算する
 * 計算式: 新しい残高 = 新予算 - balanceResetAt以降の外食支出合計
 */
async function handleBudgetCommand(replyToken: string, newBudget: number, accessToken: string): Promise<void> {
  // Settings を更新
  await updateSettings({ monthlyBudget: newBudget });

  // 全ユーザーの残高を再計算
  const balanceChanges = await recalculateAllDiningBalances(newBudget);

  const message = createBudgetUpdateMessage(newBudget, balanceChanges);
  await replyMessage(replyToken, message, accessToken);
}

/**
 * 履歴コマンド処理（年月指定可能）
 * @param args - 年月指定（例: "12", "2024/12", "2024-12"）
 */
async function handleHistoryCommand(
  replyToken: string,
  args: string,
  accessToken: string
): Promise<void> {
  let startDate: Date | undefined;
  let endDate: Date | undefined;
  let yearMonthLabel: string | undefined;

  // 年月指定がある場合
  if (args.length > 0) {
    const parsed = parseYearMonthString(args);
    if (!parsed) {
      await replyMessage(
        replyToken,
        '❌ 年月の形式が正しくありません\n例: @履歴 12\n例: @履歴 2024/12',
        accessToken
      );
      return;
    }

    // 指定月の1日〜月末を取得（JST）
    startDate = new Date(Date.UTC(parsed.year, parsed.month - 1, 1, 0, 0, 0, 0));
    endDate = new Date(Date.UTC(parsed.year, parsed.month, 0, 23, 59, 59, 999));
    yearMonthLabel = `${parsed.year}年${parsed.month}月`;
  }

  const expenses = await getRecentExpenses(10, startDate, endDate);
  const historyData = expenses.map(exp => ({
    date: exp.date.toDate(),
    category: exp.category,
    userName: exp.userName,
    amount: exp.amount,
  }));

  const message = createHistoryMessage(historyData, yearMonthLabel);
  await replyMessage(replyToken, message, accessToken);
}

/**
 * レポートコマンド処理（年月指定可能）
 * @param args - 年月指定（例: "12", "2024/12", "2024-12"）または前半/後半指定
 */
async function handleReportCommand(
  replyToken: string,
  args: string,
  accessToken: string
): Promise<void> {
  try {
    let startDate: Date;
    let endDate: Date;
    let reportType: ReportType = 'end-month';

    // 年月指定がある場合（例: "12", "2024/12"）
    if (args.length > 0 && args !== '前半' && args !== 'mid' && args !== '後半' && args !== '月末' && args !== 'end') {
      const parsed = parseYearMonthString(args);
      if (!parsed) {
        await replyMessage(
          replyToken,
          '❌ 年月の形式が正しくありません\n例: @集計\n例: @集計 12\n例: @集計 2024/12',
          accessToken
        );
        return;
      }

      // 指定月の1日〜月末を集計（月間サマリー付き、JST）
      startDate = new Date(Date.UTC(parsed.year, parsed.month - 1, 1, 0, 0, 0, 0));
      endDate = new Date(Date.UTC(parsed.year, parsed.month, 0, 23, 59, 59, 999));
      reportType = 'end-month'; // 月間サマリーを表示
    } else {
      // 従来の前半/後半指定または引数なし
      const jstDate = getJSTDate();
      const now = new Date(Date.UTC(jstDate.getUTCFullYear(), jstDate.getUTCMonth(), jstDate.getUTCDate(), jstDate.getUTCHours(), jstDate.getUTCMinutes(), jstDate.getUTCSeconds()));

      if (args === '前半' || args === 'mid' || args === '後半' || args === '月末' || args === 'end') {
        // 前半/後半指定の場合は従来のロジックを使用
        reportType = (args === '前半' || args === 'mid') ? 'mid-month' : 'end-month';
        const period = getReportPeriod(now, reportType);
        startDate = period.start;
        endDate = period.end;
      } else {
        // 引数なしの場合は今月全体を集計（月間サマリー付き、JST）
        const year = jstDate.getUTCFullYear();
        const month = jstDate.getUTCMonth();
        startDate = new Date(Date.UTC(year, month, 1, 0, 0, 0, 0));
        endDate = new Date(Date.UTC(year, month + 1, 0, 23, 59, 59, 999));
        reportType = 'end-month';
      }
    }

    // レポートデータを生成
    const reportData = await generateReportData(startDate, endDate, reportType);

    // レポートメッセージを生成
    const message = createReportMessage(reportData);

    await replyMessage(replyToken, message, accessToken);
  } catch (error) {
    console.error('Report command error:', error);
    const errorMsg = error instanceof Error ? error.message : '不明なエラー';
    await replyMessage(
      replyToken,
      `❌ レポート生成に失敗しました\n\n詳細: ${errorMsg}`,
      accessToken
    );
  }
}

/**
 * 削除コマンド処理
 * 形式: @削除 {支払い者名} {カテゴリー} {金額} [{日付}]
 */
async function handleDeleteCommand(
  replyToken: string,
  userId: string,
  groupId: string,
  args: string,
  accessToken: string,
  calendarId: string,
  mentions: any[] = []
): Promise<void> {
  try {
    // 引数をパース（例: "@自分 外食費用 1280 12/3"）
    const parts = args.split(' ').filter(p => p.length > 0);

    if (parts.length < 3) {
      // 引数不足の場合は対話モードで不足要素を質問
      await startDeleteExpenseConversationWithPartialData(userId, groupId, replyToken, accessToken, parts, mentions);
      return;
    }

    const resolved = await resolvePayerName(parts[0], groupId, userId, accessToken, mentions);
    let payerName = resolved.payerName;
    const category = parts[1];
    const amountStr = parts[2].replace(/[,，]/g, '');
    const amount = parseInt(amountStr, 10);
    const dateInput = parts.length >= 4 ? parts[3] : null; // 日付（オプション）

    // カテゴリーチェック — 不正な場合は対話で補完
    if (category !== '外食費用' && category !== '買い物費用' && category !== '旅行費用') {
      await startDeleteExpenseConversationWithPartialData(userId, groupId, replyToken, accessToken, parts, mentions);
      return;
    }

    // 金額チェック — 不正な場合は対話で補完
    if (isNaN(amount) || amount <= 0) {
      await startDeleteExpenseConversationWithPartialData(userId, groupId, replyToken, accessToken, parts, mentions);
      return;
    }

    // 日付をパース
    let targetDate: Date;
    if (dateInput) {
      // 日付が指定された場合（例: "12/3"、"2024/12/3"）
      const parsedDate = parseDateString(dateInput);
      if (!parsedDate) {
        // 日付が不正な場合は対話で補完
        await startDeleteExpenseConversationWithPartialData(userId, groupId, replyToken, accessToken, parts, mentions);
        return;
      }
      targetDate = parsedDate;
    } else {
      // 日付が指定されない場合は今日のJST日付を使用
      const jstDate = getJSTDate();
      targetDate = new Date(Date.UTC(jstDate.getUTCFullYear(), jstDate.getUTCMonth(), jstDate.getUTCDate(), 0, 0, 0, 0));
    }

    // ユーザーIDを取得（支払い者名から検索）
    const targetUser = await getUserByDisplayNamePartial(payerName);
    if (!targetUser) {
      await replyMessage(
        replyToken,
        `❌ ユーザー「${payerName}」が見つかりません`,
        accessToken
      );
      return;
    }

    // 該当する支出を削除
    const deletedExpense = await deleteExpenseByDateAndAmount(targetUser.id, targetDate, amount, category);

    if (!deletedExpense) {
      // 支出が見つからない場合、日付を対話で補う
      await startDeleteExpenseConversationAtDateStep(
        userId, groupId, replyToken, accessToken,
        payerName, category as Category, amount
      );
      return;
    }

    // カレンダーイベントも削除
    if (deletedExpense.calendarEventId) {
      try {
        await deleteCalendarEvent(calendarId, deletedExpense.calendarEventId);
      } catch (error) {
        console.error('Failed to delete calendar event:', error);
      }
    }

    // 外食費用の場合は支払い者の残高を戻す（現在の月の支出のみ）
    const expenseDateStr = targetDate.toISOString().split('T')[0];
    let newBalance: number | undefined;
    if (deletedExpense.category === '外食費用') {
      const payer = await getUser(targetUser.id);
      if (payer && isCurrentMonthJST(expenseDateStr)) {
        newBalance = payer.diningBalance + deletedExpense.amount;
        await updateDiningBalance(targetUser.id, newBalance);
      }
    }

    const user = await getUser(userId);
    const message = createDeleteMessage(
      expenseDateStr,
      deletedExpense.category,
      deletedExpense.amount,
      deletedExpense.userName,
      deletedExpense.storeName,
      newBalance
    );

    await replyMessage(replyToken, message, accessToken);
  } catch (error) {
    console.error('Delete command error:', error);
    const errorMsg = error instanceof Error ? error.message : '不明なエラー';
    await replyMessage(
      replyToken,
      `❌ 削除に失敗しました\n\n詳細: ${errorMsg}`,
      accessToken
    );
  }
}

/**
 * 追加コマンド処理
 * 形式: @追加 {支払い者名} {カテゴリー} {金額} [{日付}]
 */
async function handleAddCommand(
  replyToken: string,
  userId: string,
  groupId: string,
  args: string,
  accessToken: string,
  calendarId: string,
  mentions: any[] = []
): Promise<void> {
  try {
    // 引数をパース（例: "田中 外食費用 1280" または "田中 外食費用 1280 12/1"）
    const parts = args.split(' ').filter(p => p.length > 0);

    if (parts.length < 3) {
      // 引数不足の場合は対話モードで不足要素を質問
      await startAddExpenseConversationWithPartialData(userId, groupId, replyToken, accessToken, parts, mentions);
      return;
    }

    const resolved = await resolvePayerName(parts[0], groupId, userId, accessToken, mentions);
    let payerName = resolved.payerName;
    const category = parts[1];
    const amountStr = parts[2].replace(/[,，]/g, '');
    const amount = parseInt(amountStr, 10);
    const dateInput = parts.length >= 4 ? parts[3] : null; // 日付（オプション）

    // LINEからコマンド実行者の表示名を取得
    const displayName = await getUserDisplayName(groupId, userId, accessToken);

    // カテゴリーチェック — 不正な場合は対話で補完
    if (category !== '外食費用' && category !== '買い物費用' && category !== '旅行費用') {
      await startAddExpenseConversationWithPartialData(userId, groupId, replyToken, accessToken, parts, mentions);
      return;
    }

    // 金額チェック — 不正な場合は対話で補完
    if (isNaN(amount) || amount <= 0) {
      await startAddExpenseConversationWithPartialData(userId, groupId, replyToken, accessToken, parts, mentions);
      return;
    }

    // ユーザー情報を取得・作成（コマンド実行者として）
    const user = await getOrCreateUser(userId, displayName, groupId);

    // 日付をパース
    let expenseDate: Date;
    if (dateInput) {
      // 日付が指定された場合（例: "12/1"、"2024/12/1"）
      const parsedDate = parseDateString(dateInput);
      if (!parsedDate) {
        // 日付が不正な場合は対話で補完
        await startAddExpenseConversationWithPartialData(userId, groupId, replyToken, accessToken, parts, mentions);
        return;
      }
      expenseDate = parsedDate;
    } else {
      // 日付が指定されない場合は今日のJST日付を使用
      const jstDate = getJSTDate();
      expenseDate = new Date(Date.UTC(jstDate.getUTCFullYear(), jstDate.getUTCMonth(), jstDate.getUTCDate(), 0, 0, 0, 0));
    }

    // カレンダーに登録（支払い者名を使用）
    const dateStr = expenseDate.toISOString().split('T')[0];

    const calendarEventId = await createCalendarEvent(
      calendarId,
      payerName,
      amount,
      category,
      '手動入力',
      dateStr
    );

    // Firestoreに保存（支払い者名を使用）
    await saveExpense({
      userId,
      userName: payerName,
      amount,
      category: category,
      storeName: '手動入力',
      date: Timestamp.fromDate(expenseDate),
      calendarEventId,
    });

    // 外食費用の場合は残高を更新（現在の月の支出のみ）
    let newBalance: number | undefined;
    if (category === '外食費用') {
      if (isCurrentMonthJST(dateStr)) {
        // 現在の月の支出のみ残高を更新
        newBalance = user.diningBalance - amount;
        await updateDiningBalance(userId, newBalance);
      }
      // 過去の月の支出は残高に影響を与えない（集計には含まれる）
    }

    // 返信メッセージを送信
    const responseMessage = createRegistrationMessage(
      category,
      amount,
      payerName,
      '手動入力',
      dateStr,
      newBalance
    );

    await replyMessage(replyToken, responseMessage, accessToken);
  } catch (error) {
    console.error('Add command error:', error);
    const errorMsg = error instanceof Error ? error.message : '不明なエラー';
    const errorStack = error instanceof Error ? error.stack : '';
    await replyMessage(
      replyToken,
      `❌ 追加に失敗しました\n\nしばらくしてからもう一度お試しください。`,
      accessToken
    );
  }
}

/**
 * 旅行コマンド処理
 * 形式: @旅行 {支払い者名} {金額} {店舗名} [{日付}]
 */
async function handleTravelCommand(
  replyToken: string,
  userId: string,
  groupId: string,
  args: string,
  accessToken: string,
  calendarId: string,
  mentions: any[] = []
): Promise<void> {
  try {
    // 引数をパース（例: "@自分 15000 新幹線代" または "@自分 15000 新幹線代 12/20"）
    const parts = args.split(' ').filter(p => p.length > 0);

    if (parts.length < 3) {
      // 引数不足の場合は対話モードで不足要素を質問
      await startAddTravelConversationWithPartialData(userId, groupId, replyToken, accessToken, parts, mentions);
      return;
    }

    const resolved = await resolvePayerName(parts[0], groupId, userId, accessToken, mentions);
    let payerName = resolved.payerName;
    const amountStr = parts[1].replace(/[,，]/g, '');
    const amount = parseInt(amountStr, 10);
    const storeName = parts[2]; // 店舗名
    const dateInput = parts.length >= 4 ? parts[3] : null; // 日付（オプション）

    // LINEからコマンド実行者の表示名を取得
    const displayName = await getUserDisplayName(groupId, userId, accessToken);

    // 金額チェック — 不正な場合は対話で補完
    if (isNaN(amount) || amount <= 0) {
      await startAddTravelConversationWithPartialData(userId, groupId, replyToken, accessToken, parts, mentions);
      return;
    }

    // ユーザー情報を取得・作成（コマンド実行者として）
    await getOrCreateUser(userId, displayName, groupId);

    // 日付をパース
    let expenseDate: Date;
    if (dateInput) {
      // 日付が指定された場合（例: "12/20"、"2024/12/20"）
      const parsedDate = parseDateString(dateInput);
      if (!parsedDate) {
        // 日付が不正な場合は対話で補完
        await startAddTravelConversationWithPartialData(userId, groupId, replyToken, accessToken, parts, mentions);
        return;
      }
      expenseDate = parsedDate;
    } else {
      // 日付が指定されない場合は今日のJST日付を使用
      const jstDate = getJSTDate();
      expenseDate = new Date(Date.UTC(jstDate.getUTCFullYear(), jstDate.getUTCMonth(), jstDate.getUTCDate(), 0, 0, 0, 0));
    }

    // カレンダーに登録（支払い者名を使用）
    const dateStr = expenseDate.toISOString().split('T')[0];

    const calendarEventId = await createCalendarEvent(
      calendarId,
      payerName,
      amount,
      '旅行費用',
      storeName,
      dateStr
    );

    // Firestoreに保存（支払い者名を使用）
    await saveExpense({
      userId,
      userName: payerName,
      amount,
      category: '旅行費用',
      storeName,
      date: Timestamp.fromDate(expenseDate),
      calendarEventId,
    });

    // 返信メッセージを送信
    const responseMessage = createRegistrationMessage(
      '旅行費用',
      amount,
      payerName,
      storeName,
      dateStr
    );

    await replyMessage(replyToken, responseMessage, accessToken);
  } catch (error) {
    console.error('Travel command error:', error);
    const errorMsg = error instanceof Error ? error.message : '不明なエラー';
    const errorStack = error instanceof Error ? error.stack : '';
    await replyMessage(
      replyToken,
      `❌ 旅行費用の登録に失敗しました\n\nしばらくしてからもう一度お試しください。`,
      accessToken
    );
  }
}

/**
 * 予定コマンド処理
 * 参加者はPOSTしたユーザーが自動設定される
 */
async function handleScheduleCommand(
  replyToken: string,
  userId: string,
  groupId: string,
  args: string,
  accessToken: string,
  calendarId: string,
  mentions: any[] = []
): Promise<void> {
  try {
    // 引数をパース（例: "会議" または "会議 12/15" または "会議 12/15 14:30 16:00"）
    const parts = args.split(' ').filter(p => p.length > 0);

    if (parts.length < 1) {
      await replyMessage(
        replyToken,
        '❌ 形式が正しくありません\n\n使い方: @予定 {予定内容} [{日付}] [{開始時間}] [{終了時間}]\n\n例: @予定 会議\n例: @予定 会議 12/15\n例: @予定 会議 12/15 14:30\n例: @予定 会議 12/15 14:30 16:00',
        accessToken
      );
      return;
    }

    const scheduleContent = parts[0];
    const dateInput = parts.length >= 2 ? parts[1] : null;
    const startTimeInput = parts.length >= 3 ? parts[2] : null;
    const endTimeInput = parts.length >= 4 ? parts[3] : null;

    // LINEからコマンド実行者の表示名を取得（参加者として自動設定）
    const userName = await getUserDisplayName(groupId, userId, accessToken);

    // 日付をパース
    let scheduleDate: Date;
    if (dateInput) {
      // 日付が指定された場合（例: "12/15"、"2026/1/22"）
      const parsedDate = parseDateString(dateInput);
      if (!parsedDate) {
        await replyMessage(
          replyToken,
          '❌ 日付の形式が正しくありません\n例: @予定 会議 12/15\n例: @予定 会議 2026/1/22',
          accessToken
        );
        return;
      }
      scheduleDate = parsedDate;
    } else {
      // 日付が指定されない場合は今日のJST日付を使用
      const jstDate = getJSTDate();
      scheduleDate = new Date(Date.UTC(jstDate.getUTCFullYear(), jstDate.getUTCMonth(), jstDate.getUTCDate(), 0, 0, 0, 0));
    }

    const dateStr = scheduleDate.toISOString().split('T')[0];

    // 時間のバリデーション
    let startTime: string | undefined;
    let endTime: string | undefined;

    if (startTimeInput) {
      const startTimeMatch = startTimeInput.match(/^(\d{1,2}):(\d{2})$/);
      if (startTimeMatch) {
        const hour = parseInt(startTimeMatch[1], 10);
        const minute = parseInt(startTimeMatch[2], 10);
        if (hour >= 0 && hour <= 23 && minute >= 0 && minute <= 59) {
          startTime = `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`;
        } else {
          await replyMessage(replyToken, '❌ 開始時間の形式が正しくありません\n例: 14:30（0:00〜23:59）', accessToken);
          return;
        }
      } else {
        await replyMessage(replyToken, '❌ 開始時間の形式が正しくありません\n例: 14:30', accessToken);
        return;
      }
    }

    if (endTimeInput) {
      if (!startTime) {
        await replyMessage(replyToken, '❌ 終了時間を指定する場合は開始時間も指定してください', accessToken);
        return;
      }

      const endTimeMatch = endTimeInput.match(/^(\d{1,2}):(\d{2})$/);
      if (endTimeMatch) {
        const hour = parseInt(endTimeMatch[1], 10);
        const minute = parseInt(endTimeMatch[2], 10);
        if (hour >= 0 && hour <= 23 && minute >= 0 && minute <= 59) {
          endTime = `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`;

          // 開始時間より終了時間が早い場合はエラー
          const startMinutes = parseInt(startTime.split(':')[0]) * 60 + parseInt(startTime.split(':')[1]);
          const endMinutes = hour * 60 + minute;
          if (endMinutes <= startMinutes) {
            await replyMessage(replyToken, '❌ 終了時間は開始時間より後にしてください', accessToken);
            return;
          }
        } else {
          await replyMessage(replyToken, '❌ 終了時間の形式が正しくありません\n例: 16:00（0:00〜23:59）', accessToken);
          return;
        }
      } else {
        await replyMessage(replyToken, '❌ 終了時間の形式が正しくありません\n例: 16:00', accessToken);
        return;
      }
    } else if (startTime) {
      // 開始時間のみが指定された場合、終了時間を1時間後に設定
      const [hour, minute] = startTime.split(':').map(Number);
      const endHour = (hour + 1) % 24;
      endTime = `${String(endHour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`;
    }

    // ユーザーごとの予定カラーを取得
    const scheduleColorId = await getScheduleColorForUser(userName);

    // カレンダーに予定を登録
    await createScheduleEvent(
      calendarId,
      userName,
      scheduleContent,
      dateStr,
      startTime,
      endTime,
      scheduleColorId
    );

    // 返信メッセージを送信
    const timeDisplay = startTime && endTime ? `\n⏰ ${startTime} 〜 ${endTime}` : startTime ? `\n⏰ ${startTime} 〜` : '';
    const responseMessage = `✅ 予定を登録しました！\n\n👤 ${userName}\n📝 ${scheduleContent}\n📅 ${dateStr}${timeDisplay}`;

    await replyMessage(replyToken, responseMessage, accessToken);
  } catch (error) {
    console.error('Schedule command error:', error);
    const errorMsg = error instanceof Error ? error.message : '不明なエラー';
    await replyMessage(
      replyToken,
      `❌ 予定登録に失敗しました\n\n詳細: ${errorMsg}`,
      accessToken
    );
  }
}
