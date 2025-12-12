import { Timestamp } from '@google-cloud/firestore';
import { ConversationSession, Category } from '../types/index.js';
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
} from '../services/firestore.js';
import { createCalendarEvent, createScheduleEvent, deleteCalendarEvent } from '../services/calendar.js';
import { replyMessage, createRegistrationMessage, getUserDisplayName, createDeleteMessage } from '../services/line.js';

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
2️⃣ 買い物費用`;

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
    step: 'participant_count',
    data: {},
    createdAt: Timestamp.now(),
    expiresAt: Timestamp.fromMillis(Date.now() + 10 * 60 * 1000),
  };

  await saveConversationSession(session);

  const message = `📅 予定を登録します

予定の参加人数を入力してください
（例: 1、2、3...）`;

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
2️⃣ 買い物費用`;

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
    }
  } catch (error) {
    console.error('Conversation input error:', error);
    await deleteConversationSession(userId);
    const errorMsg = error instanceof Error ? error.message : '不明なエラー';
    await replyMessage(replyToken, `❌ エラーが発生しました\n\n詳細: ${errorMsg}`, accessToken);
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
    }

    if (!category) {
      await replyMessage(replyToken, '❌ 1 または 2 を選択してください', accessToken);
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

    const displayName = await getUserDisplayName(groupId, userId, accessToken);

    // 全角・半角の@自分に対応
    if (payerName === '@自分' || payerName === '＠自分') {
      payerName = displayName;
    } else if (mentions.length > 0 && (payerName.startsWith('@') || payerName.startsWith('＠'))) {
      const mentionedUserId = mentions[0].userId;
      payerName = await getUserDisplayName(groupId, mentionedUserId, accessToken);
    }

    session.data.payerName = payerName;
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

    await replyMessage(
      replyToken,
      `日付を入力してください\n（例: 12/15）\n「今日」と入力すると今日の日付になります`,
      accessToken
    );
  } else if (step === 'date') {
    let expenseDate: Date;
    if (input === '今日') {
      expenseDate = new Date();
    } else {
      const dateParts = input.split('/');
      if (dateParts.length === 2) {
        const month = parseInt(dateParts[0], 10);
        const day = parseInt(dateParts[1], 10);
        const year = new Date().getFullYear();
        expenseDate = new Date(year, month - 1, day);

        if (isNaN(expenseDate.getTime())) {
          await replyMessage(replyToken, '❌ 日付の形式が正しくありません\n例: 12/15', accessToken);
          return;
        }
      } else {
        await replyMessage(replyToken, '❌ 日付の形式が正しくありません\n例: 12/15', accessToken);
        return;
      }
    }

    const category = data.category!;
    const payerName = data.payerName!;
    const amount = data.amount!;

    const displayName = await getUserDisplayName(groupId, userId, accessToken);
    const user = await getOrCreateUser(userId, displayName, groupId);

    const dateStr = `${expenseDate.getFullYear()}-${String(expenseDate.getMonth() + 1).padStart(2, '0')}-${String(expenseDate.getDate()).padStart(2, '0')}`;

    const calendarEventId = await createCalendarEvent(
      calendarId,
      payerName,
      amount,
      category,
      '手動入力',
      dateStr
    );

    await saveExpense({
      userId: user.id,
      userName: payerName,
      amount,
      category,
      storeName: '手動入力',
      date: Timestamp.fromDate(expenseDate),
      calendarEventId,
    });

    if (category === '外食費用') {
      // 現在の残高から金額を引く
      const currentBalance = user.diningBalance;
      const newBalance = currentBalance - amount;
      await updateDiningBalance(user.id, newBalance);

      const message = createRegistrationMessage(
        category,
        amount,
        payerName,
        '手動入力',
        dateStr,
        newBalance
      );
      await replyMessage(replyToken, message, accessToken);
    } else {
      const message = createRegistrationMessage(
        category,
        amount,
        payerName,
        '手動入力',
        dateStr
      );
      await replyMessage(replyToken, message, accessToken);
    }

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
  const { step, data } = session;

  if (step === 'participant_count') {
    // 参加人数の入力
    const count = parseInt(input.trim(), 10);
    if (isNaN(count) || count < 1 || count > 10) {
      await replyMessage(replyToken, '❌ 1〜10の数字を入力してください', accessToken);
      return;
    }

    session.data.participantCount = count;
    session.data.userNames = [];
    session.step = 'user_name';
    await updateConversationSession(userId, { step: 'user_name', data: session.data });

    const message = count === 1
      ? `1人目のユーザー名を入力してください\n（@自分 で自分の名前、@メンションでユーザー指定）`
      : `1人目のユーザー名を入力してください\n（@自分 で自分の名前、@メンションでユーザー指定、スペース区切りで複数人可）`;

    await replyMessage(replyToken, message, accessToken);
  } else if (step === 'user_name') {
    const displayName = await getUserDisplayName(groupId, userId, accessToken);
    const participantCount = data.participantCount || 1;
    const userNames = data.userNames || [];

    // スペースで区切って複数人名を処理
    const inputNames = input.trim().split(/\s+/);

    for (let i = 0; i < inputNames.length && userNames.length < participantCount; i++) {
      let userName = inputNames[i];

      // 全角・半角の@自分に対応
      if (userName === '@自分' || userName === '＠自分') {
        userName = displayName;
      } else if (mentions.length > i && (userName.startsWith('@') || userName.startsWith('＠'))) {
        const mentionedUserId = mentions[i].userId;
        userName = await getUserDisplayName(groupId, mentionedUserId, accessToken);
      }

      userNames.push(userName);
    }

    session.data.userNames = userNames;

    // まだ全員分入力されていない場合
    if (userNames.length < participantCount) {
      const remaining = participantCount - userNames.length;
      await updateConversationSession(userId, { step: 'user_name', data: session.data });
      await replyMessage(
        replyToken,
        `${userNames.length + 1}人目のユーザー名を入力してください\n（残り${remaining}人）`,
        accessToken
      );
      return;
    }

    // 全員分入力完了
    session.step = 'schedule_content';
    await updateConversationSession(userId, { step: 'schedule_content', data: session.data });

    await replyMessage(replyToken, `予定内容を入力してください`, accessToken);
  } else if (step === 'schedule_content') {
    session.data.scheduleContent = input.trim();
    session.step = 'date';
    await updateConversationSession(userId, { step: 'date', data: session.data });

    await replyMessage(
      replyToken,
      `日付を入力してください\n（例: 12/15）\n「今日」と入力すると今日の日付になります`,
      accessToken
    );
  } else if (step === 'date') {
    let scheduleDate: Date;
    if (input === '今日') {
      scheduleDate = new Date();
    } else {
      const dateParts = input.split('/');
      if (dateParts.length === 2) {
        const month = parseInt(dateParts[0], 10);
        const day = parseInt(dateParts[1], 10);
        const year = new Date().getFullYear();
        scheduleDate = new Date(year, month - 1, day);

        if (isNaN(scheduleDate.getTime())) {
          await replyMessage(replyToken, '❌ 日付の形式が正しくありません\n例: 12/15', accessToken);
          return;
        }
      } else {
        await replyMessage(replyToken, '❌ 日付の形式が正しくありません\n例: 12/15', accessToken);
        return;
      }
    }

    const dateStr = `${scheduleDate.getFullYear()}-${String(scheduleDate.getMonth() + 1).padStart(2, '0')}-${String(scheduleDate.getDate()).padStart(2, '0')}`;
    session.data.scheduleDate = dateStr;
    session.step = 'start_time';
    await updateConversationSession(userId, { step: 'start_time', data: session.data });

    await replyMessage(
      replyToken,
      `開始時間を入力してください\n（例: 14:30）\n「なし」と入力すると終日予定になります`,
      accessToken
    );
  } else if (step === 'start_time') {
    // 開始時間のバリデーション
    if (input === 'なし' || input === 'ナシ') {
      // 終日予定として登録
      const userNames = data.userNames || [];
      const userName = userNames.length > 0 ? userNames.join('、') : data.userName!;
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
          `終了時間を入力してください\n（例: 16:00）`,
          accessToken
        );
      } else {
        await replyMessage(replyToken, '❌ 時間の形式が正しくありません\n例: 14:30（0:00〜23:59）', accessToken);
      }
    } else {
      await replyMessage(replyToken, '❌ 時間の形式が正しくありません\n例: 14:30\n終日の場合は「なし」と入力', accessToken);
    }
  } else if (step === 'end_time') {
    const userNames = data.userNames || [];
    const userName = userNames.length > 0 ? userNames.join('、') : data.userName!;
    const scheduleContent = data.scheduleContent!;
    const dateStr = data.scheduleDate!;
    const startTime = data.scheduleStartTime!;

    // 終了時間のバリデーション
    const timeMatch = input.match(/^(\d{1,2}):(\d{2})$/);
    if (!timeMatch) {
      await replyMessage(replyToken, '❌ 時間の形式が正しくありません\n例: 16:00', accessToken);
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
    }

    if (!deleteCategory) {
      await replyMessage(replyToken, '❌ 1 または 2 を選択してください', accessToken);
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
    session.step = 'delete_date';
    await updateConversationSession(userId, { step: 'delete_date', data: session.data });

    await replyMessage(
      replyToken,
      `削除する支出の日付を入力してください\n（例: 12/15）\n「今日」と入力すると今日の日付になります`,
      accessToken
    );
  } else if (step === 'delete_date') {
    let deleteDate: Date;
    if (input === '今日') {
      deleteDate = new Date();
    } else {
      const dateParts = input.split('/');
      if (dateParts.length === 2) {
        const month = parseInt(dateParts[0], 10);
        const day = parseInt(dateParts[1], 10);
        const year = new Date().getFullYear();
        deleteDate = new Date(year, month - 1, day);

        if (isNaN(deleteDate.getTime())) {
          await replyMessage(replyToken, '❌ 日付の形式が正しくありません\n例: 12/15', accessToken);
          return;
        }
      } else {
        await replyMessage(replyToken, '❌ 日付の形式が正しくありません\n例: 12/15', accessToken);
        return;
      }
    }

    const dateStr = `${deleteDate.getFullYear()}-${String(deleteDate.getMonth() + 1).padStart(2, '0')}-${String(deleteDate.getDate()).padStart(2, '0')}`;
    session.data.deleteDate = dateStr;
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

    const deleteCategory = data.deleteCategory!;
    const deleteUserName = data.deleteUserName!;
    const deleteDate = data.deleteDate!;

    // ユーザー情報を取得（userIdを取得するため）
    const displayName = await getUserDisplayName(groupId, userId, accessToken);
    const user = await getOrCreateUser(userId, displayName, groupId);

    // 支出を削除（deleteDateをDateオブジェクトに変換）
    const deleteDateObj = new Date(deleteDate);
    const deletedExpense = await deleteExpenseByDateAndAmount(user.id, deleteDateObj, deleteAmount, deleteCategory);

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

    // 外食費用の場合は残高を戻す
    if (deletedExpense.category === '外食費用') {
      const currentBalance = user.diningBalance;
      const newBalance = currentBalance + deleteAmount;
      await updateDiningBalance(user.id, newBalance);

      const message = createDeleteMessage(
        deleteDate,
        deletedExpense.category,
        deleteAmount,
        deleteUserName,
        deletedExpense.storeName,
        newBalance
      );
      await replyMessage(replyToken, message, accessToken);
    } else {
      const message = createDeleteMessage(
        deleteDate,
        deletedExpense.category,
        deleteAmount,
        deleteUserName,
        deletedExpense.storeName
      );
      await replyMessage(replyToken, message, accessToken);
    }

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
