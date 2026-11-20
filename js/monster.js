// Lớp quái vật (OOP, giống Character của người chơi). Dữ liệu cụ thể vẫn ở assets/monsters/<key>/<key>.json;
// trường "Class" (Warrior / Archer / Mage) quyết định lớp con và kiểu đánh mặc định:
//   Warrior → cận chiến (lao tới, giữ ở khung cuối rồi lướt về — giống Chiến binh của người chơi); Archer/Mage → tầm xa (bắn skill).
// JSON có "attackStyle" ('melee' | 'ranged') thì ưu tiên hơn kiểu mặc định của lớp.
class Monster {
  constructor(data) {
    // giữ nguyên các trường JSON (key, name, stats, sprites, castSkill, flip, type, ANSWER_TIMEOUT_SEC...); riêng attackStyle là getter nên bỏ qua
    const { attackStyle, ...rest } = data || {};
    Object.assign(this, rest);
  }
  get classKey() { return 'monster'; }
  get defaultAttackStyle() { return 'melee'; }
  get attackStyle() { return this.attackStyle_ || this.defaultAttackStyle; }
  get ranged() { return this.attackStyle === 'ranged'; }
  get melee() { return !this.ranged; }

  // Chọn lớp con theo "Class"; thiếu/không rõ thì dùng lớp cơ sở (cận chiến).
  static create(data) {
    const cls = String((data && (data.Class || data.class)) || '').trim().split(/[_\s-]+/)[0].toLowerCase();
    const Kind = { warrior: WarriorMonster, archer: ArcherMonster, mage: MageMonster }[cls] || Monster;
    const m = new Kind(data);
    m.attackStyle_ = data && (data.attackStyle === 'ranged' || data.attackStyle === 'melee') ? data.attackStyle : null;
    return m;
  }
}
class WarriorMonster extends Monster {
  get classKey() { return 'warrior'; }
  get defaultAttackStyle() { return 'melee'; }
}
class ArcherMonster extends Monster {
  get classKey() { return 'archer'; }
  get defaultAttackStyle() { return 'ranged'; }
}
class MageMonster extends Monster {
  get classKey() { return 'mage'; }
  get defaultAttackStyle() { return 'ranged'; }
}
