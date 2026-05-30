function yuan(amount) {
  if (amount == null) return "¥0.00";
  return "¥" + Number(amount).toFixed(2);
}

function duration(ms) {
  if (!ms || ms <= 0) return "0 分钟";
  const totalMinutes = Math.floor(ms / 60000);
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  return hours > 0 ? `${hours} 小时 ${minutes} 分钟` : `${minutes} 分钟`;
}

function time(ts) {
  if (!ts) return "—";
  const d = new Date(ts);
  return `${d.getMonth() + 1}/${d.getDate()} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function pad(n) {
  return n < 10 ? `0${n}` : `${n}`;
}

module.exports = { yuan, duration, time };
