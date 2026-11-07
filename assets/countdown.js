/* 首页那条学期倒计时 —— 天数在**打开页面时**算，不在构建时算。
 *
 * 为什么要一段脚本（全站只有两个，另一个是 review-play.js）：
 * 站是静态的，HTML 里的数字停在最后一次 push 那天 —— 隔天打开就少一天、
 * 周末不提交能差两天。**倒计时给错天数比不给更糟**：这个数字是拿来安排
 * 复习进度的，差两天就白排。CSS 做不到「今天是几号」，只能交给脚本。
 *
 * HTML 里印的那个数是构建那天的值，没 JS 时照样能看（只是可能旧几天）。
 * 日期本身来自 storage/spec/schedule/term.txt，构建时写进 data-date。
 *
 * 文案分支（明天 / 今天 / 过了）**只写在这一处**：Python 那边只算一个天数，
 * 两边各写一套措辞迟早会漂。
 */
document.querySelectorAll('.count[data-date]').forEach((el) => {
  const [y, m, d] = el.dataset.date.split('-').map(Number);
  if (!y || !m || !d) return;                     // 日期没写对就保持原样，别把页面弄花

  // 按**日历天**算，不按 24 小时块：两边都归到本地零点，
  // 下午打开和早上打开必须是同一个数
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const days = Math.round((new Date(y, m - 1, d) - today) / 86400000);

  if (days < 0) { el.hidden = true; return; }     // 过去了就整条收起来（下次构建换成下一个里程碑）

  // 名字那行不动（模板已经印好，还带着「暂定」标签），这儿只改天数那一行
  const num = el.querySelector('.num');
  const unit = el.querySelector('.unit');
  num.hidden = days < 2;                          // 「就在明天」「就是今天」不配数字
  if (days >= 2) { num.textContent = days; unit.textContent = '天'; }
  else { unit.textContent = days === 1 ? '就在明天' : '就是今天'; }
});
