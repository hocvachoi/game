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
//   Reduce_DMG / Increase_DMG (cũ) giảm sát thương nhận vào / tăng sát thương gây ra x%.   "Lucky" (cũ): chưa có cơ chế.
// Dùng chung cho Phiêu lưu/Hầm ngục (Adventure), Ranked và Boss Raid (hàm Effects.* được gọi từ cả ba).
const Effects = {
  SMITE_HP_RATIO: 0.25, SMITE_MAX: 2000,
  ALIAS: { recovery: 'blessing' },
  key(type) { const k = String(type || '').toLowerCase().replace(/[^a-z]/g, ''); return this.ALIAS[k] || k; },
  // Tổng value của một hiệu ứng trên mọi trang bị đang mặc.
  total(name) {
    const want = this.key(name);
    return Object.values((Player.data && Player.data.equip) || {}).reduce((sum, id) => {
      const e = id && Player.item(id) && Player.item(id).effect, v = Number(e && e.value);
      return e && this.key(e.type) === want && Number.isFinite(v) ? sum + v : sum;
    }, 0);
  },
  roll(percent) { return Math.random() * 100 < Math.min(100, percent); },
  pct(name) { return Math.min(100, Math.max(0, this.total(name))); },

  // Sát thương người chơi gây ra khi trả lời đúng. enemyHp = HP hiện tại của kẻ địch (cho Trừng phạt).
  attack(fight, enemyDef, enemyHp) {
    const stats = fight.playerStats;
    const lostSteps = Math.floor((1 - fight.playerHp / fight.maxPlayerHp) * 10 + 1e-9);   // số bậc 10% HP đã mất
    const boost = this.total('increasedmg') + lostSteps * this.total('berserk');
    let damage = Math.max(1, Math.round(Math.max(1, stats.ATK - enemyDef) * (1 + boost / 100)));
    const crit = this.roll(stats.CRIT);
    if (crit) damage = Math.round(damage * 2 * (1 + this.total('ambush') / 100));
    let smite = 0;
    if (enemyHp > 0 && this.roll(this.total('smite'))) smite = Math.min(this.SMITE_MAX, Math.round(enemyHp * this.SMITE_HP_RATIO));
    return { damage: damage + smite, crit, smite, berserk: lostSteps * this.total('berserk') };
  },
  // Sát thương người chơi NHẬN khi kẻ địch đánh: giáp giảm, chí mạng ×2 (Cường tráng giảm bớt), Thánh thuẫn chặn hoàn toàn.
  incoming(playerDef, enemyAtk, enemyCrit) {
    const base = Math.max(1, enemyAtk - playerDef);
    let damage = Math.max(0, Math.round(base * (1 - this.pct('reducedmg') / 100)));
    const crit = this.roll(enemyCrit);
    if (crit) damage = Math.round(damage * 2 * (1 - this.pct('sturdy') / 100));
    const blocked = damage > 0 && this.roll(this.pct('holyshield'));
    if (blocked) damage = 0;
    return { damage, crit, blocked };
  },
  heal(fight, amount) {
    if (fight.playerHp <= 0 || amount <= 0) return 0;
    const before = fight.playerHp;
    fight.playerHp = Math.min(fight.maxPlayerHp, fight.playerHp + Math.round(amount));
    Stage.playerHp(fight.playerHp / fight.maxPlayerHp, fight.playerHp, fight.maxPlayerHp);
    return fight.playerHp - before;
  },
  blessing(fight) { const x = this.total('blessing'); return x > 0 ? this.heal(fight, Math.max(1, fight.maxPlayerHp * x / 100)) : 0; },
  lifesteal(fight, dealt) { const x = this.total('steallife'); return x > 0 && dealt > 0 ? this.heal(fight, Math.max(1, dealt * x / 100)) : 0; },
  thorns() { return Math.max(0, Math.round(this.total('thorns'))); }
};
