import { Timestamp } from '@google-cloud/firestore';
import { ConversationSession, Category } from '../types/index.js';
import { parseDateString, getJSTDate, isCurrentMonthJST } from '../utils/date.js';
import {
  saveConversationSession,
  updateConversationSession,
  deleteConversationSession,
  getOrCreateUser,
  saveExpense,
  updateDiningBalance,
  deleteExpenseByDateAndAmount,
  getAllUsers,
  updateSettings,
  getUserByDisplayName,
  saveSubscription,
  getActiveSubscriptions,
  deactivateSubscription,
  getSubscription,
  updateSubscription,
  saveRent,
  getRent,
  updateRent,
} from '../services/firestore.js';
import { createCalendarEvent, createScheduleEvent, deleteCalendarEvent } from '../services/calendar.js';
import { replyMessage, createRegistrationMessage, getUserDisplayName, createDeleteMessage } from '../services/line.js';

/**
 * 日付文字列（M/D形式）をパースして未来の日付を返す（JST）
 * 過去の日付になる場合は翌年に調整
 */
function parseFutureDate(input: string): Date | null {
  const dateParts = input.split('/');
  if (dateParts.length !== 2) {
    return null;
  }

  const month = parseInt(dateParts[0], 10);
  const day = parseInt(dateParts[1], 10);

  if (isNaN(month) || isNaN(day) || month < 1 || month > 12 || day < 1 || day > 31) {
    return null;
  }

  // JST の現在時刻を取得
  const jstDate = getJSTDate();
  const todayUTC = new Date(Date.UTC(jstDate.getUTCFullYear(), jstDate.getUTCMonth(), jstDate.getUTCDate()));
  let year = jstDate.getUTCFullYear();

  let date = new Date(Date.UTC(year, month - 1, day));

  // 過去の日付の場合は翌年に調整
  if (date < todayUTC) {
    year++;
    date = new Date(Date.UTC(year, month - 1, day));
  }

  // 日付が有効かチェック（例: 2/30 は無効）
  if (isNaN(date.getTime()) || date.getUTCMonth() !== month - 1) {
    return null;
  }

  return date;
}

/**
 * @追加の対話モード開始
 */
export async function startAddExpenseConversation(
  userId: string,
  groupId: string,
  replyToken: string,
  accessToken: string
): Promise<void> {
  const session: ConversationSession = {
    userId,
    groupId,
    type: 'add_expense',
    step: 'category',
    data: {},
    createdAt: Timestamp.now(),
    expiresAt: Timestamp.fromMillis(Date.now() + 10 * 60 * 1000),
  };

  await saveConversationSession(session);

  const message = `📝 支出を登録します

カテゴリーを選択してください
1️⃣ 外食費用
2️⃣ 買い物費用
3️⃣ 旅行費用`;

  await replyMessage(replyToken, message, accessToken);
}

/**
 * @予定の対話モード開始
 */
export async function startAddScheduleConversation(
  userId: string,
  groupId: string,
  replyToken: string,
  accessToken: string
): Promise<void> {
  const session: ConversationSession = {
    userId,
    groupId,
    type: 'add_schedule',
    step: 'schedule_content',
    data: {},
    createdAt: Timestamp.now(),
    expiresAt: Timestamp.fromMillis(Date.now() + 10 * 60 * 1000),
  };

  await saveConversationSession(session);

  const message = `📅 予定を登録します

予定内容を入力してください`;

  await replyMessage(replyToken, message, accessToken);
}

/**
 * @削除の対話モード開始
 */
export async function startDeleteExpenseConversation(
  userId: string,
  groupId: string,
  replyToken: string,
  accessToken: string
): Promise<void> {
  const session: ConversationSession = {
    userId,
    groupId,
    type: 'delete_expense',
    step: 'delete_category',
    data: {},
    createdAt: Timestamp.now(),
    expiresAt: Timestamp.fromMillis(Date.now() + 10 * 60 * 1000),
  };

  await saveConversationSession(session);

  const message = `🗑️ 削除する内容を選択してください

1️⃣ 外食費用
2️⃣ 買い物費用
3️⃣ 旅行費用`;

  await replyMessage(replyToken, message, accessToken);
}

/**
 * 対話モードの入力処理
 */
export async function handleConversationInput(
  session: ConversationSession,
  input: string,
  replyToken: string,
  userId: string,
  groupId: string,
  accessToken: string,
  calendarId: string,
  mentions: any[]
): Promise<void> {
  console.log(`handleConversationInput: type=${session.type}, step=${session.step}, input="${input.substring(0, 50)}"`);
  try {
    if (session.type === 'add_expense') {
      await handleAddExpenseConversation(session, input, replyToken, userId, groupId, accessToken, calendarId, mentions);
    } else if (session.type === 'add_schedule') {
      await handleAddScheduleConversation(session, input, replyToken, userId, groupId, accessToken, calendarId, mentions);
    } else if (session.type === 'delete_expense') {
      await handleDeleteExpenseConversation(session, input, replyToken, userId, groupId, accessToken, calendarId, mentions);
    } else if (session.type === 'initial_setup') {
      await handleInitialSetupConversation(session, input, replyToken, userId, accessToken);
    } else if (session.type === 'change_settings') {
      await handleChangeSettingsConversation(session, input, replyToken, userId, accessToken);
    } else if (session.type === 'add_subscription') {
      await handleAddSubscriptionConversation(session, input, replyToken, userId, groupId, accessToken, mentions);
    } else if (session.type === 'delete_subscription') {
      await handleDeleteSubscriptionConversation(session, input, replyToken, userId, groupId, accessToken);
    } else if (session.type === 'edit_subscription') {
      await handleEditSubscriptionConversation(session, input, replyToken, userId, groupId, accessToken, mentions);
    } else if (session.type === 'add_rent') {
      await handleAddRentConversation(session, input, replyToken, userId, groupId, accessToken, mentions);
    } else if (session.type === 'edit_rent') {
      await handleEditRentConversation(session, input, replyToken, userId, groupId, accessToken, mentions);
    } else if (session.type === 'add_travel') {
      await handleAddTravelConversation(session, input, replyToken, userId, groupId, accessToken, calendarId, mentions);
    }
    console.log(`handleConversationInput completed successfully`);
  } catch (error) {
    console.error('Conversation input error:', error);
    const errorMsg = error instanceof Error ? error.message : '不明なエラー';
    const errorStack = error instanceof Error ? error.stack : '';
    console.error('Error details:', { message: errorMsg, stack: errorStack?.substring(0, 500) });
    await deleteConversationSession(userId);
    try {
      await replyMessage(replyToken, `❌ エラーが発生しました\n\n詳細: ${errorMsg}`, accessToken);
    } catch (replyError) {
      console.error('Failed to send error reply:', replyError);
    }
  }
}

/**
 * @追加の対話処理
 */
async function handleAddExpenseConversation(
  session: ConversationSession,
  input: string,
  replyToken: string,
  userId: string,
  groupId: string,
  accessToken: string,
  calendarId: string,
  mentions: any[]
): Promise<void> {
  const { step, data } = session;

  if (step === 'category') {
    let category: Category | null = null;
    if (input === '1' || input.includes('外食')) {
      category = '外食費用';
    } else if (input === '2' || input.includes('買い物')) {
      category = '買い物費用';
    } else if (input === '3' || input.includes('旅行')) {
      category = '旅行費用';
    }

    if (!category) {
      await replyMessage(replyToken, '❌ 1、2、または 3 を選択してください', accessToken);
      return;
    }

    session.data.category = category;
    session.step = 'payer_name';
    await updateConversationSession(userId, { step: 'payer_name', data: session.data });

    await replyMessage(
      replyToken,
      `支払い者名を入力してください\n（@自分 で自分の名前、@メンションでユーザー指定）`,
      accessToken
    );
  } else if (step === 'payer_name') {
    let payerName = input.trim();
    let payerUserId: string | undefined = undefined;

    const displayName = await getUserDisplayName(groupId, userId, accessToken);

    // 全角・半角の@自分に対応
    if (payerName === '@自分' || payerName === '＠自分') {
      payerName = displayName;
      payerUserId = userId;
    } else if (mentions.length > 0 && (payerName.startsWith('@') || payerName.startsWith('＠'))) {
      // LINEメンションの場合
      const mentionedUserId = mentions[0].userId;
      payerName = await getUserDisplayName(groupId, mentionedUserId, accessToken);
      payerUserId = mentionedUserId;
    } else {
      // テキストで名前を入力した場合、既存ユーザーから検索
      const existingUser = await getUserByDisplayName(payerName);
      if (existingUser) {
        payerUserId = existingUser.id;
        console.log(`Found existing user by name: ${payerName} -> ${payerUserId}`);
      } else {
        console.log(`User not found by name: ${payerName}, will use command executor's context`);
        // ユーザーが見つからない場合はundefinedのまま（date ステップでエラーになる）
      }
    }

    session.data.payerName = payerName;
    session.data.payerUserId = payerUserId;
    session.step = 'amount';
    await updateConversationSession(userId, { step: 'amount', data: session.data });

    await replyMessage(replyToken, `金額を入力してください（数字のみ）`, accessToken);
  } else if (step === 'amount') {
    const amount = parseInt(input.replace(/[,，]/g, ''), 10);
    if (isNaN(amount) || amount <= 0) {
      await replyMessage(replyToken, '❌ 正しい金額を入力してください', accessToken);
      return;
    }

    session.data.amount = amount;
    session.step = 'date';
    await updateConversationSession(userId, { step: 'date', data: session.data });

    const currentYear = getJSTDate().getUTCFullYear();
    await replyMessage(
      replyToken,
      `日付を入力してください\n（例: 12/15、2024/12/15）\n日付形式:\n- M/D: 今年の日付（例: 5/22 → ${currentYear}/5/22）\n- YYYY/M/D: 年を指定（例: 2024/5/22）\n「今日」と入力すると今日の日付になります`,
      accessToken
    );
  } else if (step === 'date') {
    let expenseDate: Date;
    if (input === '今日') {
      const jstDate = getJSTDate();
      expenseDate = new Date(Date.UTC(jstDate.getUTCFullYear(), jstDate.getUTCMonth(), jstDate.getUTCDate(), 0, 0, 0, 0));
    } else {
      const parsedDate = parseDateString(input);
      if (!parsedDate) {
        await replyMessage(
          replyToken,
          '❌ 日付の形式が正しくありません\n例: 12/15、2024/12/15',
          accessToken
        );
        return;
      }
      expenseDate = parsedDate;
    }

    const category = data.category!;
    const payerName = data.payerName!;
    const amount = data.amount!;

    // 支払い者のユーザー情報を取得
    let payerUserId = data.payerUserId;
    let payerUser;

    if (payerUserId) {
      // payerUserId が保存されている場合はそれを使用
      const payerDisplayName = await getUserDisplayName(groupId, payerUserId, accessToken);
      payerUser = await getOrCreateUser(payerUserId, payerDisplayName, groupId);
    } else {
      // payerUserId がない場合は名前で再検索
      const existingUser = await getUserByDisplayName(payerName);
      if (existingUser) {
        payerUser = existingUser;
        payerUserId = existingUser.id;
      } else {
        // ユーザーが見つからない場合はエラー
        await replyMessage(
          replyToken,
          `❌ ユーザー「${payerName}」が見つかりませんでした。\n\n@メンション または @自分 を使用してください。`,
          accessToken
        );
        await deleteConversationSession(userId);
        return;
      }
    }

    const dateStr = `${expenseDate.getUTCFullYear()}-${String(expenseDate.getUTCMonth() + 1).padStart(2, '0')}-${String(expenseDate.getUTCDate()).padStart(2, '0')}`;

    const calendarEventId = await createCalendarEvent(
      calendarId,
      payerName,
      amount,
      category,
      '手動入力',
      dateStr
    );

    await saveExpense({
      userId: payerUser.id,
      userName: payerName,
      amount,
      category,
      storeName: '手動入力',
      date: Timestamp.fromDate(expenseDate),
      calendarEventId,
    });

    // 外食費用かつ現在の月の場合のみ残高を更新
    let newBalance: number | undefined;
    if (category === '外食費用' && isCurrentMonthJST(dateStr)) {
      const currentBalance = payerUser.diningBalance;
      newBalance = currentBalance - amount;
      await updateDiningBalance(payerUser.id, newBalance);
    }

    const message = createRegistrationMessage(
      category,
      amount,
      payerName,
      '手動入力',
      dateStr,
      newBalance
    );
    await replyMessage(replyToken, message, accessToken);

    await deleteConversationSession(userId);
  }
}

/**
 * @予定の対話処理
 */
async function handleAddScheduleConversation(
  session: ConversationSession,
  input: string,
  replyToken: string,
  userId: string,
  groupId: string,
  accessToken: string,
  calendarId: string,
  mentions: any[]
): Promise<void> {
  console.log(`handleAddScheduleConversation: step=${session.step}, input="${input.substring(0, 100)}" (length: ${input.length})`);
  const { step, data } = session;

  if (step === 'schedule_content') {
    // 予定内容を取得（絵文字も含めてそのまま保存）
    const scheduleContent = input.trim();
    console.log(`Schedule content received: "${scheduleContent}" (length: ${scheduleContent.length})`);

    if (!scheduleContent || scheduleContent.length === 0) {
      await replyMessage(replyToken, '❌ 予定内容を入力してください', accessToken);
      return;
    }

    session.data.scheduleContent = scheduleContent;
    session.step = 'date';

    try {
      await updateConversationSession(userId, { step: 'date', data: session.data });
      console.log(`Session updated to step: date, scheduleContent: "${scheduleContent}"`);
    } catch (updateError) {
      console.error('Failed to update conversation session:', updateError);
      throw updateError;
    }

    const currentYear = getJSTDate().getUTCFullYear();
    await replyMessage(
      replyToken,
      `日付を入力してください\n（例: 12/15、2024/12/15）\n日付形式:\n- M/D: 今年の日付（例: 5/22 → ${currentYear}/5/22）\n- YYYY/M/D: 年を指定（例: 2024/5/22）\n「今日」と入力すると今日の日付になります`,
      accessToken
    );
    console.log(`Reply message sent for schedule_content step`);
  } else if (step === 'date') {
    let scheduleDate: Date;
    if (input === '今日') {
      const jstDate = getJSTDate();
      scheduleDate = new Date(Date.UTC(jstDate.getUTCFullYear(), jstDate.getUTCMonth(), jstDate.getUTCDate(), 0, 0, 0, 0));
    } else {
      // 日付をパース（年指定にも対応）
      const parsedDate = parseDateString(input);
      if (!parsedDate) {
        await replyMessage(
          replyToken,
          '❌ 日付の形式が正しくありません\n例: 12/15、2024/12/15',
          accessToken
        );
        return;
      }
      scheduleDate = parsedDate;
    }

    const dateStr = `${scheduleDate.getUTCFullYear()}-${String(scheduleDate.getUTCMonth() + 1).padStart(2, '0')}-${String(scheduleDate.getUTCDate()).padStart(2, '0')}`;
    session.data.scheduleDate = dateStr;
    session.step = 'start_time';
    await updateConversationSession(userId, { step: 'start_time', data: session.data });

    await replyMessage(
      replyToken,
      `開始時間を入力してください\n（例: 14:30）\n「なし」と入力すると終日予定になります`,
      accessToken
    );
  } else if (step === 'start_time') {
    // POSTしたユーザーの表示名を取得
    const userName = await getUserDisplayName(groupId, userId, accessToken);

    // 開始時間のバリデーション
    if (input === 'なし' || input === 'ナシ') {
      // 終日予定として登録
      const scheduleContent = data.scheduleContent!;
      const dateStr = data.scheduleDate!;

      await createScheduleEvent(calendarId, userName, scheduleContent, dateStr);

      const responseMessage = `✅ 予定を登録しました！\n\n👤 ${userName}\n📝 ${scheduleContent}\n📅 ${dateStr}\n⏰ 終日`;

      await replyMessage(replyToken, responseMessage, accessToken);
      await deleteConversationSession(userId);
      return;
    }

    const timeMatch = input.match(/^(\d{1,2}):(\d{2})$/);
    if (timeMatch) {
      const hour = parseInt(timeMatch[1], 10);
      const minute = parseInt(timeMatch[2], 10);
      if (hour >= 0 && hour <= 23 && minute >= 0 && minute <= 59) {
        const startTime = `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`;
        session.data.scheduleStartTime = startTime;
        session.step = 'end_time';
        await updateConversationSession(userId, { step: 'end_time', data: session.data });

        await replyMessage(
          replyToken,
          `終了時間を入力してください\n（例: 16:00）\n「なし」と入力すると開始時間+1時間が終了時間になります`,
          accessToken
        );
      } else {
        await replyMessage(replyToken, '❌ 時間の形式が正しくありません\n例: 14:30（0:00〜23:59）', accessToken);
      }
    } else {
      await replyMessage(replyToken, '❌ 時間の形式が正しくありません\n例: 14:30\n終日の場合は「なし」と入力', accessToken);
    }
  } else if (step === 'end_time') {
    // POSTしたユーザーの表示名を取得
    const userName = await getUserDisplayName(groupId, userId, accessToken);
    const scheduleContent = data.scheduleContent!;
    const dateStr = data.scheduleDate!;
    const startTime = data.scheduleStartTime!;

    // 「なし」の場合は開始時間+1時間を終了時間として登録
    if (input === 'なし' || input === 'ナシ') {
      const [hour, minute] = startTime.split(':').map(Number);
      const endHour = (hour + 1) % 24;
      const endTime = `${String(endHour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`;

      await createScheduleEvent(calendarId, userName, scheduleContent, dateStr, startTime, endTime);

      const responseMessage = `✅ 予定を登録しました！\n\n👤 ${userName}\n📝 ${scheduleContent}\n📅 ${dateStr}\n⏰ ${startTime} 〜 ${endTime}`;

      await replyMessage(replyToken, responseMessage, accessToken);
      await deleteConversationSession(userId);
      return;
    }

    // 終了時間のバリデーション
    const timeMatch = input.match(/^(\d{1,2}):(\d{2})$/);
    if (!timeMatch) {
      await replyMessage(replyToken, '❌ 時間の形式が正しくありません\n例: 16:00\n終了時間なしの場合は「なし」と入力', accessToken);
      return;
    }

    const hour = parseInt(timeMatch[1], 10);
    const minute = parseInt(timeMatch[2], 10);
    if (hour < 0 || hour > 23 || minute < 0 || minute > 59) {
      await replyMessage(replyToken, '❌ 時間の形式が正しくありません\n例: 16:00（0:00〜23:59）', accessToken);
      return;
    }

    const endTime = `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`;

    // 開始時間より終了時間が早い場合はエラー
    const startMinutes = parseInt(startTime.split(':')[0]) * 60 + parseInt(startTime.split(':')[1]);
    const endMinutes = hour * 60 + minute;
    if (endMinutes <= startMinutes) {
      await replyMessage(replyToken, '❌ 終了時間は開始時間より後にしてください', accessToken);
      return;
    }

    await createScheduleEvent(calendarId, userName, scheduleContent, dateStr, startTime, endTime);

    const responseMessage = `✅ 予定を登録しました！\n\n👤 ${userName}\n📝 ${scheduleContent}\n📅 ${dateStr}\n⏰ ${startTime} 〜 ${endTime}`;

    await replyMessage(replyToken, responseMessage, accessToken);

    await deleteConversationSession(userId);
  }
}

/**
 * @削除の対話処理
 */
async function handleDeleteExpenseConversation(
  session: ConversationSession,
  input: string,
  replyToken: string,
  userId: string,
  groupId: string,
  accessToken: string,
  calendarId: string,
  mentions: any[]
): Promise<void> {
  const { step, data } = session;

  if (step === 'delete_category') {
    let deleteCategory: Category | null = null;
    if (input === '1' || input.includes('外食')) {
      deleteCategory = '外食費用';
    } else if (input === '2' || input.includes('買い物')) {
      deleteCategory = '買い物費用';
    } else if (input === '3' || input.includes('旅行')) {
      deleteCategory = '旅行費用';
    }

    if (!deleteCategory) {
      await replyMessage(replyToken, '❌ 1、2、または 3 を選択してください', accessToken);
      return;
    }

    session.data.deleteCategory = deleteCategory;
    session.step = 'delete_user_name';
    await updateConversationSession(userId, { step: 'delete_user_name', data: session.data });

    await replyMessage(
      replyToken,
      `削除したい支出の支払い者名を入力してください\n（@自分 で自分の名前、@メンションでユーザー指定）`,
      accessToken
    );
  } else if (step === 'delete_user_name') {
    let deleteUserName = input.trim();

    const displayName = await getUserDisplayName(groupId, userId, accessToken);

    // 全角・半角の@自分に対応
    if (deleteUserName === '@自分' || deleteUserName === '＠自分') {
      deleteUserName = displayName;
    } else if (mentions.length > 0 && (deleteUserName.startsWith('@') || deleteUserName.startsWith('＠'))) {
      const mentionedUserId = mentions[0].userId;
      deleteUserName = await getUserDisplayName(groupId, mentionedUserId, accessToken);
    }

    session.data.deleteUserName = deleteUserName;
    session.step = 'delete_amount';
    await updateConversationSession(userId, { step: 'delete_amount', data: session.data });

    await replyMessage(
      replyToken,
      `削除する支出の金額を入力してください（数字のみ）`,
      accessToken
    );
  } else if (step === 'delete_amount') {
    const deleteAmount = parseInt(input.replace(/[,，]/g, ''), 10);
    if (isNaN(deleteAmount) || deleteAmount <= 0) {
      await replyMessage(replyToken, '❌ 正しい金額を入力してください', accessToken);
      return;
    }

    session.data.deleteAmount = deleteAmount;
    session.step = 'delete_date';
    await updateConversationSession(userId, { step: 'delete_date', data: session.data });

    const currentYear = getJSTDate().getUTCFullYear();
    await replyMessage(
      replyToken,
      `削除する支出の日付を入力してください\n（例: 12/15、2024/12/15）\n日付形式:\n- M/D: 今年の日付（例: 5/22 → ${currentYear}/5/22）\n- YYYY/M/D: 年を指定（例: 2024/5/22）\n「今日」と入力すると今日の日付になります`,
      accessToken
    );
  } else if (step === 'delete_date') {
    let deleteDate: Date;
    if (input === '今日') {
      const jstDate = getJSTDate();
      deleteDate = new Date(Date.UTC(jstDate.getUTCFullYear(), jstDate.getUTCMonth(), jstDate.getUTCDate(), 0, 0, 0, 0));
    } else {
      // YYYY/M/D または M/D 形式に対応
      const dateParts = input.split('/');
      if (dateParts.length === 3) {
        // YYYY/M/D 形式
        const year = parseInt(dateParts[0], 10);
        const month = parseInt(dateParts[1], 10);
        const day = parseInt(dateParts[2], 10);
        deleteDate = new Date(Date.UTC(year, month - 1, day, 0, 0, 0, 0));

        if (isNaN(deleteDate.getTime()) || deleteDate.getUTCMonth() !== month - 1) {
          await replyMessage(replyToken, '❌ 日付の形式が正しくありません\n例: 12/15、2024/12/15', accessToken);
          return;
        }
      } else if (dateParts.length === 2) {
        // M/D 形式（今年として扱う）
        const month = parseInt(dateParts[0], 10);
        const day = parseInt(dateParts[1], 10);
        const jstDate = getJSTDate();
        const year = jstDate.getUTCFullYear();
        deleteDate = new Date(Date.UTC(year, month - 1, day, 0, 0, 0, 0));

        if (isNaN(deleteDate.getTime()) || deleteDate.getUTCMonth() !== month - 1) {
          await replyMessage(replyToken, '❌ 日付の形式が正しくありません\n例: 12/15、2024/12/15', accessToken);
          return;
        }
      } else {
        await replyMessage(replyToken, '❌ 日付の形式が正しくありません\n例: 12/15、2024/12/15', accessToken);
        return;
      }
    }

    const dateStr = `${deleteDate.getUTCFullYear()}-${String(deleteDate.getUTCMonth() + 1).padStart(2, '0')}-${String(deleteDate.getUTCDate()).padStart(2, '0')}`;

    const deleteCategory = data.deleteCategory!;
    const deleteUserName = data.deleteUserName!;
    const deleteAmount = data.deleteAmount!;

    // 削除対象のユーザー情報を取得（deleteUserNameから検索）
    const targetUser = await getUserByDisplayName(deleteUserName);
    if (!targetUser) {
      await replyMessage(
        replyToken,
        `❌ ユーザー「${deleteUserName}」が見つかりませんでした`,
        accessToken
      );
      await deleteConversationSession(userId);
      return;
    }

    // 支出を削除（deleteDateをDateオブジェクトに変換）
    const deleteDateObj = new Date(deleteDate);
    const deletedExpense = await deleteExpenseByDateAndAmount(targetUser.id, deleteDateObj, deleteAmount, deleteCategory);

    if (!deletedExpense) {
      await replyMessage(
        replyToken,
        `❌ 該当する支出が見つかりませんでした\n\n👤 ${deleteUserName}\n📅 ${deleteDate}\n💰 ¥${deleteAmount.toLocaleString()}`,
        accessToken
      );
      await deleteConversationSession(userId);
      return;
    }

    // カレンダーイベントを削除
    if (deletedExpense.calendarEventId) {
      try {
        await deleteCalendarEvent(calendarId, deletedExpense.calendarEventId);
      } catch (error) {
        console.error('Failed to delete calendar event:', error);
        // カレンダーイベント削除失敗してもexpenseは削除済みなので処理続行
      }
    }

    // 外食費用かつ現在の月の場合のみ残高を戻す
    let newBalance: number | undefined;
    if (deletedExpense.category === '外食費用' && isCurrentMonthJST(dateStr)) {
      const currentBalance = targetUser.diningBalance;
      newBalance = currentBalance + deleteAmount;
      await updateDiningBalance(targetUser.id, newBalance);
    }

    const message = createDeleteMessage(
      dateStr,
      deletedExpense.category,
      deleteAmount,
      deleteUserName,
      deletedExpense.storeName,
      newBalance
    );
    await replyMessage(replyToken, message, accessToken);

    await deleteConversationSession(userId);
  }
}

/**
 * @初期設定の対話モード開始
 */
export async function startInitialSetupConversation(
  userId: string,
  groupId: string,
  replyToken: string,
  accessToken: string
): Promise<void> {
  const session: ConversationSession = {
    userId,
    groupId,
    type: 'initial_setup',
    step: 'first_half_payer',
    data: {},
    createdAt: Timestamp.now(),
    expiresAt: Timestamp.fromMillis(Date.now() + 10 * 60 * 1000),
  };

  await saveConversationSession(session);

  // ユーザーリストを取得
  const users = await getAllUsers();
  let message = `⚙️ 外食担当者を設定します\n\n`;
  message += `月前半（1日〜15日）の外食担当者を選択してください\n\n`;

  users.forEach((user, index) => {
    message += `${index + 1}️⃣ ${user.displayName}\n`;
  });

  await replyMessage(replyToken, message, accessToken);
}

/**
 * @設定変更の対話モード開始
 */
export async function startChangeSettingsConversation(
  userId: string,
  groupId: string,
  replyToken: string,
  accessToken: string
): Promise<void> {
  const session: ConversationSession = {
    userId,
    groupId,
    type: 'change_settings',
    step: 'first_half_payer',
    data: {},
    createdAt: Timestamp.now(),
    expiresAt: Timestamp.fromMillis(Date.now() + 10 * 60 * 1000),
  };

  await saveConversationSession(session);

  // ユーザーリストを取得
  const users = await getAllUsers();
  let message = `🔄 外食担当者を変更します\n\n`;
  message += `月前半（1日〜15日）の外食担当者を選択してください\n\n`;

  users.forEach((user, index) => {
    message += `${index + 1}️⃣ ${user.displayName}\n`;
  });

  await replyMessage(replyToken, message, accessToken);
}

/**
 * @初期設定の対話処理
 */
async function handleInitialSetupConversation(
  session: ConversationSession,
  input: string,
  replyToken: string,
  userId: string,
  accessToken: string
): Promise<void> {
  const { step, data } = session;

  // ユーザーリストを取得
  const users = await getAllUsers();

  if (step === 'first_half_payer') {
    // 前半担当者の選択
    const selection = parseInt(input.trim(), 10);
    if (isNaN(selection) || selection < 1 || selection > users.length) {
      await replyMessage(replyToken, `❌ 1〜${users.length}の数字を入力してください`, accessToken);
      return;
    }

    const selectedUser = users[selection - 1];
    session.data.firstHalfPayerId = selectedUser.id;
    session.step = 'second_half_payer';
    await updateConversationSession(userId, { step: 'second_half_payer', data: session.data });

    let message = `✅ 前半担当: ${selectedUser.displayName}\n\n`;
    message += `月後半（16日〜月末）の外食担当者を選択してください\n\n`;

    users.forEach((user, index) => {
      message += `${index + 1}️⃣ ${user.displayName}\n`;
    });

    await replyMessage(replyToken, message, accessToken);
  } else if (step === 'second_half_payer') {
    // 後半担当者の選択
    const selection = parseInt(input.trim(), 10);
    if (isNaN(selection) || selection < 1 || selection > users.length) {
      await replyMessage(replyToken, `❌ 1〜${users.length}の数字を入力してください`, accessToken);
      return;
    }

    const selectedUser = users[selection - 1];
    const firstHalfPayerId = data.firstHalfPayerId!;

    // Firestoreの設定を更新
    await updateSettings({
      firstHalfPayerId,
      secondHalfPayerId: selectedUser.id,
    });

    const firstHalfUser = users.find(u => u.id === firstHalfPayerId);

    let message = `✅ 外食担当者を設定しました！\n\n`;
    message += `📅 前半（1日〜15日）: ${firstHalfUser?.displayName}\n`;
    message += `📅 後半（16日〜月末）: ${selectedUser.displayName}`;

    await replyMessage(replyToken, message, accessToken);
    await deleteConversationSession(userId);
  }
}

/**
 * @設定変更の対話処理
 */
async function handleChangeSettingsConversation(
  session: ConversationSession,
  input: string,
  replyToken: string,
  userId: string,
  accessToken: string
): Promise<void> {
  // 初期設定と同じロジックを使用
  await handleInitialSetupConversation(session, input, replyToken, userId, accessToken);
}

/**
 * @サブスク追加の対話モード開始
 */
export async function startAddSubscriptionConversation(
  userId: string,
  groupId: string,
  replyToken: string,
  accessToken: string
): Promise<void> {
  const session: ConversationSession = {
    userId,
    groupId,
    type: 'add_subscription',
    step: 'subscription_payer',
    data: {},
    createdAt: Timestamp.now(),
    expiresAt: Timestamp.fromMillis(Date.now() + 10 * 60 * 1000),
  };

  await saveConversationSession(session);

  const message = `🔄 サブスク（定期支払い）を登録します

支払い者を入力してください
（@自分 で自分の名前、@メンションでユーザー指定）`;

  await replyMessage(replyToken, message, accessToken);
}

/**
 * @サブスク追加の対話処理
 */
async function handleAddSubscriptionConversation(
  session: ConversationSession,
  input: string,
  replyToken: string,
  userId: string,
  groupId: string,
  accessToken: string,
  mentions: any[]
): Promise<void> {
  const { step, data } = session;

  if (step === 'subscription_payer') {
    let payerName = input.trim();
    let payerUserId: string | undefined = undefined;

    const displayName = await getUserDisplayName(groupId, userId, accessToken);

    // 全角・半角の@自分に対応
    if (payerName === '@自分' || payerName === '＠自分') {
      payerName = displayName;
      payerUserId = userId;
    } else if (mentions.length > 0 && (payerName.startsWith('@') || payerName.startsWith('＠'))) {
      const mentionedUserId = mentions[0].userId;
      payerName = await getUserDisplayName(groupId, mentionedUserId, accessToken);
      payerUserId = mentionedUserId;
    } else {
      // テキストで名前を入力した場合、既存ユーザーから検索
      const existingUser = await getUserByDisplayName(payerName);
      if (existingUser) {
        payerUserId = existingUser.id;
      }
    }

    if (!payerUserId) {
      await replyMessage(
        replyToken,
        `❌ ユーザー「${payerName}」が見つかりませんでした。\n\n@メンション または @自分 を使用してください。`,
        accessToken
      );
      return;
    }

    session.data.subscriptionPayerName = payerName;
    session.data.subscriptionPayerUserId = payerUserId;
    session.step = 'subscription_service';
    await updateConversationSession(userId, { step: 'subscription_service', data: session.data });

    await replyMessage(replyToken, `支払い内容を入力してください\n（例: Netflix、Spotify、Amazon定期便 猫砂）`, accessToken);
  } else if (step === 'subscription_service') {
    const serviceName = input.trim();
    if (!serviceName || serviceName.length === 0) {
      await replyMessage(replyToken, '❌ 支払い内容を入力してください', accessToken);
      return;
    }

    session.data.subscriptionServiceName = serviceName;
    session.step = 'subscription_amount';
    await updateConversationSession(userId, { step: 'subscription_amount', data: session.data });

    await replyMessage(replyToken, `金額を入力してください（数字のみ）`, accessToken);
  } else if (step === 'subscription_amount') {
    const amount = parseInt(input.replace(/[,，]/g, ''), 10);
    if (isNaN(amount) || amount <= 0) {
      await replyMessage(replyToken, '❌ 正しい金額を入力してください', accessToken);
      return;
    }

    session.data.subscriptionAmount = amount;
    session.step = 'subscription_start_date';
    await updateConversationSession(userId, { step: 'subscription_start_date', data: session.data });

    await replyMessage(replyToken, `開始日（初回の支払日）を入力してください\n（例: 12/15、2024/12/15）`, accessToken);
  } else if (step === 'subscription_start_date') {
    // 日付をパース
    const startDate = parseSubscriptionDate(input.trim());
    if (!startDate) {
      await replyMessage(replyToken, '❌ 日付の形式が正しくありません\n例: 12/15、2024/12/15', accessToken);
      return;
    }

    const dateStr = `${startDate.getUTCFullYear()}-${String(startDate.getUTCMonth() + 1).padStart(2, '0')}-${String(startDate.getUTCDate()).padStart(2, '0')}`;
    session.data.subscriptionStartDate = dateStr;
    session.step = 'subscription_interval_unit';
    await updateConversationSession(userId, { step: 'subscription_interval_unit', data: session.data });

    await replyMessage(replyToken, `配送/支払いの間隔を選択してください\n\n1️⃣ 週ごと（例: 2週間に1回）\n2️⃣ 月ごと（例: 毎月、2ヶ月に1回）`, accessToken);
  } else if (step === 'subscription_interval_unit') {
    let intervalUnit: 'week' | 'month' | null = null;
    if (input === '1' || input.includes('週')) {
      intervalUnit = 'week';
    } else if (input === '2' || input.includes('月')) {
      intervalUnit = 'month';
    }

    if (!intervalUnit) {
      await replyMessage(replyToken, '❌ 1 または 2 を選択してください', accessToken);
      return;
    }

    session.data.subscriptionIntervalUnit = intervalUnit;
    session.step = 'subscription_interval_value';
    await updateConversationSession(userId, { step: 'subscription_interval_value', data: session.data });

    if (intervalUnit === 'week') {
      await replyMessage(replyToken, `何週間ごとか入力してください\n（例: 1=毎週、2=2週間ごと、4=4週間ごと）`, accessToken);
    } else {
      await replyMessage(replyToken, `何ヶ月ごとか入力してください\n（例: 1=毎月、2=2ヶ月ごと、3=3ヶ月ごと）`, accessToken);
    }
  } else if (step === 'subscription_interval_value') {
    const intervalValue = parseInt(input.trim(), 10);
    if (isNaN(intervalValue) || intervalValue < 1 || intervalValue > 12) {
      await replyMessage(replyToken, '❌ 1〜12の数字を入力してください', accessToken);
      return;
    }

    const payerName = data.subscriptionPayerName!;
    const payerUserId = data.subscriptionPayerUserId!;
    const serviceName = data.subscriptionServiceName!;
    const amount = data.subscriptionAmount!;
    const startDateStr = data.subscriptionStartDate!;
    const intervalUnit = data.subscriptionIntervalUnit!;

    // サブスクリプションを保存
    await saveSubscription({
      groupId,
      payerName,
      payerUserId,
      serviceName,
      amount,
      startDate: Timestamp.fromDate(new Date(startDateStr)),
      intervalUnit,
      intervalValue,
      isActive: true,
    });

    // 間隔の表示文字列を生成
    const intervalDisplay = intervalUnit === 'week'
      ? (intervalValue === 1 ? '毎週' : `${intervalValue}週間ごと`)
      : (intervalValue === 1 ? '毎月' : `${intervalValue}ヶ月ごと`);

    const message = `✅ サブスクを登録しました！

📝 ${serviceName}
👤 ${payerName}
💰 ¥${amount.toLocaleString()}
📅 開始日: ${startDateStr}
🔄 ${intervalDisplay}

※ 月初めに該当する日付があれば自動で「買い物費用」として登録されます`;

    await replyMessage(replyToken, message, accessToken);
    await deleteConversationSession(userId);
  }
}

/**
 * サブスク用の日付パース（M/D または YYYY/M/D形式）（JST）
 * 存在しない日付（例: 2/29の非閏年）の場合は、その月の月末に調整
 */
function parseSubscriptionDate(input: string): Date | null {
  // 月と日の範囲チェック用
  const isValidMonthDay = (month: number, day: number) =>
    month >= 1 && month <= 12 && day >= 1 && day <= 31;

  // YYYY/M/D または YYYY-M-D 形式
  const fullMatch = input.match(/^(\d{4})[\/\-](\d{1,2})[\/\-](\d{1,2})$/);
  if (fullMatch) {
    const year = parseInt(fullMatch[1], 10);
    const month = parseInt(fullMatch[2], 10);
    const day = parseInt(fullMatch[3], 10);
    if (!isValidMonthDay(month, day)) return null;
    const date = new Date(Date.UTC(year, month - 1, day, 0, 0, 0, 0));
    if (!isNaN(date.getTime())) {
      // 日付が翌月にずれた場合（例: 2/30 → 3/2）、月末に調整
      if (date.getUTCMonth() !== month - 1) {
        const lastDay = new Date(Date.UTC(year, month, 0, 0, 0, 0, 0));
        console.log(`Date adjusted: ${year}/${month}/${day} -> ${year}/${month}/${lastDay.getUTCDate()}`);
        return lastDay;
      }
      return date;
    }
    return null;
  }

  // M/D 形式（今年として扱う、存在しない場合は月末に調整）
  const shortMatch = input.match(/^(\d{1,2})[\/\-](\d{1,2})$/);
  if (shortMatch) {
    const month = parseInt(shortMatch[1], 10);
    const day = parseInt(shortMatch[2], 10);
    if (!isValidMonthDay(month, day)) return null;

    const jstDate = getJSTDate();
    const currentYear = jstDate.getUTCFullYear();

    // 今年の指定月で試す
    const date = new Date(Date.UTC(currentYear, month - 1, day, 0, 0, 0, 0));
    if (!isNaN(date.getTime())) {
      // 日付が翌月にずれた場合（例: 2/30 → 3/2）、月末に調整
      if (date.getUTCMonth() !== month - 1) {
        const lastDay = new Date(Date.UTC(currentYear, month, 0, 0, 0, 0, 0));
        console.log(`Date adjusted: ${month}/${day} -> ${month}/${lastDay.getUTCDate()} (${currentYear})`);
        return lastDay;
      }
      return date;
    }

    return null;
  }

  return null;
}

/**
 * @サブスク一覧表示
 */
export async function showSubscriptionList(
  groupId: string,
  replyToken: string,
  accessToken: string
): Promise<void> {
  const subscriptions = await getActiveSubscriptions(groupId);

  if (subscriptions.length === 0) {
    await replyMessage(replyToken, `📋 登録されているサブスクはありません\n\n@サブスク追加 で新規登録できます`, accessToken);
    return;
  }

  let message = `📋 サブスク一覧\n━━━━━━━━━━━━━━━\n\n`;

  subscriptions.forEach((sub, index) => {
    // 間隔の表示文字列を生成
    const intervalDisplay = sub.intervalUnit === 'week'
      ? (sub.intervalValue === 1 ? '毎週' : `${sub.intervalValue}週間ごと`)
      : (sub.intervalValue === 1 ? '毎月' : `${sub.intervalValue}ヶ月ごと`);

    // 開始日をフォーマット
    const startDate = sub.startDate.toDate();
    const startDateStr = `${startDate.getUTCFullYear()}/${startDate.getUTCMonth() + 1}/${startDate.getUTCDate()}`;

    message += `${index + 1}. ${sub.serviceName}\n`;
    message += `　👤 ${sub.payerName}\n`;
    message += `　💰 ¥${sub.amount.toLocaleString()}\n`;
    message += `　📅 開始: ${startDateStr}\n`;
    message += `　🔄 ${intervalDisplay}\n\n`;
  });

  message += `削除する場合は @サブスク削除 と入力`;

  await replyMessage(replyToken, message, accessToken);
}

/**
 * @サブスク削除の対話モード開始
 */
export async function startDeleteSubscriptionConversation(
  userId: string,
  groupId: string,
  replyToken: string,
  accessToken: string
): Promise<void> {
  const subscriptions = await getActiveSubscriptions(groupId);

  if (subscriptions.length === 0) {
    await replyMessage(replyToken, `📋 削除できるサブスクがありません`, accessToken);
    return;
  }

  const session: ConversationSession = {
    userId,
    groupId,
    type: 'delete_subscription',
    step: 'subscription_select',
    data: {},
    createdAt: Timestamp.now(),
    expiresAt: Timestamp.fromMillis(Date.now() + 10 * 60 * 1000),
  };

  await saveConversationSession(session);

  let message = `🗑️ 削除するサブスクを選択してください\n\n`;

  subscriptions.forEach((sub, index) => {
    message += `${index + 1}️⃣ ${sub.serviceName}（${sub.payerName}・¥${sub.amount.toLocaleString()}）\n`;
  });

  await replyMessage(replyToken, message, accessToken);
}

/**
 * @サブスク削除の対話処理
 */
async function handleDeleteSubscriptionConversation(
  session: ConversationSession,
  input: string,
  replyToken: string,
  userId: string,
  groupId: string,
  accessToken: string
): Promise<void> {
  const { step } = session;

  if (step === 'subscription_select') {
    const subscriptions = await getActiveSubscriptions(groupId);
    const selection = parseInt(input.trim(), 10);

    if (isNaN(selection) || selection < 1 || selection > subscriptions.length) {
      await replyMessage(replyToken, `❌ 1〜${subscriptions.length}の数字を入力してください`, accessToken);
      return;
    }

    const selectedSubscription = subscriptions[selection - 1];

    // サブスクを無効化
    await deactivateSubscription(selectedSubscription.id);

    const message = `✅ サブスクを削除しました

📝 ${selectedSubscription.serviceName}
👤 ${selectedSubscription.payerName}
💰 ¥${selectedSubscription.amount.toLocaleString()}`;

    await replyMessage(replyToken, message, accessToken);
    await deleteConversationSession(userId);
  }
}

/**
 * @サブスク変更の対話モード開始
 */
export async function startEditSubscriptionConversation(
  userId: string,
  groupId: string,
  replyToken: string,
  accessToken: string
): Promise<void> {
  const subscriptions = await getActiveSubscriptions(groupId);

  if (subscriptions.length === 0) {
    await replyMessage(replyToken, `📋 変更できるサブスクがありません\n\n@サブスク追加 で新規登録できます`, accessToken);
    return;
  }

  const session: ConversationSession = {
    userId,
    groupId,
    type: 'edit_subscription',
    step: 'subscription_edit_select',
    data: {},
    createdAt: Timestamp.now(),
    expiresAt: Timestamp.fromMillis(Date.now() + 10 * 60 * 1000),
  };

  await saveConversationSession(session);

  let message = `✏️ 変更するサブスクを選択してください\n\n`;

  subscriptions.forEach((sub, index) => {
    const intervalDisplay = sub.intervalUnit === 'week'
      ? (sub.intervalValue === 1 ? '毎週' : `${sub.intervalValue}週間ごと`)
      : (sub.intervalValue === 1 ? '毎月' : `${sub.intervalValue}ヶ月ごと`);
    message += `${index + 1}️⃣ ${sub.serviceName}（${sub.payerName}・¥${sub.amount.toLocaleString()}・${intervalDisplay}）\n`;
  });

  await replyMessage(replyToken, message, accessToken);
}

/**
 * @サブスク変更の対話処理
 */
async function handleEditSubscriptionConversation(
  session: ConversationSession,
  input: string,
  replyToken: string,
  userId: string,
  groupId: string,
  accessToken: string,
  mentions: any[]
): Promise<void> {
  const { step, data } = session;

  if (step === 'subscription_edit_select') {
    // サブスク選択
    const subscriptions = await getActiveSubscriptions(groupId);
    const selection = parseInt(input.trim(), 10);

    if (isNaN(selection) || selection < 1 || selection > subscriptions.length) {
      await replyMessage(replyToken, `❌ 1〜${subscriptions.length}の数字を入力してください`, accessToken);
      return;
    }

    const selectedSubscription = subscriptions[selection - 1];
    session.data.editSubscriptionId = selectedSubscription.id;
    session.step = 'subscription_edit_field';
    await updateConversationSession(userId, { step: 'subscription_edit_field', data: session.data });

    // 現在の設定を表示
    const intervalDisplay = selectedSubscription.intervalUnit === 'week'
      ? (selectedSubscription.intervalValue === 1 ? '毎週' : `${selectedSubscription.intervalValue}週間ごと`)
      : (selectedSubscription.intervalValue === 1 ? '毎月' : `${selectedSubscription.intervalValue}ヶ月ごと`);
    const startDate = selectedSubscription.startDate.toDate();
    const startDateStr = `${startDate.getUTCFullYear()}/${startDate.getUTCMonth() + 1}/${startDate.getUTCDate()}`;

    const message = `📝 ${selectedSubscription.serviceName}\n━━━━━━━━━━━━━━━\n現在の設定:\n👤 支払者: ${selectedSubscription.payerName}\n📝 内容: ${selectedSubscription.serviceName}\n💰 金額: ¥${selectedSubscription.amount.toLocaleString()}\n📅 開始日: ${startDateStr}\n🔄 間隔: ${intervalDisplay}\n\n変更する項目を選択してください\n\n1️⃣ 支払者\n2️⃣ 支払い内容\n3️⃣ 金額\n4️⃣ 開始日\n5️⃣ 間隔`;

    await replyMessage(replyToken, message, accessToken);
  } else if (step === 'subscription_edit_field') {
    // 変更項目選択
    const subscription = await getSubscription(data.editSubscriptionId!);
    if (!subscription) {
      await replyMessage(replyToken, '❌ サブスクが見つかりませんでした', accessToken);
      await deleteConversationSession(userId);
      return;
    }

    let editField: 'payer' | 'service' | 'amount' | 'startDate' | 'interval' | null = null;
    let originalValue = '';

    if (input === '1' || input.includes('支払者')) {
      editField = 'payer';
      originalValue = subscription.payerName;
    } else if (input === '2' || input.includes('内容')) {
      editField = 'service';
      originalValue = subscription.serviceName;
    } else if (input === '3' || input.includes('金額')) {
      editField = 'amount';
      originalValue = `¥${subscription.amount.toLocaleString()}`;
    } else if (input === '4' || input.includes('開始日')) {
      editField = 'startDate';
      const d = subscription.startDate.toDate();
      originalValue = `${d.getFullYear()}/${d.getMonth() + 1}/${d.getDate()}`;
    } else if (input === '5' || input.includes('間隔')) {
      editField = 'interval';
      originalValue = subscription.intervalUnit === 'week'
        ? (subscription.intervalValue === 1 ? '毎週' : `${subscription.intervalValue}週間ごと`)
        : (subscription.intervalValue === 1 ? '毎月' : `${subscription.intervalValue}ヶ月ごと`);
    }

    if (!editField) {
      await replyMessage(replyToken, '❌ 1〜5の数字を入力してください', accessToken);
      return;
    }

    session.data.editField = editField;
    session.data.originalValue = originalValue;
    session.step = 'subscription_edit_value';
    await updateConversationSession(userId, { step: 'subscription_edit_value', data: session.data });

    // 項目に応じたメッセージを表示
    let promptMessage = '';
    switch (editField) {
      case 'payer':
        promptMessage = `現在: ${originalValue}\n\n新しい支払者を入力してください\n（@自分 で自分の名前、@メンションでユーザー指定）`;
        break;
      case 'service':
        promptMessage = `現在: ${originalValue}\n\n新しい支払い内容を入力してください`;
        break;
      case 'amount':
        promptMessage = `現在: ${originalValue}\n\n新しい金額を入力してください（数字のみ）`;
        break;
      case 'startDate':
        promptMessage = `現在: ${originalValue}\n\n新しい開始日を入力してください\n（例: 12/15、2024/12/15）`;
        break;
      case 'interval':
        promptMessage = `現在: ${originalValue}\n\n新しい間隔を選択してください\n\n1️⃣ 毎週\n2️⃣ 2週間ごと\n3️⃣ 毎月\n4️⃣ 2ヶ月ごと\n5️⃣ 3ヶ月ごと\n6️⃣ その他`;
        break;
    }

    await replyMessage(replyToken, promptMessage, accessToken);
  } else if (step === 'subscription_edit_value') {
    // 新しい値の入力処理
    const subscription = await getSubscription(data.editSubscriptionId!);
    if (!subscription) {
      await replyMessage(replyToken, '❌ サブスクが見つかりませんでした', accessToken);
      await deleteConversationSession(userId);
      return;
    }

    const editField = data.editField!;
    const originalValue = data.originalValue!;
    let newValue = '';
    let updateData: Parameters<typeof updateSubscription>[1] = {};

    switch (editField) {
      case 'payer': {
        let payerName = input.trim();
        let payerUserId: string | undefined = undefined;

        const displayName = await getUserDisplayName(groupId, userId, accessToken);

        if (payerName === '@自分' || payerName === '＠自分') {
          payerName = displayName;
          payerUserId = userId;
        } else if (mentions.length > 0 && (payerName.startsWith('@') || payerName.startsWith('＠'))) {
          const mentionedUserId = mentions[0].userId;
          payerName = await getUserDisplayName(groupId, mentionedUserId, accessToken);
          payerUserId = mentionedUserId;
        } else {
          const existingUser = await getUserByDisplayName(payerName);
          if (existingUser) {
            payerUserId = existingUser.id;
          }
        }

        if (!payerUserId) {
          await replyMessage(
            replyToken,
            `❌ ユーザー「${payerName}」が見つかりませんでした。\n\n@メンション または @自分 を使用してください。`,
            accessToken
          );
          return;
        }

        updateData = { payerName, payerUserId };
        newValue = payerName;
        break;
      }
      case 'service': {
        const serviceName = input.trim();
        if (!serviceName || serviceName.length === 0) {
          await replyMessage(replyToken, '❌ 支払い内容を入力してください', accessToken);
          return;
        }
        updateData = { serviceName };
        newValue = serviceName;
        break;
      }
      case 'amount': {
        const amount = parseInt(input.replace(/[,，]/g, ''), 10);
        if (isNaN(amount) || amount <= 0) {
          await replyMessage(replyToken, '❌ 正しい金額を入力してください', accessToken);
          return;
        }
        updateData = { amount };
        newValue = `¥${amount.toLocaleString()}`;
        break;
      }
      case 'startDate': {
        const startDate = parseSubscriptionDate(input.trim());
        if (!startDate) {
          await replyMessage(replyToken, '❌ 日付の形式が正しくありません\n例: 12/15、2024/12/15', accessToken);
          return;
        }
        updateData = { startDate: Timestamp.fromDate(startDate) };
        newValue = `${startDate.getUTCFullYear()}/${startDate.getUTCMonth() + 1}/${startDate.getUTCDate()}`;
        break;
      }
      case 'interval': {
        let intervalUnit: 'week' | 'month';
        let intervalValue: number;

        const selection = parseInt(input.trim(), 10);
        switch (selection) {
          case 1:
            intervalUnit = 'week';
            intervalValue = 1;
            newValue = '毎週';
            break;
          case 2:
            intervalUnit = 'week';
            intervalValue = 2;
            newValue = '2週間ごと';
            break;
          case 3:
            intervalUnit = 'month';
            intervalValue = 1;
            newValue = '毎月';
            break;
          case 4:
            intervalUnit = 'month';
            intervalValue = 2;
            newValue = '2ヶ月ごと';
            break;
          case 5:
            intervalUnit = 'month';
            intervalValue = 3;
            newValue = '3ヶ月ごと';
            break;
          case 6:
            // その他の場合は追加のステップが必要だが、シンプルにするため6ヶ月ごととする
            intervalUnit = 'month';
            intervalValue = 6;
            newValue = '6ヶ月ごと';
            break;
          default:
            await replyMessage(replyToken, '❌ 1〜6の数字を入力してください', accessToken);
            return;
        }

        updateData = { intervalUnit, intervalValue };
        break;
      }
    }

    // 更新を実行
    await updateSubscription(data.editSubscriptionId!, updateData);

    // 更新後のサブスク情報を取得して表示
    const updatedSubscription = await getSubscription(data.editSubscriptionId!);
    if (!updatedSubscription) {
      await replyMessage(replyToken, '❌ サブスクの更新に失敗しました', accessToken);
      await deleteConversationSession(userId);
      return;
    }

    const intervalDisplay = updatedSubscription.intervalUnit === 'week'
      ? (updatedSubscription.intervalValue === 1 ? '毎週' : `${updatedSubscription.intervalValue}週間ごと`)
      : (updatedSubscription.intervalValue === 1 ? '毎月' : `${updatedSubscription.intervalValue}ヶ月ごと`);
    const startDate = updatedSubscription.startDate.toDate();
    const startDateStr = `${startDate.getUTCFullYear()}/${startDate.getUTCMonth() + 1}/${startDate.getUTCDate()}`;

    const fieldNames: Record<string, string> = {
      payer: '支払者',
      service: '支払い内容',
      amount: '金額',
      startDate: '開始日',
      interval: '間隔',
    };

    const message = `✅ サブスクを変更しました

📝 ${updatedSubscription.serviceName}
━━━━━━━━━━━━━━━
変更内容:
　${fieldNames[editField]}: ${originalValue} → ${newValue}

現在の設定:
👤 ${updatedSubscription.payerName}
💰 ¥${updatedSubscription.amount.toLocaleString()}
📅 開始日: ${startDateStr}
🔄 ${intervalDisplay}`;

    await replyMessage(replyToken, message, accessToken);
    await deleteConversationSession(userId);
  }
}

// =============================================================================
// 家賃関連
// =============================================================================

/**
 * @家賃追加の対話モード開始
 */
export async function startAddRentConversation(
  userId: string,
  groupId: string,
  replyToken: string,
  accessToken: string
): Promise<void> {
  const session: ConversationSession = {
    userId,
    groupId,
    type: 'add_rent',
    step: 'rent_payer',
    data: {},
    createdAt: Timestamp.now(),
    expiresAt: Timestamp.fromMillis(Date.now() + 10 * 60 * 1000),
  };

  await saveConversationSession(session);

  const message = `🏠 家賃情報を登録します

支払い者を入力してください
（@自分 で自分の名前、@メンションでユーザー指定）`;

  await replyMessage(replyToken, message, accessToken);
}

/**
 * @家賃追加の対話処理
 */
async function handleAddRentConversation(
  session: ConversationSession,
  input: string,
  replyToken: string,
  userId: string,
  groupId: string,
  accessToken: string,
  mentions: any[]
): Promise<void> {
  const { step } = session;

  if (step === 'rent_payer') {
    let payerName = input.trim();
    let payerUserId: string | undefined = undefined;

    const displayName = await getUserDisplayName(groupId, userId, accessToken);

    // 全角・半角の@自分に対応
    if (payerName === '@自分' || payerName === '＠自分') {
      payerName = displayName;
      payerUserId = userId;
    } else if (mentions.length > 0 && (payerName.startsWith('@') || payerName.startsWith('＠'))) {
      const mentionedUserId = mentions[0].userId;
      payerName = await getUserDisplayName(groupId, mentionedUserId, accessToken);
      payerUserId = mentionedUserId;
    } else {
      // テキストで名前を入力した場合、既存ユーザーから検索
      const existingUser = await getUserByDisplayName(payerName);
      if (existingUser) {
        payerUserId = existingUser.id;
      }
    }

    if (!payerUserId) {
      await replyMessage(
        replyToken,
        `❌ ユーザー「${payerName}」が見つかりませんでした。\n\n@メンション または @自分 を使用してください。`,
        accessToken
      );
      return;
    }

    session.data.rentPayerName = payerName;
    session.data.rentPayerUserId = payerUserId;
    session.step = 'rent_amount';
    await updateConversationSession(userId, { step: 'rent_amount', data: session.data });

    await replyMessage(replyToken, `金額を入力してください（数字のみ）`, accessToken);
  } else if (step === 'rent_amount') {
    const amount = parseInt(input.replace(/[,，]/g, ''), 10);
    if (isNaN(amount) || amount <= 0) {
      await replyMessage(replyToken, '❌ 正しい金額を入力してください', accessToken);
      return;
    }

    const payerName = session.data.rentPayerName!;
    const payerUserId = session.data.rentPayerUserId!;

    // 家賃情報を保存
    await saveRent({
      groupId,
      payerName,
      payerUserId,
      amount,
    });

    const message = `✅ 家賃を登録しました！

🏠 家賃費用
👤 ${payerName}
💰 ¥${amount.toLocaleString()}

※ 毎月の月末に自動でカレンダーに登録されます`;

    await replyMessage(replyToken, message, accessToken);
    await deleteConversationSession(userId);
  }
}

/**
 * @家賃変更の対話モード開始
 */
export async function startEditRentConversation(
  userId: string,
  groupId: string,
  replyToken: string,
  accessToken: string
): Promise<void> {
  const rent = await getRent();

  if (!rent) {
    await replyMessage(replyToken, `⚠️ 家賃情報が登録されていません\n\nまずは @家賃追加 で家賃情報を登録してください`, accessToken);
    return;
  }

  const session: ConversationSession = {
    userId,
    groupId,
    type: 'edit_rent',
    step: 'rent_edit_field',
    data: {},
    createdAt: Timestamp.now(),
    expiresAt: Timestamp.fromMillis(Date.now() + 10 * 60 * 1000),
  };

  await saveConversationSession(session);

  const message = `🏠 家賃情報を変更します

📝 現在の家賃情報:
👤 ${rent.payerName}
💰 ¥${rent.amount.toLocaleString()}

変更する項目を選択してください

1️⃣ 支払い者
2️⃣ 金額`;

  await replyMessage(replyToken, message, accessToken);
}

/**
 * @家賃変更の対話処理
 */
async function handleEditRentConversation(
  session: ConversationSession,
  input: string,
  replyToken: string,
  userId: string,
  groupId: string,
  accessToken: string,
  mentions: any[]
): Promise<void> {
  const { step, data } = session;

  if (step === 'rent_edit_field') {
    // 変更項目選択
    const rent = await getRent();
    if (!rent) {
      await replyMessage(replyToken, '❌ 家賃情報が見つかりませんでした', accessToken);
      await deleteConversationSession(userId);
      return;
    }

    let editField: 'payer' | 'amount' | null = null;

    if (input === '1' || input.includes('支払')) {
      editField = 'payer';
    } else if (input === '2' || input.includes('金額')) {
      editField = 'amount';
    }

    if (!editField) {
      await replyMessage(replyToken, '❌ 1 または 2 を選択してください', accessToken);
      return;
    }

    session.data.rentEditField = editField;
    session.step = 'rent_edit_value';
    await updateConversationSession(userId, { step: 'rent_edit_value', data: session.data });

    // 項目に応じたメッセージを表示
    if (editField === 'payer') {
      await replyMessage(replyToken, `新しい支払い者を入力してください\n（@自分 で自分の名前、@メンションでユーザー指定）`, accessToken);
    } else {
      await replyMessage(replyToken, `新しい金額を入力してください（数字のみ）`, accessToken);
    }
  } else if (step === 'rent_edit_value') {
    const rent = await getRent();
    if (!rent) {
      await replyMessage(replyToken, '❌ 家賃情報が見つかりませんでした', accessToken);
      await deleteConversationSession(userId);
      return;
    }

    const editField = data.rentEditField!;

    if (editField === 'payer') {
      let payerName = input.trim();
      let payerUserId: string | undefined = undefined;

      const displayName = await getUserDisplayName(groupId, userId, accessToken);

      if (payerName === '@自分' || payerName === '＠自分') {
        payerName = displayName;
        payerUserId = userId;
      } else if (mentions.length > 0 && (payerName.startsWith('@') || payerName.startsWith('＠'))) {
        const mentionedUserId = mentions[0].userId;
        payerName = await getUserDisplayName(groupId, mentionedUserId, accessToken);
        payerUserId = mentionedUserId;
      } else {
        const existingUser = await getUserByDisplayName(payerName);
        if (existingUser) {
          payerUserId = existingUser.id;
        }
      }

      if (!payerUserId) {
        await replyMessage(
          replyToken,
          `❌ ユーザー「${payerName}」が見つかりませんでした。\n\n@メンション または @自分 を使用してください。`,
          accessToken
        );
        return;
      }

      const originalPayer = rent.payerName;
      await updateRent({ payerName, payerUserId });

      const message = `✅ 家賃を変更しました！

🏠 家賃費用
👤 ${originalPayer} → ${payerName}
💰 ¥${rent.amount.toLocaleString()}`;

      await replyMessage(replyToken, message, accessToken);
    } else {
      // 金額の変更
      const amount = parseInt(input.replace(/[,，]/g, ''), 10);
      if (isNaN(amount) || amount <= 0) {
        await replyMessage(replyToken, '❌ 正しい金額を入力してください', accessToken);
        return;
      }

      const originalAmount = rent.amount;
      await updateRent({ amount });

      const message = `✅ 家賃を変更しました！

🏠 家賃費用
👤 ${rent.payerName}
💰 ¥${originalAmount.toLocaleString()} → ¥${amount.toLocaleString()}`;

      await replyMessage(replyToken, message, accessToken);
    }

    await deleteConversationSession(userId);
  }
}

// =============================================================================
// 旅行費用関連
// =============================================================================

/**
 * @旅行の対話モード開始
 */
export async function startAddTravelConversation(
  userId: string,
  groupId: string,
  replyToken: string,
  accessToken: string
): Promise<void> {
  const session: ConversationSession = {
    userId,
    groupId,
    type: 'add_travel',
    step: 'travel_input_method',
    data: {},
    createdAt: Timestamp.now(),
    expiresAt: Timestamp.fromMillis(Date.now() + 10 * 60 * 1000),
  };

  await saveConversationSession(session);

  const message = `🧳 旅行費用を登録します

支払い内容の登録方法を選択してください
1️⃣ 画像を送信して自動解析
2️⃣ 手動で入力`;

  await replyMessage(replyToken, message, accessToken);
}

/**
 * @旅行の対話処理
 */
async function handleAddTravelConversation(
  session: ConversationSession,
  input: string,
  replyToken: string,
  userId: string,
  groupId: string,
  accessToken: string,
  calendarId: string,
  mentions: any[]
): Promise<void> {
  const { step, data } = session;

  if (step === 'travel_input_method') {
    let inputMethod: 'image' | 'manual' | null = null;
    if (input === '1' || input.includes('画像')) {
      inputMethod = 'image';
    } else if (input === '2' || input.includes('手動')) {
      inputMethod = 'manual';
    }

    if (!inputMethod) {
      await replyMessage(replyToken, '❌ 1 または 2 を選択してください', accessToken);
      return;
    }

    session.data.travelInputMethod = inputMethod;

    if (inputMethod === 'image') {
      session.step = 'travel_wait_image';
      await updateConversationSession(userId, { step: 'travel_wait_image', data: session.data });

      await replyMessage(
        replyToken,
        '📸 レシート・チケット・予約確認画面などの画像を送信してください\n（画像送信後、自動的に解析して登録します）',
        accessToken
      );
    } else {
      session.step = 'travel_payer_name';
      await updateConversationSession(userId, { step: 'travel_payer_name', data: session.data });

      await replyMessage(
        replyToken,
        '支払い者名を入力してください\n（@自分 で自分の名前、@メンションでユーザー指定）',
        accessToken
      );
    }
  } else if (step === 'travel_payer_name') {
    let payerName = input.trim();
    let payerUserId: string | undefined = undefined;

    const displayName = await getUserDisplayName(groupId, userId, accessToken);

    if (payerName === '@自分' || payerName === '＠自分') {
      payerName = displayName;
      payerUserId = userId;
    } else if (mentions.length > 0 && (payerName.startsWith('@') || payerName.startsWith('＠'))) {
      const mentionedUserId = mentions[0].userId;
      payerName = await getUserDisplayName(groupId, mentionedUserId, accessToken);
      payerUserId = mentionedUserId;
    } else {
      const existingUser = await getUserByDisplayName(payerName);
      if (existingUser) {
        payerUserId = existingUser.id;
      }
    }

    if (!payerUserId) {
      await replyMessage(
        replyToken,
        `❌ ユーザー「${payerName}」が見つかりませんでした。\n\n@メンション または @自分 を使用してください。`,
        accessToken
      );
      return;
    }

    session.data.travelPayerName = payerName;
    session.data.travelPayerUserId = payerUserId;
    session.step = 'travel_amount';
    await updateConversationSession(userId, { step: 'travel_amount', data: session.data });

    await replyMessage(replyToken, '金額を入力してください（数字のみ）', accessToken);
  } else if (step === 'travel_amount') {
    const amount = parseInt(input.replace(/[,，]/g, ''), 10);
    if (isNaN(amount) || amount <= 0) {
      await replyMessage(replyToken, '❌ 正しい金額を入力してください', accessToken);
      return;
    }

    session.data.travelAmount = amount;
    session.step = 'travel_date';
    await updateConversationSession(userId, { step: 'travel_date', data: session.data });

    const currentYear = getJSTDate().getUTCFullYear();
    await replyMessage(
      replyToken,
      `日付を入力してください\n（例: 12/15、2024/12/15）\n日付形式:\n- M/D: 今年の日付（例: 5/22 → ${currentYear}/5/22）\n- YYYY/M/D: 年を指定（例: 2024/5/22）\n「今日」と入力すると今日の日付になります`,
      accessToken
    );
  } else if (step === 'travel_date') {
    let travelDate: Date;
    if (input === '今日') {
      const jstDate = getJSTDate();
      travelDate = new Date(Date.UTC(jstDate.getUTCFullYear(), jstDate.getUTCMonth(), jstDate.getUTCDate(), 0, 0, 0, 0));
    } else {
      const dateParts = input.split('/');
      if (dateParts.length === 3) {
        const year = parseInt(dateParts[0], 10);
        const month = parseInt(dateParts[1], 10);
        const day = parseInt(dateParts[2], 10);
        travelDate = new Date(Date.UTC(year, month - 1, day, 0, 0, 0, 0));

        if (isNaN(travelDate.getTime()) || travelDate.getUTCMonth() !== month - 1) {
          await replyMessage(replyToken, '❌ 日付の形式が正しくありません\n例: 12/15、2024/12/15', accessToken);
          return;
        }
      } else if (dateParts.length === 2) {
        const month = parseInt(dateParts[0], 10);
        const day = parseInt(dateParts[1], 10);
        const jstDate = getJSTDate();
        const year = jstDate.getUTCFullYear();
        travelDate = new Date(Date.UTC(year, month - 1, day, 0, 0, 0, 0));

        if (isNaN(travelDate.getTime()) || travelDate.getUTCMonth() !== month - 1) {
          await replyMessage(replyToken, '❌ 日付の形式が正しくありません\n例: 12/15、2024/12/15', accessToken);
          return;
        }
      } else {
        await replyMessage(replyToken, '❌ 日付の形式が正しくありません\n例: 12/15、2024/12/15', accessToken);
        return;
      }
    }

    const dateStr = `${travelDate.getUTCFullYear()}-${String(travelDate.getUTCMonth() + 1).padStart(2, '0')}-${String(travelDate.getUTCDate()).padStart(2, '0')}`;
    session.data.travelDate = dateStr;
    session.step = 'travel_store_name';
    await updateConversationSession(userId, { step: 'travel_store_name', data: session.data });

    await replyMessage(
      replyToken,
      '支払い内容を入力してください\n（例: 新幹線代、ホテル代、お土産代）\n「なし」と入力すると詳細なしで登録されます',
      accessToken
    );
  } else if (step === 'travel_store_name') {
    let storeName = input.trim();
    if (storeName === 'なし' || storeName === 'ナシ') {
      storeName = '手動入力';
    }

    const payerName = data.travelPayerName!;
    const payerUserId = data.travelPayerUserId!;
    const amount = data.travelAmount!;
    const dateStr = data.travelDate!;

    const payerDisplayName = await getUserDisplayName(groupId, payerUserId, accessToken);
    const payerUser = await getOrCreateUser(payerUserId, payerDisplayName, groupId);

    const calendarEventId = await createCalendarEvent(
      calendarId,
      payerUser.displayName,
      amount,
      '旅行費用',
      storeName,
      dateStr
    );

    await saveExpense({
      userId: payerUser.id,
      userName: payerName,
      amount,
      category: '旅行費用',
      storeName,
      date: Timestamp.fromDate(new Date(dateStr)),
      calendarEventId,
    });

    const responseMessage = createRegistrationMessage(
      '旅行費用',
      amount,
      payerName,
      storeName,
      dateStr
    );

    await replyMessage(replyToken, responseMessage, accessToken);
    await deleteConversationSession(userId);
  }
}
