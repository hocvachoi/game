// Chế độ Phiêu lưu (V3): Stage = hạ quái + làm HẾT câu hỏi trong file Excel; Dungeon = đánh quái vô tận đến khi hết HP.
// Quy tắc theo Plan mục 13.4–13.5; hằng số gameplay chung ở CONFIG.GAME (js/config.js).
const Adventure = {
  PASS_RATIO: 0.7,   // Plan 13.5: Stage hoàn thành khi hạ ≥ 1 quái và đúng ≥ 70% số câu
  raid: null, level: null, world: null, monster: null, monsterPool: [], all: [], active: false, combat: null,
  quizCtl: null, timer: null, floor: 1, startFloor: 1, monsterStats: null, madness: false,
  // ----- Chống gian lận: che câu hỏi khi người chơi rời trang (đổi tab, bấm ô địa chỉ, chuyển cửa sổ để hỏi AI...). -----
  // Đồng hồ và quái VẪN chạy khi bị che (không thể "tạm dừng" để tra cứu). Chỉ là rào cản cơ bản, không chặn được chụp màn hình/thiết bị khác.
  guard: {
    mute: false, away: false, count: 0, bound: false,
    bind() {
      if (this.bound) return;
      this.bound = true;
      document.addEventListener('visibilitychange', () => { if (document.hidden) this.cover(); });
      window.addEventListener('blur', () => this.cover());
      $('#quiz-shield-btn').onclick = () => { if (document.hasFocus() && !document.hidden) this.uncover(); };
    },
    cover() {
      if (!Adventure.active || this.mute) return;
      if (!this.away) { this.away = true; this.count++; }
      $('#quiz').classList.add('is-covered');
      $('#quiz-shield').hidden = false;
      $('#quiz-shield-count').textContent = `Số lần rời trang trong lượt này: ${this.count}`;
    },
    uncover() { this.away = false; $('#quiz').classList.remove('is-covered'); $('#quiz-shield').hidden = true; },
    reset() { this.count = 0; this.uncover(); }
  },
  isDungeon() { return Boolean(this.level && this.level.kind === 'dungeon'); },
  // Hầm ngục theo tầng: nhãn "Tầng N" và nút "Thoát hầm ngục" chỉ hiện khi đang chơi hầm ngục.
  syncDungeonUi() {
    const on = this.active && this.isDungeon();
    $('#floor-badge').hidden = !on; $('#dungeon-exit').hidden = !on;
    if (on) $('#floor-badge').textContent = `Tầng ${this.floor}`;
  },
  // Thoát hầm ngục: kết thúc lượt, các tầng đã vượt vẫn được tính thưởng/kỷ lục.
  exitDungeon() {
    if (!this.active || !this.isDungeon() || !this.quizCtl) return;
    this.quizCtl.end({ exited: true });
  },

  async start(lv, world) {
    this.raid = null;   // chế độ Boss Raid (games/boss-battle.js) tự gán lại khi vào trận
    this.world = world || WorldMap.world;
    setMsg('Đang tải câu hỏi…');
    try {
      const r = await fetch(lv.file);
      if (!r.ok) throw new Error(r.status);
      this.begin(lv, await r.arrayBuffer());
    } catch (e) {
      setMsg('Không đọc được ' + lv.file + '. Nếu bạn mở trực tiếp file index.html, hãy chạy máy chủ cục bộ (xem README). Nếu lỗi vẫn còn, hãy báo giáo viên/admin kiểm tra file câu hỏi.', true);
    }
  },
  begin(lv, buf) {
    let all;
    try {
      all = Quiz.parse(buf);
    } catch (e) {
      console.error('Unable to parse question bank:', e);
      setMsg('Không thể đọc cấu trúc file Excel câu hỏi. Hãy kiểm tra file theo mẫu hiện có.', true);
      return;
    }
    if (!all.length) { setMsg('File Excel không có câu hỏi hợp lệ.', true); return; }
    if (!this.world) this.world = WorldMap.world;
    this.level = lv; this.all = all; setMsg('');
    this.monsterPool = this.isDungeon()
      ? StageMonster.poolFor(this.world, lv)
      : [StageMonster.forStage(this.world, lv.key ? lv : { key: '' })];
    this.run();
  },
  pickMonster() { return this.isDungeon() ? StageMonster.forFloor(this.monsterPool, this.floor, this.level.index) : this.monsterPool[Math.floor(Math.random() * this.monsterPool.length)]; },

  run() {
    this.teardown();
    const qs = Quiz.pick(this.all, this.all.length), box = document.getElementById('quiz');   // làm hết mọi câu trong file
    document.getElementById('hud-nick').textContent = Player.data.nick; Player.renderHud();
    this.active = true;
    this.guard.bind(); this.guard.reset();
    show('screen-game');
    // Hầm ngục: đã vượt tầng N thì vào lại từ tầng N-5, xem CONFIG.dungeonStartFloor
    if (this.isDungeon()) this.floor = this.startFloor = CONFIG.dungeonStartFloor(((Player.data.progress || {})[this.level.id] || {}).best || 0);
    this.monster = this.pickMonster();
    this.prepareFloorMonster();
    this.syncDungeonUi();
    // nền theo từng ải (file Excel chọn từ máy dùng nền của ải đầu thế giới)
    Stage.init({ background: this.level.background || this.world.stages[0].background, monster: this.monster, character: CONFIG.selectedCharacter, madness: this.madness });
    Stage.reset();
    this.beginCombat();
    Story.pendingEnd = null;
    const startQuiz = () => {
      if (!this.active) return;
      this.quizCtl = Quiz.run(qs, box, {
        loop: this.isDungeon(),
        begin: (index, head) => this.startTimer(head),
        tools: ctx => this.buildTools(ctx),
        result: (ok, sofar, total) => this.resolveAnswer(ok, sofar, total),
        finish: res => this.finish(res, box)
      });
    };
    // Cốt truyện: ải (không phải Hầm ngục) phát hội thoại start_stage trước câu hỏi đầu tiên; đồng hồ chỉ chạy sau khi xong/bỏ qua.
    if (this.isDungeon()) startQuiz();
    else { box.replaceChildren(); Story.play(this.world, this.level, 'start_stage', startQuiz); }
  },
  // Dừng đồng hồ/hẹn giờ của lượt trước (khi chơi lại hoặc rời ải).
  teardown() {
    Story.close();
    this.stopTimer();
    clearTimeout(Stage.respawnTimer); Stage.respawnTimer = null;
  },
  abort() {
    this.active = false; this.teardown(); this.guard.reset(); this.monsterStats = null; this.madness = false; this.syncDungeonUi();
    Player.flushSpend().catch(() => { /* còn nợ Crystal trong trình duyệt: sẽ đồng bộ ở lần lưu/đăng nhập sau */ });
  },
  // Thanh công cụ trên câu hỏi (chỉ Phiêu lưu/Hầm ngục): 💡 Gợi ý 1 đáp án và ❤ Hồi HP, mỗi loại 1 lần mỗi câu, COST Crystal mỗi lần; Phiêu lưu giới hạn PER_STAGE lần mỗi loại mỗi lượt.
  buildTools(ctx) {
    const fight = this.combat, kind = this.level && this.level.kind;
    if (!this.active || !fight || fight.finished || (kind !== 'stage' && kind !== 'dungeon')) return null;
    const T = CONFIG.GAME.TOOLS, dungeon = kind === 'dungeon', state = { hint: false, heal: false };
    const bar = el('div', 'qtools'), bal = el('span', 'qtools-bal'), hintBtn = el('button', 'btn ghost qtool'), healBtn = el('button', 'btn ghost qtool');
    hintBtn.type = healBtn.type = 'button';
    const left = key => dungeon ? '∞' : Math.max(0, T.PER_STAGE - (fight[key] || 0));
    const refresh = () => {
      const gems = Player.data.crystals, done = ctx.isDone();
      bal.textContent = `💎 ${gems}`;
      hintBtn.textContent = `💡 Gợi ý · ${left('hints')} lượt`;
      healBtn.textContent = `❤ Hồi ${T.HEAL_PCT}% HP · ${left('heals')} lượt`;
      hintBtn.title = `Hiện 1 đáp án đúng — ${T.COST} Crystal (mỗi câu 1 lần)`;
      healBtn.title = `Hồi ${T.HEAL_PCT}% HP tối đa — ${T.COST} Crystal (mỗi câu 1 lần)`;
      hintBtn.disabled = done || state.hint || gems < T.COST || (!dungeon && (fight.hints || 0) >= T.PER_STAGE);
      healBtn.disabled = done || state.heal || gems < T.COST || (!dungeon && (fight.heals || 0) >= T.PER_STAGE) || fight.playerHp >= fight.maxPlayerHp || fight.playerHp <= 0;
    };
    hintBtn.onclick = () => {
      if (ctx.isDone() || state.hint || fight.finished) return;
      if (!ctx.view.hint()) { this.note('Không còn đáp án nào để gợi ý.'); return; }
      this.spendCrystal(fight, 'hints'); state.hint = true; refresh();
    };
    healBtn.onclick = () => {
      if (ctx.isDone() || state.heal || fight.finished) return;
      const healed = Effects.heal(fight, Math.max(1, fight.maxPlayerHp * T.HEAL_PCT / 100));
      if (healed <= 0) return;   // HP đã đầy: không trừ Crystal
      this.note(`Hồi ${healed} HP (${T.COST} Crystal).`);
      this.spendCrystal(fight, 'heals'); state.heal = true; refresh();
    };
    bar.append(hintBtn, healBtn, bal); refresh();
    return bar;
  },
  spendCrystal(fight, key) {
    const cost = CONFIG.GAME.TOOLS.COST;
    Player.addSpend(cost);   // lưu trình duyệt ngay; Firestore trừ khi kết thúc lượt (runSave) hoặc lần đăng nhập sau
    fight.spent = (fight.spent || 0) + cost; fight[key] = (fight[key] || 0) + 1;
  },

  // Chỉ số HIỆU DỤNG của quái (hầm ngục: đã qua cân bằng theo tầng + Điên loạn, xem prepareFloorMonster); các chế độ khác dùng chỉ số gốc trong JSON.
  monsterStat(name) {
    const stats = this.monsterStats || (this.monster && this.monster.stats);
    return Number(stats && stats[name]) || 0;
  },
  // Hầm ngục: tính chỉ số quái của tầng hiện tại. Cân bằng: HP/ATK/DEF × CONFIG.dungeonScale(tầng), CRIT giữ nguyên; rồi Điên loạn (tầng bội số 10: 100%, tầng khác 10%):
  // HP/ATK/DEF ×2 và CRIT +10 (cộng sau cân bằng).
  prepareFloorMonster() {
    if (!this.isDungeon()) { this.monsterStats = null; this.madness = false; return; }
    const D = CONFIG.GAME.DUNGEON, M = D.MADNESS, base = this.monster.stats || {}, scale = CONFIG.dungeonScale(this.floor);
    this.madness = this.floor % M.EVERY === 0 || Math.random() < M.CHANCE;
    const mult = scale * (this.madness ? M.MULT : 1);
    this.monsterStats = {
      HP: Math.max(1, Math.round((base.HP || 0) * mult)), ATK: Math.round((base.ATK || 0) * mult), DEF: Math.round((base.DEF || 0) * mult),
      CRIT: (base.CRIT || 0) + (this.madness ? M.CRIT_BONUS : 0)
    };
  },
  // Hầm ngục: mỗi quái bị hạ roll vật phẩm (tỉ lệ gốc trong world.json × hệ số tầng); vật phẩm gom trong fight.drops, ghi MỘT lần khi kết thúc lượt.
  rollDrop(fight) {
    const scale = CONFIG.dungeonScale(this.floor);
    for (const drop of (this.level.reward && this.level.reward.drops) || []) {
      const have = Player.count(drop.itemId) + (fight.dropCounts[drop.itemId] || 0), item = Player.item(drop.itemId);
      if (!item || have >= CONFIG.STACK_MAX) continue;
      if (Math.random() < drop.chance * scale) {
        fight.drops.push(drop.itemId); fight.dropCounts[drop.itemId] = (fight.dropCounts[drop.itemId] || 0) + 1;
        this.note(`Nhặt được: ${item.name}!`);
        break;   // tối đa 1 món mỗi quái
      }
    }
  },
  beginCombat() {
    const stats = Player.stats(), maxMonsterHp = Math.max(1, this.monsterStat('HP'));
    const maxPlayerHp = Math.max(1, stats.HP);
    this.combat = {
      playerStats: stats, maxPlayerHp, playerHp: maxPlayerHp,
      monster: this.monster, maxMonsterHp, monsterHp: maxMonsterHp,
      monsterKills: 0, damageDealt: 0, finished: false, drops: [], dropCounts: {}, madnessKills: 0, hints: 0, heals: 0, spent: 0
    };
    Stage.playerHp(1, maxPlayerHp, maxPlayerHp);
    Stage.hp(1, maxMonsterHp, maxMonsterHp);
  },
  equipmentEffect(type) { return Effects.total(type); },   // tổng value hiệu ứng trên trang bị đang mặc (xem js/effects.js)
  roll(chancePercent) { return Math.random() * 100 < chancePercent; },   // CRIT: tỉ lệ % → nhân đôi sát thương
  note(text) {   // thông báo chiến đấu ngắn dưới phần phản hồi đáp án
    const fb = document.querySelector('#quiz .fb');
    if (fb && text) fb.append(el('div', 'combat-note', text));
  },

  // Quái đánh người chơi: sát thương = max(1, ATK - DEF), giảm theo giáp, CRIT nhân đôi, Cường tráng/Thánh thuẫn (js/effects.js).
  monsterHit(fight, apply = true) {
    const hit = Effects.incoming(fight.playerStats.DEF, this.monsterStat('ATK'), this.monsterStat('CRIT'), this.monster,
      { monsterHp: fight.monsterHp, maxMonsterHp: fight.maxMonsterHp, playerHp: fight.playerHp, fight });
    if (apply) this.applyMonsterHit(fight, hit);
    return hit;
  },
  applyMonsterHit(fight, hit) {
    fight.playerHp = Math.max(0, fight.playerHp - hit.damage);
    Stage.playerHp(fight.playerHp / fight.maxPlayerHp, fight.playerHp, fight.maxPlayerHp);
    if (!this.raid && hit.damage > 0) {   // Đoạt huyết của quái (effect trong JSON)
      const stolen = Effects.mLifesteal(fight, this.monster, hit.damage);
      if (stolen > 0) this.note(`${this.monster.name} hồi ${stolen} HP (Đoạt huyết).`);
    }
  },
  // Gai góc của QUÁI: người chơi vừa gây sát thương mà quái còn sống → bị phản x sát thương. Trả về true nếu người chơi gục. Không áp dụng cho Raid/Ranked.
  monsterThorns(fight) {
    const t = this.raid || (this.level && this.level.kind === 'ranked') ? 0 : Effects.mThorns(this.monster);
    if (t <= 0 || fight.finished || fight.playerHp <= 0) return false;
    fight.playerHp = Math.max(0, fight.playerHp - t);
    Stage.playerHp(fight.playerHp / fight.maxPlayerHp, fight.playerHp, fight.maxPlayerHp);
    this.note(`${this.monster.name} phản đòn (Gai góc): -${t} HP.`);
    Stage.popup('mob', 'Gai góc', 'thorns');
    if (fight.playerHp > 0) return false;
    fight.finished = true; this.stopTimer(); Stage.playerDefeat();
    this.quizCtl.end({ playerDefeated: true });
    return true;
  },
  // Quái bị hạ (đòn thường hoặc Gai góc): tính kill, hiệu ứng ngã, rồi hồi sinh/quái mới sau 650ms.
  killMonster(fight) {
    fight.monsterKills++;
    Effects.resetBurn(fight);
    if (this.isDungeon()) {
      if (this.madness) { fight.madnessKills++; this.note(`Hạ quái Điên loạn: +${CONFIG.GAME.DUNGEON.MADNESS.CRYSTALS} Crystal!`); }
      this.rollDrop(fight);
    }
    Stage.hp(0, 0, fight.maxMonsterHp);
    Stage.defeat();
    // Giãn cách KILL_GAP_MS (2s) giữa hai quái ở Phiêu lưu/Hầm ngục: quái mới xuất hiện sau khoảng này, câu hỏi kế tiếp cũng chờ hết khoảng này (xem killGap).
    const gap = CONFIG.GAME.KILL_GAP_MS;
    fight.gapUntil = Date.now() + gap;
    Stage.respawnTimer = setTimeout(() => {
      Stage.respawnTimer = null;
      if (this.active && this.combat === fight && !fight.finished) this.spawnNext(fight);
    }, gap);
  },
  // Chờ hết khoảng giãn cách sau khi quái bị hạ (nếu có) rồi mới cho hiện câu hỏi tiếp theo.
  killGap(fight) {
    const wait = (fight.gapUntil || 0) - Date.now();
    return wait > 0 ? new Promise(resolve => setTimeout(resolve, wait)) : Promise.resolve();
  },
  // Gai góc: khi người chơi bị tấn công, gây sát thương cố định lên kẻ địch. Raid: cộng vào sát thương Boss; Ranked: có thể thắng ngay.
  applyThorns(fight) {
    const t = Effects.thorns();
    if (t <= 0 || fight.finished || fight.playerHp <= 0) return 0;
    if (this.raid) return this.raid.thorns(fight, t);
    if (fight.monsterHp <= 0) return 0;
    const dealt = Math.min(t, fight.monsterHp);
    fight.damageDealt += dealt; fight.monsterHp -= dealt;
    this.note(`Gai góc phản ${dealt} sát thương.`);
    Stage.popup('hero', 'Gai góc', 'thorns');
    if (fight.monsterHp > 0) { Stage.hp(fight.monsterHp / fight.maxMonsterHp, fight.monsterHp, fight.maxMonsterHp); return dealt; }
    if (this.level && this.level.kind === 'ranked') Ranked.thornWin(fight);
    else this.killMonster(fight);
    return dealt;
  },
  // Cuối mỗi LƯỢT (một câu trả lời): Ban phước hồi HP.
  afterTurn(fight) {
    if (fight.finished || fight.downed) return;
    const healed = Effects.blessing(fight);
    if (healed > 0) this.note(`Ban phước: hồi ${healed} HP.`);
    if (!this.raid && !(this.level && this.level.kind === 'ranked') && fight.monsterHp > 0) {   // Ban phước của quái
      const mh = Effects.mBlessing(fight, this.monster);
      if (mh > 0) this.note(`${this.monster.name} hồi ${mh} HP (Ban phước).`);
    }
  },
  // Quái hồi sinh / xuất hiện quái mới (Dungeon chọn ngẫu nhiên trong danh sách của dungeon).
  spawnNext(fight) {
    if (this.isDungeon()) {
      this.floor = this.startFloor + fight.monsterKills;   // hạ quái = vượt tầng, lên tầng kế
      this.syncDungeonUi();
      this.monster = fight.monster = this.pickMonster();
      this.prepareFloorMonster();
      Stage.setMonster(this.monster, this.madness);
    } else {
      Stage.respawn();
    }
    fight.maxMonsterHp = Math.max(1, this.monsterStat('HP'));
    fight.monsterHp = fight.maxMonsterHp;
    Stage.hp(1, fight.monsterHp, fight.maxMonsterHp);
  },

  resolveAnswer(correct, sofar, total) {
    this.stopTimer();
    const fight = this.combat;
    if (!fight || fight.finished) return true;
    // Câu hỏi hiện ngay khi quái vừa bị hạ (không chờ). Hiếm khi trả lời trước khi quái mới xuất hiện (chỉ khi dùng công cụ): đòn chờ quái mới ra rồi mới tính.
    if (fight.monsterHp <= 0 && (fight.gapUntil || 0) > Date.now()) return this.killGap(fight).then(() => this.resolveAnswer(correct, sofar, total));
    let damage = 0, crit = false, hit = null, atk = null;
    if (correct) {
      atk = Effects.attack(fight, this.monsterStat('DEF'), fight.monsterHp, this.monster);
      damage = atk.damage; crit = atk.crit;
    } else hit = this.monsterHit(fight, false);
    const impact = Stage.fx(correct, sofar, total, () => {
      if (!this.active || this.combat !== fight || fight.finished) return;
      Effects.showAttack(correct ? atk : hit, correct ? 'hero' : 'mob', correct ? 'mob' : 'hero');   // chữ nổi Chí mạng / Đột kích / Thánh thuẫn
      if (correct) {
        const actualDamage = Math.min(damage, fight.monsterHp);
        fight.damageDealt += actualDamage;
        fight.monsterHp = Math.max(0, fight.monsterHp - damage);
        this.note(`${crit ? 'CHÍ MẠNG! ' : ''}Bạn gây ${damage} sát thương${Effects.describe(atk)}.`);
        const stolen = Effects.lifesteal(fight, actualDamage);
        if (stolen > 0) this.note(`Đoạt huyết: hồi ${stolen} HP.`);
        if (fight.monsterHp === 0) this.killMonster(fight);
        else {
          Stage.hp(fight.monsterHp / fight.maxMonsterHp, fight.monsterHp, fight.maxMonsterHp);
          if (this.monsterThorns(fight)) return;
        }
        this.afterTurn(fight);
        return;
      }
      this.applyMonsterHit(fight, hit);
      const action = this.afterMonsterHit(fight, hit, 'trả lời sai');
      if (action === true) { this.quizCtl.end({ playerDefeated: true }); return; }
      this.applyThorns(fight);
      this.afterTurn(fight);
    });
    if (correct) return impact;
    if (this.raid && fight.playerHp <= hit.damage) {
      const reviveMs = this.raid.R().REVIVE_SEC * 1000;
      return impact.then(() => new Promise(resolve => setTimeout(resolve, reviveMs)));
    }
    return impact;
  },
  afterMonsterHit(fight, hit, reason) {
    this.note(hit.blocked && hit.damage === 0 ? `${this.monster.name} tấn công vì ${reason}: Thánh thuẫn chặn hoàn toàn!`
      : `${this.monster.name} tấn công vì ${reason}: ${hit.crit ? 'CHÍ MẠNG! ' : ''}-${hit.damage} HP${Effects.describe(hit)}.`);
    if (fight.playerHp === 0 && this.raid) return this.raid.down(fight);   // Raid: hồi sinh sau 10s thay vì kết thúc lượt
    if (fight.playerHp === 0) {
      fight.finished = true;
      Stage.playerDefeat();
      return true;
    }
    return false;
  },

  // ----- đồng hồ: quá ANSWER_TIMEOUT_SEC của QUÁI (monster.json; mặc định CONFIG.GAME.ANSWER_TIMEOUT_SEC) giây
  // chưa trả lời thì quái tấn công (lặp lại theo chu kỳ). Quái nhanh hơn = tấn công dồn dập hơn. -----
  startTimer(head) {
    this.stopTimer();
    const limit = StageMonster.attackInterval(this.monster), label = el('span', 'qtimer');
    let left = limit;
    head.append(label);
    const draw = () => { label.textContent = `⏱ ${left}s`; label.classList.toggle('is-low', left <= 5); };
    draw();
    this.timer = setInterval(() => {
      if (!this.active || !label.isConnected) return this.stopTimer();
      left--;
      if (left <= 0) {
        left = limit;
        if (this.timeoutStrike(label)) return;
      }
      draw();
    }, 1000);
  },
  // Kết quả thưởng lượt chơi: biểu tượng Gold / Crystal / trang bị + số lượng (chữ to, xem CSS .reward-*).
  rewardView(r) {
    const view = el('div', 'reward-view'), row = el('div', 'reward-list');
    const ico = src => { const i = new Image(); i.alt = ''; i.src = src; i.className = 'reward-ico'; return i; };
    const chip = (icon, text, cls) => { const c = el('span', 'reward-chip' + (cls ? ' ' + cls : '')); if (icon) c.append(icon); c.append(el('b', '', text)); return c; };
    row.append(chip(ico('assets/ui/gold.png'), `+${Number(r.gold || 0).toLocaleString('vi-VN')} Gold`));
    row.append(chip(null, `+${Number(r.exp || 0).toLocaleString('vi-VN')} EXP`, 'is-exp'));
    if (r.crystals) row.append(chip(ico('assets/ui/crystal.png'), `+${r.crystals} Crystal`));
    for (const id of r.drops || []) {
      const it = Player.item(id);
      if (!it) continue;
      const c = el('span', 'reward-chip is-item'); c.append(Inventory.icon(it), el('b', '', it.name)); row.append(c);
    }
    view.append(row);
    view.append(el('span', 'reward-note', `(${Math.round((r.factor || 0) * 100)}% thưởng)`));
    if (r.levelUp) view.append(el('span', 'reward-levelup', `LÊN CẤP ${Player.data.level}!`));
    if (r.rankSkipped) view.append(el('span', 'reward-note', 'Chưa cập nhật bảng xếp hạng — hãy kiểm tra đồng hồ thiết bị.'));
    return view;
  },
  stopTimer() { clearInterval(this.timer); this.timer = null; },
  timeoutStrike(label) {   // trả về true nếu người chơi bị hạ gục
    const fight = this.combat;
    if (!fight || fight.finished) return true;
    if (fight.downed) return false;   // Raid: đang chờ hồi sinh, Boss không đánh thêm
    const hit = this.monsterHit(fight, false);
    Stage.fx(false, 0, 0, () => {
      if (!this.active || this.combat !== fight || fight.finished || fight.downed) return;
      Effects.showAttack(hit, 'mob', 'hero');
      this.applyMonsterHit(fight, hit);
      label.textContent = `⏱ Hết giờ! ${this.monster.name} đánh ${hit.blocked ? '— bị Thánh thuẫn chặn' : `-${hit.damage} HP${hit.crit ? ' (CHÍ MẠNG)' : ''}`}`;
      if (fight.playerHp === 0 && this.raid) { this.raid.down(fight); return; }
      if (fight.playerHp === 0) {
        fight.finished = true;
        this.stopTimer();
        Stage.playerDefeat();
        this.quizCtl.end({ playerDefeated: true });
        return;
      }
      this.applyThorns(fight);
      this.afterTurn(fight);
    });
    return false;
  },

  async finish(res, box) {
    this.stopTimer();
    this.active = false;
    this.guard.uncover();   // màn kết quả không cần che
    $('#dungeon-exit').hidden = true; $('#floor-badge').hidden = true;
    document.getElementById('screen-game').classList.remove('is-madness');
    const fight = this.combat, dungeon = this.isDungeon();
    if (fight) fight.finished = true;
    clearTimeout(Stage.respawnTimer);
    Stage.respawnTimer = null;
    const kills = fight ? fight.monsterKills : 0;
    const topFloor = dungeon && kills > 0 ? this.startFloor + kills - 1 : 0;   // tầng cao nhất vượt được trong lượt này
    const defeated = Boolean(res.playerDefeated || (fight && fight.playerHp <= 0));
    const ratio = res.total ? res.correct / res.total : 0;
    const passed = !dungeon && !defeated && kills > 0 && ratio >= this.PASS_RATIO;
    const damagePct = fight ? Math.min(1, fight.damageDealt / fight.maxMonsterHp) : 0;
    const div = el('div', 'result'), status = el('div', 'save-status', 'Đang lưu kết quả…');
    const again = el('button', 'btn', 'Chơi lại'), back = el('button', 'btn ghost', 'Về bản đồ');
    again.onclick = () => this.run(); back.onclick = () => renderLevels();
    Story.pendingEnd = passed && this.level.kind === 'stage' ? { world: this.world, stage: this.level } : null;   // vượt ải → về bản đồ sẽ phát end_stage
    const name = this.monster.name, pctText = Math.round(ratio * 100) + '%';
    let title, detail;
    if (dungeon) {
      title = res.exited ? 'ĐÃ THOÁT HẦM NGỤC' : 'HẦM NGỤC KẾT THÚC';
      detail = (kills > 0 ? `Bạn đã vượt ${kills} tầng (tầng ${this.startFloor} → ${topFloor}) ` : `Bạn chưa vượt được tầng ${this.startFloor} `)
        + (res.exited ? 'rồi thoát hầm ngục' : 'trước khi hết HP') + `; đạt tầng ${topFloor} tăng thêm ${Math.round(CONFIG.dungeonRewardBonus(topFloor) * 100)}% phần thưởng.`
        + ` Hạ quái Điên loạn được ${fight ? fight.madnessKills : 0} Crystal.`;
    } else if (passed) {
      title = 'CHIẾN THẮNG!';
      const C = CONFIG.GAME.CRYSTAL.stage;
      detail = `Bạn đã hạ ${kills} quái vật, đúng ${pctText} số câu; mỗi quái bị hạ tăng 10% phần thưởng.`
        + (this.level.kind === 'stage' && this.world.stages[this.level.index] && WorldMap.hasQuestions(this.world.stages[this.level.index]) ? ' Ải tiếp theo đã mở (nếu đủ cấp).' : '')
        + ` Đúng trên ${Math.round(C.minCorrectRatio * 100)}% số câu sẽ nhận Crystal.`;
    } else if (defeated) {
      title = 'BẠN ĐÃ BỊ HẠ!';
      detail = `${name} đã hạ gục bạn sau ${res.answered || 0} câu. Thưởng tính theo sát thương bạn đã gây (tối thiểu 10%).`;
    } else {
      title = 'CHƯA VƯỢT ẢI';
      detail = kills === 0
        ? `Bạn chưa hạ được ${name}. Cần hạ ít nhất 1 quái và đúng từ 70% số câu (hiện ${pctText}).`
        : `Bạn đã hạ quái nhưng mới đúng ${pctText}; cần đúng từ 70% số câu để vượt ải.`;
    }
    div.append(el('h1', '', title), el('div', 'score', dungeon ? `${kills} tầng` : `${res.correct}/${res.total}`), el('p', '', detail), status, again, back);
    box.replaceChildren(div);
    const save = async () => {
      again.disabled = back.disabled = true;
      try {
        const wait = Player.cooldownLeftMs();
        if (wait > 0) { status.textContent = `Đang chờ ${Math.ceil(wait / 1000)}s để lưu kết quả…`; await new Promise(r => setTimeout(r, wait)); status.textContent = 'Đang lưu kết quả…'; }
        const r = await Player.saveRun(this.level, { correct: res.correct, total: res.total, passed, kills, floor: topFloor, damagePct, drops: fight ? fight.drops : [], madnessKills: fight ? fight.madnessKills : 0, spent: fight ? fight.spent : 0 });
        if (r.celebrate && typeof Celebrate !== 'undefined') setTimeout(() => Celebrate.level100(r), 500);   // cấp 100 (một lần)
        status.replaceChildren(this.rewardView(r));
        Player.renderHud();
        again.disabled = back.disabled = false;
      } catch (e) {
        status.textContent = 'Chưa lưu được kết quả: ' + (e.message || 'lỗi không rõ') + ' ';
        const retry = el('button', 'btn ghost', 'Thử lưu lại'); retry.onclick = () => { retry.remove(); save(); };
        status.append(retry); back.disabled = false;
      }
    };
    save();
  }
};
