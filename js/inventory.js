// Dùng chung cho màn Cửa hàng và Trang bị: hàm dựng ô vật phẩm + màn "Trang bị" (UI mô tả trong Equipment_UI.png).
// Màn Trang bị chia đôi: TRÁI = nhân vật, chỉ số và 4 ô đang mặc; PHẢI = kho đồ (cuộn được) + chi tiết vật phẩm đang chọn.
const Ui = {
  busy: false,
  timers: {},
  // Thông báo nổi (CSS .ui-msg: position fixed, KHÔNG chiếm chỗ trong bố cục) và tự biến mất sau MSG_MS.
  msg(id, text, err) {
    const m = $('#' + id);
    clearTimeout(this.timers[id]);
    m.textContent = text || '';
    m.classList.toggle('is-error', !!err);
    m.classList.toggle('is-success', !err && !!text);
    if (text) this.timers[id] = setTimeout(() => { m.textContent = ''; m.classList.remove('is-error', 'is-success'); }, this.MSG_MS);
  },
  MSG_MS: 10000,
  // Chạy thao tác ghi (mua/mặc/tháo/đổi nhân vật), chặn bấm đúp, vẽ lại màn bằng `redraw` rồi báo kết quả.
  async act(msgId, fn, okText, redraw) {
    if (this.busy) return;
    this.busy = true; this.msg(msgId, 'Đang xử lý…');
    try { await fn(); redraw(); this.msg(msgId, okText || '', false); }
    catch (e) { this.msg(msgId, e.message || 'Không thực hiện được. Vui lòng thử lại.', true); }
    finally { this.busy = false; }
  }
};

// Tooltip vật phẩm dùng chung (Cửa hàng / Trang bị): rê chuột (hoặc focus bằng bàn phím) để xem tên, phẩm chất, chỉ số, hiệu ứng, nghề.
// Thay cho khung chi tiết lớn; thiết bị cảm ứng không có hover nên dùng thanh thao tác gọn ở màn Trang bị.
const Tip = {
  box: null,
  init() {
    if (this.box) return;
    this.box = el('div', 'item-tip'); this.box.hidden = true; this.box.setAttribute('role', 'tooltip');
    document.body.append(this.box);
    window.addEventListener('scroll', () => this.hide(), true);
  },
  fill(it, hint) {
    const q = CONFIG.quality(it.quality), head = el('div', 'tip-head');
    head.append(el('b', 'tip-name', it.name), Inventory.qualityBadge(it));
    this.box.style.setProperty('--q', q.color);
    const rows = [head, el('p', 'tip-sub', `${Inventory.slotName(it.slot)} · ${Player.classLabel(it)}`), el('p', 'tip-stats', Inventory.bonusText(it))];
    const effect = Inventory.effectText(it);
    if (effect) rows.push(el('p', 'tip-effect', `Hiệu ứng: ${effect}`));
    Inventory.setLines(it).forEach((line, i) => rows.push(el('p', i ? 'tip-set-line' : 'tip-set', line)));
    if (!Player.usable(it)) rows.push(el('p', 'tip-bad', 'Không dùng được với nghề hiện tại'));
    if (hint) rows.push(el('p', 'tip-hint', hint));
    this.box.replaceChildren(...rows);
  },
  show(target, it, hint) {
    this.init(); this.fill(it, hint);
    const b = this.box; b.hidden = false;
    const r = target.getBoundingClientRect(), w = b.offsetWidth, h = b.offsetHeight, pad = 8;
    let x = r.right + pad, y = r.top;
    if (x + w > window.innerWidth - pad) x = r.left - w - pad;          // hết chỗ bên phải → đặt bên trái
    if (x < pad) x = Math.max(pad, Math.min(r.left, window.innerWidth - w - pad));
    if (y + h > window.innerHeight - pad) y = window.innerHeight - h - pad;
    b.style.left = x + 'px'; b.style.top = Math.max(pad, y) + 'px';
  },
  hide() { if (this.box) this.box.hidden = true; },
  attach(node, it, hint) {
    node.addEventListener('mouseenter', () => this.show(node, it, hint));
    node.addEventListener('focus', () => this.show(node, it, hint));
    node.addEventListener('mouseleave', () => this.hide());
    node.addEventListener('blur', () => this.hide());
  }
};

const Inventory = {
  touch: window.matchMedia('(hover: none)').matches,   // cảm ứng: chạm lần 1 = chọn, chạm lần 2 = mặc/tháo
  selected: null,   // ID vật phẩm đang xem chi tiết ở màn Trang bị
  tag: 'all',       // bộ lọc kho đồ: 'all' hoặc id ô (weapon/armor/helmet/accessory)
  timer: null,
  SLOT_ICON: { weapon: '⚔️', armor: '🛡️', helmet: '⛑️', accessory: '💍' },
  STAT_NAMES: { HP: 'HP', ATK: 'ATK', DEF: 'DEF', CRIT: 'CRIT' },

  // ----- hàm dùng chung -----
  slotName(id) { return (CONFIG.SLOTS.find(s => s.id === id) || {}).name || id; },
  statParts(it) {
    return Object.entries(it.bonus).filter(([k, v]) => Number(v) !== 0 && k in this.STAT_NAMES)
      .map(([k, v]) => `${v > 0 ? '+' : ''}${v}${k === 'CRIT' ? '%' : ''} ${k}`);
  },
  bonusText(it) { return it.power ? this.statParts(it).join(' · ') : 'Chỉ trang trí'; },
  // Một hiệu ứng {type, value} → chuỗi hiển thị.
  oneEffect(e) {
    if (!e || !e.type) return '';
    const key = Effects.key(e.type), def = CONFIG.EFFECTS[key];
    if (def && Number.isFinite(Number(e.value))) return `${def.name}: ${def.text(e.value)}`;
    return `${CONFIG.EFFECT_NAMES[key] || e.type}${Number.isFinite(Number(e.value)) ? ` ${e.value}%` : ''}`;
  },
  // Hiệu ứng riêng của món (một hoặc nhiều).
  effectText(it) { return Effects.list(it.effect).map(e => this.oneEffect(e)).filter(Boolean).join(' · '); },
  // Hiệu ứng BỘ ĐỒ của món (tooltip/thẻ): dòng đầu = tên bộ + số món đang mặc, các dòng sau = từng mốc (✓ đã đạt, ○ chưa).
  setLines(it) {
    const set = it.set && CONFIG.SETS && CONFIG.SETS[it.set];
    if (!set) return [];
    const worn = Object.values((Player.data && Player.data.equip) || {}).filter(id => { const x = id && Player.item(id); return x && x.set === it.set; }).length;
    return [`${set.name} — đang mặc ${worn} món`, ...set.tiers.map(t => `${worn >= t.count ? '✓' : '○'} ${t.count} món: ${t.effects.map(e => this.oneEffect(e)).join(' · ')}`)];
  },
  // Ảnh icon vật phẩm; thiếu ảnh thì hiện biểu tượng theo ô trang bị.
  icon(it) {
    const qk = String(it.quality || 'normal').toLowerCase();
    const box = el('span', 'item-icon q-' + (CONFIG.QUALITIES[qk] ? qk : 'normal'));   // khung ảnh theo phẩm chất: assets/ui/<qk>_frame.png
    const fallback = () => { box.replaceChildren(el('span', 'item-icon-fallback', this.SLOT_ICON[it.slot] || '❔')); };
    if (!it.image) { fallback(); return box; }
    const img = new Image();
    img.alt = ''; img.loading = 'lazy'; img.decoding = 'async';
    img.onerror = fallback;
    img.src = it.image;
    box.append(img);
    return box;
  },
  qualityBadge(it) {
    const q = CONFIG.quality(it.quality), b = el('span', 'q-badge', q.name);
    b.style.setProperty('--q', q.color);
    return b;
  },
  // Ô vật phẩm vuông (kho đồ / túi đồ). opts: { selected, worn, onClick, count }
  tile(it, opts = {}) {
    const q = CONFIG.quality(it.quality), usable = Player.usable(it);
    const b = el('button', 'tile' + (opts.selected ? ' is-selected' : '') + (opts.worn ? ' is-worn' : '') + (usable ? '' : ' is-dim'));
    b.type = 'button';
    b.style.setProperty('--q', q.color);
    b.setAttribute('aria-label', `${it.name} (${q.name})${usable ? '' : ' — không dùng được với nghề hiện tại'}`);
    Tip.attach(b, it, opts.hint);
    b.append(this.icon(it));
    const n = Player.count(it.id);
    if (n > 1) b.append(el('span', 'tile-count', `×${n}`));   // kho đồ gộp: số lượng cùng loại (tối đa CONFIG.STACK_MAX)
    if (opts.onSell) {   // nút Bán (span để không lồng button trong button); phím Enter/Space cũng dùng được
      const sell = el('span', 'tile-sell', 'Bán');
      sell.setAttribute('role', 'button'); sell.tabIndex = 0; sell.setAttribute('aria-label', `Bán ${it.name}`);
      const go = e => { e.stopPropagation(); e.preventDefault(); Tip.hide(); opts.onSell(); };
      sell.onclick = go; sell.onkeydown = e => { if (e.key === 'Enter' || e.key === ' ') go(e); };
      b.append(sell);
    }
    if (opts.worn) b.append(el('span', 'tile-flag', 'Đã mặc'));
    else if (!usable) b.append(el('span', 'tile-flag is-bad', '🚫'));
    if (opts.onClick) b.onclick = opts.onClick;
    return b;
  },
  tagBar(container, current, onPick) {
    container.replaceChildren(...[{ id: 'all', name: 'Tất cả' }, ...CONFIG.SLOTS].map(s => {
      const b = el('button', 'tag' + (s.id === current ? ' is-on' : ''));
      b.type = 'button'; b.onclick = () => onPick(s.id);
      b.append(el('span', '', s.name));
      return b;
    }));
  },

  // Bán 1 món cho NPC: thẻ xác nhận hiện số tiền nhận được. `msgId` = vùng thông báo của màn đang mở; `redraw` vẽ lại màn.
  sell(it, msgId, redraw) {
    if (Player.count(it.id) === 1 && Object.values(Player.data.equip).includes(it.id)) {
      Ui.msg(msgId, `Hãy tháo ${it.name} trước khi bán bản cuối cùng.`, true); return;
    }
    ItemSheet.open({ mode: 'sell', item: it, price: Player.sellPrice(it), onConfirm: () => Player.sell(it.id),
      onDone: () => { redraw(); Ui.msg(msgId, `Đã bán ${it.name}.`, false); } });
  },

  // ----- màn Trang bị -----
  open() { this.render(); show('screen-equip'); },
  bind() {
    if (this.bound) return;
    this.bound = true;
    $('#f-char').onchange = event => {
      const select = event.target, key = select.value;
      if (key === CONFIG.character().key) return;
      if (CONFIG.classPrefix(CONFIG.character().key) !== CONFIG.classPrefix(key) && Player.classCooldownLeft() > 0) {   // đổi NGHỀ bị giới hạn 1 lần/ngày
        Ui.msg('equip-msg', `Chưa thể đổi nghề. Hãy chờ thêm ${Player.fmtLeft(Player.classCooldownLeft())} (đổi kiểu nhân vật cùng nghề thì không giới hạn).`, true);
        select.value = CONFIG.character().key;
        return;
      }
      if (Player.classChangeResets(key) && !window.confirm('Đổi sang nghề khác sẽ THÁO toàn bộ trang bị đang mặc (vật phẩm vẫn còn trong kho). Tiếp tục?')) {
        select.value = CONFIG.character().key;
        return;
      }
      Ui.act('equip-msg', () => Player.setCharacter(key), 'Đã đổi nhân vật.', () => this.render())
        .then(() => { select.value = CONFIG.character().key; });
    };
  },
  // Mặc / thay / tháo một vật phẩm (gọi từ ô kho đồ hoặc ô đang mặc).
  toggle(it) {
    const worn = Player.data.equip[it.slot] === it.id;
    if (!worn && !Player.usable(it)) { Ui.msg('equip-msg', `Vật phẩm này chỉ dành cho: ${Player.classLabel(it)}.`, true); return; }
    Ui.act('equip-msg', () => Player.setEquip(it.slot, worn ? null : it.id), worn ? `Đã tháo ${it.name}.` : `Đã mặc ${it.name}.`, () => this.render());
  },
  // Đếm ngược "Đổi nghề lại sau hh:mm:ss" cạnh ô chọn nhân vật (tính ở trình duyệt, không đọc Firestore).
  tickClassCd() {
    const out = $('#class-cd'); clearInterval(this.cdTimer);
    const upd = () => {
      const ms = Player.classCooldownLeft();
      out.textContent = ms > 0 ? `Đổi nghề lại sau ${Player.fmtLeft(ms)}` : '';
      if (ms <= 0 || $('#screen-equip').hidden) clearInterval(this.cdTimer);
    };
    upd();
    if (Player.classCooldownLeft() > 0) this.cdTimer = setInterval(upd, 1000);
  },
  render() {
    this.bind();
    Tip.hide();
    this.tickClassCd();
    const d = Player.data, char = CONFIG.character();
    Player.fillTopBar('equip');
    const pick = $('#f-char');
    pick.replaceChildren(...Object.values(CONFIG.CHARACTERS).map(c => new Option(c.name, c.key)));
    pick.value = char.key;

    // chỉ số: giá trị hiện tại (+ phần cộng từ trang bị)
    const s = Player.stats(), base = char.statsAt(d.level), stats = $('#equip-stats');
    stats.replaceChildren(...['HP', 'ATK', 'DEF', 'CRIT'].map(k => {
      const extra = Math.round((s[k] - base[k]) * 10) / 10, row = el('div', 'stat');
      row.append(el('span', 'stat-k', k), el('b', '', k === 'CRIT' ? `${s[k]}%` : String(s[k])));
      if (extra) row.append(el('em', extra > 0 ? 'plus' : 'minus', `${extra > 0 ? '+' : ''}${extra}`));
      return row;
    }));

    // 4 ô trang bị quanh nhân vật
    document.querySelectorAll('#screen-equip [data-slot]').forEach(box => {
      const slot = box.dataset.slot, worn = Player.item(d.equip[slot]);
      box.replaceChildren(el('span', 'slot-label', this.slotName(slot)));
      box.classList.toggle('is-filled', Boolean(worn));
      box.classList.toggle('is-selected', Boolean(worn) && worn.id === this.selected);
      box.style.setProperty('--q', worn ? CONFIG.quality(worn.quality).color : '#6f6a58');
      if (worn) box.append(this.icon(worn)); else box.append(el('span', 'slot-empty', this.SLOT_ICON[slot]));
      box.setAttribute('aria-label', worn ? `${this.slotName(slot)}: ${worn.name}` : `${this.slotName(slot)}: trống`);
      if (worn) Tip.attach(box, worn, this.touch ? '' : 'Bấm để tháo');
      box.onclick = () => {
        if (!worn) { this.tag = slot; this.selected = null; this.render(); return; }
        this.tag = slot; this.selected = worn.id;
        if (this.touch) this.render(); else this.toggle(worn);   // chuột: tháo ngay; cảm ứng: chọn, bấm nút ở thanh thao tác
      };
    });

    // kho đồ (cuộn được) theo bộ lọc
    this.tagBar($('#equip-tags'), this.tag, id => { this.tag = id; this.render(); });
    const owned = d.inventory.map(id => Player.item(id)).filter(Boolean).filter(it => this.tag === 'all' || it.slot === this.tag);
    const bag = $('#equip-bag');
    if (this.selected && !d.inventory.includes(this.selected)) this.selected = null;
    bag.replaceChildren(...(owned.length ? owned.map(it => this.tile(it, {
      selected: it.id === this.selected, worn: d.equip[it.slot] === it.id,
      onSell: () => this.sell(it, 'equip-msg', () => this.render()),
      hint: this.touch ? '' : (d.equip[it.slot] === it.id ? 'Bấm để tháo' : d.equip[it.slot] ? 'Bấm để thay thế' : 'Bấm để mặc'),
      onClick: () => {
        if (this.touch && this.selected !== it.id) { this.selected = it.id; this.render(); return; }
        this.selected = it.id; this.toggle(it);
      }
    })) : [el('p', 'bag-empty', d.inventory.length ? 'Không có vật phẩm thuộc loại này.' : 'Kho đồ trống. Hãy ghé Cửa hàng hoặc đánh quái để nhận vật phẩm.')]));
    $('#equip-count').textContent = `${d.inventory.length} loại · ${Object.values(d.stock).reduce((a, b) => a + b, 0)} vật phẩm`;
    this.detail();
    this.startPortrait();
  },

  // Thanh thao tác gọn cho thiết bị cảm ứng (không có hover): tên + chỉ số + nút Mặc/Tháo. Máy có chuột: ẩn bằng CSS, dùng tooltip.
  detail() {
    const box = $('#equip-info'), it = Player.item(this.selected);
    if (!it || !this.touch) { box.replaceChildren(); box.hidden = true; return; }
    const d = Player.data, worn = d.equip[it.slot] === it.id, usable = Player.usable(it);
    const act = el('button', 'btn', worn ? 'Tháo' : d.equip[it.slot] ? 'Thay thế' : 'Mặc');
    act.type = 'button';
    if (!usable && !worn) { act.textContent = 'Sai nghề'; act.disabled = true; }
    else act.onclick = () => this.toggle(it);
    box.hidden = false;
    box.replaceChildren(el('span', 'action-text', `${it.name} · ${this.bonusText(it)}${this.effectText(it) ? ' · ' + this.effectText(it) : ''}`), act);
  },

  // nhân vật động (idle) ở giữa màn Trang bị
  stopPortrait() { clearInterval(this.timer); this.timer = null; },
  startPortrait() {
    this.stopPortrait();
    const sheet = CONFIG.character().idle, cv = $('#equip-portrait');
    if (!sheet || !cv) return;
    const img = new Image(); let i = 0;
    // cắt PORTRAIT_CROP_RIGHT px bên phải mỗi khung (sprite lệch/thừa hiệu ứng) → canvas hẹp lại, vẫn giữ đúng tỉ lệ ảnh
    const CROP = CONFIG.PORTRAIT_CROP_RIGHT, srcW = Math.max(1, sheet.frameW - CROP), srcH = sheet.cropH || sheet.frameH;
    cv.width = srcW; cv.height = srcH;
    const draw = () => {
      const g = cv.getContext('2d');
      g.clearRect(0, 0, cv.width, cv.height);
      if (!img.complete || !img.naturalWidth) return;
      g.imageSmoothingEnabled = false;
      g.drawImage(img, sheet.frames[i % sheet.frames.length] * sheet.frameW, sheet.cropY || 0, srcW, srcH, 0, 0, srcW, srcH);
    };
    img.onload = draw;
    img.src = sheet.src;
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    this.timer = setInterval(() => { if ($('#screen-equip').hidden) return this.stopPortrait(); i++; draw(); }, 160);
  }
};
