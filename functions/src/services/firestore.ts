import { Firestore, Timestamp } from '@google-cloud/firestore';
import { User, Expense, Settings, Category, ConversationSession, Subscription, Rent } from '../types/index.js';

/**
 * Firestoreクライアント
 */
let firestore: Firestore | null = null;

/**
 * Firestoreの初期化
 */
function getFirestore(): Firestore {
  if (!firestore) {
    firestore = new Firestore();
  }
  return firestore;
}

// =============================================================================
// ユーザー操作
// =============================================================================

/**
 * ユーザーを取得（存在しない場合は作成）
 */
export async function getOrCreateUser(
  userId: string,
  displayName: string,
  groupId: string
): Promise<User> {
  const db = getFirestore();
  const userRef = db.collection('users').doc(userId);
  const userDoc = await userRef.get();

  if (userDoc.exists) {
    return userDoc.data() as User;
  }

  // 新規ユーザー作成
  const newUser: User = {
    id: userId,
    displayName,
    groupId,
    isActive: true,
    diningBalance: 50000,
    balanceResetAt: Timestamp.now(),
    createdAt: Timestamp.now(),
    updatedAt: Timestamp.now(),
  };

  await userRef.set(newUser);
  console.log(`New user created: ${userId} (${displayName})`);
  return newUser;
}

/**
 * ユーザーを取得
 */
export async function getUser(userId: string): Promise<User | null> {
  const db = getFirestore();
  const userDoc = await db.collection('users').doc(userId).get();
  return userDoc.exists ? (userDoc.data() as User) : null;
}

/**
 * 全ユーザーを取得
 */
export async function getAllUsers(): Promise<User[]> {
  const db = getFirestore();
  const usersSnapshot = await db.collection('users').where('isActive', '==', true).get();
  return usersSnapshot.docs.map(doc => doc.data() as User);
}

/**
 * 表示名でユーザーを検索（完全一致）
 */
export async function getUserByDisplayName(displayName: string): Promise<User | null> {
  const db = getFirestore();
  const usersSnapshot = await db.collection('users')
    .where('displayName', '==', displayName)
    .where('isActive', '==', true)
    .limit(1)
    .get();

  if (usersSnapshot.empty) {
    return null;
  }

  return usersSnapshot.docs[0].data() as User;
}

/**
 * 表示名でユーザーを検索（部分一致）
 * 入力文字列がdisplayNameに含まれるユーザーを検索
 */
export async function getUserByDisplayNamePartial(partialName: string): Promise<User | null> {
  const db = getFirestore();
  // Firestoreは部分一致クエリをサポートしていないため、全ユーザーを取得してフィルタリング
  const usersSnapshot = await db.collection('users')
    .where('isActive', '==', true)
    .get();

  if (usersSnapshot.empty) {
    return null;
  }

  // 部分一致で検索（大文字小文字を区別しない）
  const lowerPartialName = partialName.toLowerCase();
  for (const doc of usersSnapshot.docs) {
    const user = doc.data() as User;
    if (user.displayName.toLowerCase().includes(lowerPartialName)) {
      return user;
    }
  }

  return null;
}

/**
 * ユーザーの外食残高を更新
 */
export async function updateDiningBalance(userId: string, newBalance: number): Promise<void> {
  const db = getFirestore();
  await db.collection('users').doc(userId).update({
    diningBalance: newBalance,
    updatedAt: Timestamp.now(),
  });
}

/**
 * 全ユーザーの外食残高をリセット
 */
export async function resetAllDiningBalances(monthlyBudget: number): Promise<void> {
  const db = getFirestore();
  const users = await getAllUsers();

  const batch = db.batch();
  for (const user of users) {
    const userRef = db.collection('users').doc(user.id);
    batch.update(userRef, {
      diningBalance: monthlyBudget,
      balanceResetAt: Timestamp.now(),
      updatedAt: Timestamp.now(),
    });
  }

  await batch.commit();
  console.log(`Reset dining balances for ${users.length} users`);
}

// =============================================================================
// 支出操作
// =============================================================================

/**
 * 支出を保存
 */
export async function saveExpense(expense: Omit<Expense, 'id' | 'createdAt'>): Promise<string> {
  const db = getFirestore();
  const expenseRef = db.collection('expenses').doc();

  const newExpense: Expense = {
    ...expense,
    id: expenseRef.id,
    createdAt: Timestamp.now(),
  };

  await expenseRef.set(newExpense);
  console.log(`Expense saved: ${expenseRef.id}`);
  return expenseRef.id;
}

/**
 * 期間内の支出を取得
 */
export async function getExpensesByPeriod(
  startDate: Date,
  endDate: Date
): Promise<Expense[]> {
  const db = getFirestore();
  const snapshot = await db
    .collection('expenses')
    .where('date', '>=', Timestamp.fromDate(startDate))
    .where('date', '<=', Timestamp.fromDate(endDate))
    .orderBy('date', 'desc')
    .get();

  return snapshot.docs.map(doc => doc.data() as Expense);
}

/**
 * ユーザー別・カテゴリー別の支出合計を取得
 */
export async function getExpensesSummary(
  startDate: Date,
  endDate: Date
): Promise<Map<string, Map<Category, number>>> {
  const expenses = await getExpensesByPeriod(startDate, endDate);
  const summary = new Map<string, Map<Category, number>>();

  for (const expense of expenses) {
    if (!summary.has(expense.userId)) {
      summary.set(expense.userId, new Map());
    }
    const userMap = summary.get(expense.userId)!;
    const currentTotal = userMap.get(expense.category) || 0;
    userMap.set(expense.category, currentTotal + expense.amount);
  }

  return summary;
}

/**
 * 直近の支出を取得（年月指定可能）
 * @param limit - 取得件数
 * @param startDate - 開始日（省略時は全期間）
 * @param endDate - 終了日（省略時は全期間）
 */
export async function getRecentExpenses(
  limit: number = 10,
  startDate?: Date,
  endDate?: Date
): Promise<Expense[]> {
  const db = getFirestore();
  let query = db.collection('expenses').orderBy('date', 'desc');

  // 期間指定がある場合はフィルタを追加
  if (startDate) {
    query = query.where('date', '>=', Timestamp.fromDate(startDate));
  }
  if (endDate) {
    query = query.where('date', '<=', Timestamp.fromDate(endDate));
  }

  const snapshot = await query.limit(limit).get();

  return snapshot.docs.map(doc => doc.data() as Expense);
}

/**
 * 指定日付の支出を削除
 */
export async function deleteExpensesByDate(
  userId: string,
  date: Date
): Promise<Expense[]> {
  const db = getFirestore();
  const startOfDay = new Date(date);
  startOfDay.setHours(0, 0, 0, 0);
  const endOfDay = new Date(date);
  endOfDay.setHours(23, 59, 59, 999);

  const snapshot = await db
    .collection('expenses')
    .where('userId', '==', userId)
    .where('date', '>=', Timestamp.fromDate(startOfDay))
    .where('date', '<=', Timestamp.fromDate(endOfDay))
    .get();

  const deletedExpenses: Expense[] = [];
  const batch = db.batch();

  for (const doc of snapshot.docs) {
    deletedExpenses.push(doc.data() as Expense);
    batch.delete(doc.ref);
  }

  await batch.commit();
  console.log(`Deleted ${deletedExpenses.length} expenses for ${userId} on ${date.toISOString()}`);
  return deletedExpenses;
}

/**
 * 指定日付・金額の支出を削除
 */
export async function deleteExpenseByDateAndAmount(
  userId: string,
  date: Date,
  amount: number,
  category: Category
): Promise<Expense | null> {
  const db = getFirestore();
  const startOfDay = new Date(date);
  startOfDay.setHours(0, 0, 0, 0);
  const endOfDay = new Date(date);
  endOfDay.setHours(23, 59, 59, 999);

  // インデックス不要なクエリ: userIdとcategoryだけでフィルタ
  const snapshot = await db
    .collection('expenses')
    .where('userId', '==', userId)
    .where('category', '==', category)
    .get();

  // JavaScriptで日付と金額をフィルタ
  const matchingDocs = snapshot.docs.filter(doc => {
    const expense = doc.data() as Expense;
    const expenseDate = expense.date.toDate();
    return expenseDate >= startOfDay &&
           expenseDate <= endOfDay &&
           expense.amount === amount;
  });

  if (matchingDocs.length === 0) {
    return null;
  }

  // 最初にマッチしたものを削除
  const doc = matchingDocs[0];
  const expense = doc.data() as Expense;
  await doc.ref.delete();

  console.log(`Deleted expense: ${expense.id} (${userId}, ${date.toISOString()}, ${amount}, ${category})`);
  return expense;
}

// =============================================================================
// 設定操作
// =============================================================================

/**
 * 設定を取得
 */
export async function getSettings(): Promise<Settings | null> {
  const db = getFirestore();
  const settingsDoc = await db.collection('settings').doc('global').get();
  return settingsDoc.exists ? (settingsDoc.data() as Settings) : null;
}

/**
 * 設定を更新
 */
export async function updateSettings(updates: Partial<Omit<Settings, 'id'>>): Promise<void> {
  const db = getFirestore();
  await db.collection('settings').doc('global').update({
    ...updates,
    updatedAt: Timestamp.now(),
  });
  console.log('Settings updated:', updates);
}

/**
 * LINEグループIDを設定（初回のみ）
 */
export async function initializeLineGroupId(lineGroupId: string): Promise<void> {
  const db = getFirestore();
  const settingsRef = db.collection('settings').doc('global');
  const settingsDoc = await settingsRef.get();

  if (!settingsDoc.exists || !settingsDoc.data()?.lineGroupId) {
    await settingsRef.set(
      {
        lineGroupId,
        updatedAt: Timestamp.now(),
      },
      { merge: true }
    );
    console.log(`LINE Group ID initialized: ${lineGroupId}`);
  }
}

/**
 * 対話セッションを保存
 */
export async function saveConversationSession(session: ConversationSession): Promise<void> {
  const db = getFirestore();
  await db.collection('conversations').doc(session.userId).set({
    ...session,
    createdAt: Timestamp.now(),
    expiresAt: Timestamp.fromMillis(Date.now() + 10 * 60 * 1000), // 10分後
  });
  console.log(`Conversation session saved for user: ${session.userId}`);
}

/**
 * 対話セッションを取得
 */
export async function getConversationSession(userId: string): Promise<ConversationSession | null> {
  const db = getFirestore();
  const doc = await db.collection('conversations').doc(userId).get();

  if (!doc.exists) {
    return null;
  }

  const session = doc.data() as ConversationSession;

  // 有効期限チェック
  if (session.expiresAt.toMillis() < Date.now()) {
    // 期限切れの場合は削除
    await deleteConversationSession(userId);
    return null;
  }

  return session;
}

/**
 * 対話セッションを削除
 */
export async function deleteConversationSession(userId: string): Promise<void> {
  const db = getFirestore();
  await db.collection('conversations').doc(userId).delete();
  console.log(`Conversation session deleted for user: ${userId}`);
}

/**
 * 対話セッションを更新
 */
export async function updateConversationSession(
  userId: string,
  updates: Partial<ConversationSession>
): Promise<void> {
  const db = getFirestore();
  await db.collection('conversations').doc(userId).update(updates);
  console.log(`Conversation session updated for user: ${userId}`);
}

/**
 * カレンダーイベントIDで支出が存在するかチェック
 */
export async function expenseExistsByCalendarEventId(
  calendarEventId: string
): Promise<boolean> {
  const db = getFirestore();
  const snapshot = await db
    .collection('expenses')
    .where('calendarEventId', '==', calendarEventId)
    .limit(1)
    .get();

  return !snapshot.empty;
}

/**
 * カレンダーイベントIDで支出を取得
 */
export async function getExpenseByCalendarEventId(
  calendarEventId: string
): Promise<Expense | null> {
  const db = getFirestore();
  const snapshot = await db
    .collection('expenses')
    .where('calendarEventId', '==', calendarEventId)
    .limit(1)
    .get();

  if (snapshot.empty) {
    return null;
  }

  const doc = snapshot.docs[0];
  return { id: doc.id, ...doc.data() } as Expense;
}

/**
 * 支出を更新
 */
export async function updateExpense(
  expenseId: string,
  updates: Partial<Omit<Expense, 'id'>>
): Promise<void> {
  const db = getFirestore();
  await db.collection('expenses').doc(expenseId).update(updates);
  console.log(`Expense updated: ${expenseId}`);
}

/**
 * ユーザー名から対応するユーザーIDを取得
 * 完全一致で見つからない場合は、あいまい検索（部分一致）を試みる
 */
export async function getUserIdByDisplayName(
  displayName: string
): Promise<string | null> {
  const db = getFirestore();

  // まず完全一致を試みる
  const exactSnapshot = await db
    .collection('users')
    .where('displayName', '==', displayName)
    .limit(1)
    .get();

  if (!exactSnapshot.empty) {
    return exactSnapshot.docs[0].id;
  }

  // 完全一致がない場合は、あいまい検索
  // 全ユーザーを取得して部分一致を確認
  const allUsersSnapshot = await db.collection('users').get();

  if (allUsersSnapshot.empty) {
    return null;
  }

  const users = allUsersSnapshot.docs.map(doc => ({
    id: doc.id,
    displayName: doc.data().displayName as string,
  }));

  // 入力されたユーザー名を正規化（空白除去、小文字化）
  const normalizedInput = displayName.replace(/\s+/g, '').toLowerCase();

  // あいまいマッチング: 部分一致または含む関係
  for (const user of users) {
    const normalizedUserName = user.displayName.replace(/\s+/g, '').toLowerCase();

    // パターン1: 入力が登録名に含まれる（例: 入力「田中」→ 登録「田中太郎」）
    if (normalizedUserName.includes(normalizedInput)) {
      console.log(`Fuzzy match found: input="${displayName}" matched "${user.displayName}"`);
      return user.id;
    }

    // パターン2: 登録名が入力に含まれる（例: 入力「田中太郎さん」→ 登録「田中」）
    if (normalizedInput.includes(normalizedUserName)) {
      console.log(`Fuzzy match found: input="${displayName}" matched "${user.displayName}"`);
      return user.id;
    }
  }

  console.warn(`No user found for: ${displayName}`);
  return null;
}

// =============================================================================
// サブスクリプション操作
// =============================================================================

/**
 * サブスクリプションを保存
 */
export async function saveSubscription(
  subscription: Omit<Subscription, 'id' | 'createdAt' | 'updatedAt'>
): Promise<string> {
  const db = getFirestore();
  const subscriptionRef = db.collection('subscriptions').doc();

  const newSubscription: Subscription = {
    ...subscription,
    id: subscriptionRef.id,
    createdAt: Timestamp.now(),
    updatedAt: Timestamp.now(),
  };

  await subscriptionRef.set(newSubscription);
  console.log(`Subscription saved: ${subscriptionRef.id}`);
  return subscriptionRef.id;
}

/**
 * グループの有効なサブスクリプション一覧を取得
 */
export async function getActiveSubscriptions(groupId: string): Promise<Subscription[]> {
  const db = getFirestore();
  const snapshot = await db
    .collection('subscriptions')
    .where('groupId', '==', groupId)
    .where('isActive', '==', true)
    .orderBy('startDate', 'asc')
    .get();

  return snapshot.docs.map(doc => doc.data() as Subscription);
}

/**
 * サブスクリプションを取得
 */
export async function getSubscription(subscriptionId: string): Promise<Subscription | null> {
  const db = getFirestore();
  const doc = await db.collection('subscriptions').doc(subscriptionId).get();
  return doc.exists ? (doc.data() as Subscription) : null;
}

/**
 * サブスクリプションを無効化（論理削除）
 */
export async function deactivateSubscription(subscriptionId: string): Promise<void> {
  const db = getFirestore();
  await db.collection('subscriptions').doc(subscriptionId).update({
    isActive: false,
    updatedAt: Timestamp.now(),
  });
  console.log(`Subscription deactivated: ${subscriptionId}`);
}

/**
 * 全グループの有効なサブスクリプションを取得
 */
export async function getAllActiveSubscriptions(): Promise<Subscription[]> {
  const db = getFirestore();
  const snapshot = await db
    .collection('subscriptions')
    .where('isActive', '==', true)
    .get();

  return snapshot.docs.map(doc => doc.data() as Subscription);
}

/**
 * サブスクリプションを更新
 */
export async function updateSubscription(
  subscriptionId: string,
  updates: Partial<Omit<Subscription, 'id' | 'createdAt' | 'updatedAt'>>
): Promise<void> {
  const db = getFirestore();
  await db.collection('subscriptions').doc(subscriptionId).update({
    ...updates,
    updatedAt: Timestamp.now(),
  });
  console.log(`Subscription updated: ${subscriptionId}`, updates);
}

// =============================================================================
// 家賃操作
// =============================================================================

/**
 * 家賃情報を保存（または更新）
 */
export async function saveRent(
  rent: Omit<Rent, 'id' | 'createdAt' | 'updatedAt'>
): Promise<void> {
  const db = getFirestore();
  const rentRef = db.collection('rents').doc('global');
  const existingDoc = await rentRef.get();

  if (existingDoc.exists) {
    // 既存の場合は更新
    await rentRef.update({
      ...rent,
      updatedAt: Timestamp.now(),
    });
    console.log('Rent updated');
  } else {
    // 新規作成
    const newRent: Rent = {
      ...rent,
      id: 'global',
      createdAt: Timestamp.now(),
      updatedAt: Timestamp.now(),
    };
    await rentRef.set(newRent);
    console.log('Rent created');
  }
}

/**
 * 家賃情報を取得
 */
export async function getRent(): Promise<Rent | null> {
  const db = getFirestore();
  const rentDoc = await db.collection('rents').doc('global').get();
  return rentDoc.exists ? (rentDoc.data() as Rent) : null;
}

/**
 * 家賃情報を更新
 */
export async function updateRent(
  updates: Partial<Omit<Rent, 'id' | 'createdAt' | 'updatedAt'>>
): Promise<void> {
  const db = getFirestore();
  await db.collection('rents').doc('global').update({
    ...updates,
    updatedAt: Timestamp.now(),
  });
  console.log('Rent updated:', updates);
}

/**
 * calendarEventIdがない支出を検索（日付・金額・カテゴリー・ユーザーでマッチング）
 * 手動入力された支出とカレンダーイベントを紐付けるために使用
 */
export async function findExpenseWithoutCalendarEventId(
  userId: string,
  date: Date,
  amount: number,
  category: Category
): Promise<Expense | null> {
  const db = getFirestore();
  const startOfDay = new Date(date);
  startOfDay.setHours(0, 0, 0, 0);
  const endOfDay = new Date(date);
  endOfDay.setHours(23, 59, 59, 999);

  // userIdとcategoryでフィルタ
  const snapshot = await db
    .collection('expenses')
    .where('userId', '==', userId)
    .where('category', '==', category)
    .get();

  // JavaScriptで日付・金額・calendarEventIdをフィルタ
  const matchingDocs = snapshot.docs.filter(doc => {
    const expense = doc.data() as Expense;
    const expenseDate = expense.date.toDate();
    return expenseDate >= startOfDay &&
           expenseDate <= endOfDay &&
           expense.amount === amount &&
           !expense.calendarEventId; // calendarEventIdがないものだけ
  });

  if (matchingDocs.length === 0) {
    return null;
  }

  return matchingDocs[0].data() as Expense;
}
