function $(s) { return document.querySelector(s); }
function show(id) { document.querySelectorAll('.screen').forEach(s => { s.hidden = s.id !== id; }); }
function setMsg(t, err) { const m = $('#msg'); m.textContent = t; m.style.color = err ? '#ff6b6b' : ''; }

function setAuthStatus(id, message, type) {
  const status = $(id);
  status.textContent = message || '';
  status.classList.toggle('is-error', type === 'error');
  status.classList.toggle('is-success', type === 'success');
}

function setFormLoading(form, loading) {
  const button = form.querySelector('.auth-submit');
  button.disabled = loading;
  button.setAttribute('aria-busy', String(loading));
}

function showLoginError(message) {
  show('screen-login');
  setAuthStatus('#login-status', message, 'error');
}

function populateClassOptions() {
  document.querySelectorAll('#f-cls, #signup-cls').forEach(select => {
    select.replaceChildren(new Option('Chọn khối lớp', ''));
    CONFIG.WORLDS.forEach(world => {
      select.add(new Option(`Khối ${world.grade}`, String(world.grade)));
    });
  });
}

// Nền tổng của website: ảnh Selection_Stage_Map.jpg (làm mờ bằng CSS #app-bg). Mặc định World đầu tiên khi chưa đăng nhập.
function setAppBackground(src) { $('#app-bg').style.backgroundImage = `url("${src}")`; }
setAppBackground(CONFIG.WORLDS[0].mapImage);

function renderLevels() {
  if (!Player.data || !Player.u) {
    showLoginError('Vui lòng đăng nhập để truy cập thế giới của bạn.');
    return;
  }
  const cls = Player.u.cls;
  const match = String(cls).match(/^\s*(?:lớp\s*)?([6-9])(?=$|[\sA-Za-z])/i);
  const world = match && CONFIG.WORLDS.find(item => item.grade === Number(match[1]));
  renderMapPlayerInfo();
  $('#map-error').hidden = Boolean(world);
  $('#world-map').hidden = !world;
  if (world) {
    WorldMap.open(world, stage => Adventure.start(stage, world));
  } else {
    $('#map-error').textContent = `Không xác định được khối 6, 7, 8 hoặc 9 từ hồ sơ lớp "${cls}". Hãy liên hệ giáo viên.`;
    $('#world-progress').textContent = '';
  }
  setMsg('');
  show('screen-levels');
}

function renderMapPlayerInfo() {
  const d = Player.data;
  $('#who').textContent = d.nick;
  $('#map-level').textContent = d.level;
  $('#map-class').textContent = CONFIG.character().name;
  $('#map-gold').textContent = d.gold.toLocaleString('vi-VN');
  $('#map-gem').textContent = d.crystals.toLocaleString('vi-VN');
  drawMapPortrait();
}

function drawMapPortrait() {
  const canvas = $('#map-portrait'), sheet = CONFIG.character().idle, key = CONFIG.character().key;
  const context = canvas.getContext('2d');
  context.clearRect(0, 0, canvas.width, canvas.height);
  if (!sheet || !sheet.frames || !sheet.frames.length) return;
  const image = new Image();
  image.onload = () => {
    if (CONFIG.character().key !== key) return;
    context.imageSmoothingEnabled = false;
    context.clearRect(0, 0, canvas.width, canvas.height);
    context.drawImage(image, sheet.frames[0] * sheet.frameW, sheet.cropY || 0, sheet.frameW, sheet.cropH || sheet.frameH, 0, 0, canvas.width, canvas.height);
  };
  image.onerror = () => console.warn(`Không tải được ảnh nhân vật: ${sheet.src}`);
  image.src = sheet.src;
}

// Hồ sơ cũ chưa có lớp (Room, vd 6/5): hỏi một lần. Trả về false nếu người dùng chọn đăng xuất.
function askRoom() {
  return new Promise(resolve => {
    const dialog = $('#room-dialog'), input = $('#room-input'), status = $('#room-status'), form = $('#room-form');
    $('#room-grade').textContent = Player.u.cls;
    input.value = ''; status.textContent = ''; status.classList.remove('is-error');
    dialog.hidden = false; input.focus();
    form.onsubmit = async event => {
      event.preventDefault();
      const button = form.querySelector('.auth-submit');
      button.disabled = true;
      try {
        await Player.setRoom(input.value);
        dialog.hidden = true; resolve(true);
      } catch (error) {
        setAuthStatus('#room-status', error.message || 'Không lưu được lớp. Vui lòng thử lại.', 'error');
      } finally { button.disabled = false; }
    };
    $('#room-logout').onclick = async () => {
      dialog.hidden = true;
      try { await Auth.logout(); } catch (error) { console.error(error); }
      resolve(false);
    };
  });
}

// enter() có thể bị gọi hai lần cùng lúc (form đăng nhập + onAuthStateChanged) → dùng chung một lượt chạy.
let entering = null;
function enter(session) {
  if (!entering) entering = enterNow(session).finally(() => { entering = null; });
  return entering;
}
async function enterNow(session) {
  await Promise.all([CONFIG.loadItems(), CONFIG.loadCharacters(), CONFIG.loadWorlds()]);
  Player.load(session.profile, session.identity);
  await StageMonster.load();
  if (!Player.data.room && !(await askRoom())) return;
  renderLevels();
  checkRewards();   // không chặn vào game; lỗi mạng/quyền chỉ bỏ qua
}

// Phiếu thưởng xếp hạng do giáo viên chốt (trang admin): hiện hộp thông báo, bấm "Nhận" để cộng Gold.
async function checkRewards() {
  let vouchers;
  try { vouchers = await Player.pendingVouchers(); } catch (error) { console.warn('Không đọc được phiếu thưởng:', error); return; }
  if (!vouchers.length) return;
  const dialog = $('#reward-dialog'), list = $('#reward-list'), status = $('#reward-status');
  const draw = () => {
    list.replaceChildren(...vouchers.map(v => {
      const row = document.createElement('div'), text = document.createElement('p'), button = document.createElement('button');
      row.className = 'reward-row';
      const parts = [];
      if (v.Gold) parts.push(`${Number(v.Gold).toLocaleString('vi-VN')} Gold`);
      if (v.Crystals) parts.push(`${v.Crystals} Crystal`);
      if (v.ItemId) parts.push(Player.item(v.ItemId) ? Player.item(v.ItemId).name : v.ItemId);
      text.textContent = `${v.Title} — ${parts.join(' + ')}`;
      button.type = 'button'; button.className = 'btn'; button.textContent = 'Nhận';
      button.onclick = async () => {
        button.disabled = true;
        try {
          await Player.claimVoucher(v.id);
          renderMapPlayerInfo();
          vouchers = vouchers.filter(x => x.id !== v.id);
          setAuthStatus('#reward-status', `Đã nhận: ${parts.join(' + ')}.`, 'success');
          if (vouchers.length) draw(); else { dialog.hidden = true; }
        } catch (error) {
          button.disabled = false;
          setAuthStatus('#reward-status', error.message || 'Không nhận được phiếu. Vui lòng thử lại.', 'error');
        }
      };
      row.append(text, button);
      return row;
    }));
  };
  status.textContent = ''; draw();
  $('#reward-close').onclick = () => { dialog.hidden = true; };
  dialog.hidden = false;
}

populateClassOptions();

document.querySelectorAll('[data-screen]').forEach(link => {
  link.addEventListener('click', event => {
    event.preventDefault();
    setAuthStatus('#login-status', '');
    setAuthStatus('#signup-status', '');
    show(link.dataset.screen === 'signup' ? 'screen-signup' : 'screen-login');
  });
});

document.querySelectorAll('[data-password-toggle]').forEach(button => {
  button.addEventListener('click', () => {
    const input = document.getElementById(button.dataset.passwordToggle);
    const showPassword = input.type === 'password';
    input.type = showPassword ? 'text' : 'password';
    button.textContent = showPassword ? 'Ẩn' : 'Hiện';
    button.setAttribute('aria-label', showPassword ? 'Ẩn mật khẩu' : 'Hiện mật khẩu');
    button.setAttribute('aria-pressed', String(showPassword));
  });
});

$('#login').onsubmit = async event => {
  event.preventDefault();
  const form = event.currentTarget;
  setAuthStatus('#login-status', '');
  setFormLoading(form, true);
  form.querySelector('.button-label').textContent = 'Đang đăng nhập…';
  try {
    const session = await Auth.login($('#f-cls').value, $('#f-name').value, $('#f-password').value);
    await enter(session);
  } catch (error) {
    showLoginError(error.message || 'Không thể đăng nhập. Vui lòng thử lại.');
  } finally {
    setFormLoading(form, false);
    form.querySelector('.button-label').textContent = 'Vào game';
  }
};

$('#signup').onsubmit = async event => {
  event.preventDefault();
  const form = event.currentTarget;
  const username = $('#signup-name').value;
  const password = $('#signup-password').value;
  const confirmation = $('#signup-confirm').value;
  const nickname = $('#signup-nickname').value.trim();
  const room = Auth.normalizeRoom($('#signup-room').value);
  setAuthStatus('#signup-status', '');

  if (!Auth.usernameIsValid(username)) {
    setAuthStatus('#signup-status', 'Tên đăng nhập cần có 3–20 ký tự gồm chữ không dấu, số hoặc dấu gạch dưới.', 'error');
    return;
  }
  if (!Auth.roomIsValid($('#signup-cls').value, room)) {
    setAuthStatus('#signup-status', 'Lớp cần có dạng khối/số lớp và trùng khối đã chọn, ví dụ 6/5, 7/11, 8/15.', 'error');
    return;
  }
  if (password.length < 6) {
    setAuthStatus('#signup-status', 'Mật khẩu cần có ít nhất 6 ký tự.', 'error');
    return;
  }
  if (password !== confirmation) {
    setAuthStatus('#signup-status', 'Mật khẩu nhập lại chưa khớp.', 'error');
    return;
  }
  if (nickname.length < 2 || nickname.length > 16) {
    setAuthStatus('#signup-status', 'Nickname cần có từ 2 đến 16 ký tự.', 'error');
    return;
  }

  setFormLoading(form, true);
  form.querySelector('.button-label').textContent = 'Đang tạo tài khoản…';
  try {
    await Auth.register($('#signup-cls').value, username, password, nickname, room);
    form.reset();
    setAuthStatus('#signup-status', '');
    show('screen-login');
    setAuthStatus('#login-status', 'Đăng ký thành công! Hãy đăng nhập để vào thế giới của bạn.', 'success');
  } catch (error) {
    setAuthStatus('#signup-status', error.message || 'Không thể tạo tài khoản. Vui lòng thử lại.', 'error');
  } finally {
    setFormLoading(form, false);
    form.querySelector('.button-label').textContent = 'Tạo tài khoản';
  }
};

$('#logout').onclick = async () => {
  $('#logout').disabled = true;
  try {
    await Auth.logout();
    Player.data = null;
    Player.u = null;
    show('screen-login');
    setAuthStatus('#login-status', 'Bạn đã đăng xuất.', 'success');
  } catch (error) {
    $('#map-error').hidden = false;
    $('#map-error').textContent = 'Không thể đăng xuất. Vui lòng thử lại.';
  } finally {
    $('#logout').disabled = false;
  }
};

$('#open-shop').onclick = () => { Shop.msg(''); Shop.open(); };
$('#open-equip').onclick = () => { Ui.msg('equip-msg', ''); Inventory.open(); };
$('#open-rank').onclick = () => Rank.open();
$('#open-raid').onclick = () => Raid.open();
$('#open-ranked').onclick = () => Ranked.open();
$('#shop-go-equip').onclick = () => { Ui.msg('equip-msg', ''); Inventory.open(); };
$('#equip-go-shop').onclick = () => { Shop.msg(''); Shop.open(); };
['shop', 'equip', 'rank'].forEach(name => { $(`#${name}-back`).onclick = () => renderLevels(); });
$('#rank-refresh').onclick = () => Rank.refresh();

$('#game-back').onclick = () => {
  Adventure.guard.mute = true;   // hộp thoại xác nhận làm cửa sổ mất focus: không coi là rời trang
  const raid = Raid.running || Raid.waiting;   // đang đánh Boss hoặc đang ở phòng chờ
  const leave = !Adventure.active || window.confirm(raid
    ? 'Rời Boss Raid? Sát thương đã gây vẫn được gửi lên bảng.'
    : (Adventure.level && Adventure.level.kind === 'ranked')
      ? 'Rời trận Ranked? Trận này đã tính vào số trận hôm nay và bạn sẽ bị tính là thua (không mất điểm).'
      : 'Rời ải? Kết quả lượt chơi hiện tại sẽ không được lưu.');
  setTimeout(() => { Adventure.guard.mute = false; }, 300);
  if (!leave) return;
  if (raid) Raid.leave();
  Adventure.abort();
  renderLevels();
};

Auth.onAuthStateChanged(async (user, authError) => {
  if (authError) {
    showLoginError(authError.message);
    return;
  }
  if (!user) {
    Auth.clearProfileCache();
    Player.data = null;
    Player.u = null;
    if (!$('#screen-signup').hidden) return;
    show('screen-login');
    return;
  }
  if (Auth.registering) return;
  try {
    const session = await Auth.loadStudent(user);
    if (FirebaseService.auth.currentUser?.uid !== user.uid) return;
    await enter(session);
  } catch (error) {
    showLoginError(error.message || 'Không thể khôi phục hồ sơ học sinh.');
    try {
      await Auth.logout();
    } catch (signOutError) {
      setAuthStatus('#login-status', `${error.message} Đăng xuất cũng chưa hoàn tất; hãy thử lại.`, 'error');
    }
  }
});
