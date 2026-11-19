// V4: Boss Raid — cả khối cùng đánh Boss (HP chung) theo LỊCH (CONFIG.RAID.SCHEDULE: mỗi ngày chỉ một số khối được mở).
// Luồng mỗi ngày của một khối: Boss 1 xuất hiện khi có START_PLAYERS (5) người bấm vào trước giờ đóng cửa (21:00 VN); mỗi Boss tối đa MAX_PLAYERS (70)
// người và BOSS_MIN (15) phút (hết giờ mà chưa hạ = THẤT BẠI); Boss 2 xuất hiện 5 phút sau khi Boss 1 kết thúc, bắt đầu khi có người đầu tiên bấm vào.
// Boss đã mở thì chạy nốt kể cả quá 21:00. Thưởng (admin chốt): hạ Boss = đủ thưởng; thất bại = 50% và không có trang bị.
// Cách tiết kiệm đọc/ghi (Firestore):
//  - Sát thương tính NGAY TRÊN TRÌNH DUYỆT (cùng công thức Adventure). Mỗi ~2 phút (CONFIG.RAID.FLUSH_SEC) mỗi người gửi phần sát thương đã gom 1 lần
//    bằng FieldValue.increment (cộng nguyên tử, nhiều người gửi cùng lúc không ghi đè nhau): 1 batch = ghi raids/<id> + raids/<id>/players/<UID>.
//  - HP Boss + số người (Players) chỉ ĐỌC lại mỗi chu kỳ gửi (1 lượt đọc). Giữa hai lần đọc, thanh HP = HP đã biết − sát thương mình vừa gây.
//  - Ít người thì tăng sát thương: dưới 10 người, mỗi người thiếu +10% cho mọi người (đọc từ Players, không tốn thêm đọc). Không giảm DEF Boss.
//  - Phòng chờ Boss 1: người chờ đọc tài liệu Boss mỗi 15 giây, tối đa 10 phút (KHÔNG dùng onSnapshot: 70 người vào sẽ nhân số lượt đọc lên).
//  - Hiệu ứng "đồng đội đang đánh": phần sát thương của NGƯỜI KHÁC giữa hai lần đọc = (HP mới − HP cũ − phần mình vừa gửi) → chia ngẫu nhiên thành nhiều
//    con số nhỏ gắn nickname lấy từ bảng top 10 (đọc lúc bắt đầu + khi mở bảng, KHÔNG thêm lượt đọc nào khác). Tổng đúng dữ liệu thật,
//    từng con số/nickname chỉ là MINH HỌA (không biết thật sự ai đánh bao nhiêu).
//  - Chỉ TOP 10 sát thương được xếp hạng/hiển thị (truy vấn limit 10, chỉ khi mở bảng) và được thưởng; ngoài top 10 không xếp hạng.
//  - Boss đánh người chơi khi trả lời sai VÀ phản công mỗi COUNTER_SEC (20) giây theo đồng hồ đếm ngược tại trình duyệt, KHÔNG đồng bộ. Bị hạ gục → hồi sinh sau REVIVE_SEC giây.
// Dữ liệu: raids/<khối>_<yyyymmdd>_<1|2> = { MaxHP, Damage, Players, Slot, CreatedAt, StartAt?, DefeatedAt? } (StartAt/DefeatedAt do máy chủ ghi);
//          raids/<id>/players/<UID> = { Nickname, Damage, LastFlush }.
// Phần thưởng: giáo viên chốt ở trang admin (phiếu rewards/<UID>/vouchers/raid_<id>) theo hạng sát thương top 10.
const Raid = {
  hold: 0, names: [], fxTimers: [],   // hold = sát thương đồng đội đã biết nhưng chưa "phát" hiệu ứng (hiển thị mượt)
  running: false, waiting: false, opening: false, ended: false, raidId: null, slot: 1, maxHp: 0, bossDamage: 0, players: 0, pending: 0, myTotal: 0,
  startMs: 0, defeatedMs: 0, defeatTried: false, lastFlushMs: 0, lastTryMs: 0, world: null, bossDef: null, questions: null, lobbyTimer: null, lobbyFrom: 0, nextTimer: null,
  boss: null, bossRef: null, playerRef: null, tick: null, reviveTimer: null, flushing: false, drain: null, topCache: null, cache: {},
  R() { return CONFIG.RAID; },

  // ----- thời gian (giờ VN = UTC+7) -----
  vnMinutes(ms = Date.now()) { return (Math.floor(ms / 60000) + 7 * 60) % 1440; },
  isOpen(ms = Date.now()) { const m = this.vnMinutes(ms); return m >= this.R().OPEN_MIN && m < this.R().CLOSE_MIN; },   // cửa kích hoạt Boss 1
  dayKey(ms = Date.now()) { const d = new Date(ms); return d.getUTCFullYear() * 10000 + (d.getUTCMonth() + 1) * 100 + d.getUTCDate(); },   // khớp dayInt() trong rules
  // Thứ trong tuần theo cách gọi Việt Nam: 2 = Thứ Hai … 7 = Thứ Bảy, 8 = Chủ Nhật (khóa của CONFIG.RAID.SCHEDULE).
  vnWeekday(ms = Date.now()) { const d = new Date(ms + 7 * 3600 * 1000).getUTCDay(); return d === 0 ? 8 : d + 1; },
  todayGrades(ms = Date.now()) { return (this.R().SCHEDULE[this.vnWeekday(ms)] || []).map(String); },
  scheduleText() {
    const names = { 2: 'Thứ Hai', 3: 'Thứ Ba', 4: 'Thứ Tư', 5: 'Thứ Năm', 6: 'Thứ Sáu', 7: 'Thứ Bảy', 8: 'Chủ nhật' };
    return Object.keys(this.R().SCHEDULE).map(Number).sort((a, b) => a - b).filter(d => (this.R().SCHEDULE[d] || []).length)
      .map(d => `${names[d]}: khối ${this.R().SCHEDULE[d].join(', ')}`).join(' · ');
  },
  openText() {
    const R = this.R(), hh = m => `${Math.floor(m / 60)}:${String(m % 60).padStart(2, '0')}`;
    return `Boss Raid mở từ ${hh(R.OPEN_MIN)} đến ${hh(R.CLOSE_MIN)} (giờ Việt Nam) khi có ${R.START_PLAYERS} người bấm vào.`;
  },
  tsMs(ts) { return ts && ts.toMillis ? ts.toMillis() : 0; },
  secondsLeft() { return (this.startMs + this.R().BOSS_MIN * 60000 - Date.now()) / 1000; },   // thời gian còn lại của Boss đang đánh
  mmss(ms) { const s = Math.max(0, Math.ceil(ms / 1000)); return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`; },
  fmt(n) { return Math.round(n).toLocaleString('vi-VN'); },
  sleep(ms) { return new Promise(r => setTimeout(r, ms)); },
  damageMult() { const R = this.R(); return 1 + Math.max(0, R.FEW_PLAYERS_UNTIL - this.players) * R.FEW_PLAYERS_BONUS; },   // thiếu người → tăng sát thương

  // ----- vào trận -----
  async open() {
    if (this.running || this.waiting || this.opening) return;
    if (!FirebaseService.configured) { setMsg(FirebaseService.errorMessage, true); return; }
    const grade = String(Player.u.cls), today = this.todayGrades();
    if (!today.includes(grade)) {   // lịch: hôm nay không phải ngày của khối này
      setMsg(today.length ? `Hôm nay Boss Raid dành cho khối ${today.join(', ')}. Lịch: ${this.scheduleText()}.` : `Hôm nay không có Boss Raid. Lịch: ${this.scheduleText()}.`, true);
      return;
    }
    const world = WorldMap.world;
    if (!world) { setMsg('Chưa tải được bản đồ của khối. Hãy thử lại.', true); return; }
    this.opening = true; setMsg('Đang vào Boss Raid…');
    try {
      const [bossDef, questions] = await Promise.all([this.loadBoss(), this.loadQuestions(world)]);
      if (!questions.length) throw new Error('Chưa có câu hỏi nào trong các ải của khối này.');
      const slot = await this.route(grade);
      if (!slot) return;   // đã hiện thông báo lý do
      this.world = world; this.bossDef = bossDef; this.questions = questions;
      const phase = await this.join(grade, slot);
      setMsg('');
      if (phase === 'lobby') this.lobby(); else await this.start();
    } catch (e) {
      console.error('Raid open failed:', e);
      setMsg(e.code === 'permission-denied'
        ? 'Không vào được Boss Raid (chưa đúng lịch/giờ hoặc firestore.rules chưa được cập nhật). Hãy thử lại sau.'
        : 'Không vào được Boss Raid: ' + (e.message || 'lỗi không rõ'), true);
    } finally { this.opening = false; }
  },
  // Quyết định vào Boss 1 hay Boss 2 (1 lượt đọc tài liệu Boss 1, thêm 1 lượt cho Boss 2 khi đến lượt). Trả về 1, 2 hoặc 0 (đã báo lý do).
  async route(grade) {
    const R = this.R(), now = Date.now(), db = FirebaseService.db, day = this.dayKey(now);
    const s1 = await db.collection('raids').doc(`${grade}_${day}_1`).get();
    const b1 = s1.exists ? s1.data() : null, start1 = b1 ? this.tsMs(b1.StartAt) : 0;
    if (!start1) {   // Boss 1 chưa bắt đầu (chưa ai bấm hoặc đang chờ đủ người)
      if (!this.isOpen(now)) {
        setMsg(this.vnMinutes(now) < R.OPEN_MIN ? `${this.openText()} Chưa đến giờ.` : 'Hôm nay Boss Raid không mở vì chưa có đủ người bấm vào trước giờ đóng cửa.', true);
        return 0;
      }
      return 1;   // vào phòng chờ (hoặc người đầu tiên tạo)
    }
    const end1 = b1.DefeatedAt ? this.tsMs(b1.DefeatedAt) : start1 + R.BOSS_MIN * 60000;
    if (now < end1) return 1;   // Boss 1 đang chạy: vào muộn vẫn được
    const open2 = end1 + R.BOSS2_DELAY_MIN * 60000;
    if (now < open2) { setMsg(`Boss 1 đã kết thúc. Boss 2 xuất hiện sau ${this.mmss(open2 - now)}.`, true); return 0; }
    const s2 = await db.collection('raids').doc(`${grade}_${day}_2`).get();
    const start2 = s2.exists ? this.tsMs(s2.data().StartAt) : 0;
    if (start2 && now >= start2 + R.BOSS_MIN * 60000) { setMsg('Hôm nay đã hết lượt Boss Raid. Hẹn gặp lại lần sau!', true); return 0; }
    if (!s2.exists && this.vnMinutes(now) >= R.LATEST_START_MIN) { setMsg('Boss 2 hôm nay đã quá giờ bắt đầu.', true); return 0; }
    return 2;
  },
  async loadBoss() {
    if (this.cache.boss) return this.cache.boss;
    const r = await fetch(this.R().BOSS_FILE);
    if (!r.ok) throw new Error(`Không tải được ${this.R().BOSS_FILE} (${r.status}).`);
    const data = await r.json();
    if (!StageMonster.validate(data)) throw new Error('raid_boss.json không hợp lệ (cần name, stats, sprites.idle/attack).');
    const boss = { ...data, key: 'raid_boss', stats: { CRIT: 0, ...data.stats } };
    return (this.cache.boss = Monster.create(boss));
  },
  // Câu hỏi = TOÀN BỘ file Excel của mọi ải trong thế giới của khối (1 lần tải mỗi phiên).
  async loadQuestions(world) {
    if (this.cache[world.id]) return this.cache[world.id];
    const stages = world.stages.filter(s => WorldMap.hasQuestions(s));
    const lists = await Promise.all(stages.map(async s => {
      const r = await fetch(s.file);
      if (!r.ok) throw new Error(`Không đọc được ${s.file} (${r.status}).`);
      return Quiz.parse(await r.arrayBuffer());
    }));
    return (this.cache[world.id] = lists.flat());
  },
  // Vào Boss: 1 transaction (đọc Boss + tài liệu của mình, ghi Players+1 và tạo tài liệu người chơi cùng lúc; Rules kiểm tra chéo).
  // Người đầu tiên tạo Boss; người thứ START_PLAYERS bấm vào thì máy chủ ghi StartAt (Boss 1 xuất hiện). Boss 2 có StartAt ngay từ lúc tạo.
  // Trả về 'lobby' (Boss 1 chưa đủ người) hoặc 'run' (đã bắt đầu).
  async join(grade, slot) {
    const R = this.R(), db = FirebaseService.db, FV = firebase.firestore.FieldValue, id = `${grade}_${this.dayKey()}_${slot}`;
    if (this.raidId !== id) { this.pending = 0; this.myTotal = 0; this.topCache = null; this.lastFlushMs = 0; this.startMs = 0; this.defeatedMs = 0; this.defeatTried = false; }
    this.raidId = id; this.slot = slot;
    this.bossRef = db.collection('raids').doc(id);
    this.playerRef = this.bossRef.collection('players').doc(Player.uid);
    const mineNew = () => ({ Nickname: Player.data.nick, Damage: 0, LastFlush: FV.serverTimestamp() });
    const info = await db.runTransaction(async t => {
      const [bs, ps] = await Promise.all([t.get(this.bossRef), t.get(this.playerRef)]);
      if (bs.exists && ps.exists) return { b: bs.data(), mine: ps.data(), startedNow: false };   // vào lại: không ghi gì
      if (!bs.exists) {
        const base = { MaxHP: R.BOSS_HP[grade], Damage: 0, Players: 1, Slot: slot, CreatedAt: FV.serverTimestamp() };
        if (slot === 2) base.StartAt = FV.serverTimestamp();
        t.set(this.bossRef, base); t.set(this.playerRef, mineNew());
        return { b: { MaxHP: base.MaxHP, Damage: 0, Players: 1 }, startedNow: slot === 2 };
      }
      const b = bs.data(), start = this.tsMs(b.StartAt);
      if (b.DefeatedAt || (start && Date.now() >= start + R.BOSS_MIN * 60000)) throw new Error('Boss này đã kết thúc.');
      if ((b.Players || 0) >= R.MAX_PLAYERS) throw new Error(`Boss đã đủ ${R.MAX_PLAYERS} người. Hãy chờ Boss tiếp theo.`);
      const upd = { Players: (b.Players || 0) + 1 };
      let startedNow = false;
      if (!start && upd.Players >= R.START_PLAYERS) { upd.StartAt = FV.serverTimestamp(); startedNow = true; }
      t.update(this.bossRef, upd); t.set(this.playerRef, mineNew());
      return { b: { ...b, Players: upd.Players }, startedNow };
    });
    const b = info.b;
    this.maxHp = Number(b.MaxHP) || R.BOSS_HP[grade];
    this.bossDamage = Number(b.Damage) || 0;
    this.players = Number(b.Players) || 1;
    this.startMs = this.tsMs(b.StartAt) || (info.startedNow ? Date.now() : 0);
    this.defeatedMs = this.tsMs(b.DefeatedAt);
    if (info.mine) { this.myTotal = Number(info.mine.Damage) || 0; this.lastFlushMs = this.tsMs(info.mine.LastFlush) || this.lastFlushMs; }
    else this.lastFlushMs = Date.now();
    this.lastTryMs = Date.now();
    return this.startMs ? 'run' : 'lobby';
  },
  remaining() { return Math.max(0, this.maxHp - this.bossDamage - this.pending); },

  // ----- phòng chờ Boss 1 (cần START_PLAYERS người) -----
  lobby() {
    const A = Adventure, R = this.R();
    A.teardown(); A.active = false;
    this.waiting = true; this.lobbyFrom = Date.now();
    $('#hud-nick').textContent = Player.data.nick; Player.renderHud();
    show('screen-game');
    Stage.init({ background: this.world.stages[0].background, monster: this.bossDef, character: CONFIG.selectedCharacter });
    Stage.reset(); Stage.hp(1, '???', '???');
    $('#raid-bar').hidden = true; $('#raid-top').hidden = true;
    this.drawLobby(false);
    clearInterval(this.lobbyTimer);
    this.lobbyTimer = setInterval(() => this.pollLobby(), R.LOBBY_POLL_SEC * 1000);
  },
  drawLobby(timedOut) {
    const R = this.R(), box = $('#quiz'), div = el('div', 'result');
    div.append(el('h1', '', 'PHÒNG CHỜ BOSS RAID'),
      el('div', 'score', `${this.players}/${R.START_PLAYERS} người`),
      el('p', '', timedOut
        ? 'Chưa đủ người sau thời gian chờ. Bạn có thể chờ tiếp hoặc quay lại sau (chỉ mở trước giờ đóng cửa).'
        : `Boss xuất hiện khi có ${R.START_PLAYERS} người bấm vào. Hãy rủ bạn cùng khối! Màn hình tự cập nhật mỗi ${R.LOBBY_POLL_SEC} giây.`));
    if (timedOut) {
      const again = el('button', 'btn', 'Chờ tiếp'); again.type = 'button';
      again.onclick = () => { this.lobbyFrom = Date.now(); this.drawLobby(false); clearInterval(this.lobbyTimer); this.lobbyTimer = setInterval(() => this.pollLobby(), R.LOBBY_POLL_SEC * 1000); };
      div.append(again);
    }
    box.replaceChildren(div);
  },
  // Mỗi LOBBY_POLL_SEC giây: 1 lượt đọc tài liệu Boss (xem đã đủ người/đã có StartAt chưa). Tối đa LOBBY_MAX_MIN phút.
  async pollLobby() {
    if (!this.waiting || this.polling) return;
    this.polling = true;
    try {
      if (Date.now() - this.lobbyFrom > this.R().LOBBY_MAX_MIN * 60000) { clearInterval(this.lobbyTimer); this.drawLobby(true); return; }
      const snap = await this.bossRef.get();
      if (!this.waiting || !snap.exists) return;
      const d = snap.data();
      this.players = Number(d.Players) || this.players;
      this.maxHp = Number(d.MaxHP) || this.maxHp; this.bossDamage = Number(d.Damage) || 0;
      const start = this.tsMs(d.StartAt);
      if (start) { this.startMs = start; clearInterval(this.lobbyTimer); this.waiting = false; await this.start(); }
      else this.drawLobby(false);
    } catch (e) { console.warn('Lobby poll failed:', e); } finally { this.polling = false; }
  },

  // ----- chiến đấu (dùng lại Adventure/Stage/Quiz) -----
  async start() {
    const A = Adventure, world = this.world, bossDef = this.bossDef, questions = this.questions;
    clearInterval(this.lobbyTimer); this.waiting = false;
    this.running = true; this.ended = false; this.boss = bossDef;
    try { await this.top10(true); } catch (e) { /* không có tên thì dùng "Đồng đội" */ }   // ≤ 10 lượt đọc 1 lần: nickname cho hiệu ứng đồng đội
    if (!this.running) return;   // người chơi đã rời trong lúc chờ đọc
    A.teardown();
    A.raid = this; A.world = world; A.monster = bossDef; A.monsterPool = [bossDef];
    A.level = { kind: 'raid', index: 0, key: '', background: world.stages[0].background };
    $('#hud-nick').textContent = Player.data.nick; Player.renderHud();
    A.active = true; A.guard.bind(); A.guard.reset();
    show('screen-game');
    Stage.init({ background: A.level.background, monster: bossDef, character: CONFIG.selectedCharacter });
    Stage.reset();
    const stats = Player.stats(), maxPlayerHp = Math.max(1, stats.HP);
    A.combat = { playerStats: stats, maxPlayerHp, playerHp: maxPlayerHp, monster: bossDef, maxMonsterHp: this.maxHp, monsterHp: this.remaining(),
      monsterKills: 0, damageDealt: 0, finished: false, downed: false };
    Stage.playerHp(1, maxPlayerHp, maxPlayerHp);
    this.drawHp();
    this.bindBar();
    this.clearFx();
    $('#raid-bar').hidden = false; $('#raid-top').hidden = true;
    this.nextCounterAt = Date.now() + this.R().COUNTER_SEC * 1000;
    clearInterval(this.tick);
    this.tick = setInterval(() => this.onTick(), 1000);
    this.onTick();
    const box = $('#quiz');
    A.quizCtl = Quiz.run(Quiz.pick(questions, questions.length), box, {
      loop: true,
      // không dùng đồng hồ "quá giờ trả lời" của Adventure: Boss phản công theo đồng hồ riêng (onTick)
      result: (ok, sofar, total) => this.resolve(ok, sofar, total),
      finish: res => this.finish(res, box)
    });
  },
  drawHp() {
    const left = this.remaining();
    const shown = Math.min(this.maxHp, left + this.hold);   // trừ dần phần sát thương đồng đội chưa phát hiệu ứng
    Stage.hp(shown / this.maxHp, this.fmt(shown), this.fmt(this.maxHp));
    const mine = $('#raid-mine'); if (mine) mine.textContent = `Sát thương của bạn: ${this.fmt(this.myTotal + this.pending)}`;
  },
  onTick() {
    if (!this.running) return;
    const s = Math.floor(this.secondsLeft()), mult = this.damageMult();
    $('#raid-time').textContent = `Boss ${this.slot} · còn ${Math.floor(Math.max(0, s) / 60)}:${String(Math.max(0, s % 60)).padStart(2, '0')}${mult > 1 ? ` · +${Math.round((mult - 1) * 100)}% sát thương (ít người)` : ''}`;
    if (s <= 0) { this.end('time'); return; }   // hết giờ mà chưa hạ = thất bại
    this.counterTick();
    if (!this.flushing && Date.now() - this.lastTryMs >= this.R().FLUSH_SEC * 1000) this.flush();
  },
  // Chia `total` thành các phần ngẫu nhiên, mỗi phần gắn một nickname và hiện dạng số bay lên Boss, rải đều trong một chu kỳ.
  playOthers(total) {
    this.clearFx();
    const R = this.R(), n = Math.max(1, Math.min(24, Math.ceil(total / 300), total));
    const weights = Array.from({ length: n }, () => 0.4 + Math.random()), sum = weights.reduce((a, b) => a + b, 0);
    const parts = weights.map(w => Math.max(1, Math.floor(total * w / sum)));
    parts[parts.length - 1] += total - parts.reduce((a, b) => a + b, 0);   // đảm bảo tổng đúng bằng dữ liệu thật
    const pool = this.names.length ? this.names : ['Đồng đội'];
    this.hold = total;
    parts.forEach((part, i) => {
      const at = (i + Math.random() * 0.8) / n * R.FLUSH_SEC * 900;   // rải trong ~90% chu kỳ
      this.fxTimers.push(setTimeout(() => {
        if (!this.running) return;
        this.hold = Math.max(0, this.hold - part);
        this.spawnFloat(pool[Math.floor(Math.random() * pool.length)], part);
        this.drawHp();
      }, at));
    });
  },
  spawnFloat(nick, damage) {
    const stage = document.getElementById('stage'); if (!stage) return;
    const f = el('div', 'fx-float', `${nick} −${this.fmt(damage)}`);
    f.style.left = `${52 + Math.random() * 30}%`; f.style.top = `${22 + Math.random() * 22}%`;
    f.addEventListener('animationend', () => f.remove());
    stage.append(f);
  },
  clearFx() { this.fxTimers.forEach(clearTimeout); this.fxTimers = []; this.hold = 0; document.querySelectorAll('.fx-float').forEach(n => n.remove()); },
  // Phản công: đếm ngược ở trình duyệt, mỗi COUNTER_SEC giây Boss đánh người chơi (tab bị ẩn/throttle: bù lần bỏ lỡ, tối đa 5 lần).
  counterTick() {
    const A = Adventure, fight = A.combat, label = $('#raid-counter'), R = this.R();
    if (!fight || fight.finished) return;
    if (fight.downed) { this.nextCounterAt = Date.now() + R.COUNTER_SEC * 1000; label.textContent = '💀 Chờ hồi sinh…'; return; }
    let hits = 0;
    while (Date.now() >= this.nextCounterAt && hits < 5 && !fight.downed) {
      this.nextCounterAt += R.COUNTER_SEC * 1000; hits++;
      const hit = A.monsterHit(fight, false);
      Stage.fx(false, 0, 0, () => {
        if (!this.running || A.combat !== fight || fight.finished || fight.downed) return;
        A.applyMonsterHit(fight, hit);
        A.note(hit.blocked ? `${this.boss.name} phản công: Thánh thuẫn chặn hoàn toàn!` : `${this.boss.name} phản công: ${hit.crit ? 'CHÍ MẠNG! ' : ''}-${hit.damage} HP.`);
        if (fight.playerHp === 0) { this.down(fight); return; }
        A.applyThorns(fight);
        A.afterTurn(fight);
      });
    }
    if (Date.now() >= this.nextCounterAt) this.nextCounterAt = Date.now() + R.COUNTER_SEC * 1000;   // bỏ lỡ quá 5 lần: bỏ phần còn lại
    const left = Math.max(0, Math.ceil((this.nextCounterAt - Date.now()) / 1000));
    label.textContent = `⚔ Phản công sau ${left}s`;
    label.classList.toggle('is-low', left <= 5);
  },
  resolve(correct, sofar, total) {
    const A = Adventure, fight = A.combat;
    A.stopTimer();
    if (!fight || fight.finished) return true;
    if (!correct) {
      const hit = A.monsterHit(fight, false);
      const impact = Stage.fx(false, sofar, total, () => {
        if (!this.running || A.combat !== fight || fight.finished) return;
        A.applyMonsterHit(fight, hit);
        const action = A.afterMonsterHit(fight, hit, 'trả lời sai');
        if (action === true) { A.quizCtl.end({ playerDefeated: true }); return; }
        if (fight.playerHp > 0) { A.applyThorns(fight); A.afterTurn(fight); }
      });
      if (fight.playerHp <= hit.damage) {
        const reviveMs = this.R().REVIVE_SEC * 1000;
        return impact.then(() => new Promise(resolve => setTimeout(resolve, reviveMs)));
      }
      return impact;
    }
    const atk = Effects.attack(fight, A.monsterStat('DEF'), this.remaining()), crit = atk.crit;
    const damage = Math.max(1, Math.round(atk.damage * this.damageMult()));   // thiếu người → tăng sát thương
    const impact = Stage.fx(true, sofar, total, () => {
      if (!this.running || A.combat !== fight || fight.finished) return;
      const applied = Math.min(damage, this.remaining());
      this.pending += applied; fight.damageDealt += applied;
      A.note(`${crit ? 'CHÍ MẠNG! ' : ''}Bạn gây ${applied} sát thương${Effects.describe(atk)}.`);
      const stolen = Effects.lifesteal(fight, applied);
      if (stolen > 0) A.note(`Đoạt huyết: hồi ${stolen} HP.`);
      A.afterTurn(fight);
      this.drawHp();
      if (this.remaining() <= 0) { Stage.defeat(); this.end('boss'); }
    });
    return impact;
  },
  // Gai góc (Adventure.applyThorns gọi khi đang ở Raid): cộng vào sát thương Boss như một đòn đánh.
  thorns(fight, t) {
    if (!this.running || fight.finished || fight.downed) return 0;
    const applied = Math.min(t, this.remaining());
    if (applied <= 0) return 0;
    this.pending += applied; fight.damageDealt += applied;
    Adventure.note(`Gai góc phản ${applied} sát thương.`);
    this.drawHp();
    if (this.remaining() <= 0) { Stage.defeat(); this.end('boss'); }
    return applied;
  },
  // Người chơi hết HP: không kết thúc, hồi sinh sau REVIVE_SEC giây (Plan 5.2).
  down(fight) {
    fight.downed = true;
    Stage.playerDefeat();
    const ms = this.R().REVIVE_SEC * 1000;
    Adventure.note(`Bạn bị hạ gục! Hồi sinh sau ${this.R().REVIVE_SEC} giây.`);
    clearTimeout(this.reviveTimer);
    this.reviveTimer = setTimeout(() => {
      if (!this.running || fight.finished) return;
      fight.downed = false; fight.playerHp = fight.maxPlayerHp; this.nextCounterAt = Date.now() + this.R().COUNTER_SEC * 1000;
      document.getElementById('hero').classList.remove('dead');
      Stage.playerHp(1, fight.maxPlayerHp, fight.maxPlayerHp);
    }, ms);
    return ms;
  },

  // ----- gửi sát thương (1 lần/phút) -----
  async flush() {
    if (this.flushing || !this.bossRef) return;
    this.flushing = true; this.lastTryMs = Date.now();
    try {
      const d = this.pending, R = this.R(), FV = firebase.firestore.FieldValue, before = this.bossDamage;
      let send = 0;
      const gapOk = Date.now() - this.lastFlushMs >= (R.MIN_FLUSH_GAP_SEC + 1) * 1000;
      if (d > 0 && gapOk && this.secondsLeft() > -(R.GRACE_MIN * 60 - 5)) {
        send = Math.min(d, R.MAX_FLUSH_DAMAGE);   // trần mỗi lần gửi (Rules); phần dư gửi lần sau
        const batch = FirebaseService.db.batch();
        batch.update(this.playerRef, { Damage: FV.increment(send), LastFlush: FV.serverTimestamp() });
        batch.update(this.bossRef, { Damage: FV.increment(send) });
        await batch.commit();
        this.pending -= send; this.myTotal += send; this.lastFlushMs = Date.now();
      }
      const snap = await this.bossRef.get();   // 1 lượt đọc/phút: HP Boss hiện tại
      if (snap.exists) {
        const bd = snap.data();
        this.bossDamage = Number(bd.Damage) || 0;
        this.players = Number(bd.Players) || this.players;   // số người hiện tại (tính bonus ít người)
        if (bd.DefeatedAt) this.defeatedMs = this.tsMs(bd.DefeatedAt);
      }
      if (this.bossDamage >= this.maxHp && !this.defeatedMs && !this.defeatTried) { this.defeatTried = true; await this.markDefeated(); }
      const others = this.bossDamage - before - send;   // sát thương của người khác trong chu kỳ vừa rồi
      if (others > 0 && this.running) this.playOthers(others);
      if (this.running) { this.drawHp(); if (this.remaining() <= 0) this.end('boss'); }
    } catch (e) {
      console.warn('Raid flush failed:', e);   // giữ nguyên this.pending, thử lại ở chu kỳ sau
    } finally { this.flushing = false; }
  },
  // Gửi nốt sát thương còn lại (rời trận hoặc hết trận): chờ đủ khoảng cách tối thiểu giữa hai lần ghi.
  drainPending() {
    if (this.drain) return this.drain;
    this.drain = (async () => {
      for (let tries = 0; tries < 4 && this.pending > 0; tries++) {
        const wait = this.lastFlushMs + (this.R().MIN_FLUSH_GAP_SEC + 1) * 1000 - Date.now();
        if (wait > 0) await this.sleep(wait);
        if (this.secondsLeft() < -(this.R().GRACE_MIN * 60 - 10)) break;   // quá giờ gia hạn: Rules sẽ từ chối
        while (this.flushing) await this.sleep(200);
        await this.flush();
      }
    })().finally(() => { this.drain = null; });
    return this.drain;
  },

  // Ghi mốc Boss bị hạ (máy chủ ghi giờ); chỉ người nào ghi được trước thì thành công, người khác bị Rules từ chối (bỏ qua). Mốc này quyết định giờ xuất hiện Boss 2.
  async markDefeated() {
    try {
      await this.bossRef.update({ DefeatedAt: firebase.firestore.FieldValue.serverTimestamp() });
      this.defeatedMs = Date.now();
    } catch (e) { /* người khác đã ghi hoặc chưa đủ điều kiện */ }
  },

  // ----- kết thúc / rời trận -----
  end(reason) {
    if (this.ended || !this.running) return;
    this.ended = true;
    if (Adventure.quizCtl) Adventure.quizCtl.end({ raidOver: reason });
  },
  stopLocal() {
    this.running = false; this.waiting = false; clearInterval(this.tick); this.tick = null; clearInterval(this.lobbyTimer); this.lobbyTimer = null;
    clearTimeout(this.reviveTimer); this.reviveTimer = null; this.clearFx();
    $('#raid-bar').hidden = true; $('#raid-top').hidden = true;
    Adventure.stopTimer(); Adventure.active = false; Adventure.guard.uncover();
    if (Adventure.combat) Adventure.combat.finished = true;
  },
  leave() {   // người chơi bấm "Về bản đồ": sát thương đã gây vẫn được gửi ngầm
    clearInterval(this.nextTimer); this.nextTimer = null;
    this.stopLocal(); this.ended = true; Adventure.raid = null;
    if (this.pending > 0) this.drainPending();
  },
  async finish(res, box) {
    this.stopLocal();
    const R = this.R(), dead = this.remaining() <= 0 || res.raidOver === 'boss';
    const div = el('div', 'result'), status = el('p', 'save-status', 'Đang gửi sát thương…'), list = el('div', 'raid-top-list'), next = el('p', '');
    const back = el('button', 'btn ghost', 'Về bản đồ');
    back.onclick = () => { clearInterval(this.nextTimer); Adventure.raid = null; renderLevels(); };
    div.append(el('h1', '', dead ? `BOSS ${this.slot} ĐÃ BỊ HẠ!` : `BOSS ${this.slot} THẤT BẠI`),
      el('div', 'score', `${this.fmt(this.myTotal + this.pending)} sát thương`),
      el('p', '', (dead ? 'Cả khối đã hạ Boss: ' : 'Boss chưa bị hạ khi hết giờ: ') + 'top 10 sát thương nhận thưởng' +
        (dead ? ' đầy đủ' : ' 50% và không có trang bị') + '; giáo viên sẽ chốt, bạn sẽ thấy thông báo khi đăng nhập.'),
      status, list, next, back);
    box.replaceChildren(div);
    back.disabled = true;
    try {
      await this.drainPending();
      if (this.bossDamage >= this.maxHp && !this.defeatedMs) await this.markDefeated();
      status.textContent = this.pending > 0 ? `Chưa gửi được ${this.fmt(this.pending)} sát thương cuối (đã quá giờ hoặc mất mạng).` : 'Đã gửi toàn bộ sát thương.';
      this.renderTop(list, await this.top10(true));
    } catch (e) {
      status.textContent = 'Không tải được bảng top 10: ' + (e.message || 'lỗi không rõ');
    }
    this.showNext(next, div);
    back.disabled = false;
  },
  // Sau Boss 1: đếm ngược đến Boss 2 (tính ở trình duyệt từ mốc đã biết, không tốn đọc) + nút vào Boss 2. Sau Boss 2: hết lượt hôm nay.
  showNext(note, div) {
    clearInterval(this.nextTimer);
    if (this.slot !== 1) { note.textContent = 'Hôm nay đã hết lượt Boss Raid. Hẹn gặp lại lần sau!'; return; }
    const R = this.R(), end = this.defeatedMs || (this.startMs + R.BOSS_MIN * 60000), openAt = end + R.BOSS2_DELAY_MIN * 60000;
    const go = el('button', 'btn', 'Vào Boss 2'); go.type = 'button'; go.disabled = true;
    go.onclick = () => { clearInterval(this.nextTimer); Adventure.raid = null; renderLevels(); this.open(); };
    div.insertBefore(go, div.lastChild);
    const upd = () => {
      const left = openAt - Date.now();
      note.textContent = left > 0 ? `Boss 2 xuất hiện sau ${this.mmss(left)}.` : 'Boss 2 đã xuất hiện! Bấm vào để chiến đấu.';
      go.disabled = left > 0;
      if (left <= 0) clearInterval(this.nextTimer);
    };
    upd(); this.nextTimer = setInterval(upd, 1000);
  },

  // ----- Top 10 sát thương: chỉ top 10 được xếp hạng (limit 10); đọc khi mở bảng, tối đa 1 lần/phút -----
  async top10(force) {
    if (!force && this.topCache && Date.now() - this.topCache.at < 60000) return this.topCache.rows;
    const snap = await this.bossRef.collection('players').orderBy('Damage', 'desc').limit(this.R().TOP).get();
    const rows = snap.docs.map(d => ({ id: d.id, nick: d.data().Nickname || '?', damage: Number(d.data().Damage) || 0 })).filter(r => r.damage > 0);
    this.topCache = { at: Date.now(), rows };
    this.names = rows.filter(r => r.id !== Player.uid).map(r => r.nick);   // nickname cho hiệu ứng đồng đội
    return rows;
  },
  renderTop(box, rows) {
    const medals = ['🥇', '🥈', '🥉'], out = [];
    const mine = this.myTotal + this.pending;
    if (!rows.length) out.push(el('p', 'rank-empty', 'Chưa có ai trong top 10.'));
    rows.forEach((r, i) => {
      const me = r.id === Player.uid, row = el('div', 'rank-row' + (me ? ' is-me' : '') + (i < 3 ? ' is-top' : ''));
      row.append(el('span', 'rank-pos', medals[i] || String(i + 1)), el('span', 'rank-name', `${r.nick}${me ? ' (bạn)' : ''}`),
        el('span', 'rank-score', `${this.fmt(me ? Math.max(mine, r.damage) : r.damage)} sát thương`));
      out.push(row);
    });
    if (!rows.some(r => r.id === Player.uid)) out.push(el('p', 'rank-empty', `Bạn đang ngoài top 10 (chỉ top 10 được xếp hạng) — sát thương của bạn: ${this.fmt(mine)}.`));
    box.replaceChildren(...out);
  },
  bindBar() {
    if (this.barBound) return;
    this.barBound = true;
    $('#raid-top-btn').onclick = async () => {
      const panel = $('#raid-top');
      if (!panel.hidden) { panel.hidden = true; return; }
      panel.hidden = false; panel.replaceChildren(el('p', 'rank-empty', 'Đang tải…'));
      try { this.renderTop(panel, await this.top10(false)); } catch (e) { panel.replaceChildren(el('p', 'rank-empty is-error', 'Không tải được top 10.')); }
    };
  }
};
