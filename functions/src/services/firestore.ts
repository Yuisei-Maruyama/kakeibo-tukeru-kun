import { Firestore, Timestamp } from '@google-cloud/firestore';
import { User, Expense, Settings, Category } from '../types/index.js';

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
 * 直近の支出を取得
 */
export async function getRecentExpenses(limit: number = 10): Promise<Expense[]> {
  const db = getFirestore();
  const snapshot = await db
    .collection('expenses')
    .orderBy('date', 'desc')
    .limit(limit)
    .get();

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
  amount: number
): Promise<Expense | null> {
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
    .where('amount', '==', amount)
    .limit(1)
    .get();

  if (snapshot.empty) {
    return null;
  }

  const doc = snapshot.docs[0];
  const expense = doc.data() as Expense;
  await doc.ref.delete();

  console.log(`Deleted expense: ${expense.id} (${userId}, ${date.toISOString()}, ${amount})`);
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
