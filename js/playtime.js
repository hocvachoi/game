// GIỚI HẠN THỜI GIAN CHƠI: tối đa CONFIG.PLAYTIME.LIMIT_SEC (3 giờ) mỗi ngày (theo giờ Việt Nam, reset 00:00), đếm HOÀN TOÀN ở trình duyệt (localStorage theo tài khoản + ngày):
// không tốn lượt đọc/ghi Firestore. Chỉ tính khi tab đang hiển thị và có thao tác trong IDLE_SEC gần nhất. Đổi trình duyệt/xóa dữ liệu trình duyệt sẽ tính lại (chấp nhận mức "cơ bản").
// Còn WARN_SEC → nhắc; hết giờ → kết thúc lượt đang chơi (vẫn lưu), khóa vào Phiêu lưu/Hầm ngục/Boss Raid/Ranked; vẫn dùng được Cài đặt, Cửa hàng, Trang bị.
const PlayTime = {
  uid: null, day: '', used: 0, locked: false, warned: false, saveAcc: 0,
  lastActive: Date.now(), lastTick: Date.now(), timer: null,
  cfg() { return CONFIG.PLAYTIME; },
  today() { return new Date(Date.now() + 7 * 3600 * 1000).toISOString().slice(0, 10); },   // ngày theo giờ Việt Nam (UTC+7)
  key() { return `rpg.playtime.${this.uid}.${this.day}`; },
  load() { try { return Math.max(0, parseInt(localStorage.getItem(this.key()) || '0', 10) || 0); } catch (e) { return 0; } },
  save() { try { localStorage.setItem(this.key(), String(Math.floor(this.used))); } catch (e) { /* bộ nhớ trình duyệt bị chặn: bỏ qua */ } },
  cleanup() {   // xóa bộ đếm của các ngày cũ
    try { Object.keys(localStorage).filter(k => k.startsWith('rpg.playtime.') && !k.endsWith('.' + this.day)).forEach(k => localStorage.removeItem(k)); } catch (e) { /* bỏ qua */ }
  },
  left() { return Math.max(0, this.cfg().LIMIT_SEC - this.used); },
  fmt(sec) {
    const h = Math.floor(sec / 3600), m = Math.floor((sec % 3600) / 60);
    return h > 0 ? `${h} giờ ${m} phút` : `${m} phút`;
  },
  summary() {
    return `Thời gian chơi hôm nay: ${this.fmt(this.used)} / ${this.fmt(this.cfg().LIMIT_SEC)} (còn ${this.fmt(this.left())}).`;
  },
  touch() { this.lastActive = Date.now(); },
  tick() {
    const now = Date.now(), dt = Math.min(5, (now - this.lastTick) / 1000); this.lastTick = now;
    const uid = Player.uid;
    if (!uid || !Player.data) { this.uid = null; return; }
    const day = this.today();
    if (uid !== this.uid || day !== this.day) {   // đổi tài khoản hoặc sang ngày mới
      this.uid = uid; this.day = day; this.used = this.load(); this.warned = false; this.saveAcc = 0;
      this.locked = this.used >= this.cfg().LIMIT_SEC; this.cleanup();
    }
    const active = document.visibilityState === 'visible' && now - this.lastActive <= this.cfg().IDLE_SEC * 1000;
    if (active && !this.locked) {
      this.used += dt; this.saveAcc += dt;
      if (this.saveAcc >= 10) { this.saveAcc = 0; this.save(); }
    }
    if (!this.locked && !this.warned && this.left() <= this.cfg().WARN_SEC) {
      this.warned = true; this.toast(`Còn ${this.fmt(Math.ceil(this.left() / 60) * 60)} là hết thời gian chơi hôm nay.`);
    }
    if (!this.locked && this.used >= this.cfg().LIMIT_SEC) {
      this.locked = true; this.save(); this.endRun(); this.showLock();
    }
  },
  // Hết giờ giữa lượt: kết thúc lượt (Raid: gửi sát thương; còn lại: lưu kết quả như khi thoát).
  endRun() {
    try {
      if (!Adventure.active) return;
      if (Adventure.raid) Raid.end('time');
      else if (Adventure.quizCtl) Adventure.quizCtl.end({ exited: true });
    } catch (e) { console.error(e); }
  },
  blocked() {
    if (!this.locked) return false;
    this.showLock();
    return true;
  },
  toast(text) {
    const n = el('div', 'ui-msg is-error playtime-toast', text);
    n.setAttribute('role', 'status');
    document.body.append(n);
    setTimeout(() => n.remove(), 9000);
  },
  showLock() {
    if (document.getElementById('playtime-lock')) return;
    const back = el('div', 'sheet-backdrop'), card = el('div', 'sheet-card');
    back.id = 'playtime-lock'; card.setAttribute('role', 'alertdialog'); card.setAttribute('aria-modal', 'true');
    const ok = el('button', 'btn', 'Đã hiểu'); ok.type = 'button';
    ok.onclick = () => back.remove();
    back.onclick = e => { if (e.target === back) back.remove(); };
    card.append(el('b', 'sheet-name', 'Hết giờ chơi hôm nay'),
      el('p', 'sheet-sub', `Bạn đã chơi đủ ${this.fmt(this.cfg().LIMIT_SEC)} hôm nay. Hãy nghỉ ngơi và hẹn gặp lại vào ngày mai nhé!`),
      el('p', 'sheet-have', 'Bạn vẫn có thể vào Cài đặt, Cửa hàng và Trang bị.'), ok);
    back.append(card); document.body.append(back); ok.focus();
  },
  // Chặn vào các chế độ chơi khi đã hết giờ (bọc hàm vào của từng chế độ).
  install() {
    const wrap = (obj, name) => {
      const original = obj[name];
      obj[name] = function (...args) { return PlayTime.blocked() ? undefined : original.apply(this, args); };
    };
    wrap(Adventure, 'start'); wrap(Raid, 'open'); wrap(Ranked, 'open');
  },
  init() {
    ['pointerdown', 'keydown', 'touchstart', 'wheel', 'pointermove'].forEach(type => document.addEventListener(type, () => this.touch(), { passive: true, capture: true }));
    document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden') this.save(); });
    window.addEventListener('pagehide', () => this.save());
    window.addEventListener('load', () => this.install());
    this.timer = setInterval(() => this.tick(), 1000);
  }
};
PlayTime.init();
