// VÒNG QUAY MAY MẮN (nút 🎡 trên màn bản đồ) + Ô TROLL "+666 Crystal".
// Cấu hình ở assets/wheel/wheel.json: { "spinsPerDay": 5, "boards": [ { "name": "...", "slots": [ { "type": "gold|crystal|item", "amount"|"id", "weight": 10 }, ... ] }, ... ] }.
// Mỗi ngày (giờ Việt Nam) dùng một bảng luân phiên: bảng số (ngày % số bảng). Tối đa SPINS_PER_DAY lượt/ngày, đếm bằng localStorage (không tốn đọc/ghi Firestore để kiểm tra);
// mỗi lượt quay ghi đúng MỘT lần (Player.wheelReward: trừ phí Gold và cộng thưởng cùng lúc). Phí: lượt đầu trong ngày 500 Gold, mỗi lượt sau +100 ("cost" trong wheel.json). Phần thưởng bị kẹp theo CONFIG.WHEEL (khớp trần trong firestore.rules).
const Wheel = {
  cfg: null, node: null, angle: 0, spinning: false,
  COLORS: ['#18345A', '#243C5B'],
  async load() {
    if (this.cfg) return this.cfg;
    const response = await fetch('assets/wheel/wheel.json');
    if (!response.ok) throw new Error('Không tải được cấu hình vòng quay.');
    const data = await response.json(), W = CONFIG.WHEEL;
    const boards = (Array.isArray(data.boards) ? data.boards : []).map(board => ({
      name: board.name || 'Vòng quay',
      slots: (Array.isArray(board.slots) ? board.slots : []).map(s => {
        const weight = Number(s.weight) > 0 ? Number(s.weight) : 1;
        if (s.type === 'gold' && Number(s.amount) > 0) return { type: 'gold', amount: Math.min(W.MAX_GOLD, Math.floor(s.amount)), weight };
        if (s.type === 'crystal' && Number(s.amount) > 0) return { type: 'crystal', amount: Math.min(W.MAX_CRYSTAL, Math.floor(s.amount)), weight };
        if (s.type === 'item' && Player.item(s.id)) return { type: 'item', id: s.id, weight };
        return null;
      }).filter(Boolean).slice(0, 12)
    })).filter(board => board.slots.length >= 2);
    if (!boards.length) throw new Error('Cấu hình vòng quay không hợp lệ.');
    const cost = data.cost || {};
    this.cfg = { spinsPerDay: Math.max(1, Math.floor(Number(data.spinsPerDay) || W.SPINS_PER_DAY)), boards,
      costBase: Math.max(0, Math.floor(Number(cost.base) >= 0 && cost.base !== undefined ? Number(cost.base) : W.COST_BASE)), costStep: Math.max(0, Math.floor(Number(cost.step) >= 0 && cost.step !== undefined ? Number(cost.step) : W.COST_STEP)) };
    return this.cfg;
  },
  dayNumber() { return Math.floor((Date.now() + 7 * 3600 * 1000) / 86400000); },   // số ngày theo giờ Việt Nam → chọn bảng
  board() { return this.cfg.boards[this.dayNumber() % this.cfg.boards.length]; },
  key() { return `rpg.wheel.${Player.uid}.${this.dayNumber()}`; },
  used() { try { return Math.max(0, parseInt(localStorage.getItem(this.key()) || '0', 10) || 0); } catch (e) { return 0; } },
  setUsed(n) {
    try {
      localStorage.setItem(this.key(), String(Math.max(0, n)));
      const mine = `rpg.wheel.${Player.uid}.`;   // dọn bộ đếm các ngày cũ
      Object.keys(localStorage).filter(k => k.startsWith(mine) && k !== this.key()).forEach(k => localStorage.removeItem(k));
    } catch (e) { /* bộ nhớ trình duyệt bị chặn: bỏ qua */ }
  },
  left() { return Math.max(0, this.cfg.spinsPerDay - this.used()); },
  // Phí của lượt quay kế tiếp: lượt đầu trong ngày costBase Gold, mỗi lượt sau + costStep (lượt đã dùng hôm nay quyết định).
  costNow() { return Math.min(CONFIG.WHEEL.MAX_COST, this.cfg.costBase + this.cfg.costStep * this.used()); },
  label(slot) {
    if (slot.type === 'gold') return `${slot.amount.toLocaleString('vi-VN')} Gold`;
    if (slot.type === 'crystal') return `${slot.amount} Crystal`;
    return Player.item(slot.id).name;
  },
  icon(slot) { return slot.type === 'gold' ? '🪙' : slot.type === 'crystal' ? '💎' : '🎁'; },
  pick(slots) {   // chọn ô theo trọng số
    const total = slots.reduce((sum, s) => sum + s.weight, 0);
    let r = Math.random() * total;
    for (let i = 0; i < slots.length; i++) { r -= slots[i].weight; if (r < 0) return i; }
    return slots.length - 1;
  },
  close() {
    if (this.spinning || !this.node) return;
    document.removeEventListener('keydown', this.onKey);
    this.node.remove(); this.node = null;
  },
  onKey(e) { if (e.key === 'Escape') Wheel.close(); },
  async open() {
    this.close();
    let board;
    try { await this.load(); board = this.board(); }
    catch (error) { Ui.msg('map-error', error.message, true); return; }
    const slots = board.slots, per = 360 / slots.length;
    const back = el('div', 'sheet-backdrop'), card = el('div', 'sheet-card wheel-card');
    card.setAttribute('role', 'dialog'); card.setAttribute('aria-modal', 'true'); card.setAttribute('aria-label', 'Vòng quay may mắn');
    back.onclick = e => { if (e.target === back) this.close(); };
    const wheel = el('div', 'wheel'), stage = el('div', 'wheel-stage');
    wheel.style.background = `conic-gradient(${slots.map((s, i) => `${this.COLORS[i % 2]} ${i * per}deg ${(i + 1) * per}deg`).join(',')})`;
    slots.forEach((s, i) => {
      const lab = el('div', 'wheel-slot');
      lab.style.transform = `rotate(${i * per + per / 2}deg)`;
      const inner = el('div', 'wheel-slot-in'); inner.append(el('span', 'wheel-ico', this.icon(s)), el('span', 'wheel-txt', this.label(s)));
      lab.append(inner); wheel.append(lab);
    });
    const hub = el('button', 'wheel-hub'); hub.type = 'button';
    const hubCost = el('small', 'wheel-hub-cost');
    stage.append(el('div', 'wheel-pointer'), wheel, hub);
    const info = el('p', 'sheet-sub'), msg = el('p', 'sheet-msg'); msg.setAttribute('role', 'status');
    const close = el('button', 'btn ghost', 'Đóng'); close.type = 'button'; close.onclick = () => this.close();
    const refresh = () => {
      info.textContent = `${board.name} · hôm nay còn ${this.left()}/${this.cfg.spinsPerDay} lượt` + (this.left() > 0 ? ` · phí lượt này ${this.costNow().toLocaleString('vi-VN')} Gold` : '');
      hub.replaceChildren(document.createTextNode('QUAY'), hubCost);
      hubCost.textContent = this.left() > 0 ? `${this.costNow().toLocaleString('vi-VN')} Gold` : 'Hết lượt';
      hub.disabled = this.spinning || this.left() <= 0;
    };
    const say = (text, bad) => { msg.textContent = text; msg.classList.toggle('is-error', Boolean(bad)); msg.classList.toggle('is-ok', Boolean(text) && !bad); };
    hub.onclick = async () => {
      if (this.spinning || Ui.busy) return;
      if (this.left() <= 0) { say('Hết lượt quay hôm nay. Hẹn bạn ngày mai nhé!', true); return; }
      const cost = this.costNow();
      if (Player.data.gold < cost) { say(`Không đủ Gold: lượt quay này cần ${cost.toLocaleString('vi-VN')} Gold (bạn có ${Player.data.gold.toLocaleString('vi-VN')}).`, true); return; }
      const idx = this.pick(slots);
      this.setUsed(this.used() + 1);   // trừ lượt NGAY (trước khi quay) để tải lại trang không lách được
      this.spinning = true; Ui.busy = true; close.disabled = true; say(''); refresh();
      this.angle = this.angle - (this.angle % 360) + 360 * 6 + (360 - (idx * per + per / 2));   // ô trúng dừng ngay dưới mũi tên (đỉnh vòng)
      wheel.style.transform = `rotate(${this.angle}deg)`;
      await new Promise(resolve => setTimeout(resolve, 4400));
      try {
        const res = await Player.wheelReward(slots[idx], cost);
        say(`🎉 Đã trả ${cost.toLocaleString('vi-VN')} Gold. Bạn nhận được: ${res.text}`);
      } catch (error) {
        this.setUsed(this.used() - 1);   // lỗi lưu: hoàn lại lượt quay
        say(error.message || 'Không nhận được phần thưởng. Vui lòng thử lại.', true);
      } finally { this.spinning = false; Ui.busy = false; close.disabled = false; refresh(); }
    };
    const actions = el('div', 'sheet-actions wheel-actions'); actions.append(close);
    card.append(el('b', 'sheet-name', '🎡 Vòng quay may mắn'), info, stage, msg, actions);
    back.append(card); document.body.append(back);
    this.node = back; document.addEventListener('keydown', this.onKey);
    refresh(); hub.focus();
  }
};

// Ô TROLL nằm nổi ở góc trên-trái bản đồ: bấm vào chỉ hiện thông báo, KHÔNG cộng Crystal.
const Troll = {
  show() {
    if (document.getElementById('troll-card')) return;
    const back = el('div', 'sheet-backdrop'), card = el('div', 'sheet-card troll-card');
    back.id = 'troll-card'; card.setAttribute('role', 'alertdialog'); card.setAttribute('aria-modal', 'true');
    const ok = el('button', 'btn', 'Em biết lỗi rồi'); ok.type = 'button';
    ok.onclick = () => back.remove();
    back.onclick = e => { if (e.target === back) back.remove(); };
    card.append(el('b', 'troll-title', 'THAM LAM!'), el('p', 'sheet-sub', '+666 Crystal chỉ là trò đùa thôi. Muốn có Crystal thì chăm chỉ học và chơi nhé! 😜'), ok);
    back.append(card); document.body.append(back); ok.focus();
  }
};
