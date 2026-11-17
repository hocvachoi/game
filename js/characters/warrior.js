// Chiến binh: cận chiến, không cần sprite/skill bắn đạn.
class Warrior extends Character {
  get classKey() { return 'warrior'; }
  get defaultAttackStyle() { return 'melee'; }
}
