import { Request, Response } from '@google-cloud/functions-framework';
import { WebhookEvent, MessageEvent, TextEventMessage, ImageEventMessage } from '@line/bot-sdk';
import { Timestamp } from '@google-cloud/firestore';
import * as crypto from 'crypto';

// Services
import { analyzeReceiptImage } from '../services/gemini.js';
import { getOrCreateUser, saveExpense, updateDiningBalance, getUser, getAllUsers, getSettings, updateSettings, deleteExpenseByDateAndAmount, getRecentExpenses } from '../services/firestore.js';
import { createCalendarEvent, deleteCalendarEvent } from '../services/calendar.js';
import { getImageContent, replyMessage, createRegistrationMessage, createErrorMessage, createBalanceMessage, createBudgetUpdateMessage, createHistoryMessage, createDeleteMessage, createHelpMessage } from '../services/line.js';

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
    res.status(500).json({ error: 'Internal server error' });
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
    // 実際の表示名はLINE APIから取得する必要がありますが、簡略化のため仮の名前を使用
    const userName = userId.slice(0, 8); // 仮の名前
    const user = await getOrCreateUser(userId, userName, groupId);

    // 日付をTimestampに変換
    const expenseDate = Timestamp.fromDate(new Date(analysisResult.date));

    // 外食費用の場合は残高を更新
    let newBalance = user.diningBalance;
    if (analysisResult.category === '外食費用') {
      newBalance = user.diningBalance - analysisResult.amount;
      await updateDiningBalance(userId, newBalance);
    }

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
    await replyMessage(replyToken, createErrorMessage(), accessToken);
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

  // コマンドでない場合は無視
  if (!text.startsWith('@')) {
    return;
  }

  try {
    const command = text.slice(1).trim();

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
    else if (command.startsWith('削除 ')) {
      const args = command.replace('削除 ', '').trim();
      await handleDeleteCommand(replyToken, userId, args, accessToken, calendarId);
    }
    // @追加コマンド
    else if (command.startsWith('追加 ')) {
      const args = command.replace('追加 ', '').trim();
      await handleAddCommand(replyToken, userId, groupId, args, accessToken, calendarId);
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
    await replyMessage(replyToken, '⚠️ エラーが発生しました', accessToken);
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

    // 該当する支出を削除
    const deletedExpense = await deleteExpenseByDateAndAmount(userId, targetDate, amount);

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
    await replyMessage(replyToken, '❌ 削除に失敗しました', accessToken);
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
  calendarId: string
): Promise<void> {
  try {
    // 引数をパース（例: "外食費用 田中 1280"）
    const parts = args.split(' ').filter(p => p.length > 0);

    if (parts.length < 3) {
      await replyMessage(
        replyToken,
        '❌ 形式が正しくありません\n\n使い方: @追加 {カテゴリー} {支払い者名} {金額}\n例: @追加 外食費用 田中 1280',
        accessToken
      );
      return;
    }

    const category = parts[0];
    const userName = parts[1];
    const amountStr = parts[2].replace(/[,，]/g, '');
    const amount = parseInt(amountStr, 10);

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

    // ユーザー情報を取得・作成
    const user = await getOrCreateUser(userId, userName, groupId);

    // 外食費用の場合は残高を更新
    let newBalance = user.diningBalance;
    if (category === '外食費用') {
      newBalance = user.diningBalance - amount;
      await updateDiningBalance(userId, newBalance);
    }

    // カレンダーに登録
    const today = new Date();
    const dateStr = today.toISOString().split('T')[0];

    const calendarEventId = await createCalendarEvent(
      calendarId,
      userName,
      amount,
      category,
      '手動入力',
      dateStr
    );

    // Firestoreに保存
    await saveExpense({
      userId,
      userName,
      amount,
      category: category,
      storeName: '手動入力',
      date: Timestamp.fromDate(today),
      calendarEventId,
    });

    // 返信メッセージを送信
    const responseMessage = createRegistrationMessage(
      category,
      amount,
      userName,
      '手動入力',
      dateStr,
      category === '外食費用' ? newBalance : undefined
    );

    await replyMessage(replyToken, responseMessage, accessToken);
  } catch (error) {
    console.error('Add command error:', error);
    await replyMessage(replyToken, '❌ 追加に失敗しました', accessToken);
  }
}
