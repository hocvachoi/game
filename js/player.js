// Hồ sơ nhân vật. Firestore là nguồn dữ liệu duy nhất (Plan mục 10.2: không tin localStorage).
// Mọi thay đổi Gold/EXP/vật phẩm đi qua transaction: đọc hồ sơ mới nhất -> kiểm tra -> ghi một lần.
// Quy tắc cuối cùng do firestore.rules quyết định; kiểm tra ở đây chỉ để báo lỗi sớm.
const Player = {
  data: null, u: null, uid: null, lastRewardMs: 0,
  G: () => CONFIG.GAME,

  load(profile, identity) {
    this.u = { name: identity.username, cls: identity.className, nick: profile.Nickname };
    this.uid = profile.UID;
    this.lastRewardMs = 0;
    this.apply(profile);
    this.syncCharacter();
    return this.data;
  },
  // Nhân vật đang chọn lấy từ hồ sơ (trường Character, Plan 9.1). Hồ sơ cũ chưa có trường này dùng nhân vật mặc định.
  syncCharacter() {
    const key = this.data.character;
    CONFIG.selectCharacter(key && CONFIG.CHARACTERS[key] ? key : CONFIG.DEFAULT_CHARACTER);
    if (!CONFIG.CHARACTERS[CONFIG.selectedCharacter]) CONFIG.selectedCharacter = CONFIG.character().key;
  },
  apply(p) {
    if (p.LastReward && typeof p.LastReward.toMillis === 'function') this.lastRewardMs = p.LastReward.toMillis();
    const exp = p.EXP || 0;
    this.data = {
      ...p, nick: p.Nickname, cls: this.u.cls,
      level: this.levelOf(exp), xp: exp, gold: p.Golds || 0, crystals: p.Crystals || 0,
      equip: p.Equipment || {}, inventory: p.Enventory || [], progress: p.progress || {},
      character: p.Character || null,
      // Mốc đổi NGHỀ gần nhất (ms). Vừa ghi bằng serverTimestamp (chưa có giá trị thật) thì lấy giờ máy làm xấp xỉ.
      classChangedAt: p.ClassChangedAt ? (p.ClassChangedAt.toMillis ? p.ClassChangedAt.toMillis() : Date.now()) : 0,
      room: p.Room || null   // lớp dạng "6/5"; hồ sơ cũ chưa có thì null → main.js yêu cầu nhập một lần
    };
  },

  // ----- Phiếu thưởng xếp hạng (do trang admin tạo ở rewards/<UID>/vouchers/<id>) -----
  voucherCol() { return FirebaseService.db.collection('rewards').doc(this.uid).collection('vouchers'); },
  // 1 truy vấn nhỏ lúc đăng nhập: các phiếu chưa nhận.
  async pendingVouchers() {
    const snap = await this.voucherCol().where('Claimed', '==', false).limit(20).get();
    return snap.docs.map(d => ({ id: d.id, ...d.data() }));
  },
  // Nhận phiếu: cộng Gold + đánh dấu đã nhận trong cùng một transaction (Rules validClaim bắt buộc).
  async claimVoucher(id) {
    if (!FirebaseService.configured) throw new Error(FirebaseService.errorMessage);
    const pref = FirebaseService.getStudentRef(this.u.cls, this.u.name), vref = this.voucherCol().doc(id);
    const next = await FirebaseService.db.runTransaction(async t => {
      const [ps, vs] = await Promise.all([t.get(pref), t.get(vref)]);
      if (!ps.exists || !vs.exists) throw new Error('Không tìm thấy phiếu thưởng.');
      const cur = ps.data(), v = vs.data();
      if (cur.UID !== this.uid) throw new Error('Không thể xác minh hồ sơ học sinh.');
      if (v.Claimed) throw new Error('Phiếu này đã được nhận.');
      // Phiếu có thể gồm Gold, Crystal và/hoặc một trang bị (ItemId). Đã sở hữu trang bị thì không thêm lần nữa.
      const fields = { Golds: (cur.Golds || 0) + (v.Gold || 0), Crystals: (cur.Crystals || 0) + (v.Crystals || 0), LastClaim: id };
      const inv = Array.isArray(cur.Enventory) ? cur.Enventory : [];
      if (v.ItemId && !inv.includes(v.ItemId)) fields.Enventory = inv.concat([v.ItemId]);
      t.update(pref, fields);
      t.update(vref, { Claimed: true, ClaimedAt: firebase.firestore.FieldValue.serverTimestamp() });
      return { ...cur, ...fields };
    }).catch(e => {
      if (e.code === 'permission-denied') throw new Error('Máy chủ từ chối nhận phiếu (đã nhận rồi hoặc phiếu không hợp lệ).');
      throw e;
    });
    this.apply(next);
    return this.data;
  },

  // Đặt lớp cho hồ sơ cũ chưa có (Rules chỉ cho đặt MỘT lần, phải đúng khối).
  async setRoom(room) {
    const value = Auth.normalizeRoom(room);
    if (!Auth.roomIsValid(this.u.cls, value)) throw new Error(`Lớp cần có dạng ${this.u.cls}/số lớp, ví dụ ${this.u.cls}/5.`);
    await this.tx(cur => {
      if (cur.Room) throw new Error('Hồ sơ đã có lớp. Muốn đổi hãy nhờ giáo viên.');
      return { fields: { Room: value } };
    });
  },

  // ----- ràng buộc nghề (class) của trang bị: [RULES] classesOf()/classOfChar() trong firestore.rules -----
  classOfKey(key) { return { Archer: 'archer', Mage: 'mage', Warrior: 'warrior' }[CONFIG.classPrefix(key)] || null; },
  classKey() { return CONFIG.character().classKey; },
  usable(item, classKey) { return !item.classes.length || item.classes.includes(classKey || this.classKey()); },
  classLabel(item) { return item.classes.length ? item.classes.map(c => CONFIG.CLASS_NAMES[c] || c).join(' / ') : 'Mọi nghề'; },

  // ----- cấp độ & chỉ số (tính từ EXP, nhân vật đang chọn và trang bị; Firestore chỉ lưu LV và EXP) -----
  // EXP cần để ĐẠT cấp L: (L-1)*(2*XP_BASE + XP_STEP*(L-2))/2  (= 25*(L-1)*(L+2) với 100/50).
  expFor(level) { const G = this.G(); return level <= 1 ? 0 : (level - 1) * (2 * G.XP_BASE + G.XP_STEP * (level - 2)) / 2; },
  levelOf(exp) {
    const G = this.G(); let L = 1;
    while (L < G.MAX_LEVEL && this.expFor(L + 1) <= exp) L++;
    return L;
  },
  maxExp() { return this.expFor(this.G().MAX_LEVEL); },
  item(id) { return CONFIG.ITEMS.find(i => i.id === id); },
  stats() { const d = this.data; return this.statsOf(this.levelOf(d.xp), CONFIG.character().key, d.equip); },
  // Chỉ số của MỘT nhân vật bất kỳ (người chơi hiện tại hoặc bản chụp đối thủ Ranked): cấp + nhân vật + trang bị.
  // Trang bị chỉ cộng nếu đúng nghề của nhân vật đó (tránh nhầm hệ: đổi nghề thì bản chụp cũ vẫn tính đúng theo nghề lúc chụp).
  statsOf(level, charKey, equip) {
    const def = CONFIG.CHARACTERS[charKey] || CONFIG.character(), s = def.statsAt(level), classKey = def.classKey;
    Object.values(equip || {}).forEach(id => {
      const it = this.item(id);
      if (it && it.power && this.usable(it, classKey)) Object.entries(it.bonus).forEach(([k, v]) => { if (k in s) s[k] += Number(v) || 0; });
    });
    s.HP = Math.max(1, s.HP); s.ATK = Math.max(0, s.ATK); s.DEF = Math.max(0, s.DEF);
    s.CRIT = Math.max(0, Math.min(100, Math.round(s.CRIT * 10) / 10));
    return s;
  },
  // Bản chụp công khai cho Ranked (tên, cấp, nhân vật, trang bị đang mặc) — chỉ đọc từ hồ sơ đã có trong bộ nhớ, không tốn lượt đọc.
  snapshot() {
    const d = this.data;
    return { N: d.nick, Lv: this.levelOf(d.xp), Ch: CONFIG.character().key, Eq: { ...d.equip } };
  },
  renderHud() {
    const d = this.data, G = this.G(), maxed = d.level >= G.MAX_LEVEL;
    const need = G.XP_BASE + G.XP_STEP * (d.level - 1), inLv = maxed ? need : d.xp - this.expFor(d.level), hp = this.stats().HP;
    $('#hud-level').textContent = d.level;
    $('#hud-hp').textContent = `${hp} / ${hp}`;
    $('#hud-xp-bar').style.width = (inLv / need * 100) + '%';
    $('#hud-xp').textContent = maxed ? 'MAX' : `${inLv} / ${need} XP`;
  },
  // Điền thanh trên cùng (cấp, EXP, nghề, Gold, Crystal) của màn Cửa hàng/Trang bị; prefix = 'shop' | 'equip' | 'rank'.
  fillTopBar(prefix) {
    const d = this.data, G = this.G(), maxed = d.level >= G.MAX_LEVEL;
    const need = G.XP_BASE + G.XP_STEP * (d.level - 1), inLv = maxed ? need : d.xp - this.expFor(d.level);
    $(`#${prefix}-level`).textContent = d.level;
    $(`#${prefix}-xp-bar`).style.width = (inLv / need * 100) + '%';
    $(`#${prefix}-xp`).textContent = maxed ? 'MAX' : `${inLv} / ${need}`;
    $(`#${prefix}-class`).textContent = `${d.nick} · ${CONFIG.character().name}`;
    $(`#${prefix}-gold`).textContent = d.gold.toLocaleString('vi-VN');
    $(`#${prefix}-gem`).textContent = d.crystals.toLocaleString('vi-VN');
  },
  cooldownLeftMs() { return Math.max(0, this.lastRewardMs + (this.G().REWARD_COOLDOWN_SEC + 2) * 1000 - Date.now()); },

  // ----- ghi dữ liệu an toàn -----
  // rankRef (tùy chọn): bản ghi bảng xếp hạng ghi CÙNG transaction; build(cur, rankPrev) có thể trả thêm { rank }.
  // opts.skipRankRead = true: KHÔNG đọc lại bản ghi xếp hạng của mình trong transaction (dùng bản sao ở máy, xem Rank.ownEntry) → tiết kiệm 1 lượt đọc/lượt chơi.
  async tx(build, rankRef, opts = {}) {
    if (!FirebaseService.configured) throw new Error(FirebaseService.errorMessage);
    const ref = FirebaseService.getStudentRef(this.u.cls, this.u.name);
    const next = await FirebaseService.db.runTransaction(async t => {
      const snap = await t.get(ref);
      const rsnap = rankRef && !opts.skipRankRead ? await t.get(rankRef) : null;
      if (!snap.exists) throw new Error('Không tìm thấy hồ sơ học sinh.');
      const cur = snap.data();
      if (cur.UID !== this.uid) throw new Error('Không thể xác minh hồ sơ học sinh.');
      const { fields = {}, progress, rank } = build(cur, rsnap && rsnap.exists ? rsnap.data() : null);
      const args = [];
      Object.entries(fields).forEach(([k, v]) => args.push(k, v));
      if (progress) args.push(new firebase.firestore.FieldPath('progress', progress.id), progress.entry);
      t.update(ref, ...args);
      if (rank && rankRef) t.set(rankRef, rank);   // set (ghi đè cả bản ghi) để bỏ trường của phiên bản cũ
      const merged = { ...cur, ...fields };
      if ('LastReward' in fields) merged.LastReward = { toMillis: () => Date.now() };
      if (progress) merged.progress = { ...(cur.progress || {}), [progress.id]: progress.entry };
      return merged;
    }).catch(e => {
      if (e.code === 'permission-denied') {
        const denied = new Error('Máy chủ từ chối thao tác này (không hợp lệ hoặc thao tác quá nhanh). Hãy thử lại sau ít giây.');
        denied.denied = true;
        throw denied;
      }
      throw e;
    });
    this.apply(next);
    return this.data;
  },
  rankRef() {
    return FirebaseService.db.collection('leaderboards').doc(String(this.u.cls)).collection('entries').doc(this.uid);
  },

  // Kết thúc một lượt ải/dungeon: ghi tiến trình + thưởng bằng MỘT lần ghi (Plan mục 9.3).
  // level: stage/dungeon từ CONFIG.WORLDS (có .reward lấy từ world.json).
  // o: { correct, total, passed, kills, damagePct, hpRatio }  (damagePct = sát thương đã gây / HP một quái, 0..1; hpRatio = HP còn lại / HP tối đa)
  // Thưởng (Plan 13.4): thắng stage = base * (1 + 10% * quái hạ); dungeon = base * (1 + 5% * quái hạ);
  // thua / chưa vượt ải = base * max(10%, %sát thương gây cho quái). Crystal: xem CONFIG.GAME.CRYSTAL.
  // Bản ghi xếp hạng (leaderboards/<khối>/entries/<UID>) ghi cùng transaction; nếu Rules từ chối riêng phần xếp hạng
  // (ví dụ đồng hồ máy lệch tuần) thì lưu lại thưởng không kèm xếp hạng và đặt out.rankSkipped = true.
  async saveRun(level, o) {
    try {
      return await this.runSave(level, o, true);
    } catch (e) {
      if (!e.denied) throw e;
      // Bản sao điểm xếp hạng ở máy có thể lệch (chơi trên máy khác...): đọc lại bản ghi của mình 1 lần rồi thử lại trước khi bỏ qua xếp hạng.
      try { await Rank.ownEntry(true); return await this.runSave(level, o, true); } catch (e2) { if (!e2.denied) throw e2; }
      const out = await this.runSave(level, o, false);
      out.rankSkipped = true;
      return out;
    }
  },
  async runSave(level, o, withRank) {
    const G = this.G(), R = G.REWARD, dungeon = level.kind === 'dungeon';
    const out = { gold: 0, exp: 0, crystals: 0, levelUp: false, factor: 0, drop: null, rankSkipped: false };
    if (!Number.isInteger(o.kills) || o.kills < 0) throw new Error('Số quái vật bị hạ không hợp lệ.');
    const base = level.reward || { EXP: 0, GOLD: 0, drops: [] };
    const win = dungeon ? o.kills > 0 : o.passed;
    const factor = win
      ? 1 + o.kills * (dungeon ? G.KILL_BONUS.dungeon : G.KILL_BONUS.stage)
      : Math.max(G.MIN_LOSE_FACTOR, Math.min(1, o.damagePct || 0));
    const ratio = o.total ? o.correct / o.total : 0, C = G.CRYSTAL;
    let crystals = 0;
    if (!dungeon) {
      if (o.passed && (ratio > C.stage.minCorrectRatio || (o.hpRatio || 0) > C.stage.minHpRatio)) crystals = C.stage.amount;
    } else if (level.index === C.dungeon.index) {
      crystals = Math.min(C.dungeon.max, Math.floor(o.kills / C.dungeon.killsPerCrystal));
    }
    // Chỉ GHI bản ghi xếp hạng khi lượt này có thể đổi điểm tuần (thắng ải, hoặc hầm ngục hạ ≥ 1 quái). KHÔNG đọc lại bản ghi của mình:
    // lấy từ bản sao ở máy (Rank.ownEntry: 0 lượt đọc nếu đã có, 1 lượt đọc lần đầu). Kiểm tra top 10 làm ở Rank.afterRun, không tốn đọc/ghi.
    const needRank = withRank && Boolean(this.data.room) && (dungeon ? o.kills > 0 : Boolean(o.passed));
    const rankPrev = needRank ? (await Rank.ownEntry()).doc : null;
    await this.tx(cur => {
      const old = (cur.progress || {})[level.id] || { best: 0, passed: false, tries: 0 };
      const f = factor * (old.passed ? R.repeatFactor : 1);
      const gold = Math.min(R.maxGold, Math.floor(base.GOLD * f));
      const rawExp = Math.min(R.maxExp, Math.floor(base.EXP * f));
      const exp = Math.min(this.maxExp(), (cur.EXP || 0) + rawExp);
      out.factor = f; out.gold = gold; out.exp = exp - (cur.EXP || 0); out.drop = null; out.crystals = crystals;
      out.levelUp = this.levelOf(exp) > this.levelOf(cur.EXP || 0);
      const owned = cur.Enventory || [];
      if (win) { // tối đa 1 vật phẩm rơi mỗi lượt, chỉ rơi món chưa sở hữu
        for (const drop of base.drops || []) {
          if (!owned.includes(drop.itemId) && this.item(drop.itemId) && Math.random() < drop.chance) { out.drop = drop.itemId; break; }
        }
      }
      const pct = o.total ? Math.round(o.correct / o.total * 100) : 0;
      const entry = dungeon
        ? { best: Math.max(old.best, o.kills), passed: false, tries: old.tries + 1 }       // dungeon: best = số quái hạ nhiều nhất
        : { best: Math.max(old.best, pct), passed: old.passed || o.passed, tries: old.tries + 1 };
      const fields = { Golds: (cur.Golds || 0) + gold, EXP: exp, LV: this.levelOf(exp), LastReward: firebase.firestore.FieldValue.serverTimestamp() };
      if (crystals > 0) fields.Crystals = (cur.Crystals || 0) + crystals;
      if (out.drop) fields.Enventory = [...owned, out.drop];
      const result = { fields, progress: { id: level.id, entry } };
      if (needRank) {
        const rank = Rank.entry(rankPrev, { nick: cur.Nickname, room: cur.Room, lv: fields.LV, kind: dungeon ? 'dungeon' : 'stage', index: level.index, kills: o.kills, passedNow: !dungeon && o.passed });
        if (rank) { result.rank = rank; out.rank = rank; }
      }
      return result;
    }, needRank ? this.rankRef() : null, { skipRankRead: true });
    Rank.afterRun(out.rank);
    return out;
  },

  async buy(itemId) {
    const it = this.item(itemId);
    if (!it) throw new Error('Vật phẩm không tồn tại.');
    await this.tx(cur => {
      const inv = cur.Enventory || [];
      if (inv.includes(itemId)) throw new Error('Bạn đã sở hữu vật phẩm này.');
      if ((cur.Golds || 0) < it.price) throw new Error('Không đủ Gold.');
      if ((cur.Crystals || 0) < it.gemPrice) throw new Error('Không đủ Crystal.');
      return {
        fields: {
          Golds: cur.Golds - it.price,
          Crystals: cur.Crystals - it.gemPrice,
          Enventory: [...inv, itemId]
        }
      };
    });
  },
  async setEquip(slot, itemId) { // itemId = null để tháo
    if (!CONFIG.SLOTS.some(entry => entry.id === slot)) throw new Error('Ô trang bị không hợp lệ.');
    const item = itemId && this.item(itemId);
    if (itemId && (!item || item.slot !== slot)) throw new Error('Vật phẩm không phù hợp với ô trang bị này.');
    await this.tx(cur => {
      const cls = this.classOfKey(cur.Character || CONFIG.DEFAULT_CHARACTER);
      const eq = {};
      // dọn luôn trang bị sai nghề còn sót lại (Rules kiểm tra mọi ô khi đổi trang bị)
      Object.entries(cur.Equipment || {}).forEach(([s, id]) => { const it = this.item(id); if (it && this.usable(it, cls)) eq[s] = id; });
      if (itemId) {
        if (!(cur.Enventory || []).includes(itemId)) throw new Error('Bạn chưa sở hữu vật phẩm này.');
        if (!this.usable(item, cls)) throw new Error(`Vật phẩm này chỉ dành cho: ${this.classLabel(item)}.`);
        eq[slot] = itemId;
      } else delete eq[slot];
      return { fields: { Equipment: eq } };
    });
  },
  // Đổi nhân vật: lưu trường Character. Đổi NGHỀ (Archer/Mage/Warrior) thì tháo toàn bộ trang bị (ràng buộc class);
  // đổi giới tính trong cùng nghề giữ nguyên trang bị.
  async setCharacter(key) {
    if (!CONFIG.CHARACTERS[key]) throw new Error('Nhân vật không hợp lệ.');
    await this.tx(cur => {
      const before = cur.Character || CONFIG.DEFAULT_CHARACTER;
      const fields = { Character: key };
      if (CONFIG.classPrefix(before) !== CONFIG.classPrefix(key)) {
        // Đổi NGHỀ: tháo hết trang bị và chỉ được 1 lần / CLASS_CHANGE_HOURS giờ (Rules cũng kiểm tra bằng giờ máy chủ).
        const last = cur.ClassChangedAt && cur.ClassChangedAt.toMillis ? cur.ClassChangedAt.toMillis() : 0;
        const left = last + CONFIG.CLASS_CHANGE_HOURS * 3600 * 1000 - Date.now();
        if (left > 0) throw new Error(`Chưa thể đổi nghề. Hãy chờ thêm ${this.fmtLeft(left)}.`);
        fields.Equipment = {};
        fields.ClassChangedAt = firebase.firestore.FieldValue.serverTimestamp();
      }
      return { fields };
    });
    this.syncCharacter();
  },
  // Thời gian còn lại (ms) trước khi được đổi nghề lần nữa — tính ở trình duyệt từ mốc đã có trong hồ sơ, KHÔNG tốn lượt đọc.
  classCooldownLeft() { return Math.max(0, (this.data.classChangedAt || 0) + CONFIG.CLASS_CHANGE_HOURS * 3600 * 1000 - Date.now()); },
  fmtLeft(ms) {
    const s = Math.ceil(ms / 1000), h = Math.floor(s / 3600), m = Math.floor(s % 3600 / 60);
    return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
  },
  // Đổi nghề có làm mất trang bị không? (để hỏi xác nhận trước khi gọi setCharacter)
  classChangeResets(key) {
    return CONFIG.classPrefix(CONFIG.character().key) !== CONFIG.classPrefix(key) && Object.keys(this.data.equip).length > 0;
  }
};
