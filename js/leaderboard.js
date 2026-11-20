// Bảng xếp hạng THEO TUẦN, có hai phạm vi: theo LỚP (trường Room, vd 6/5) và theo KHỐI (Plan 13.2 phương án A; bảng toàn trường chưa làm).
// Mỗi bảng (phạm vi × tab) có phần thưởng riêng ở CONFIG.RANK.REWARDS (mặc định 100 Gold) — hiện chỉ hiển thị.
// Ba tab: "Ải đã vượt" (số lượt vượt ải trong tuần, tính cả chơi lại), "Hầm ngục 1", "Hầm ngục 2" (kỷ lục số quái hạ trong tuần).
// Reset 07:00 sáng thứ Hai giờ Việt Nam (= 00:00 UTC thứ Hai): sang tuần mới, WeekStart đổi nên mọi bản ghi cũ tự bị bỏ qua.
// Dữ liệu: leaderboards/<khối>/entries/<UID> = { Nickname, Room, LV, WeekStart, WeekClears, Dung1Week, Dung2Week, UpdatedAt, (tùy chọn) PrevWeekStart, PrevWeekClears, PrevDung1, PrevDung2 = điểm tuần trước }
// (không có tên đăng nhập). Bản ghi chỉ được ghi CÙNG transaction nhận thưởng và chỉ khi có điểm thay đổi.
// Chỉ TOP 10 được xếp hạng và nhận thưởng; người ngoài top 10 không có hạng (không có truy vấn đếm).
// BẢNG KHỐI hiện TẮT truy vấn (CONFIG.RANK.GRADE_BOARD_ENABLED = false): tab vẫn hiển thị nhưng không đọc Firestore; bảng LỚP là bảng chính.
//
// ================= BẢNG TỔNG KẾT ĐỌC/GHI (Firestore) — bảng xếp hạng theo lớp =================
//  HÀM                      ĐỌC                                   GHI      GHI CHÚ
//  Rank.fetch(tab)          ≤ 10 (truy vấn top 10, limit 10)      0        gọi lúc VÀO BẢNG lần đầu và mỗi khi cache hết hạn (CONFIG.RANK.REFRESH_SEC = 5 phút) hoặc
//                                                                          bị đánh dấu cũ vì mình vừa lọt/đổi hạng trong top 10 (xem afterRun). Bảng ít người đọc ít hơn.
//  Rank.ownEntry()          0 nếu đã có bản sao điểm của mình      0        bản sao nằm trong localStorage; chỉ ĐỌC 1 lượt khi chưa có (lần đầu / đổi máy / bị Rules từ chối).
//  Player.runSave (rank)    0 (không đọc lại bản ghi của mình)    1        mỗi lượt làm điểm tuần thay đổi: 1 lượt ghi `set` cùng transaction với hồ sơ. Rules đọc hồ sơ
//                                                                          bằng getAfter (+1 lượt đọc tính phí phía Rules, không phải do trình duyệt).
//  Rank.afterRun(entry)     0                                     0        cập nhật bản sao ở máy + so điểm mới với người thứ 10 trong cache để quyết định có cần tải lại bảng không.
//  Tab KHỐI (đang tắt)      0                                     0        không truy vấn; admin vẫn chốt thưởng khối bình thường (admin đọc toàn bộ bản ghi của khối).
// Quy tắc: kiểm tra top 10 làm HOÀN TOÀN ở trình duyệt. Chưa lọt top 10 → chỉ ghi, giữ nguyên cache. Lọt/đổi chỗ trong top 10 → đánh dấu cache cũ để
// lần mở bảng KẾ TIẾP tải mới đúng 1 lần (≤ 10 lượt đọc). Giới hạn 5 phút chỉ ở trình duyệt (Rules không giới hạn được số lần đọc).
const Rank = {
  WEEK_MS: 7 * 24 * 3600 * 1000,
  MONDAY_UTC_MS: 4 * 24 * 3600 * 1000,   // 1970-01-05 00:00 UTC là thứ Hai đầu tiên sau epoch. [RULES] weekStart()
  TABS: [
    { id: 'stage', label: 'Ải đã vượt', field: 'WeekClears', unit: 'ải' },
    // Hầm ngục theo TẦNG: kỷ lục tầng cao nhất đã vượt, KHÔNG reset theo tuần (weekly: false) → không lọc WeekStart, ws = 0.
    { id: 'dungeon1', label: 'Hầm ngục 1', field: 'Dung1Floor', unit: 'tầng', weekly: false },
    { id: 'dungeon2', label: 'Hầm ngục 2', field: 'Dung2Floor', unit: 'tầng', weekly: false }
  ],
  SCOPES: [{ id: 'room', label: 'Lớp' }, { id: 'grade', label: 'Khối' }],
  tab: 'stage', scope: 'room', own: null, tick: null, seq: 0,   // own = bản sao bản ghi xếp hạng của mình { v: 2, doc: {...} | null }

  weekStart(ms) { return Math.floor((ms - this.MONDAY_UTC_MS) / this.WEEK_MS) * this.WEEK_MS + this.MONDAY_UTC_MS; },
  nextReset(ms) { return this.weekStart(ms) + this.WEEK_MS; },

  // Bản ghi mới sau một lượt chơi, hoặc null nếu không có điểm nào thay đổi (khi đó không ghi gì).
  // p = { nick, lv, kind: 'stage' | 'dungeon', index (số hầm ngục), kills, passedNow }
  entry(prev, p) {
    const ws = this.weekStart(Date.now()), same = prev && prev.WeekStart === ws;
    const e = { WeekClears: same ? prev.WeekClears || 0 : 0, Dung1Week: same ? prev.Dung1Week || 0 : 0, Dung2Week: same ? prev.Dung2Week || 0 : 0 };
    const fl = { Dung1Floor: (prev && prev.Dung1Floor) || 0, Dung2Floor: (prev && prev.Dung2Floor) || 0 };   // tầng cao nhất: giữ qua các tuần
    let changed = false;
    if (p.kind === 'stage' && p.passedNow) { e.WeekClears += 1; changed = true; }
    if (p.kind === 'dungeon' && p.index >= 1 && p.index <= 2) {
      const key = `Dung${p.index}Week`;
      if (p.kills > e[key]) { e[key] = p.kills; changed = true; }
      const fkey = `Dung${p.index}Floor`;
      if (p.floor > fl[fkey]) { fl[fkey] = p.floor; changed = true; }
    }
    if (!changed) return null;
    // Điểm TUẦN TRƯỚC được chép sang Prev* khi sang tuần mới (để trang admin vẫn chốt thưởng được); cùng tuần thì giữ nguyên Prev* cũ.
    const carry = {};
    if (prev && prev.WeekStart !== ws) {
      Object.assign(carry, { PrevWeekStart: prev.WeekStart, PrevWeekClears: prev.WeekClears || 0, PrevDung1: prev.Dung1Week || 0, PrevDung2: prev.Dung2Week || 0 });
    } else if (prev) {
      ['PrevWeekStart', 'PrevWeekClears', 'PrevDung1', 'PrevDung2'].forEach(k => { if (k in prev) carry[k] = prev[k]; });
    }
    return { Nickname: p.nick, Room: p.room, LV: p.lv, WeekStart: ws, ...e, ...fl, ...carry, UpdatedAt: firebase.firestore.FieldValue.serverTimestamp() };
  },
  // ----- Bản sao điểm của mình (localStorage) -----
  ownKey() { return `rank.own.v2.${Player.u.cls}.${Player.uid}`; },
  // ĐỌC: 0 nếu đã có bản sao (bộ nhớ hoặc localStorage); 1 lượt đọc khi chưa có hoặc forceRead (bản sao nghi bị lệch, vd chơi trên máy khác).
  async ownEntry(forceRead) {
    if (!forceRead) {
      if (this.own) return this.own;
      try { const c = JSON.parse(localStorage.getItem(this.ownKey())); if (c && c.v === 2) return (this.own = c); } catch (e) { /* đọc lại bên dưới */ }
    }
    const snap = await this.collection().doc(Player.uid).get();   // 1 lượt đọc
    return this.setOwn(snap.exists ? snap.data() : null);
  },
  setOwn(doc) {   // doc = dữ liệu bản ghi (bỏ UpdatedAt) hoặc null = chưa có bản ghi
    let keep = null;
    if (doc) { keep = {}; ['Nickname', 'Room', 'LV', 'WeekStart', 'WeekClears', 'Dung1Week', 'Dung2Week', 'Dung1Floor', 'Dung2Floor', 'PrevWeekStart', 'PrevWeekClears', 'PrevDung1', 'PrevDung2'].forEach(k => { if (k in doc) keep[k] = doc[k]; }); }
    this.own = { v: 2, doc: keep };
    try { localStorage.setItem(this.ownKey(), JSON.stringify(this.own)); } catch (e) { /* bỏ qua */ }
    return this.own;
  },
  // Điểm tuần `ws` của mình (0 nếu bản sao thuộc tuần khác). Không đọc gì.
  scoresFor(ws) {
    const d = this.own && this.own.doc, wk = d && d.WeekStart === ws;
    return { WeekClears: wk ? d.WeekClears || 0 : 0, Dung1Week: wk ? d.Dung1Week || 0 : 0, Dung2Week: wk ? d.Dung2Week || 0 : 0,
      Dung1Floor: (d && d.Dung1Floor) || 0, Dung2Floor: (d && d.Dung2Floor) || 0 };   // tầng hầm ngục không phụ thuộc tuần
  },
  // Gọi sau khi ghi xếp hạng thành công (Player.runSave). KHÔNG đọc/ghi Firestore.
  // Kiểm tra top 10 ở trình duyệt (bảng LỚP của mình): so điểm mới với người thứ 10 trong cache; chưa lọt top 10 → giữ nguyên cache;
  // lọt/đổi chỗ trong top 10 → đánh dấu cache cũ (at = 0) để lần mở bảng kế tiếp tải mới 1 lần.
  afterRun(entry) {
    if (!entry) return;
    this.setOwn(entry);
    this.TABS.forEach(tab => {
      const ws = tab.weekly === false ? 0 : entry.WeekStart, c = this.readCache(tab, 'room');
      if (!c || c.ws !== ws) return;
      const score = entry[tab.field] || 0, rows = c.rows || [];
      const inTop = rows.some(r => r.id === Player.uid);
      const cutoff = rows.length >= CONFIG.RANK.TOP ? rows[rows.length - 1].score : 0;
      if (score > 0 && (inTop || score > cutoff)) { c.at = 0; this.saveCache(tab, c, 'room'); }
    });
  },

  collection() { return FirebaseService.db.collection('leaderboards').doc(String(Player.u.cls)).collection('entries'); },
  storeKey(tab, scope = this.scope) { return `rank.v4.${Player.u.cls}.${Player.uid}.${scope}.${scope === 'room' ? Player.data.room : 'all'}.${tab.id}`; },
  loadCache(tab, ws) {
    try {
      const c = JSON.parse(localStorage.getItem(this.storeKey(tab)));
      return c && c.ws === ws && Date.now() - c.at < CONFIG.RANK.REFRESH_SEC * 1000 && Date.now() >= c.at ? c : null;
    } catch (e) { return null; }
  },
  saveCache(tab, c, scope) { try { localStorage.setItem(this.storeKey(tab, scope), JSON.stringify(c)); } catch (e) { /* bỏ qua */ } },
  readCache(tab, scope) { try { return JSON.parse(localStorage.getItem(this.storeKey(tab, scope))); } catch (e) { return null; } },

  // ĐỌC: truy vấn top 10 của LỚP (limit 10 → ≤ 10 lượt đọc; bảng ít người đọc ít hơn). Điểm của mình lấy từ bản sao ở máy
  // (Rank.ownEntry: 0 lượt đọc nếu đã có, 1 lượt đọc lần đầu). Cần chỉ mục kép (Room + WeekStart, <field> giảm dần).
  // Bảng KHỐI đang tắt (CONFIG.RANK.GRADE_BOARD_ENABLED): render() không gọi hàm này cho phạm vi 'grade'.
  async fetch(tab, ws) {
    if (this.scope === 'grade' && !CONFIG.RANK.GRADE_BOARD_ENABLED) throw new Error('Bảng khối đang tạm đóng.');
    let base = this.collection();
    if (tab.weekly !== false) base = base.where('WeekStart', '==', ws);   // bảng tầng hầm ngục không reset theo tuần
    if (this.scope === 'room') base = base.where('Room', '==', Player.data.room);   // bảng theo lớp
    const snap = await base.orderBy(tab.field, 'desc').limit(CONFIG.RANK.TOP).get();
    const rows = snap.docs.map(d => ({ id: d.id, Nickname: d.data().Nickname, LV: d.data().LV, score: d.data()[tab.field] || 0 })).filter(r => r.score > 0);
    await this.ownEntry();
    // Chỉ TOP 10 được xếp hạng; ngoài top 10 không đếm hạng (tiết kiệm lượt đọc).
    const inTop = rows.findIndex(r => r.id === Player.uid);
    return { at: Date.now(), ws, rows, rank: inTop >= 0 ? inTop + 1 : null, mine: this.scoresFor(ws)[tab.field] };
  },

  open() { this.render(); show('screen-rank'); },
  async render(force) {
    Player.fillTopBar('rank');
    const tab = this.TABS.find(t => t.id === this.tab), ws = tab.weekly === false ? 0 : this.weekStart(Date.now());
    const bar = $('#rank-tabs'), list = $('#rank-list'), info = $('#rank-info'), scopeBar = $('#rank-scope');
    scopeBar.replaceChildren(...this.SCOPES.map(s => {
      const b = el('button', 'tag' + (s.id === this.scope ? ' is-on' : ''), s.id === 'room' ? `Lớp ${Player.data.room || '?'}` : `Khối ${Player.u.cls}`);
      b.type = 'button'; b.onclick = () => { this.scope = s.id; this.render(); };
      return b;
    }));
    if (this.scope === 'room' && !Player.data.room) {
      list.replaceChildren(el('p', 'rank-empty is-error', 'Hồ sơ chưa có lớp. Hãy đăng nhập lại để nhập lớp (ví dụ 6/5).'));
      info.textContent = ''; this.refreshButton(null); return;
    }
    bar.replaceChildren(...this.TABS.map(t => {
      const b = el('button', 'tab' + (t.id === this.tab ? ' is-on' : ''), t.label);
      b.type = 'button'; b.onclick = () => { this.tab = t.id; this.render(); };
      return b;
    }));
    info.textContent = tab.weekly === false
      ? 'Tầng hầm ngục cao nhất đã vượt (kỷ lục không reset theo tuần).'
      : `${tab.id === 'stage' ? 'Số lượt vượt ải trong tuần (tính cả chơi lại).' : 'Kỷ lục trong tuần.'} Reset 07:00 sáng thứ Hai (giờ Việt Nam) — còn ${this.countdown(this.nextReset(Date.now()) - Date.now())}.`;
    const prize = tab.weekly === false ? null : ((CONFIG.RANK.REWARDS[this.scope] || {})[tab.id]) || null;
    const label = r => `${r.gold} Gold${r.crystals ? ` + ${r.crystals} Crystal` : ''}`;
    if (prize) info.textContent += ` Thưởng top 10: hạng 1 ${label(prize.top1)} · hạng 2 ${label(prize.top2)} · hạng 3 ${label(prize.top3)} · hạng 4–10 ${label(prize.top4_10)}.`;
    const seq = ++this.seq;
    if (this.scope === 'grade' && !CONFIG.RANK.GRADE_BOARD_ENABLED) {   // KHÔNG truy vấn gì, không đọc cache
      list.replaceChildren(el('p', 'rank-empty', 'Bảng xếp hạng theo khối đang tạm đóng. Hãy xem bảng lớp của bạn.'));
      clearInterval(this.tick);
      const btn = $('#rank-refresh'); btn.disabled = true; btn.textContent = 'Tạm đóng';
      return;
    }
    let data = this.loadCache(tab, ws);
    if (!data) {
      list.replaceChildren(el('p', 'rank-empty', 'Đang tải bảng xếp hạng…'));
      try {
        data = await this.fetch(tab, ws);
        this.saveCache(tab, data);
      } catch (e) {
        if (seq !== this.seq) return;
        const msg = el('p', 'rank-empty is-error', e.code === 'permission-denied'
          ? 'Chưa có quyền đọc bảng xếp hạng. Hãy kiểm tra đã Publish firestore.rules mới nhất.'
          : e.code === 'failed-precondition' ? 'Bảng xếp hạng cần tạo chỉ mục Firestore (chỉ cần làm một lần cho mỗi bảng).'
            : 'Không tải được bảng xếp hạng: ' + (e.message || 'lỗi không rõ'));
        // Firestore đính kèm sẵn đường link tạo đúng chỉ mục còn thiếu trong thông báo lỗi → hiện thành liên kết bấm được.
        const link = e.code === 'failed-precondition' && String(e.message || '').match(/https:\/\/console\.firebase\.google\.com\/[^\s"')]+/);
        if (link) {
          const a = el('a', '', 'Bấm vào đây để tạo chỉ mục'); a.href = link[0]; a.target = '_blank'; a.rel = 'noopener';
          msg.append(' ', a, '. Đợi vài phút cho chỉ mục xây xong rồi bấm "Thử lại".');
          console.warn('Firestore index link:', link[0]);
        }
        list.replaceChildren(msg);
        this.refreshButton(null);
        return;
      }
    }
    if (seq !== this.seq) return;
    try { await this.ownEntry(); } catch (e) { /* không có điểm của mình thì chỉ hiện top 10 */ }   // 0 lượt đọc nếu đã có bản sao ở máy
    list.replaceChildren(...this.rows(tab, data));
    this.refreshButton(data.at);
  },
  rows(tab, data) {
    const medals = ['🥇', '🥈', '🥉'], out = [];
    const mineNow = this.scoresFor(data.ws)[tab.field];   // điểm của mình luôn mới nhất (từ bản sao ở máy, không đọc Firestore)
    if (!data.rows.length) out.push(el('p', 'rank-empty', tab.weekly === false ? 'Chưa có ai trên bảng này. Hãy là người đầu tiên!' : 'Tuần này chưa có ai trên bảng này. Hãy là người đầu tiên!'));
    data.rows.forEach((r, i) => {
      const me = r.id === Player.uid, row = el('div', 'rank-row' + (me ? ' is-me' : '') + (i < 3 ? ' is-top' : ''));
      row.append(el('span', 'rank-pos', medals[i] || String(i + 1)), el('span', 'rank-name', `${r.Nickname}${me ? ' (bạn)' : ''}`),
        el('span', 'rank-lv', `Lv ${r.LV}`), el('span', 'rank-score', `${me ? mineNow : r.score} ${tab.unit}`));
      out.push(row);
    });
    if (!data.rows.some(r => r.id === Player.uid)) {
      if (mineNow > 0) {
        const row = el('div', 'rank-row is-me');
        row.append(el('span', 'rank-pos', '—'), el('span', 'rank-name', `${Player.data.nick} (bạn)`),
          el('span', 'rank-lv', `Lv ${Player.data.level}`), el('span', 'rank-score', `${mineNow} ${tab.unit}`));
        out.push(el('p', 'rank-empty', 'Bạn đang ngoài top 10 (chỉ top 10 được xếp hạng và nhận thưởng).'), row);
      } else out.push(el('p', 'rank-empty', tab.weekly === false ? 'Bạn chưa vượt tầng nào ở bảng này.' : 'Bạn chưa có điểm ở bảng này trong tuần.'));
    }
    return out;
  },

  // Nút "Làm mới": chỉ bấm được khi dữ liệu đã quá REFRESH_SEC giây (đếm ngược hiển thị trên nút).
  refreshButton(at) {
    const btn = $('#rank-refresh'); clearInterval(this.tick);
    if (!at) { btn.disabled = false; btn.textContent = 'Thử lại'; return; }
    const update = () => {
      const left = Math.ceil((at + CONFIG.RANK.REFRESH_SEC * 1000 - Date.now()) / 1000);
      btn.disabled = left > 0;
      btn.textContent = left > 0 ? `Làm mới sau ${Math.floor(left / 60)}:${String(left % 60).padStart(2, '0')}` : 'Làm mới';
      if (left <= 0 || $('#screen-rank').hidden) clearInterval(this.tick);
    };
    update(); this.tick = setInterval(update, 1000);
  },
  refresh() {
    if (this.scope === 'grade' && !CONFIG.RANK.GRADE_BOARD_ENABLED) return;
    const tab = this.TABS.find(t => t.id === this.tab), c = this.readCache(tab);
    if (c && Date.now() - c.at < CONFIG.RANK.REFRESH_SEC * 1000) return;   // chưa đủ thời gian
    try { localStorage.removeItem(this.storeKey(tab)); } catch (e) { /* bỏ qua */ }
    this.render();
  },
  countdown(ms) {
    const m = Math.max(0, Math.floor(ms / 60000)), d = Math.floor(m / 1440), h = Math.floor(m % 1440 / 60);
    return d > 0 ? `${d} ngày ${h} giờ` : `${h} giờ ${m % 60} phút`;
  }
};
