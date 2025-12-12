import { Request, Response } from '@google-cloud/functions-framework';
import { WebhookEvent, MessageEvent, TextEventMessage, ImageEventMessage } from '@line/bot-sdk';
import { Timestamp } from '@google-cloud/firestore';
import * as crypto from 'crypto';
import { Category, ConversationSession } from '../types/index.js';

// Services
import { analyzeReceiptImage } from '../services/gemini.js';
import { getOrCreateUser, saveExpense, updateDiningBalance, getUser, getAllUsers, getSettings, updateSettings, deleteExpenseByDateAndAmount, getRecentExpenses, initializeLineGroupId, getConversationSession, deleteConversationSession } from '../services/firestore.js';
import { createCalendarEvent, deleteCalendarEvent, createScheduleEvent } from '../services/calendar.js';
import { getImageContent, replyMessage, createRegistrationMessage, createErrorMessage, createBalanceMessage, createBudgetUpdateMessage, createHistoryMessage, createDeleteMessage, createHelpMessage, getUserDisplayName } from '../services/line.js';
import { startAddExpenseConversation, startAddScheduleConversation, startDeleteExpenseConversation, startInitialSetupConversation, startChangeSettingsConversation, handleConversationInput } from './conversation.js';

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
    const signature = req.headers['x-line-signature'] as string;
    if (!signature || !validateSignature(JSON.stringify(req.body), signature, channelSecret)) {
      console.error('Invalid signature');
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
      details: errorMsg,
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

    // 外食費用の場合は残高を更新（カレンダー登録とFirestore保存が成功した後）
    let newBalance = user.diningBalance;
    if (analysisResult.category === '外食費用') {
      newBalance = user.diningBalance - analysisResult.amount;
      await updateDiningBalance(userId, newBalance);
    }

    // 返信メッセージを送信
    const responseMessage = createRegistrationMessage(
      analysisResult.category,
      analysisResult.amount,
      user.displayName,
      analysisResult.storeName,
      analysisResult.date,
      analysisResult.category === '外食費用' ? newBalance : undefined
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

  try {
    // 全角・半角スペースを統一（全て半角スペースに変換）
    const normalizedText = text.slice(1).trim().replace(/　/g, ' ');
    const command = normalizedText;

    // @ヘルプコマンド
    if (command === 'ヘルプ') {
      const message = createHelpMessage();
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
    else if (command === '履歴') {
      await handleHistoryCommand(replyToken, accessToken);
    }
    // @削除コマンド
    else if (command.startsWith('削除')) {
      const args = command.replace('削除', '').trim();
      if (args.length === 0) {
        // 引数なし → 対話モード開始
        await startDeleteExpenseConversation(userId, groupId, replyToken, accessToken);
      } else {
        // 引数あり → 通常処理
        await handleDeleteCommand(replyToken, userId, args, accessToken, calendarId);
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
 */
async function handleBudgetCommand(replyToken: string, newBudget: number, accessToken: string): Promise<void> {
  await updateSettings({ monthlyBudget: newBudget });
  const message = createBudgetUpdateMessage(newBudget);
  await replyMessage(replyToken, message, accessToken);
}

/**
 * 履歴コマンド処理
 */
async function handleHistoryCommand(replyToken: string, accessToken: string): Promise<void> {
  const expenses = await getRecentExpenses(10);
  const historyData = expenses.map(exp => ({
    date: exp.date.toDate(),
    category: exp.category,
    userName: exp.userName,
    amount: exp.amount,
  }));

  const message = createHistoryMessage(historyData);
  await replyMessage(replyToken, message, accessToken);
}

/**
 * 削除コマンド処理
 */
async function handleDeleteCommand(
  replyToken: string,
  userId: string,
  args: string,
  accessToken: string,
  calendarId: string
): Promise<void> {
  try {
    // 引数をパース（例: "12/3 1280"）
    const parts = args.split(' ').filter(p => p.length > 0);

    if (parts.length < 2) {
      await replyMessage(
        replyToken,
        '❌ 形式が正しくありません\n\n使い方: @削除 {日付} {金額}\n例: @削除 12/3 1280',
        accessToken
      );
      return;
    }

    // 日付をパース
    const dateParts = parts[0].split('/');
    if (dateParts.length !== 2) {
      await replyMessage(
        replyToken,
        '❌ 日付の形式が正しくありません\n例: @削除 12/3 1280',
        accessToken
      );
      return;
    }

    const month = parseInt(dateParts[0], 10);
    const day = parseInt(dateParts[1], 10);
    const year = new Date().getFullYear();
    const targetDate = new Date(year, month - 1, day);

    // 金額をパース
    const amountStr = parts[1].replace(/[,，]/g, '');
    const amount = parseInt(amountStr, 10);

    if (isNaN(amount) || amount <= 0) {
      await replyMessage(
        replyToken,
        '❌ 正しい金額を入力してください\n例: @削除 12/3 1280',
        accessToken
      );
      return;
    }

    // 該当する支出を削除（まず外食費用、次に買い物費用で検索）
    let deletedExpense = await deleteExpenseByDateAndAmount(userId, targetDate, amount, '外食費用');

    if (!deletedExpense) {
      deletedExpense = await deleteExpenseByDateAndAmount(userId, targetDate, amount, '買い物費用');
    }

    if (!deletedExpense) {
      await replyMessage(
        replyToken,
        '❌ 指定した日付・金額の支出が見つかりません',
        accessToken
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

    // 外食費用の場合は残高を戻す
    if (deletedExpense.category === '外食費用') {
      const user = await getUser(userId);
      if (user) {
        const newBalance = user.diningBalance + deletedExpense.amount;
        await updateDiningBalance(userId, newBalance);
      }
    }

    const user = await getUser(userId);
    const message = createDeleteMessage(
      targetDate.toISOString().split('T')[0],
      deletedExpense.category,
      deletedExpense.amount,
      deletedExpense.userName,
      deletedExpense.storeName,
      deletedExpense.category === '外食費用' && user ? user.diningBalance : undefined
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
    // 引数をパース（例: "外食費用 田中 1280" または "外食費用 田中 1280 12/1"）
    const parts = args.split(' ').filter(p => p.length > 0);

    if (parts.length < 3) {
      await replyMessage(
        replyToken,
        '❌ 形式が正しくありません\n\n使い方: @追加 {カテゴリー} {支払い者名} {金額} [{日付}]\n例: @追加 外食費用 田中 1280\n例: @追加 外食費用 @自分 1280\n例: @追加 外食費用 田中 1280 12/1',
        accessToken
      );
      return;
    }

    const category = parts[0];
    let payerName = parts[1]; // 支払い者名（代理入力可能）
    const amountStr = parts[2].replace(/[,，]/g, '');
    const amount = parseInt(amountStr, 10);
    const dateInput = parts.length >= 4 ? parts[3] : null; // 日付（オプション）

    // LINEからコマンド実行者の表示名を取得
    const displayName = await getUserDisplayName(groupId, userId, accessToken);

    // @自分が指定された場合は、送信者の名前を使用
    if (payerName === '@自分') {
      payerName = displayName;
    }
    // メンションされたユーザーがいる場合、その表示名を取得
    else if (mentions.length > 0 && payerName.startsWith('@')) {
      // メンションの最初のユーザーを使用
      const mentionedUserId = mentions[0].userId;
      payerName = await getUserDisplayName(groupId, mentionedUserId, accessToken);
    }

    // カテゴリーチェック
    if (category !== '外食費用' && category !== '買い物費用') {
      await replyMessage(
        replyToken,
        '❌ カテゴリーは「外食費用」または「買い物費用」を指定してください',
        accessToken
      );
      return;
    }

    // 金額チェック
    if (isNaN(amount) || amount <= 0) {
      await replyMessage(
        replyToken,
        '❌ 正しい金額を入力してください\n例: @追加 外食費用 田中 1280',
        accessToken
      );
      return;
    }

    // ユーザー情報を取得・作成（コマンド実行者として）
    const user = await getOrCreateUser(userId, displayName, groupId);

    // 日付をパース
    let expenseDate: Date;
    if (dateInput) {
      // 日付が指定された場合（例: "12/1"）
      const dateParts = dateInput.split('/');
      if (dateParts.length === 2) {
        const month = parseInt(dateParts[0], 10);
        const day = parseInt(dateParts[1], 10);
        const year = new Date().getFullYear();
        expenseDate = new Date(year, month - 1, day);

        // 日付が無効な場合
        if (isNaN(expenseDate.getTime())) {
          await replyMessage(
            replyToken,
            '❌ 日付の形式が正しくありません\n例: @追加 外食費用 田中 1280 12/1',
            accessToken
          );
          return;
        }
      } else {
        await replyMessage(
          replyToken,
          '❌ 日付の形式が正しくありません\n例: @追加 外食費用 田中 1280 12/1',
          accessToken
        );
        return;
      }
    } else {
      // 日付が指定されない場合は今日の日付を使用
      expenseDate = new Date();
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

    // 外食費用の場合は残高を更新（カレンダー登録とFirestore保存が成功した後）
    let newBalance = user.diningBalance;
    if (category === '外食費用') {
      newBalance = user.diningBalance - amount;
      await updateDiningBalance(userId, newBalance);
    }

    // 返信メッセージを送信
    const responseMessage = createRegistrationMessage(
      category,
      amount,
      payerName,
      '手動入力',
      dateStr,
      category === '外食費用' ? newBalance : undefined
    );

    await replyMessage(replyToken, responseMessage, accessToken);
  } catch (error) {
    console.error('Add command error:', error);
    const errorMsg = error instanceof Error ? error.message : '不明なエラー';
    const errorStack = error instanceof Error ? error.stack : '';
    await replyMessage(
      replyToken,
      `❌ 追加に失敗しました\n\n詳細: ${errorMsg}\n\n${errorStack ? `スタック:\n${errorStack.substring(0, 200)}...` : ''}`,
      accessToken
    );
  }
}

/**
 * 予定コマンド処理
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
    // 引数をパース（例: "田中 会議" または "田中 会議 12/15" または "田中 会議 12/15 14:30 16:00"）
    const parts = args.split(' ').filter(p => p.length > 0);

    if (parts.length < 2) {
      await replyMessage(
        replyToken,
        '❌ 形式が正しくありません\n\n使い方: @予定 {ユーザー名} {予定内容} [{日付}] [{開始時間}] [{終了時間}]\n例: @予定 田中 会議\n例: @予定 @自分 会議\n例: @予定 田中 会議 12/15\n例: @予定 田中 会議 12/15 14:30 16:00',
        accessToken
      );
      return;
    }

    let userName = parts[0];
    const scheduleContent = parts[1];
    const dateInput = parts.length >= 3 ? parts[2] : null;
    const startTimeInput = parts.length >= 4 ? parts[3] : null;
    const endTimeInput = parts.length >= 5 ? parts[4] : null;

    // LINEからコマンド実行者の表示名を取得
    const displayName = await getUserDisplayName(groupId, userId, accessToken);

    // @自分が指定された場合は、送信者の名前を使用
    if (userName === '@自分') {
      userName = displayName;
    }
    // メンションされたユーザーがいる場合、その表示名を取得
    else if (mentions.length > 0 && userName.startsWith('@')) {
      const mentionedUserId = mentions[0].userId;
      userName = await getUserDisplayName(groupId, mentionedUserId, accessToken);
    }

    // 日付をパース
    let scheduleDate: Date;
    if (dateInput) {
      // 日付が指定された場合（例: "12/15"）
      const dateParts = dateInput.split('/');
      if (dateParts.length === 2) {
        const month = parseInt(dateParts[0], 10);
        const day = parseInt(dateParts[1], 10);
        const year = new Date().getFullYear();
        scheduleDate = new Date(year, month - 1, day);

        if (isNaN(scheduleDate.getTime())) {
          await replyMessage(
            replyToken,
            '❌ 日付の形式が正しくありません\n例: @予定 田中 会議 12/15',
            accessToken
          );
          return;
        }
      } else {
        await replyMessage(
          replyToken,
          '❌ 日付の形式が正しくありません\n例: @予定 田中 会議 12/15',
          accessToken
        );
        return;
      }
    } else {
      scheduleDate = new Date();
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
    }

    // カレンダーに予定を登録
    await createScheduleEvent(
      calendarId,
      userName,
      scheduleContent,
      dateStr,
      startTime,
      endTime
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
