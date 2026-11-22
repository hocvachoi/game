// HIỆU ỨNG TRANG BỊ (Giai đoạn 3). Mỗi trang bị trong assets/items/equipments.json có "effect": { "type": "...", "value": x }.
// type không phân biệt hoa/thường/ký tự lạ (Steal_Life = steallife). Nhiều trang bị cùng loại hiệu ứng thì CỘNG dồn value.
//   Blessing    Ban phước    hồi x% HP tối đa mỗi LƯỢT (mỗi câu trả lời, đúng hay sai)        [alias cũ: Recovery]
//   Steal_Life  Đoạt huyết   hồi HP = x% sát thương đã gây ra
//   Thorns      Gai góc      mỗi khi bị tấn công, gây x sát thương cố định cho kẻ địch
//   Ambush      Đột kích     sát thương CHÍ MẠNG tăng thêm x%  (chí mạng = ×2 → ×2×(1+x/100))
//   Holy_Shield Thánh thuẫn  x% (tối đa 100) sát thương nhận vào bằng 0
//   Sturdy      Cường tráng  giảm x% (tối đa 100) sát thương khi bị chí mạng
//   Smite       Trừng phạt   x% cơ hội gây thêm sát thương = 25% HP hiện tại của kẻ địch (tối đa 2000)
//   Berserk     Cuồng chiến  mỗi 10% HP đã mất tăng x% sát thương gây ra
//   Burn        Thiêu đốt    mỗi đòn tấn công tích 1 tầng (tối đa 10), mỗi tầng gây thêm x sát thương. Mất hết tầng khi chủ sở hữu bị tấn công bằng ĐÒN GỐC (người chơi: quái đánh trúng, kể cả bị Thánh thuẫn chặn;
//                quái: người chơi trả lời đúng) hoặc khi kẻ địch bị hạ. Sát thương cộng thêm (Gai góc, Trừng phạt, Thiêu đốt, chiêu cuối Boss) KHÔNG làm mất tầng. Hai bên cùng có Burn thì bộ đếm riêng, không chồng lên nhau.
//   Pierce      Xuyên giáp   bỏ qua x% DEF của kẻ địch (tối đa 100%) trước khi tính ATK × 400 / (400 + DEF)
// HIỆU ỨNG BỘ ĐỒ: assets/items/sets.json (CONFIG.SETS). Trang bị cùng bộ (trường "set" trong equipments.json, mặc định là phần trước dấu _ đầu tiên của id: warlord_sword → warlord);
//   đủ 2 / 4 món thì nhận hiệu ứng của mốc đó (cộng dồn các mốc đã đạt, và cộng dồn với hiệu ứng riêng từng món). Trang bị và mốc bộ đều có thể có nhiều hiệu ứng (mảng effect).
// CÔNG THỨC SÁT THƯƠNG ĐÒN GỐC (mọi chế độ): dmg = ATK × 400 / (400 + DEF) × bonus, làm tròn, tối thiểu 1 (trừ khi bị Thánh thuẫn/giảm 100%).
//   bonus = (1 + Tăng sát thương% + Cuồng chiến%) × (1 − Giảm sát thương%) × [chí mạng: 2 × (1 + Đột kích%) × (1 − Cường tráng%)]; Thánh thuẫn → đòn gốc = 0.
// THỨ TỰ TÍNH SÁT THƯƠNG: đòn gốc (ATK-DEF, Cuồng chiến, chí mạng + Đột kích) → rồi các hiệu ứng "gây thêm sát thương" (Trừng phạt, Thiêu đốt, Gai góc)
// được cộng SAU CÙNG: không bị DEF/chí mạng tác động. Ngược lại hiệu ứng GIẢM sát thương (Reduce DMG, Cường tráng, Thánh thuẫn) chỉ tác động lên đòn gốc nhận vào.
//   Reduce_DMG / Increase_DMG (cũ) giảm sát thương nhận vào / tăng sát thương gây ra x%.   "Lucky" (cũ): chưa có cơ chế.
// Dùng chung cho Phiêu lưu/Hầm ngục (Adventure), Ranked và Boss Raid (hàm Effects.* được gọi từ cả ba).
// QUÁI cũng có hiệu ứng: trường "effect" trong <key>.json ({type,value} hoặc mảng) — cùng bảng hiệu ứng, áp dụng cho quái làm chủ thể (mTotal/mHeal/...).
// Chữ nổi "Chí mạng" / "Đột kích" / "Thánh thuẫn" / "Hồi phục" hiện ngay tại nhân vật kích hoạt (Stage.popup).
const Effects = {
  SMITE_HP_RATIO: 0.25, SMITE_MAX: 2000,
  ALIAS: { recovery: 'blessing' },
  key(type) { const k = String(type || '').toLowerCase().replace(/[^a-z]/g, ''); return this.ALIAS[k] || k; },
  // Chuẩn hóa trường effect: {type,value} | [{type,value}, ...] | rỗng → mảng.
  list(effect) { return (Array.isArray(effect) ? effect : effect ? [effect] : []).filter(e => e && e.type); },
  // Mọi hiệu ứng người chơi đang có: từng trang bị đang mặc + hiệu ứng bộ đồ (CONFIG.SETS, mốc 2/4 món…).
  equipEffects() {
    const out = [], counts = {};
    Object.values((Player.data && Player.data.equip) || {}).forEach(id => {
      const it = id && Player.item(id);
      if (!it) return;
      out.push(...this.list(it.effect));
      if (it.set) counts[it.set] = (counts[it.set] || 0) + 1;
    });
    Object.entries(counts).forEach(([key, n]) => {
      const set = CONFIG.SETS && CONFIG.SETS[key];
      if (set) set.tiers.filter(t => n >= t.count).forEach(t => out.push(...t.effects));
    });
    return out;
  },
  // Tổng value của một hiệu ứng (trang bị + bộ đồ).
  total(name) {
    const want = this.key(name);
    return this.equipEffects().reduce((sum, e) => {
      const v = Number(e.value);
      return this.key(e.type) === want && Number.isFinite(v) ? sum + v : sum;
    }, 0);
  },
  // ----- Hiệu ứng của QUÁI: trường "effect" trong <key>.json, dạng {type, value} hoặc mảng [{type, value}, ...]; dùng chung bảng hiệu ứng với trang bị -----
  mTotal(mon, name) {
    if (!mon || !mon.effect) return 0;
    const want = this.key(name);
    return this.list(mon.effect).reduce((sum, e) => {
      const v = Number(e.value);
      return this.key(e.type) === want && Number.isFinite(v) ? sum + v : sum;
    }, 0);
  },
  mPct(mon, name) { return Math.min(100, Math.max(0, this.mTotal(mon, name))); },
  // Sát thương gốc trước bonus: ATK × 400 / (400 + DEF)
  core(atk, def) { return atk * 400 / (400 + Math.max(0, def)); },
  roll(percent) { return Math.random() * 100 < Math.min(100, percent); },
  pct(name) { return Math.min(100, Math.max(0, this.total(name))); },

  // Sát thương người chơi gây ra khi trả lời đúng. enemyHp = HP hiện tại của kẻ địch (cho Trừng phạt).
  // Trả về { damage (tổng), base (đòn gốc), crit, berserk (% cộng), extras: [{ key, name, amount }] }.
  attack(fight, enemyDef, enemyHp, mon) {
    const stats = fight.playerStats;
    const lostSteps = Math.floor((1 - fight.playerHp / fight.maxPlayerHp) * 10 + 1e-9);   // số bậc 10% HP đã mất
    const berserk = lostSteps * this.total('berserk');
    const boost = this.total('increasedmg') + berserk;
    const crit = this.roll(stats.CRIT), ambush = crit && this.total('ambush') > 0, sturdy = crit && this.mPct(mon, 'sturdy') > 0;
    let bonus = (1 + boost / 100) * (1 - this.mPct(mon, 'reducedmg') / 100);   // tăng/giảm sát thương (Giảm sát thương, Cường tráng, Thánh thuẫn của QUÁI)
    if (crit) bonus *= 2 * (1 + this.total('ambush') / 100) * (1 - this.mPct(mon, 'sturdy') / 100);
    let base = Math.max(bonus > 0 ? 1 : 0, Math.round(this.core(stats.ATK, enemyDef * (1 - this.pct('pierce') / 100)) * bonus));   // Xuyên giáp: bỏ qua x% DEF
    const blocked = this.roll(this.mPct(mon, 'holyshield'));
    if (blocked) base = 0;
    // Đòn gốc kết thúc → hiệu ứng gây thêm sát thương cộng dồn sau cùng (không bị giảm sát thương/chặn)
    const extras = [];
    let left = Math.max(0, enemyHp - base);
    if (left > 0 && this.roll(this.total('smite'))) {
      const amount = Math.min(this.SMITE_MAX, Math.round(left * this.SMITE_HP_RATIO));
      extras.push({ key: 'smite', name: 'Trừng phạt', amount }); left -= amount;
    }
    const burnX = this.total('burn');
    if (burnX > 0) {
      const stacks = fight.burnStacks = Math.min(CONFIG.BURN_MAX_STACKS, (fight.burnStacks || 0) + 1);
      extras.push({ key: 'burn', name: `Thiêu đốt ×${stacks}`, amount: Math.round(stacks * burnX) });
    }
    fight.mobBurn = 0;   // quái vừa bị tấn công bằng đòn gốc → quái mất hết tầng Thiêu đốt của nó
    return { damage: base + extras.reduce((sum, e) => sum + e.amount, 0), base, crit, ambush, blocked, sturdy, berserk, extras };
  },
  // Chuỗi mô tả cho thông báo chiến đấu, vd " (Cuồng chiến +25%, Trừng phạt +120, Thiêu đốt ×3 +30)".
  describe(atk) {
    const parts = [];
    if (atk.berserk) parts.push(`Cuồng chiến +${atk.berserk}%`);
    atk.extras.forEach(e => parts.push(`${e.name} +${e.amount}`));
    return parts.length ? ` (${parts.join(', ')})` : '';
  },
  // Hạ kẻ địch: các tầng Thiêu đốt reset.
  resetBurn(fight) { fight.burnStacks = 0; fight.mobBurn = 0; },
  // Sát thương người chơi NHẬN khi kẻ địch đánh: giáp giảm, chí mạng ×2 (Cường tráng giảm bớt), Thánh thuẫn chặn đòn gốc.
  // mon = quái (effect trong JSON: Tăng sát thương, Cuồng chiến, Đột kích, Trừng phạt, Thiêu đốt); ctx = { monsterHp, maxMonsterHp, playerHp, fight }.
  incoming(playerDef, enemyAtk, enemyCrit, mon, ctx) {
    const c = ctx || {};
    const lost = c.maxMonsterHp ? Math.floor((1 - c.monsterHp / c.maxMonsterHp) * 10 + 1e-9) : 0;
    const berserk = lost * this.mTotal(mon, 'berserk');
    const crit = this.roll(enemyCrit), ambush = crit && this.mTotal(mon, 'ambush') > 0, sturdy = crit && this.pct('sturdy') > 0;
    let bonus = (1 + (this.mTotal(mon, 'increasedmg') + berserk) / 100) * (1 - this.pct('reducedmg') / 100);
    if (crit) bonus *= 2 * (1 + this.mTotal(mon, 'ambush') / 100) * (1 - this.pct('sturdy') / 100);
    let base = Math.max(bonus > 0 ? 1 : 0, Math.round(this.core(enemyAtk, playerDef * (1 - this.mPct(mon, 'pierce') / 100)) * bonus));   // Xuyên giáp của quái
    const blocked = base > 0 && this.roll(this.pct('holyshield'));
    if (blocked) base = 0;
    const extras = [];
    if (this.roll(this.mTotal(mon, 'smite')) && (c.playerHp || 0) - base > 0) {
      extras.push({ key: 'smite', name: 'Trừng phạt', amount: Math.min(this.SMITE_MAX, Math.round((c.playerHp - base) * this.SMITE_HP_RATIO)) });
    }
    const burnX = this.mTotal(mon, 'burn');
    if (burnX > 0 && c.fight) {
      const stacks = c.fight.mobBurn = Math.min(CONFIG.BURN_MAX_STACKS, (c.fight.mobBurn || 0) + 1);
      extras.push({ key: 'burn', name: `Thiêu đốt ×${stacks}`, amount: Math.round(stacks * burnX) });
    }
    if (c.fight) c.fight.burnStacks = 0;   // người chơi vừa bị tấn công bằng đòn gốc → mất hết tầng Thiêu đốt của mình (kể cả khi đòn bị Thánh thuẫn chặn)
    return { damage: base + extras.reduce((sum, e) => sum + e.amount, 0), base, crit, ambush, blocked, sturdy, berserk, extras };
  },
  // Chữ nổi (Stage.popup) tại nhân vật KÍCH HOẠT hiệu ứng: Chí mạng / Đột kích ở bên tấn công, Thánh thuẫn ở bên bị đánh. who/foe = 'hero' | 'mob'.
  showAttack(res, who, foe) {
    if (!res) return;
    if (res.crit) Stage.popup(who, 'Chí mạng', 'crit');
    if (res.ambush) Stage.popup(who, 'Đột kích', 'ambush');
    if (res.blocked) Stage.popup(foe, 'Thánh thuẫn', 'shield');
    if (res.sturdy) Stage.popup(foe, 'Cường tráng', 'sturdy');
    if (res.berserk > 0) Stage.popup(who, 'Cuồng chiến', 'berserk');
    (res.extras || []).forEach(e => {   // hiệu ứng gây thêm sát thương (cộng sau cùng)
      if (e.key === 'smite') Stage.popup(who, 'Trừng phạt', 'smite');
      else if (e.key === 'burn') Stage.popup(who, e.name, 'burn');
    });
  },
  heal(fight, amount, label = 'Hồi phục', kind = 'heal') {
    if (fight.playerHp <= 0 || amount <= 0) return 0;
    const before = fight.playerHp;
    fight.playerHp = Math.min(fight.maxPlayerHp, fight.playerHp + Math.round(amount));
    Stage.playerHp(fight.playerHp / fight.maxPlayerHp, fight.playerHp, fight.maxPlayerHp);
    const healed = fight.playerHp - before;
    if (healed > 0) Stage.popup('hero', label, kind);
    return healed;
  },
  // Quái hồi HP (Ban phước / Đoạt huyết trong effect của quái): chỉ ở Phiêu lưu/Hầm ngục (HP quái riêng của người chơi), không áp dụng cho Boss Raid.
  mHeal(fight, amount, label = 'Hồi phục', kind = 'heal') {
    if (fight.monsterHp <= 0 || amount <= 0) return 0;
    const before = fight.monsterHp;
    fight.monsterHp = Math.min(fight.maxMonsterHp, fight.monsterHp + Math.round(amount));
    Stage.hp(fight.monsterHp / fight.maxMonsterHp, fight.monsterHp, fight.maxMonsterHp);
    const healed = fight.monsterHp - before;
    if (healed > 0) Stage.popup('mob', label, kind);
    return healed;
  },
  mBlessing(fight, mon) { const x = this.mTotal(mon, 'blessing'); return x > 0 ? this.mHeal(fight, Math.max(1, fight.maxMonsterHp * x / 100)) : 0; },
  mLifesteal(fight, mon, dealt) { const x = this.mTotal(mon, 'steallife'); return x > 0 && dealt > 0 ? this.mHeal(fight, Math.max(1, dealt * x / 100), 'Đoạt huyết', 'lifesteal') : 0; },
  mThorns(mon) { return Math.max(0, Math.round(this.mTotal(mon, 'thorns'))); },
  blessing(fight) { const x = this.total('blessing'); return x > 0 ? this.heal(fight, Math.max(1, fight.maxPlayerHp * x / 100)) : 0; },
  lifesteal(fight, dealt) { const x = this.total('steallife'); return x > 0 && dealt > 0 ? this.heal(fight, Math.max(1, dealt * x / 100), 'Đoạt huyết', 'lifesteal') : 0; },
  thorns() { return Math.max(0, Math.round(this.total('thorns'))); }
};
