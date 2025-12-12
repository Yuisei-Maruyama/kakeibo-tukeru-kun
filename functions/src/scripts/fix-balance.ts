/**
 * ユーザーの外食残高を正しい値に修正するスクリプト
 */
import { Firestore, Timestamp } from '@google-cloud/firestore';

const firestore = new Firestore();

async function fixUserBalance(userId: string) {
  console.log(`\n🔍 Fixing balance for user: ${userId}`);

  // ユーザー情報を取得
  const userDoc = await firestore.collection('users').doc(userId).get();
  if (!userDoc.exists) {
    console.error('❌ User not found');
    return;
  }

  const userData = userDoc.data();
  console.log('\n📊 Current user data:');
  console.log(`  Name: ${userData?.displayName}`);
  console.log(`  Current balance: ¥${userData?.diningBalance?.toLocaleString()}`);
  console.log(`  Balance reset at: ${userData?.balanceResetAt?.toDate().toLocaleString('ja-JP')}`);

  // balanceResetAt以降の外食費用の合計を計算
  const balanceResetAt = userData?.balanceResetAt || Timestamp.fromDate(new Date('2025-12-01'));
  console.log(`\n💰 Calculating expenses since: ${balanceResetAt.toDate().toLocaleString('ja-JP')}`);

  // インデックスなしで実行できるように、まずuserIdとcategoryでフィルタ
  const expensesSnapshot = await firestore
    .collection('expenses')
    .where('userId', '==', userId)
    .where('category', '==', '外食費用')
    .get();

  let totalExpenses = 0;
  const expenses: any[] = [];

  expensesSnapshot.forEach(doc => {
    const expense = doc.data();
    const expenseDate = expense.date as Timestamp;

    // JavaScriptでbalanceResetAt以降のものをフィルタ
    if (expenseDate.toMillis() >= balanceResetAt.toMillis()) {
      totalExpenses += expense.amount;
      expenses.push({
        id: doc.id,
        date: expenseDate.toDate(),
        amount: expense.amount,
        storeName: expense.storeName,
        userName: expense.userName,
      });
    }
  });

  console.log(`\n📋 Found ${expenses.length} expense(s):`);
  if (expenses.length === 0) {
    console.log('  (No expenses found)');
  } else {
    expenses.sort((a, b) => a.date.getTime() - b.date.getTime());
    expenses.forEach(exp => {
      console.log(`  - ${exp.date.toISOString().split('T')[0]}: ¥${exp.amount.toLocaleString()} at ${exp.storeName} (${exp.userName})`);
    });
  }
  console.log(`\n  Total expenses: ¥${totalExpenses.toLocaleString()}`);

  // 正しい残高を計算
  const monthlyBudget = 50000;
  const correctBalance = monthlyBudget - totalExpenses;

  console.log(`\n🧮 Calculation:`);
  console.log(`  Monthly budget: ¥${monthlyBudget.toLocaleString()}`);
  console.log(`  Total expenses: ¥${totalExpenses.toLocaleString()}`);
  console.log(`  Correct balance: ¥${correctBalance.toLocaleString()}`);
  console.log(`\n  Current balance: ¥${(userData?.diningBalance || 0).toLocaleString()}`);
  console.log(`  Difference: ¥${(correctBalance - (userData?.diningBalance || 0)).toLocaleString()}`);

  // 残高を更新
  await firestore.collection('users').doc(userId).update({
    diningBalance: correctBalance,
    updatedAt: Timestamp.now(),
  });

  console.log(`\n✅ Balance updated successfully!`);
  console.log(`  New balance: ¥${correctBalance.toLocaleString()}`);
}

// スクリプト実行
const userId = process.argv[2] || 'REDACTED_USER_ID';
fixUserBalance(userId)
  .then(() => {
    console.log('\n✅ Script completed successfully\n');
    process.exit(0);
  })
  .catch(error => {
    console.error('\n❌ Script failed:', error);
    process.exit(1);
  });
