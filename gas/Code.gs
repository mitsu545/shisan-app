/**
 * 預金の予報 — Gmail から入出金を読み取り、アプリに渡す Google Apps Script
 *
 * 読むメール（読むだけ。送信・削除・ラベル付けはしない）
 *   1. 楽天カード「お支払予定金額のご案内」 … 今月の引き落とし額と日（カード①）
 *   2. 楽天カード「カード利用のお知らせ（速報版）」 … 月ごとの利用額（カード①の見込み）
 *   3. 三井住友「ご利用のお知らせ」 … 月ごとの利用額（カード②の見込み）
 *   4. マネーフォワードME「入金／出金のお知らせ」 … 楽天銀行の入出金（1万円以上）
 *
 * 設定：スクリプトプロパティに TOKEN（合言葉）を入れる。アプリにも同じ合言葉を入れる。
 */

var DAYS = 70; // 何日前までのメールを読むか

function doGet(e) {
  var token = PropertiesService.getScriptProperties().getProperty('TOKEN');
  if (!token || !e || !e.parameter || e.parameter.token !== token) {
    return json_({ error: '合言葉が違います' });
  }
  return json_({
    bills: readBills_(),
    usage: { card1: readRakutenUsage_(), card2: readSmbcUsage_() },
    moves: readMoves_(),
    at: new Date().toISOString()
  });
}

/* 1. 楽天カードの請求額：「2026年11月合計お支払予定金額 369907円 お支払日 2026/11/27」 */
function readBills_() {
  var out = [];
  eachMessage_('from:info@mail.rakuten-card.co.jp subject:お支払予定金額', function (body) {
    var a = body.match(/合計お支払予定金額\s*([\d,]+)\s*円/);
    var d = body.match(/お支払日\s*(\d{4})\/(\d{1,2})\/(\d{1,2})/);
    if (a && d) out.push({ card: 'card1', amount: num_(a[1]), due: ymd_(d[1], d[2], d[3]) });
  });
  return out;
}

/* 2. 楽天カードの速報：「■利用日 2026/11/02 … ■利用金額 1,234 円」を月ごとに合計 */
function readRakutenUsage_() {
  var sum = {};
  eachMessage_('from:info@mail.rakuten-card.co.jp subject:速報版', function (body) {
    var re = /■利用日[\s:：]*(\d{4})\/(\d{1,2})\/(\d{1,2})[\s\S]*?■利用金額[\s:：]*([\d,]+)/g, m;
    while ((m = re.exec(body)) !== null) add_(sum, m[1], m[2], num_(m[4]));
  });
  return sum;
}

/* 3. 三井住友の利用通知：「◇利用日：2026/11/14 13:41 … ◇利用金額：4,175円」を月ごとに合計 */
function readSmbcUsage_() {
  var sum = {};
  eachMessage_('from:statement@vpass.ne.jp subject:ご利用のお知らせ', function (body) {
    var m = body.match(/利用日時?[\s:：]*(\d{4})\/(\d{1,2})\/(\d{1,2})[\s\S]*?([\d,]+)\s*円/);
    if (m) add_(sum, m[1], m[2], num_(m[4]));
  });
  return sum;
}

/* 4. マネーフォワードの通知：「金融機関 楽天銀行 入金日 2026年11月13日 入金額 322890円」 */
function readMoves_() {
  var out = [];
  eachMessage_('subject:"Money Forward ME" (入金のお知らせ OR 出金のお知らせ)', function (body, msg) {
    var m = body.match(/金融機関\s*(\S+)\s*(入金|出金)日\s*(\d{4})年(\d{1,2})月(\d{1,2})日\s*(?:入金|出金)額\s*([\d,]+)\s*円/);
    if (m && m[1] === '楽天銀行') {
      out.push({ id: msg.getId(), dir: m[2] === '入金' ? 1 : -1, date: ymd_(m[3], m[4], m[5]), amount: num_(m[6]) });
    }
  });
  return out;
}

/* ---------- 共通 ---------- */
function eachMessage_(query, fn) {
  GmailApp.search(query + ' newer_than:' + DAYS + 'd', 0, 100).forEach(function (th) {
    th.getMessages().forEach(function (msg) { fn(msg.getPlainBody().replace(/\s+/g, ' '), msg); });
  });
}
function add_(sum, y, mo, v) { var k = y + '-' + pad_(mo); sum[k] = (sum[k] || 0) + v; }
function num_(s) { return parseInt(String(s).replace(/,/g, ''), 10) || 0; }
function pad_(n) { n = +n; return (n < 10 ? '0' : '') + n; }
function ymd_(y, m, d) { return y + '-' + pad_(m) + '-' + pad_(d); }
function json_(o) { return ContentService.createTextOutput(JSON.stringify(o)).setMimeType(ContentService.MimeType.JSON); }

/* エディタで実行して、ログで読み取り結果を確かめる用 */
function test() { Logger.log(JSON.stringify({ bills: readBills_(), usage: { card1: readRakutenUsage_(), card2: readSmbcUsage_() }, moves: readMoves_() }, null, 1)); }
