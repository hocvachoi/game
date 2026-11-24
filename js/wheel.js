// VÒNG QUAY MAY MẮN dạng MỞ HÒM kiểu CS (nút "Quay số" dùng assets/ui/wheel.png trên màn bản đồ): dải ô cuộn ngang, dừng dưới mũi tên + Ô TROLL "+666 Crystal".
// Cấu hình ở assets/wheel/wheel.json: { "spinsPerDay": 5, "boards": [ { "name": "...", "slots": [ { "type": "gold|crystal|item", "amount"|"id", "weight": 10 }, ... ] }, ... ] }.
// Mỗi ngày (giờ Việt Nam) dùng một bảng luân phiên: bảng số (ngày % số bảng). Tối đa SPINS_PER_DAY lượt/ngày, đếm bằng localStorage (không tốn đọc/ghi Firestore để kiểm tra);
// mỗi lượt quay ghi đúng MỘT lần (Player.wheelReward: trừ phí Gold và cộng thưởng cùng lúc). Phí: lượt đầu trong ngày 500 Gold, mỗi lượt sau +100 ("cost" trong wheel.json). Phần thưởng bị kẹp theo CONFIG.WHEEL (khớp trần trong firestore.rules).
const Wheel = {
  cfg: null, node: null, spinning: false, onResize: null,
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
  // Một ô trong dải mở hòm: khung phẩm chất + icon (gold.png / crystal.png / icon trang bị) + tên.
  tile(slot) {
    const it = slot.type === 'item' ? Player.item(slot.id) : null;
    const t = el('div', 'roll-tile');
    if (it) t.append(Inventory.icon(it));
    else {
      const box = el('span', 'item-icon roll-coin q-' + (slot.type === 'gold' ? 'normal' : 'rare')), img = new Image();
      img.alt = ''; img.decoding = 'async'; img.src = slot.type === 'gold' ? 'assets/ui/gold.png' : 'assets/ui/crystal.png';
      img.onerror = () => box.replaceChildren(el('span', 'item-icon-fallback', slot.type === 'gold' ? '🪙' : '💎'));
      box.append(img); t.append(box);
    }
    t.append(el('span', 'roll-txt', this.label(slot)));
    return t;
  },
  pick(slots) {   // chọn ô theo trọng số
    const total = slots.reduce((sum, s) => sum + s.weight, 0);
    let r = Math.random() * total;
    for (let i = 0; i < slots.length; i++) { r -= slots[i].weight; if (r < 0) return i; }
    return slots.length - 1;
  },
  close() {
    if (this.spinning || !this.node) return;
    document.removeEventListener('keydown', this.onKey);
    window.removeEventListener('resize', this.onResize);
    this.node.remove(); this.node = null;
  },
  onKey(e) { if (e.key === 'Escape') Wheel.close(); },
  async open() {
    this.close();
    let board;
    try { await this.load(); board = this.board(); }
    catch (error) { Ui.msg('map-error', error.message, true); return; }
    const slots = board.slots, TRACK = 46, WIN = 38, REST = 3;   // TRACK ô trong dải; ô trúng ở vị trí WIN; ô đang đứng yên ở vị trí REST
    const back = el('div', 'sheet-backdrop'), card = el('div', 'sheet-card wheel-card');
    card.setAttribute('role', 'dialog'); card.setAttribute('aria-modal', 'true'); card.setAttribute('aria-label', 'Mở hòm may mắn');
    back.onclick = e => { if (e.target === back) this.close(); };
    const view = el('div', 'roll'), track = el('div', 'roll-track');
    view.append(el('i', 'roll-arrow roll-arrow-top'), el('i', 'roll-arrow roll-arrow-bot'), el('i', 'roll-line'), track);
    const hub = el('button', 'btn wheel-spin'); hub.type = 'button';
    const hubCost = el('small', 'wheel-hub-cost');
    // Dựng dải: các ô ngẫu nhiên theo trọng số (nhìn như mở hòm); ô WIN là phần thưởng đã định trước (nếu có).
    const build = (winSlot, restSlot) => {
      const list = Array.from({ length: TRACK }, () => slots[this.pick(slots)]);
      if (winSlot) list[WIN] = winSlot;
      if (restSlot) list[REST] = restSlot;
      track.replaceChildren(...list.map(sl => this.tile(sl)));
      return track.children;
    };
    // Vị trí dịch (px) để TÂM ô i nằm dưới mũi tên; offset lệch trong ô (±40% bề rộng ô)
    const shiftFor = (i, frac = 0) => {
      const tile = track.children[i], mid = tile.offsetLeft + tile.offsetWidth * (0.5 + frac);
      return view.clientWidth / 2 - mid;
    };
    const place = (i, frac) => { track.style.transition = 'none'; track.style.transform = `translateX(${shiftFor(i, frac)}px)`; void track.offsetWidth; };
    let lastSlot = null;
    const info = el('p', 'sheet-sub'), msg = el('p', 'sheet-msg'); msg.setAttribute('role', 'status');
    const close = el('button', 'btn ghost', 'Đóng'); close.type = 'button'; close.onclick = () => this.close();
    const refresh = () => {
      info.textContent = `${board.name} · hôm nay còn ${this.left()}/${this.cfg.spinsPerDay} lượt` + (this.left() > 0 ? ` · phí lượt này ${this.costNow().toLocaleString('vi-VN')} Gold` : '');
      hub.replaceChildren(document.createTextNode('MỞ HÒM'), hubCost);
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
      build(slots[idx], lastSlot);     // dải mới: ô đang đứng yên giữ nguyên ở vị trí cũ rồi chạy tới ô trúng
      place(REST, 0);
      const reduce = window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches, ms = reduce ? 900 : 5200;
      track.style.transition = `transform ${ms}ms cubic-bezier(.1,.62,.08,1)`;
      track.style.transform = `translateX(${shiftFor(WIN, (Math.random() - 0.5) * 0.7)}px)`;
      await new Promise(resolve => setTimeout(resolve, ms + 150));
      try {
        track.children[WIN].classList.add('is-win');
        lastSlot = slots[idx];
        const res = await Player.wheelReward(slots[idx], cost);
        say(`🎉 Đã trả ${cost.toLocaleString('vi-VN')} Gold. Bạn nhận được: ${res.text}`);
      } catch (error) {
        this.setUsed(this.used() - 1);   // lỗi lưu: hoàn lại lượt quay
        say(error.message || 'Không nhận được phần thưởng. Vui lòng thử lại.', true);
      } finally { this.spinning = false; Ui.busy = false; close.disabled = false; refresh(); }
    };
    // Danh sách phần quà của bảng hôm nay (chỉ liệt kê, KHÔNG hiện tỉ lệ; không ảnh hưởng random).
    const prizes = el('div', 'wheel-prizes'), seen = new Set(), order = { gold: 0, crystal: 1, item: 2 };
    slots.filter(sl => { const k = sl.type + (sl.id || sl.amount); if (seen.has(k)) return false; seen.add(k); return true; })
      .sort((a, b) => order[a.type] - order[b.type] || (a.amount || 0) - (b.amount || 0))
      .forEach(sl => prizes.append(this.tile(sl)));
    prizes.hidden = true;
    const listBtn = el('button', 'btn ghost wheel-list-btn', 'Xem phần thưởng'); listBtn.type = 'button';
    listBtn.onclick = () => { prizes.hidden = !prizes.hidden; listBtn.textContent = prizes.hidden ? 'Xem phần thưởng' : 'Ẩn phần thưởng'; };
    const actions = el('div', 'sheet-actions wheel-actions'); actions.append(close);
    card.append(el('b', 'sheet-name', 'Hòm may mắn'), info, view, hub, msg, listBtn, prizes, actions);
    back.append(card); document.body.append(back);
    this.node = back; document.addEventListener('keydown', this.onKey);
    build(null, null); place(REST, 0); refresh(); hub.focus();
    this.onResize = () => { if (!this.spinning && this.node) place(REST, 0); };
    window.addEventListener('resize', this.onResize);
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
