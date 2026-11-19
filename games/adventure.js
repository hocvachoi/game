// Chế độ Phiêu lưu (V3): Stage = hạ quái + làm HẾT câu hỏi trong file Excel; Dungeon = đánh quái vô tận đến khi hết HP.
// Quy tắc theo Plan mục 13.4–13.5; hằng số gameplay chung ở CONFIG.GAME (js/config.js).
const Adventure = {
  PASS_RATIO: 0.7,   // Plan 13.5: Stage hoàn thành khi hạ ≥ 1 quái và đúng ≥ 70% số câu
  raid: null, level: null, world: null, monster: null, monsterPool: [], all: [], active: false, combat: null,
  quizCtl: null, timer: null, floor: 1, startFloor: 1,
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
    this.syncDungeonUi();
    // nền theo từng ải (file Excel chọn từ máy dùng nền của ải đầu thế giới)
    Stage.init({ background: this.level.background || this.world.stages[0].background, monster: this.monster, character: CONFIG.selectedCharacter });
    Stage.reset();
    this.beginCombat();
    this.quizCtl = Quiz.run(qs, box, {
      loop: this.isDungeon(),
      begin: (index, head) => this.startTimer(head),
      result: (ok, sofar, total) => this.resolveAnswer(ok, sofar, total),
      finish: res => this.finish(res, box)
    });
  },
  // Dừng đồng hồ/hẹn giờ của lượt trước (khi chơi lại hoặc rời ải).
  teardown() {
    this.stopTimer();
    clearTimeout(Stage.respawnTimer); Stage.respawnTimer = null;
  },
  abort() { this.active = false; this.teardown(); this.guard.reset(); this.syncDungeonUi(); },

  monsterStat(name) { return Number(this.monster && this.monster.stats && this.monster.stats[name]) || 0; },
  beginCombat() {
    const stats = Player.stats(), maxMonsterHp = Math.max(1, this.monsterStat('HP'));
    const maxPlayerHp = Math.max(1, stats.HP);
    this.combat = {
      playerStats: stats, maxPlayerHp, playerHp: maxPlayerHp,
      monster: this.monster, maxMonsterHp, monsterHp: maxMonsterHp,
      monsterKills: 0, damageDealt: 0, finished: false
    };
    Stage.playerHp(1, maxPlayerHp, maxPlayerHp);
    Stage.hp(1, maxMonsterHp, maxMonsterHp);
  },
  equipmentEffect(type) {
    const normalized = type.toLowerCase().replace(/[^a-z]/g, '');
    return Object.values(Player.data.equip).reduce((total, id) => {
      const effect = Player.item(id)?.effect;
      const effectType = effect && typeof effect.type === 'string'
        ? effect.type.toLowerCase().replace(/[^a-z]/g, '')
        : '';
      const value = Number(effect && effect.value);
      return effectType === normalized && Number.isFinite(value) ? total + value : total;
    }, 0);
  },
  roll(chancePercent) { return Math.random() * 100 < chancePercent; },   // CRIT: tỉ lệ % → nhân đôi sát thương
  note(text) {   // thông báo chiến đấu ngắn dưới phần phản hồi đáp án
    const fb = document.querySelector('#quiz .fb');
    if (fb && text) fb.append(el('div', 'combat-note', text));
  },

  // Quái đánh người chơi: sát thương = max(1, ATK - DEF) giảm theo hiệu ứng giáp, CRIT nhân đôi.
  monsterHit(fight, apply = true) {
    const base = Math.max(1, this.monsterStat('ATK') - fight.playerStats.DEF);
    const reduction = Math.min(100, this.equipmentEffect('reducedmg'));
    const crit = this.roll(this.monsterStat('CRIT'));
    let damage = Math.max(0, Math.round(base * (1 - reduction / 100)));
    if (crit) damage *= 2;
    const hit = { damage, crit };
    if (apply) this.applyMonsterHit(fight, hit);
    return hit;
  },
  applyMonsterHit(fight, hit) {
    fight.playerHp = Math.max(0, fight.playerHp - hit.damage);
    Stage.playerHp(fight.playerHp / fight.maxPlayerHp, fight.playerHp, fight.maxPlayerHp);
  },
  // Quái hồi sinh / xuất hiện quái mới (Dungeon chọn ngẫu nhiên trong danh sách của dungeon).
  spawnNext(fight) {
    if (this.isDungeon()) {
      this.floor = this.startFloor + fight.monsterKills;   // hạ quái = vượt tầng, lên tầng kế
      this.syncDungeonUi();
      this.monster = fight.monster = this.pickMonster();
      Stage.setMonster(this.monster);
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
    let damage = 0, crit = false, hit = null;
    if (correct) {
      const base = Math.max(1, fight.playerStats.ATK - this.monsterStat('DEF'));
      const bonus = this.equipmentEffect('increasedmg');
      crit = this.roll(fight.playerStats.CRIT);
      damage = Math.max(1, Math.round(base * (1 + bonus / 100)));
      if (crit) damage *= 2;
    } else hit = this.monsterHit(fight, false);
    const impact = Stage.fx(correct, sofar, total, () => {
      if (!this.active || this.combat !== fight || fight.finished) return;
      if (correct) {
        const actualDamage = Math.min(damage, fight.monsterHp);
        fight.damageDealt += actualDamage;
        fight.monsterHp = Math.max(0, fight.monsterHp - damage);
        this.note(`${crit ? 'CHÍ MẠNG! ' : ''}Bạn gây ${damage} sát thương.`);
        if (fight.monsterHp === 0) {
          fight.monsterKills++;
          Stage.hp(0, 0, fight.maxMonsterHp);
          Stage.defeat();
          Stage.respawnTimer = setTimeout(() => {
            Stage.respawnTimer = null;
            if (this.active && this.combat === fight && !fight.finished) this.spawnNext(fight);
          }, 650);
        } else Stage.hp(fight.monsterHp / fight.maxMonsterHp, fight.monsterHp, fight.maxMonsterHp);
        return;
      }
      this.applyMonsterHit(fight, hit);
      const action = this.afterMonsterHit(fight, hit, 'trả lời sai');
      if (action === true) this.quizCtl.end({ playerDefeated: true });
    });
    if (correct) {
      return damage >= fight.monsterHp
        ? impact.then(() => new Promise(resolve => setTimeout(resolve, 700)))
        : impact;
    }
    if (this.raid && fight.playerHp <= hit.damage) {
      const reviveMs = this.raid.R().REVIVE_SEC * 1000;
      return impact.then(() => new Promise(resolve => setTimeout(resolve, reviveMs)));
    }
    return impact;
  },
  afterMonsterHit(fight, hit, reason) {
    this.note(`${this.monster.name} tấn công vì ${reason}: ${hit.crit ? 'CHÍ MẠNG! ' : ''}-${hit.damage} HP.`);
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
  stopTimer() { clearInterval(this.timer); this.timer = null; },
  timeoutStrike(label) {   // trả về true nếu người chơi bị hạ gục
    const fight = this.combat;
    if (!fight || fight.finished) return true;
    if (fight.downed) return false;   // Raid: đang chờ hồi sinh, Boss không đánh thêm
    const hit = this.monsterHit(fight, false);
    Stage.fx(false, 0, 0, () => {
      if (!this.active || this.combat !== fight || fight.finished || fight.downed) return;
      this.applyMonsterHit(fight, hit);
      label.textContent = `⏱ Hết giờ! ${this.monster.name} đánh -${hit.damage} HP${hit.crit ? ' (CHÍ MẠNG)' : ''}`;
      if (fight.playerHp === 0 && this.raid) { this.raid.down(fight); return; }
      if (fight.playerHp === 0) {
        fight.finished = true;
        this.stopTimer();
        Stage.playerDefeat();
        this.quizCtl.end({ playerDefeated: true });
      }
    });
    return false;
  },

  async finish(res, box) {
    this.stopTimer();
    this.active = false;
    this.guard.uncover();   // màn kết quả không cần che
    $('#dungeon-exit').hidden = true; $('#floor-badge').hidden = true;
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
    const hpRatio = fight ? Math.max(0, fight.playerHp) / fight.maxPlayerHp : 0;   // HP còn lại, dùng cho điều kiện nhận Crystal
    const div = el('div', 'result'), status = el('p', 'save-status', 'Đang lưu kết quả…');
    const again = el('button', 'btn', 'Chơi lại'), back = el('button', 'btn ghost', 'Về bản đồ');
    again.onclick = () => this.run(); back.onclick = () => renderLevels();
    const name = this.monster.name, pctText = Math.round(ratio * 100) + '%';
    let title, detail;
    if (dungeon) {
      title = res.exited ? 'ĐÃ THOÁT HẦM NGỤC' : 'HẦM NGỤC KẾT THÚC';
      const D = CONFIG.GAME.CRYSTAL.dungeon;
      detail = (kills > 0 ? `Bạn đã vượt ${kills} tầng (tầng ${this.startFloor} → ${topFloor}) ` : `Bạn chưa vượt được tầng ${this.startFloor} `)
        + (res.exited ? 'rồi thoát hầm ngục' : 'trước khi hết HP') + '; mỗi quái bị hạ tăng 5% phần thưởng.'
        + (this.level.index === D.index ? ` Mỗi ${D.killsPerCrystal} quái hạ được nhận 1 Crystal (tối đa ${D.max}).` : '');
    } else if (passed) {
      title = 'CHIẾN THẮNG!';
      const C = CONFIG.GAME.CRYSTAL.stage;
      detail = `Bạn đã hạ ${kills} quái vật, đúng ${pctText} số câu; mỗi quái bị hạ tăng 10% phần thưởng.`
        + (this.level.kind === 'stage' && this.world.stages[this.level.index] && WorldMap.hasQuestions(this.world.stages[this.level.index]) ? ' Ải tiếp theo đã mở (nếu đủ cấp).' : '')
        + ` Đúng trên ${Math.round(C.minCorrectRatio * 100)}% hoặc còn trên ${Math.round(C.minHpRatio * 100)}% HP sẽ nhận Crystal.`;
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
        const r = await Player.saveRun(this.level, { correct: res.correct, total: res.total, passed, kills, floor: topFloor, damagePct, hpRatio });
        const drop = r.drop && Player.item(r.drop);
        status.textContent = `+${r.gold} Gold · +${r.exp} EXP (${Math.round(r.factor * 100)}% thưởng)`
          + (r.crystals ? ` · +${r.crystals} Crystal` : '')
          + (r.levelUp ? ` · LÊN CẤP ${Player.data.level}!` : '') + (drop ? ` · NHẬN ĐƯỢC: ${drop.name}` : '')
          + (r.rankSkipped ? ' · (chưa cập nhật bảng xếp hạng — hãy kiểm tra đồng hồ thiết bị)' : '');
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
