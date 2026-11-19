// V4: RANKED — đấu với BẢN CHỤP của một bạn cùng lớp (B) có hạng gần mình; B không cần online. Hoạt động như đánh quái ở Ải:
// A trả lời đúng → gây sát thương lên B; A trả lời sai hoặc hết đồng hồ → B đánh A; HP A về 0 trước = THUA, HP B về 0 trước = THẮNG
// (không cần hết bộ câu hỏi; câu hỏi lặp từ TẤT CẢ ải của khối). Thắng được CONFIG.RANKED.WIN_BASE + max(0, điểm B − điểm A) điểm; thua không mất điểm.
//
// DỮ LIỆU: MỘT tài liệu cho mỗi lớp: ranked/<khối>_<số lớp> (vd ranked/6_5) = { <UID>: { N, Lv, Ch, Eq, Pt, D, Cnt, Win, LS, B }, ... }
//   N nickname · Lv cấp · Ch nhân vật (vd Archer_F, có nghề) · Eq trang bị đang mặc · Pt điểm · D ngày VN (yyyymmdd) · Cnt số trận đã BẮT ĐẦU hôm nay ·
//   Win số trận thắng hôm nay · LS giờ bắt đầu trận gần nhất (máy chủ) · B UID đối thủ của trận gần nhất.
// Học sinh chỉ `get` (đọc đúng 1 tài liệu của lớp), KHÔNG truy vấn/danh sách; chỉ được ghi trường mang UID của chính mình (rules kiểm tra).
//
// ================= BẢNG ĐỌC/GHI (Firestore) =================
//  Thao tác                      ĐỌC                    GHI    GHI CHÚ
//  Mở màn Ranked / xem top 10    1 (0 nếu cache < 5')   0      cả lớp ~35–40 người nằm trong 1 tài liệu nên xem top 10 hay hạng của mình đều chỉ 1 lượt đọc
//  Đăng ký lần đầu (+10 điểm)    1 (trong transaction)  1      + 1 lượt đọc hồ sơ do Rules kiểm tra lớp
//  Bắt đầu 1 trận                1 (transaction)        1      ghi: số trận hôm nay, bản chụp mới của mình, B; + 1 lượt đọc do Rules (lớp)
//  Báo THẮNG                     1 (transaction)        1      ghi điểm; THUA không ghi gì. Trong lúc đánh: 0 lượt đọc/ghi
// Trung bình ~3 đọc + 1,6 ghi mỗi trận (60% thắng). Chống gian lận cơ bản: rules ép giới hạn 5 trận/ngày, công thức điểm, B tồn tại, báo thắng ≥ 30s sau
// khi bắt đầu và mỗi thắng phải có một trận đã bắt đầu. KHÔNG kiểm tra được thắng thật hay không (trình duyệt tự báo) → trần điểm MAX_DIFF mỗi trận.
const Ranked = {
  doc: null, at: 0, busy: false, opp: null, startedAt: 0, world: null, questions: null,
  C() { return CONFIG.RANKED; },
  ref() { const [g, r] = String(Player.data.room).split('/'); return FirebaseService.db.collection('ranked').doc(`${g}_${r}`); },
  vnDay(ms = Date.now()) { const d = new Date(ms + 7 * 3600 * 1000); return d.getUTCFullYear() * 10000 + (d.getUTCMonth() + 1) * 100 + d.getUTCDate(); },
  fmt(n) { return Math.round(n).toLocaleString('vi-VN'); },
  sleep(ms) { return new Promise(r => setTimeout(r, ms)); },
  // Xếp hạng trong lớp: điểm giảm dần, bằng điểm thì theo UID (ổn định). Chỉ dùng dữ liệu đã đọc, không tốn đọc.
  rows(doc = this.doc) {
    return Object.entries(doc || {}).filter(([, e]) => e && typeof e.Pt === 'number').map(([uid, e]) => ({ uid, ...e }))
      .sort((a, b) => b.Pt - a.Pt || (a.uid < b.uid ? -1 : 1));
  },
  matchesToday(e, today = this.vnDay()) { return e && e.D === today ? e.Cnt || 0 : 0; },
  leftToday() { return this.C().DAILY_MATCHES - this.matchesToday(this.doc && this.doc[Player.uid]); },

  // ----- đọc / đăng ký -----
  // ĐỌC: 1 lượt (tài liệu cả lớp), dùng lại trong CACHE_SEC giây.
  async load(force) {
    if (!force && this.doc && Date.now() - this.at < this.C().CACHE_SEC * 1000) return this.doc;
    const snap = await this.ref().get();
    this.doc = snap.exists ? snap.data() : {}; this.at = Date.now();
    return this.doc;
  },
  entryNew() { return { ...Player.snapshot(), Pt: this.C().START_POINTS, D: this.vnDay(), Cnt: 0, Win: 0 }; },
  // Lần đầu vào Ranked: tặng START_POINTS điểm. 1 transaction (đọc lại tài liệu lớp, ghi đúng trường của mình).
  async register() {
    const uid = Player.uid, ref = this.ref();
    await FirebaseService.db.runTransaction(async t => {
      const snap = await t.get(ref), data = snap.exists ? snap.data() : {};
      if (data[uid]) { this.doc = data; return; }
      const e = this.entryNew();
      if (snap.exists) t.update(ref, { [uid]: e }); else t.set(ref, { [uid]: e });
      this.doc = { ...data, [uid]: e };
    });
    this.at = Date.now();
  },
  async syncCharacterSnapshot(force = false) {
    if (!FirebaseService.configured || !Player.uid || !Player.data || !Player.data.room) return;
    const uid = Player.uid, key = CONFIG.character().key;
    if (!force && this.doc && this.doc[uid] && this.doc[uid].Ch === key) return;
    const ref = this.ref();
    await FirebaseService.db.runTransaction(async t => {
      const snap = await t.get(ref), data = snap.exists ? snap.data() : {}, entry = data[uid];
      if (!entry || entry.Ch === key) { this.doc = data; return; }
      const next = { ...entry, Ch: key };
      t.update(ref, { [uid]: next });
      this.doc = { ...data, [uid]: next };
    });
    this.at = Date.now();
  },

  // ----- màn Ranked (hộp thoại) -----
  async open() {
    if (this.busy) return;
    if (!FirebaseService.configured) { setMsg(FirebaseService.errorMessage, true); return; }
    if (!Player.data.room) { setMsg('Hồ sơ chưa có lớp. Hãy đăng nhập lại và nhập lớp (ví dụ 6/5).', true); return; }
    const dialog = $('#ranked-dialog'), status = $('#ranked-status');
    dialog.hidden = false; status.textContent = 'Đang tải…'; status.classList.remove('is-error');
    $('#ranked-close').onclick = () => { dialog.hidden = true; };
    $('#ranked-find').onclick = () => this.find();
    this.busy = true;
    try {
      await this.load(false);
      if (!this.doc[Player.uid]) { status.textContent = 'Đang đăng ký Ranked…'; await this.register(); }
      await this.syncCharacterSnapshot();
      this.render();
    } catch (e) {
      console.error('Ranked open failed:', e);
      this.fail(e.code === 'permission-denied' ? 'Không vào được Ranked (kiểm tra lớp của bạn và firestore.rules mới nhất).' : 'Không tải được Ranked: ' + (e.message || 'lỗi không rõ'));
    } finally { this.busy = false; }
  },
  fail(msg) { const s = $('#ranked-status'); s.textContent = msg; s.classList.add('is-error'); },
  render() {
    const me = this.doc[Player.uid], rows = this.rows(), top = rows.slice(0, this.C().TOP), idx = rows.findIndex(r => r.uid === Player.uid);
    const left = this.leftToday(), room = Player.data.room;
    $('#ranked-title').textContent = `RANKED · LỚP ${room}`;
    $('#ranked-me').textContent = me
      ? `Điểm của bạn: ${me.Pt} · ${idx >= 0 && idx < this.C().TOP ? `hạng #${idx + 1}` : 'ngoài top 10'} · Trận hôm nay: ${this.C().DAILY_MATCHES - left}/${this.C().DAILY_MATCHES}`
      : '';
    const list = $('#ranked-top'), medals = ['🥇', '🥈', '🥉'];
    list.replaceChildren(...top.map((r, i) => {
      const row = el('div', 'rank-row' + (r.uid === Player.uid ? ' is-me' : '') + (i < 3 ? ' is-top' : ''));
      row.append(el('span', 'rank-pos', medals[i] || String(i + 1)), el('span', 'rank-name', `${r.N}${r.uid === Player.uid ? ' (bạn)' : ''}`),
        el('span', 'rank-lv', `Lv ${r.Lv}`), el('span', 'rank-score', `${r.Pt} điểm`));
      return row;
    }));
    const find = $('#ranked-find'), others = rows.length - 1;
    find.disabled = left <= 0 || others < 1;
    $('#ranked-status').classList.remove('is-error');
    $('#ranked-status').textContent = left <= 0 ? 'Hôm nay bạn đã đủ số trận Ranked. Hẹn bạn ngày mai!'
      : others < 1 ? 'Chưa có đối thủ: lớp bạn cần ít nhất một bạn khác vào Ranked.'
        : `Chỉ top ${this.C().TOP} có hạng. Đối thủ là một bạn cùng lớp trong khoảng ±${this.C().RANK_RANGE} hạng quanh bạn.`;
  },

  // ----- tìm đối thủ + bắt đầu trận (1 transaction: đọc tài liệu lớp, ghi bản chụp mới + số trận + B) -----
  async find() {
    if (this.busy) return;
    this.busy = true; $('#ranked-find').disabled = true;
    const status = $('#ranked-status'); status.classList.remove('is-error'); status.textContent = 'Đang tìm đối thủ…';
    try {
      const world = WorldMap.world;
      if (!world) throw new Error('Chưa tải được bản đồ của khối.');
      const [questions] = await Promise.all([Raid.loadQuestions(world)]);
      if (!questions.length) throw new Error('Chưa có câu hỏi nào trong các ải của khối này.');
      const uid = Player.uid, ref = this.ref(), C = this.C();
      const picked = await FirebaseService.db.runTransaction(async t => {
        const snap = await t.get(ref), data = snap.exists ? snap.data() : {}, me = data[uid], today = this.vnDay();
        if (!me) throw new Error('Bạn chưa đăng ký Ranked.');
        const cnt = this.matchesToday(me, today);
        if (cnt >= C.DAILY_MATCHES) throw new Error('Hôm nay bạn đã đủ số trận Ranked.');
        const rows = this.rows(data), i = rows.findIndex(r => r.uid === uid);
        const pool = rows.slice(Math.max(0, i - C.RANK_RANGE), i + C.RANK_RANGE + 1).filter(r => r.uid !== uid);
        if (!pool.length) throw new Error('Chưa có đối thủ trong lớp.');
        const opp = pool[Math.floor(Math.random() * pool.length)];
        const next = { ...Player.snapshot(), Pt: me.Pt, D: today, Cnt: cnt + 1, Win: me.D === today ? me.Win || 0 : 0, LS: firebase.firestore.FieldValue.serverTimestamp(), B: opp.uid };
        t.update(ref, { [uid]: next });
        this.doc = { ...data, [uid]: { ...next, LS: null } };
        return { opp, myPt: me.Pt };
      });
      this.at = Date.now();
      this.opp = picked.opp; this.startedAt = Date.now(); this.world = world; this.questions = questions;
      $('#ranked-dialog').hidden = true;
      await this.start();
    } catch (e) {
      console.error('Ranked find failed:', e);
      this.fail(e.code === 'permission-denied' ? 'Máy chủ từ chối bắt đầu trận (đủ 5 trận hoặc rules chưa cập nhật).' : (e.message || 'Không bắt đầu được trận.'));
      try { this.render(); } catch (e2) { /* giữ thông báo lỗi */ }
    } finally { this.busy = false; }
  },
  // Đối thủ B như một "quái": chỉ số tính từ bản chụp (cấp + nghề/nhân vật + trang bị), sprite là sprite nhân vật của B (lật ngang).
  monsterFrom(b) {
    const def = CONFIG.CHARACTERS[b.Ch] || CONFIG.character(), s = Player.statsOf(b.Lv, def.key, b.Eq);
    return { key: 'rk_' + def.key, name: b.N, type: 'Ranked', flip: true, attackStyle: def.attackStyle, castSkill: def.castSkill,
      stats: { HP: s.HP, ATK: s.ATK, DEF: s.DEF, CRIT: s.CRIT }, sprites: { idle: def.idle, attack: def.attack, skill: def.skill } };
  },

  // ----- chiến đấu (dùng lại Adventure/Stage/Quiz) -----
  async start() {
    const A = Adventure, mon = this.monsterFrom(this.opp), box = $('#quiz');
    A.teardown(); A.raid = null; A.world = this.world; A.monster = mon; A.monsterPool = [mon];
    A.level = { kind: 'ranked', index: 0, key: '', background: this.world.stages[0].background };
    $('#hud-nick').textContent = Player.data.nick; Player.renderHud();
    A.active = true; A.guard.bind(); A.guard.reset();
    show('screen-game');
    Stage.init({ background: A.level.background, monster: mon, character: CONFIG.selectedCharacter });
    Stage.reset();
    A.beginCombat();   // HP của mình theo chỉ số hiện tại, HP của B theo bản chụp
    this.won = false;
    A.quizCtl = Quiz.run(Quiz.pick(this.questions, this.questions.length), box, {
      loop: true,
      begin: (i, head) => A.startTimer(head),   // hết đồng hồ → B đánh
      result: (ok, sofar, total) => this.resolve(ok, sofar, total),
      finish: res => this.finish(res, box)
    });
  },
  resolve(correct, sofar, total) {
    const A = Adventure, fight = A.combat;
    A.stopTimer();
    if (!fight || fight.finished) return true;
    if (!correct) {
      const hit = A.monsterHit(fight, false);
      return Stage.fx(false, sofar, total, () => {
        if (!A.active || A.combat !== fight || fight.finished) return;
        A.applyMonsterHit(fight, hit);
        const action = A.afterMonsterHit(fight, hit, 'trả lời sai');
        if (action === true) { A.quizCtl.end({ playerDefeated: true }); return; }
        A.applyThorns(fight);
        A.afterTurn(fight);
      });
    }
    const atk = Effects.attack(fight, A.monsterStat('DEF'), fight.monsterHp), damage = atk.damage, crit = atk.crit;
    return Stage.fx(true, sofar, total, () => {
      if (!A.active || A.combat !== fight || fight.finished) return;
      const dealt = Math.min(damage, fight.monsterHp);
      fight.monsterHp = Math.max(0, fight.monsterHp - damage);
      A.note(`${crit ? 'CHÍ MẠNG! ' : ''}Bạn gây ${damage} sát thương${atk.smite ? ` (Trừng phạt +${atk.smite})` : ''}.`);
      const stolen = Effects.lifesteal(fight, dealt);
      if (stolen > 0) A.note(`Đoạt huyết: hồi ${stolen} HP.`);
      Stage.hp(fight.monsterHp / fight.maxMonsterHp, fight.monsterHp, fight.maxMonsterHp);
      if (fight.monsterHp === 0) {
        fight.finished = true; this.won = true;
        Stage.defeat();
        A.quizCtl.end({ rankedWin: true });
      } else A.afterTurn(fight);
    });
  },
  // Gai góc hạ đối thủ (gọi từ Adventure.applyThorns): thắng ngay như đòn thường.
  thornWin(fight) {
    fight.finished = true; this.won = true;
    Stage.hp(0, 0, fight.maxMonsterHp); Stage.defeat();
    Adventure.quizCtl.end({ rankedWin: true });
  },
  async finish(res, box) {
    const A = Adventure;
    A.stopTimer(); A.active = false; A.guard.uncover();
    if (A.combat) A.combat.finished = true;
    const win = this.won && !res.playerDefeated, name = this.opp.N;
    const div = el('div', 'result'), status = el('p', 'save-status', win ? 'Đang ghi điểm…' : ''), again = el('button', 'btn', 'Ranked'), back = el('button', 'btn ghost', 'Về bản đồ');
    again.onclick = () => { renderLevels(); this.open(); }; back.onclick = () => renderLevels();
    div.append(el('h1', '', win ? 'CHIẾN THẮNG RANKED!' : 'BẠN ĐÃ THUA'),
      el('p', '', win ? `Bạn đã hạ ${name} (bản chụp). Điểm được cộng sau đây.` : `${name} đã thắng lượt này. Thua không bị trừ điểm, nhưng vẫn tính vào số trận trong ngày (còn ${this.leftToday()} trận).`),
      status, again, back);
    box.replaceChildren(div);
    if (!win) return;
    again.disabled = back.disabled = true;
    try {
      const gain = await this.reportWin();
      status.textContent = `Bạn nhận +${gain} điểm (10 + chênh lệch). Còn ${this.leftToday()} trận hôm nay.`;
    } catch (e) {
      console.error('Ranked reportWin failed:', e);
      status.textContent = 'Không ghi được điểm: ' + (e.code === 'permission-denied' ? 'máy chủ từ chối (có thể do quá nhanh hoặc rules chưa cập nhật).' : (e.message || 'lỗi không rõ'));
    }
    again.disabled = back.disabled = false;
  },
  // Báo thắng: 1 transaction (đọc lại điểm mới nhất của A và B, ghi điểm của A). Rules kiểm tra lại công thức, giới hạn và thời gian.
  async reportWin() {
    const C = this.C(), uid = Player.uid, ref = this.ref();
    const wait = this.startedAt + (C.MIN_BATTLE_SEC + 1) * 1000 - Date.now();
    if (wait > 0) await this.sleep(wait);   // rules yêu cầu báo thắng cách lúc bắt đầu ≥ MIN_BATTLE_SEC giây
    return FirebaseService.db.runTransaction(async t => {
      const snap = await t.get(ref), data = snap.exists ? snap.data() : {}, me = data[uid], b = data[this.opp.uid];
      if (!me || !b || me.B !== this.opp.uid) throw new Error('Không tìm thấy dữ liệu trận.');
      if ((me.Win || 0) >= (me.Cnt || 0)) throw new Error('Trận này đã được ghi điểm.');
      const gain = C.WIN_BASE + Math.min(C.MAX_DIFF, Math.max(0, b.Pt - me.Pt));
      const next = { ...me, Pt: me.Pt + gain, Win: (me.Win || 0) + 1 };
      t.update(ref, { [uid]: next });
      this.doc = { ...data, [uid]: next }; this.at = Date.now();
      return gain;
    });
  }
};
