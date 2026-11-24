// Màn chọn ải: Selection_Stage_Map.jpg hiển thị ~90% màn hình, nút ải/hầm ngục đặt đè lên số đã vẽ sẵn trên ảnh.
// Bấm (trigger) một nút → hiện THANH TRẠNG THÁI của ải ở cuối bản đồ, có nút vào ải. Bấm lại/✕/vùng trống/Esc → ẩn.
// Quy tắc mở khóa (Plan 13.4): vượt ải i-1 VÀ đạt cấp 1 + 5*(i-1) → mở ải i. Hầm ngục mở khi vượt ải `after`.
const WorldMap = {
  world: null,
  selected: null,   // ải đang mở thanh trạng thái (object stage/dungeon) hoặc null
  onStart: null,

  open(world, onStart) {
    this.world = world;
    this.onStart = onStart;
    this.selected = null;
    $('#map-error').hidden = true;
    $('#world-map').hidden = false;
    const map = $('#world-map');
    map.setAttribute('aria-label', `Bản đồ ${world.name}`);
    map.style.backgroundImage = `url("${world.mapImage}")`;
    setAppBackground(world.mapImage);
    this.fitAspect(world.mapImage);
    if (!this.bound) {
      this.bound = true;
      map.addEventListener('click', event => { if (!event.target.closest('.map-stage, .stage-bar')) this.select(null); });
      document.addEventListener('keydown', event => { if (event.key === 'Escape' && this.selected) this.select(null); });
    }
    this.render();
  },
  // Khung bản đồ theo đúng tỉ lệ ảnh (các world có ảnh 16:9 hoặc 1672×941) để nút % luôn trùng số trên ảnh.
  fitAspect(src) {
    const map = $('#world-map'), image = new Image();
    image.onload = () => { if (image.naturalHeight) map.style.setProperty('--ar', String(image.naturalWidth / image.naturalHeight)); };
    image.src = src;
  },

  all() { return [...this.world.stages, ...this.world.dungeons]; },
  passed(stage) { const p = Player.data.progress[stage.id]; return Boolean(p && p.passed); },
  hasQuestions(stage) { return Boolean(stage.file) && !stage.placeholder; },
  levelReq(stage) { return stage.kind === 'dungeon' ? 1 : 1 + CONFIG.GAME.STAGE_LEVEL_STEP * (stage.index - 1); },
  levelOk(stage) { return Player.data.level >= this.levelReq(stage); },

  state(stage) {
    if (this.passed(stage)) return 'completed';
    let open;
    if (stage.kind === 'dungeon') open = this.passed(this.world.stages[stage.after - 1]);
    else open = stage.index === 1 || this.passed(this.world.stages[stage.index - 2]);
    return open && this.levelOk(stage) && this.hasQuestions(stage) ? 'unlocked' : 'locked';
  },

  render() {
    const layer = $('#map-stages');
    layer.replaceChildren();
    this.all().forEach(stage => {
      const state = this.state(stage);
      const b = document.createElement('button');
      b.type = 'button';
      b.className = `map-stage map-stage--${state} map-stage--${stage.kind}`;
      b.style.left = `${stage.x}%`;
      b.style.top = `${stage.y}%`;
      b.setAttribute('aria-label', `${stage.name} — ${this.stateLabel(state)}`);
      b.setAttribute('aria-pressed', 'false');
      b.title = `${stage.name} — ${this.stateLabel(state)}`;
      b.dataset.id = stage.id;
      b.append(this.element('span', 'stage-number', stage.kind === 'dungeon' ? 'H' + stage.index : String(stage.index)));
      b.onclick = () => this.select(this.selected === stage ? null : stage);
      layer.append(b);
    });
    const done = this.world.stages.filter(s => this.hasQuestions(s) && this.passed(s)).length;
    $('#world-progress').textContent = `${done}/${this.world.stages.filter(s => this.hasQuestions(s)).length} ải đã hoàn thành`;
    this.select(null);
  },

  select(stage) {
    this.selected = stage;
    document.querySelectorAll('.map-stage').forEach(b => {
      const on = Boolean(stage) && b.dataset.id === stage.id;
      b.classList.toggle('is-selected', on);
      b.setAttribute('aria-pressed', String(on));
    });
    const bar = $('#stage-info');
    bar.hidden = !stage;
    if (!stage) { bar.replaceChildren(); return; }

    const state = this.state(stage), progress = Player.data.progress[stage.id];
    const monsterText = stage.kind === 'dungeon'
      ? `Quái vật: ${StageMonster.poolFor(this.world, stage).map(m => m.name).join(', ')}`
      : `Quái vật: ${StageMonster.forStage(this.world, stage).name}`;
    const lines = [this.element('span', 'stage-monster', monsterText)];
    if (stage.kind === 'stage' && CONFIG.GAME.STAGE_LEVEL_STEP > 0) lines.push(this.element('span', 'stage-level', `Yêu cầu cấp: ${this.levelReq(stage)}`));
    if (progress) {
      lines.push(this.element('span', 'stage-best', stage.kind === 'dungeon'
        ? `Tầng cao nhất: ${progress.best} · vào lại từ tầng ${CONFIG.dungeonStartFloor(progress.best)} · đã chơi ${progress.tries} lần`
        : `Tốt nhất: ${progress.best}% · đã chơi ${progress.tries} lần`));
    }
    if (!this.hasQuestions(stage)) lines.push(this.element('span', 'stage-note', 'Ải đang chờ được bổ sung file câu hỏi.'));
    if (state === 'locked') lines.push(this.element('span', 'stage-locked-note', this.lockReason(stage)));

    const head = this.element('div', 'stage-bar-head');
    head.append(
      this.element('h2', '', (stage.kind === 'dungeon' ? `${stage.index}` : `${String(stage.index).padStart(2, '0')}`) + (stage.title ? `·${stage.title}` : '')),
      this.element('span', `stage-status stage-status--${state}`, this.stateLabel(state)));
    const body = this.element('div', 'stage-bar-body');
    body.append(...lines);
    const actions = this.element('div', 'stage-bar-actions');
    if (state !== 'locked') {
      const start = this.element('button', 'btn stage-start', state === 'completed' ? 'Thách đấu lại' : 'Vào ải');
      start.type = 'button';
      start.onclick = () => this.onStart(stage);
      actions.append(start);
    }
    const close = this.element('button', 'btn ghost stage-close', '✕');
    close.type = 'button'; close.setAttribute('aria-label', 'Đóng thanh trạng thái');
    close.onclick = () => this.select(null);
    actions.append(close);
    bar.replaceChildren(head, body, actions);
  },

  lockReason(stage) {
    if (stage.kind === 'dungeon') return `Vượt ải ${stage.after} để mở hầm ngục này.`;
    if (!this.hasQuestions(stage)) return 'Ải chưa có câu hỏi.';
    if (stage.index > 1 && !this.passed(this.world.stages[stage.index - 2])) return `Vượt ải ${stage.index - 1} để mở ải này.`;
    return `Cần đạt cấp ${this.levelReq(stage)} (hiện tại: cấp ${Player.data.level}).`;
  },
  stateLabel(state) { return { locked: 'Đang khóa', unlocked: 'Đã mở khóa', completed: 'Đã hoàn thành' }[state]; },
  element(tag, className, text) {
    const e = document.createElement(tag);
    if (className) e.className = className;
    if (text != null) e.textContent = text;
    return e;
  }
};
