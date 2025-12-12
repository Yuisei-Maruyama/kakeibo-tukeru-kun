/**
 * タイムゾーンのテストスクリプト
 * Cloud FunctionsがUTCで動作していることを確認し、JST変換が正しく機能するかテスト
 */

import { getJSTDate, getJSTYear, getJSTMonth, getJSTDay, getJSTHours, getJSTInfo, formatDateYYYYMMDD, getJSTMonthStart, getJSTMonthEnd } from '../utils/date.js';

console.log('='.repeat(60));
console.log('タイムゾーンテスト開始');
console.log('='.repeat(60));

// UTC時刻を表示
const utcNow = new Date();
console.log('\n[UTC時刻]');
console.log(`  Date: ${utcNow.toISOString()}`);
console.log(`  Year: ${utcNow.getUTCFullYear()}`);
console.log(`  Month: ${utcNow.getUTCMonth() + 1}`);
console.log(`  Day: ${utcNow.getUTCDate()}`);
console.log(`  Hours: ${utcNow.getUTCHours()}`);

// JST時刻を表示
const jstNow = getJSTDate();
console.log('\n[JST時刻（変換後）]');
console.log(`  Date: ${jstNow.toISOString()}`);
console.log(`  Year: ${getJSTYear()}`);
console.log(`  Month: ${getJSTMonth()}`);
console.log(`  Day: ${getJSTDay()}`);
console.log(`  Hours: ${getJSTHours()}`);

// JST情報
const jstInfo = getJSTInfo();
console.log('\n[JST情報]');
console.log(`  Formatted: ${jstInfo.formatted}`);
console.log(`  UTC Offset: ${jstInfo.utcOffset}`);
console.log(`  Full Info:`, jstInfo);

// 月の開始日・終了日
console.log('\n[当月の範囲（JST）]');
const monthStart = getJSTMonthStart(getJSTYear(), getJSTMonth());
const monthEnd = getJSTMonthEnd(getJSTYear(), getJSTMonth());
console.log(`  Start: ${monthStart.toISOString()}`);
console.log(`  End: ${monthEnd.toISOString()}`);
console.log(`  Start (formatted): ${formatDateYYYYMMDD(monthStart)}`);
console.log(`  End (formatted): ${formatDateYYYYMMDD(monthEnd)}`);

// 境界値テスト（深夜0時前後）
console.log('\n[境界値テスト]');
console.log('  UTC 2025-12-31 23:00 (JST 2026-01-01 08:00):');
const utcEndOfYear = new Date('2025-12-31T23:00:00Z');
const jstDate = new Date(utcEndOfYear.getTime() + 9 * 60 * 60 * 1000);
console.log(`    UTC: ${utcEndOfYear.toISOString()}`);
console.log(`    JST: ${jstDate.toISOString()}`);
console.log(`    JST Year: ${jstDate.getUTCFullYear()}`);
console.log(`    JST Month: ${jstDate.getUTCMonth() + 1}`);
console.log(`    JST Day: ${jstDate.getUTCDate()}`);

// 検証
console.log('\n[検証結果]');
const utcTime = utcNow.getTime();
const jstTime = jstNow.getTime();
const timeDiffMs = jstTime - utcTime;
const timeDiffHours = timeDiffMs / (1000 * 60 * 60);
const expectedDiff = 9; // JST = UTC+9

if (Math.abs(timeDiffHours - expectedDiff) < 0.01) { // 誤差0.01時間以内
  console.log('  ✅ JST変換が正しく動作しています');
  console.log(`     UTC時刻 + 9時間 = JST時刻`);
  console.log(`     時刻差分: ${timeDiffHours.toFixed(2)}時間`);
} else {
  console.log('  ⚠️  JST変換に問題がある可能性があります');
  console.log(`     期待される差分: ${expectedDiff}時間`);
  console.log(`     実際の差分: ${timeDiffHours.toFixed(2)}時間`);
}

console.log('\n' + '='.repeat(60));
console.log('テスト完了');
console.log('='.repeat(60));
