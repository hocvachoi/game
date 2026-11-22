// Cấu hình chung. Mỗi file Excel = một ải (xem mục 4.3 đặc tả).
// Số câu hỏi/lượt và tỉ lệ đúng để vượt ải KHÔNG còn cấu hình ở đây (V3): làm hết mọi câu trong file Excel,
// vượt ải khi hạ ≥ 1 quái và đúng ≥ 70% (Plan mục 13.5; hằng số nằm trong games/adventure.js).
const CONFIG = {
  WORLDS: []
};

// stageCount = số file Stage_<i>.xlsx hiện có (tối đa 12). Ải chưa có file hiển thị khóa/"sắp có".
function makeWorld(n, grade, theme, description, stageCount) {
  const dir = 'World' + n, assetDir = dir.toLowerCase(), w = {
    id: `world${n}`, grade, folder: dir, name: '', theme, description,
    mapImage: `assets/maps/${assetDir}/selection_stage_map.jpg`,
    stages: [], dungeons: []
  };
  for (let k = 0; k < 12; k++) {
    const i = k + 1, has = i <= stageCount;
    w.stages.push({
      id: `g${grade}-stage-${String(i).padStart(2, '0')}`, kind: 'stage', index: i,
      key: `Stage_${i}`, name: `Ải ${i}`, x: 0, y: 0,
      file: has ? `questions/${dir}/Stage_${i}.xlsx` : null, placeholder: !has,
      background: `assets/maps/${assetDir}/stage_${i}.jpg`
    });
  }
  for (let k = 0; k < 2; k++) {
    const i = k + 1;
    w.dungeons.push({
      id: `g${grade}-dungeon-${i}`, kind: 'dungeon', index: i,
      key: `Dungeon_${i}`, name: `Hầm ngục ${i}`, x: 0, y: 0, after: 1,
      file: `questions/${dir}/Dungeon_${i}.xlsx`, placeholder: false,
      background: `assets/maps/${assetDir}/dungeon_${i}.jpg`
    });
  }
  return w;
}

// Khối 6→World1, 7→World2, 8→World3, 9→World4.
CONFIG.WORLDS.push(
  makeWorld(1, 6, 'dawn', 'Khám phá vương quốc cổ đại với thác nước, sa mạc và lâu đài dung nham.', 8),
  makeWorld(2, 7, 'kingdom', 'Băng qua thành quách xưa và những dãy núi huyền bí.', 12),
  makeWorld(3, 8, 'arcane', 'Du hành qua đảo bay, thư viện cổ và những phế tích phép thuật.', 10),
  makeWorld(4, 9, 'frontier', 'Vùng đất mới đang chờ bạn khám phá.', 9)
);
CONFIG.worldsLoaded = false;
CONFIG.worldsPromise = null;
CONFIG.loadWorlds = function () {
  if (this.worldsLoaded) return Promise.resolve();
  if (!this.worldsPromise) {
    this.worldsPromise = Promise.all(this.WORLDS.map(async world => {
      const response = await fetch(`assets/maps/${world.folder.toLowerCase()}/world.json`);
      if (!response.ok) throw new Error(`Không tải được cấu hình ${world.folder}/world.json (${response.status}).`);
      const data = await response.json();
      const validNodes = nodes => Array.isArray(nodes) && nodes.every(node =>
        node && Number.isFinite(node.x) && node.x >= 0 && node.x <= 100
        && Number.isFinite(node.y) && node.y >= 0 && node.y <= 100);
      const validRewards = rewards => rewards && typeof rewards === 'object'
        && Number.isFinite(rewards.EXP) && rewards.EXP >= 0
        && Number.isFinite(rewards.GOLD) && rewards.GOLD >= 0
        && Array.isArray(rewards.drops)
        && rewards.drops.every(drop => drop && typeof drop.itemId === 'string'
          && Number.isFinite(drop.chance) && drop.chance >= 0 && drop.chance <= 1);
      // Số ải của map = số phần tử stage_nodes (tối đa 12, khớp số nút đã vẽ trên Selection_Stage_Map.jpg).
      const stageTotal = Array.isArray(data && data.stage_nodes) ? data.stage_nodes.length : 0;
      if (!data || data.id !== world.id || typeof data.name !== 'string' || !data.name.trim()
        || !validNodes(data.stage_nodes) || stageTotal < 1 || stageTotal > world.stages.length
        || !validNodes(data.dungeon_nodes) || data.dungeon_nodes.length !== world.dungeons.length
        || !Array.isArray(data.stage_rewards) || data.stage_rewards.length < stageTotal
        || !data.stage_rewards.every(validRewards)
        || !Array.isArray(data.dungeon_rewards) || data.dungeon_rewards.length !== world.dungeons.length
        || !data.dungeon_rewards.every(validRewards)
        || !data.dungeon_nodes.every(node => Number.isInteger(node.after) && node.after >= 1 && node.after <= stageTotal)
        || (data.dungeon_monsters !== undefined && !(Array.isArray(data.dungeon_monsters)
          && data.dungeon_monsters.length === world.dungeons.length
          && data.dungeon_monsters.every(pool => Array.isArray(pool) && pool.length > 0
            && pool.every(key => typeof key === 'string' && /^[A-Za-z0-9_-]+$/.test(key)))))) {
        throw new Error(`Cấu hình bản đồ ${world.folder}/world.json không hợp lệ.`);
      }
      world.name = data.name.trim();
      world.stages = world.stages.slice(0, stageTotal);   // bỏ các ải không có nút trên bản đồ
      world.stageNodes = data.stage_nodes;
      world.dungeonNodes = data.dungeon_nodes;
      world.stages.forEach((stage, index) => {
        Object.assign(stage, data.stage_nodes[index], { reward: data.stage_rewards[index] });
      });
      world.dungeons.forEach((dungeon, index) => {
        // monsters: mảng key quái vật có thể xuất hiện trong dungeon (assets/monsters/<key>/<key>.json)
        Object.assign(dungeon, data.dungeon_nodes[index], {
          reward: data.dungeon_rewards[index],
          monsters: data.dungeon_monsters ? data.dungeon_monsters[index] : []
        });
      });
    })).then(() => { this.worldsLoaded = true; }).catch(error => {
      this.worldsPromise = null;
      throw error;
    });
  }
  return this.worldsPromise;
};

// Nhân vật (OOP): lớp ở js/characters/*.js, danh sách và bộ nạp JSON ở js/characters/roster.js.

// ===== Quy tắc game (Plan mục 13.4–13.5). Các hằng số có ghi "[RULES]" phải khớp với firestore.rules. =====
CONFIG.GAME = {
  // Lên cấp (Plan 13.4): lv1 cần 100 EXP, mỗi cấp sau cần thêm 50 (lv1:100, lv2:150, lv3:200...).
  // EXP cần để ĐẠT cấp L = 25*(L-1)*(L+2).      [RULES] XP_BASE=100, XP_STEP=50
  XP_BASE: 100, XP_STEP: 50,
  MAX_LEVEL: 100,           // [RULES] Plan chưa nêu cấp tối đa; ải 12 cần cấp 56 nên đặt 100 (chỉnh được, nhớ sửa rules)
  STAGE_LEVEL_STEP: 5,      // ải i yêu cầu cấp 1 + 5*(i-1) (ải 1: cấp 1, ải 2: cấp 6...). Đặt 0 để tắt.
  // Giá trị MẶC ĐỊNH (Plan 13.4: 20s). Mỗi quái vật quy định riêng bằng "ANSWER_TIMEOUT_SEC" trong <monster_key>.json
  // (xem như tốc độ tấn công: sau ngần ấy giây chưa trả lời thì quái đánh, lặp lại mỗi chu kỳ). Quái không khai báo thì dùng số này.
  ANSWER_TIMEOUT_SEC: 20,
  // HẦM NGỤC THEO TẦNG (vô hạn): mỗi tầng 1 quái; hạ quái = vượt tầng, lên tầng kế (HP người chơi giữ nguyên).
  // Phẩm chất quái theo tầng, MỖI HẦM NGỤC MỘT BẢNG RIÊNG (khóa = số hầm ngục 1/2); phẩm chất = trường "type" trong <monster_key>.json (không phân biệt hoa/thường).
  // Thiếu quái đúng phẩm chất trong pool của hầm ngục thì lấy phẩm chất gần nhất (nếu ngang khoảng cách, ưu tiên cao hơn).
  // Vào lại hầm ngục: đã vượt tầng N thì bắt đầu từ tầng N - REENTRY_BACK (tối thiểu 1). Kỷ lục tầng cao nhất vẫn giữ nguyên.
  DUNGEON: {
    ORDER: ['normal', 'uncommon', 'rare', 'epic', 'legendary'],
    TIERS: {
      1: [{ to: 20, type: 'normal' }, { to: 40, type: 'uncommon' }, { to: 60, type: 'rare' }, {to: 80, type:'epic'}, {to: Infinity, type:'legendary'}],
      2: [{ to: 20, type: 'rare' }, { to: 50, type: 'epic' }, { to: Infinity, type: 'legendary' }]
    },
    REENTRY_BACK: 5,
    // v5.7 — CÂN BẰNG THEO TẦNG: mỗi STEP tầng quái tăng SCALE_PER_STEP của giá trị GỐC (cộng thẳng, không nhân dồn) cho HP/ATK/DEF (không CRIT);
    // tỉ lệ rơi vật phẩm tăng cùng hệ số (5% → 5,5% ở tầng 11–20, 6% ở 21–30…). Tầng 1–10 ×1,0; 11–20 ×1,1; 21–30 ×1,2 …
    STEP: 10,
    SCALE_PER_STEP: 0.10,
    // Thưởng Gold/EXP cuối lượt tăng thêm (cộng vào hệ số thưởng): đạt tầng XY → +X0% (tầng 37 → +30%, tầng 9 → +0%). Crystal không nhân.
    REWARD_PER_TENS: 0.10,
    // ĐIÊN LOẠN (Madness, chỉ hầm ngục): HP/ATK/DEF ×MULT, CRIT +CRIT_BONUS (cộng SAU cân bằng theo tầng). 100% ở tầng bội số của EVERY, CHANCE ở các tầng khác.
    // Hạ quái Điên loạn nhận CRYSTALS Crystal (Crystal hầm ngục CHỈ đến từ Điên loạn). Sprite riêng: <key>_madness_idle.png / <key>_madness_animation.png.
    MADNESS: { EVERY: 10, CHANCE: 0.10, MULT: 1.5, CRIT_BONUS: 10, CRYSTALS: 1, NAME_PREFIX: 'Điên loạn · ' },
    MAX_CRYSTALS_PER_RUN: 30,   // [RULES] trần Crystal mỗi lượt lưu
    MAX_FLOOR: 100000,   // [RULES] trần tầng ghi trong bảng xếp hạng (Dung1Floor / Dung2Floor)
    MAX_FLOORS_PER_RUN: 300   // [RULES] một lượt chơi tăng kỷ lục tối đa bấy nhiêu tầng
  },
  KILL_GAP_MS: 1000,   // quái bị hạ mất bấy lâu mới hồi sinh/quái mới xuất hiện (Phiêu lưu/Hầm ngục); câu hỏi kế tiếp hiện NGAY, không chờ
  MAX_LEVEL_BONUS_CRYSTALS: 50,   // thưởng một lần khi lên cấp tối đa (MAX_LEVEL); [RULES] trần Crystal mỗi lượt khi lên cấp 100 là 80
  KILL_BONUS: { stage: 0.10 },   // stage: cộng dồn thẳng 10% mỗi quái bị hạ
  MIN_LOSE_FACTOR: 0.10,    // thua: thưởng = % sát thương gây cho quái, tối thiểu 10%
  REWARD: {
    repeatFactor: 1,        // Plan không giảm thưởng khi chơi lại; chỉnh <1 nếu muốn chống farm
    maxGold: 20000,         // [RULES] trần Gold mỗi lượt (world.json + bonus quái hạ)
    maxExp: 60000           // [RULES] trần EXP mỗi lượt
  },
  REWARD_COOLDOWN_SEC: 20,  // [RULES] khoảng cách tối thiểu giữa hai lần ghi thưởng
  // Crystal: hoàn thành Stage với tỉ lệ đúng > 85% → +1 Crystal;
  // Dungeon: mỗi 10 tầng vượt được nhận 1 Crystal. Không nhân với hệ số thưởng.
  CRYSTAL: {
    stage: { minCorrectRatio: 0.85, amount: 1 },
    dungeon: { fromMadness: true }   // Crystal hầm ngục chỉ từ quái Điên loạn (GAME.DUNGEON.MADNESS.CRYSTALS mỗi con)
  }
};

// RANKED (games/ranked.js): đấu với BẢN CHỤP của một bạn cùng lớp có hạng gần mình (B không cần online). Mọi mục [RULES] phải khớp khối `match /ranked/...` trong rules.
CONFIG.RANKED = {
  DAILY_MATCHES: 5,        // [RULES] tối đa số trận mỗi ngày (tính cả thắng và thua; tính lúc BẮT ĐẦU trận để không bỏ dở né giới hạn); reset 0 giờ giờ VN
  START_POINTS: 10,        // [RULES] điểm tặng khi lần đầu vào Ranked
  WIN_BASE: 10,            // [RULES] thắng được WIN_BASE + max(0, điểm B − điểm A)
  MAX_DIFF: 100,           // [RULES] trần phần chênh lệch được cộng (chặn báo thắng gian lận với đối thủ cực mạnh)
  RANK_RANGE: 10,          // chọn B ngẫu nhiên trong ±RANK_RANGE hạng quanh A (cả trên lẫn dưới)
  MIN_BATTLE_SEC: 20,      // [RULES] báo thắng phải cách lúc bắt đầu ≥ ngần này giây
  CACHE_SEC: 300,          // dùng lại tài liệu lớp đã đọc trong 5 phút khi mở bảng (chỉ ở trình duyệt)
  TOP: 10                  // chỉ top 10 được hiển thị/xếp hạng/thưởng
};

// Boss Raid (games/boss-battle.js). Mọi mục [RULES] phải khớp khối `match /raids/...` trong firestore.rules (sửa cả hai nơi rồi Publish lại rules).
// Luồng mỗi ngày của MỖI khối được xếp lịch (SCHEDULE): Boss 1 xuất hiện khi có START_PLAYERS người bấm vào TRƯỚC giờ đóng cửa (CLOSE_MIN);
// Boss 1 kéo dài tối đa BOSS_MIN phút (hết giờ mà chưa hạ = THẤT BẠI); Boss 2 xuất hiện BOSS2_DELAY_MIN phút sau khi Boss 1 kết thúc (hạ hoặc thất bại),
// bắt đầu khi có người đầu tiên bấm vào (không cần đủ 5 người) và cũng kéo dài tối đa BOSS_MIN phút. Boss đã mở thì chạy nốt kể cả quá CLOSE_MIN.
CONFIG.RAID = {
  // LỊCH MỞ RAID — SỬA TẠI ĐÂY (và hàm scheduledGrades() trong firestore.rules). Khóa = thứ trong tuần theo cách gọi Việt Nam:
  // 2 = Thứ Hai … 7 = Thứ Bảy, 8 = Chủ Nhật. Giá trị = danh sách khối được đánh Boss hôm đó. Ngày không có khóa = không mở Raid.
  SCHEDULE: { 2: ['7'], 3: ['7'], 4: ['6', '8'], 5: ['7'], 6: ['6', '8'], 7: ['7'], 8: ['9'] },
  OPEN_MIN: 19 * 60, CLOSE_MIN: 21 * 60,   // [RULES] cửa kích hoạt Boss 1: 19:00–21:00 VN = 12:00–14:00 UTC (phút 720–840)
  START_PLAYERS: 5,                        // [RULES] đủ ngần này người bấm vào thì Boss 1 xuất hiện
  MAX_PLAYERS: 70,                         // [RULES] tối đa người chơi mỗi Boss
  BOSS_MIN: 15,                            // [RULES] thời gian tối đa mỗi Boss (phút); quá giờ mà chưa hạ = thất bại
  BOSS2_DELAY_MIN: 5,                      // [RULES] Boss 2 xuất hiện sau khi Boss 1 kết thúc bấy nhiêu phút
  LATEST_START_MIN: 22 * 60 + 30,          // [RULES] Boss 2 chỉ được bắt đầu trước 22:30 VN (chặn mở muộn qua đêm)
  LOBBY_POLL_SEC: 15, LOBBY_MAX_MIN: 10,   // phòng chờ: cứ 15 giây đọc 1 lần xem đủ người chưa; chờ tối đa 10 phút rồi dừng (bấm lại để chờ tiếp)
  GRACE_MIN: 3,                            // [RULES] vẫn nhận lượt gửi sát thương cuối tối đa 3 phút sau khi Boss hết giờ (rules dùng BOSS_MIN + GRACE_MIN)
  FLUSH_SEC: 120,                          // chu kỳ gửi sát thương + đọc HP Boss (giây). Tăng = ít đọc/ghi hơn nhưng HP Boss cập nhật chậm hơn
  MIN_FLUSH_GAP_SEC: 105,                  // [RULES] khoảng cách tối thiểu giữa hai lần ghi của một người (nên ≈ 0,9 × FLUSH_SEC)
  MAX_FLUSH_DAMAGE: 60000,                 // [RULES] trần sát thương mỗi lần gửi (≈ trần 2 phút, đã tính cả bonus ít người); phần dư gửi lần sau
  // Ít người thì tăng sát thương: dưới FEW_PLAYERS_UNTIL người, mỗi người thiếu tăng thêm FEW_PLAYERS_BONUS (0,10 = +10%) sát thương cho mọi người chơi.
  // (5 người = +50%.) Số người lấy từ trường Players của Boss, đọc mỗi chu kỳ gửi — không tốn thêm lượt đọc.
  FEW_PLAYERS_UNTIL: 10, FEW_PLAYERS_BONUS: 0.10,
  COUNTER_SEC: 20,                         // Boss phản công mỗi 20 giây (đồng hồ đếm ngược ở trình duyệt, không đồng bộ), ngoài lần đánh khi trả lời sai
  // KỸ NĂNG CUỐI của Boss: mỗi lần Boss mất thêm ULT_EVERY_PCT% HP tối đa (75% → 50% → 25% còn lại) Boss tung kỹ năng cuối gây ULT_DAMAGE sát thương lên TẤT CẢ người chơi
  // (sát thương cố định, không trừ DEF). Kiểm tra mỗi giây ở trình duyệt từ HP Boss đã đồng bộ (cập nhật mỗi FLUSH_SEC); người vào trễ không bị "bù" các lần đã qua.
  // File JSON của Boss có thể ghi "ultimate": { "name": "Tên kỹ năng", "damage": 800 } để đổi tên/sát thương.
  ULT_EVERY_PCT: 25,
  ULT_DAMAGE: 500,
  REVIVE_SEC: 10,                          // hồi sinh sau khi bị hạ gục (Plan 5.2)
  TOP: 10,                                 // chỉ top 10 sát thương được xếp hạng/thưởng
  BOSS_HP: { '6': 100000, '7': 100000, '8': 100000, '9': 100000 },   // [RULES] HP tối đa Boss mỗi khối — SỬA TẠI ĐÂY (và bossMax() trong rules)
  BOSS_FILE: 'assets/raid/raid_boss.json'  // ATK/DEF/CRIT + sprite của Boss (thay ảnh trong assets/raid/)
};

// Bảng xếp hạng THEO TUẦN theo khối (js/leaderboard.js). Mốc reset tuần: 07:00 sáng thứ Hai giờ Việt Nam (UTC+7),
// trùng 00:00 UTC thứ Hai nên firestore.rules tính được bằng request.time.   [RULES] WeekStart
// Đổi NGHỀ (Archer/Mage/Warrior) tối đa 1 lần mỗi CLASS_CHANGE_HOURS giờ (đổi giới tính/kiểu nhân vật CÙNG nghề không giới hạn).
// Mốc đổi gần nhất lưu ở hồ sơ (ClassChangedAt, giờ máy chủ) nên đếm ngược ở trình duyệt không tốn thêm lượt đọc. [RULES] khớp validCharacter() trong firestore.rules.
CONFIG.CLASS_CHANGE_HOURS = 5;   // [RULES] khớp duration.value(5, 'h') trong validCharacter
// Màn Trang bị: cắt bấy nhiêu px bên PHẢI mỗi khung sprite nhân vật (px của ảnh gốc), xem Inventory.startPortrait.
CONFIG.PORTRAIT_CROP_RIGHT = 50;

CONFIG.RANK = {
  TOP: 10, REFRESH_SEC: 300,   // chỉ top 10 có hạng; mỗi học sinh tải mới tối đa 1 lần / 5 phút / tab (chỉ ở trình duyệt)
  GRADE_BOARD_ENABLED: false,  // bảng KHỐI: tab vẫn hiện nhưng KHÔNG truy vấn Firestore; đặt true để mở lại khi đã biết mức tiêu hao đọc/ghi
  // Phạm vi bảng: 'room' = theo LỚP (vd 6/5), 'grade' = theo KHỐI. Mỗi bảng (phạm vi × tab: Ải, Hầm ngục 1, Hầm ngục 2) có phần thưởng riêng.
  // Thưởng cho TOP 10, chia bậc: hạng 1, hạng 2, hạng 3, hạng 4–10; mỗi bậc gồm Gold và Crystal (mặc định 100 Gold + 3/2/1/1 Crystal).
  // Đây chỉ để HIỂN THỊ trên bảng xếp hạng; số thật do giáo viên nhập ở trang admin khi chốt (giữ hai nơi khớp nhau).
  REWARDS: {
    room:  { stage: { top1: { gold: 2000, crystals: 3 }, top2: { gold: 1000, crystals: 2 }, top3: { gold: 700, crystals: 1 }, top4_10: { gold: 500, crystals: 1 } }, dungeon1: { top1: { gold: 2000, crystals: 5 }, top2: { gold: 1500, crystals: 3 }, top3: { gold: 1000, crystals: 2 }, top4_10: { gold: 700, crystals: 1 } }, dungeon2: { top1: { gold: 4000, crystals: 7 }, top2: { gold: 2500, crystals: 4 }, top3: { gold: 1500, crystals: 3 }, top4_10: { gold: 1000, crystals: 1 } } },
    grade: { stage: { top1: { gold: 4000, crystals: 5 }, top2: { gold: 2000, crystals: 3 }, top3: { gold: 1000, crystals: 1 }, top4_10: { gold: 700, crystals: 1 } }, dungeon1: { top1: { gold: 4000, crystals: 7 }, top2: { gold: 2000, crystals: 5 }, top3: { gold: 1000, crystals: 1 }, top4_10: { gold: 700, crystals: 1 } }, dungeon2: { top1: { gold: 6000, crystals: 10 }, top2: { gold: 3000, crystals: 7 }, top3: { gold: 2000, crystals: 5 }, top4_10: { gold: 1500, crystals: 1 } } }
  }
};

CONFIG.SLOTS = [
  { id: 'weapon', name: 'Vũ khí' }, { id: 'armor', name: 'Giáp' }, { id: 'helmet', name: 'Mũ' },
  { id: 'accessory', name: 'Phụ kiện' }
];

// Phẩm chất vật phẩm (trường "quality" trong equipments.json, không phân biệt hoa/thường).
CONFIG.QUALITIES = {
  normal: { name: 'Thường', color: '#b8c5a6' },
  uncommon: { name: 'Tốt', color: '#6fd36f' },
  rare: { name: 'Hiếm', color: '#5aa9ff' },
  epic: { name: 'Sử thi', color: '#c070ff' },
  legendary: { name: 'Huyền thoại', color: '#ffb02e' },
  divine: {name:'Thần thánh', color:'#fc0e0e'}
};
CONFIG.quality = function (key) {
  return this.QUALITIES[String(key || 'normal').toLowerCase()] || { name: String(key), color: '#b8c5a6' };
};
// Tên nghề dùng cho ràng buộc "class" của vật phẩm (khóa trùng Character.classKey).
CONFIG.CLASS_NAMES = { warrior: 'Chiến binh', archer: 'Cung thủ', mage: 'Pháp sư' };
CONFIG.normalizeClass = function (name) {
  const key = String(name || '').trim().toLowerCase();
  return key === 'magical' ? 'mage' : key;
};
// Hiệu ứng trang bị (Giai đoạn 3): khóa = type viết thường bỏ ký tự lạ; text(x) = mô tả hiển thị. Cơ chế ở js/effects.js.
// Kho đồ gộp: tối đa STACK_MAX món cùng loại (lưu "warlord_sword 5"); bán cho NPC = SELL_RATIO × giá mua (làm tròn LÊN, cả Gold và Crystal).
CONFIG.STACK_MAX = 10;
// Giá BÁN cho NPC của vật phẩm CHỈ RƠI (không ghi giá, không mua được trong Cửa hàng): theo phẩm chất, tính bằng Crystal (không có Gold).
CONFIG.DROP_ONLY_SELL_CRYSTALS = { epic: 1, legendary: 2, divine: 5 };
// Giới hạn thời gian chơi mỗi ngày (giờ Việt Nam), đếm ở trình duyệt (js/playtime.js).
CONFIG.PLAYTIME = { LIMIT_SEC: 3 * 3600, WARN_SEC: 600, IDLE_SEC: 120 };
CONFIG.SELL_RATIO = 0.5;
CONFIG.BURN_MAX_STACKS = 10;   // Thiêu đốt: tối đa 10 tầng
CONFIG.EFFECTS = {
  burn: { name: 'Thiêu đốt', text: x => `Mỗi đòn tấn công tích 1 tầng (tối đa 10), mỗi tầng gây thêm ${x} sát thương; mất hết tầng khi bị tấn công` },
  pierce: { name: 'Xuyên giáp', text: x => `Bỏ qua ${x}% DEF của kẻ địch` },
  blessing: { name: 'Ban phước', text: x => `Hồi ${x}% HP tối đa mỗi lượt` },
  steallife: { name: 'Đoạt huyết', text: x => `Hồi HP bằng ${x}% sát thương đã gây ra` },
  thorns: { name: 'Gai góc', text: x => `Gây ${x} sát thương khi bị tấn công` },
  ambush: { name: 'Đột kích', text: x => `Tăng ${x}% sát thương khi chí mạng` },
  holyshield: { name: 'Thánh thuẫn', text: x => `${x}% sát thương nhận vào bằng 0` },
  sturdy: { name: 'Cường tráng', text: x => `Giảm ${x}% sát thương khi bị chí mạng` },
  smite: { name: 'Trừng phạt', text: x => `${x}% gây thêm sát thương bằng 25% HP kẻ địch (tối đa 2000)` },
  berserk: { name: 'Cuồng chiến', text: x => `Mỗi 10% HP đã mất tăng ${x}% sát thương gây ra` }
};
CONFIG.EFFECT_NAMES = { recovery: 'Hồi phục', reducedmg: 'Giảm sát thương nhận', increasedmg: 'Tăng sát thương gây ra', steallife: 'Hút máu', lucky: 'May mắn' };

// Metadata vật phẩm được nạp từ assets/items/equipments.json (khóa = ID dạng chữ); Firestore chỉ lưu ID đã sở hữu/đang mặc, chỉ số trang bị cộng ở trình duyệt.
CONFIG.ITEMS = [];
CONFIG.itemsLoaded = false;
CONFIG.itemsPromise = null;
CONFIG.loadItems = function () {
  if (this.itemsLoaded) return Promise.resolve();
  if (!this.itemsPromise) {
    this.itemsPromise = fetch('assets/items/equipments.json')
      .then(response => {
        if (!response.ok) throw new Error(`Không tải được danh mục trang bị (${response.status}).`);
        return response.json();
      })
      .then(catalog => {
        if (!catalog || typeof catalog !== 'object' || Array.isArray(catalog)) {
          throw new Error('Danh mục trang bị không đúng định dạng.');
        }
        const validSlots = new Set(this.SLOTS.map(slot => slot.id));
        const items = Object.entries(catalog).map(([id, item]) => {
          // ID vật phẩm dạng chữ thường không dấu (vd iron_sword, warlord_armor); khớp bảng trong firestore.rules.
          if (!/^[a-z][a-z0-9_]{2,40}$/.test(id)) throw new Error(`ID trang bị "${id}" không hợp lệ (chỉ dùng chữ thường không dấu, số, dấu gạch dưới; ví dụ iron_sword).`);
          const slot = String(item.slot || '').toLowerCase();
          const gold = Number(item.price && item.price.gold);
          const gems = Number(item.price && item.price.gem);
          if (!item.name || !validSlots.has(slot) || !Number.isSafeInteger(gold) || gold < 0
            || !Number.isSafeInteger(gems) || gems < 0 || !item.stats || typeof item.stats !== 'object') {
            throw new Error(`Thông tin trang bị ${id} trong equipments.json không hợp lệ.`);
          }
          return {
            id, slot, name: item.name, price: gold, gemPrice: gems,
            dropOnly: gold === 0 && gems === 0,   // không ghi giá (price rỗng/0) = chỉ nhận từ phần thưởng rơi, không bán trong Cửa hàng
            power: Object.values(item.stats).some(value => Number(value) !== 0),
            bonus: item.stats, effect: item.effect,
            // bộ đồ: trường "set" nếu có, mặc định = phần trước dấu _ đầu tiên của id (warlord_sword → warlord); hiệu ứng bộ khai báo trong assets/items/sets.json
            set: typeof item.set === 'string' && item.set.trim() ? item.set.trim().toLowerCase() : id.split('_')[0],
            // đường dẫn tương đối (catalog có thể ghi "/assets/..." → bỏ dấu "/" đầu để chạy được trên GitHub Pages)
            image: typeof item.image === 'string' ? item.image.replace(/^\/+/, '') : '',
            quality: String(item.quality || 'normal').toLowerCase(),
            // class: mảng nghề được dùng; rỗng/thiếu = mọi nghề
            classes: Array.isArray(item.class) ? item.class.map(c => this.normalizeClass(c)).filter(Boolean) : []
          };
        });
        if (!items.length) throw new Error('Danh mục equipments.json đang trống.');
        this.ITEMS = items;
        this.itemsLoaded = true;
        return this.loadSets();   // hiệu ứng bộ đồ (không có file thì bỏ qua)
      })
      .catch(error => {
        this.itemsPromise = null;
        throw error;
      });
  }
  return this.itemsPromise;
};

// ----- Hiệu ứng BỘ ĐỒ: assets/items/sets.json (hoặc set.json) -----
// { "warlord": { "name": "Bộ Chiến Thần", "2": [ {"type":"Pierce","value":10} ], "4": [ {...}, {...} ] } }  — khóa số = số món đang mặc; mỗi mốc là một effect {type,value} hoặc mảng.
CONFIG.SETS = {};
CONFIG.loadSets = function () {
  const get = url => fetch(url).then(r => (r.ok ? r.json() : null)).catch(() => null);
  return get('assets/items/sets.json').then(data => data || get('assets/items/set.json')).then(data => {
    const sets = {};
    Object.entries(data && typeof data === 'object' ? data : {}).forEach(([key, def]) => {
      const tiers = Object.entries(def || {}).filter(([k]) => /^\d+$/.test(k) && Number(k) > 0)
        .map(([k, v]) => ({ count: Number(k), effects: (Array.isArray(v) ? v : v ? [v] : []).filter(e => e && e.type) }))
        .filter(t => t.effects.length).sort((a, b) => a.count - b.count);
      if (tiers.length) sets[key.toLowerCase()] = { name: (def && def.name) || key, tiers };
    });
    CONFIG.SETS = sets;
  });
};
// ----- Hầm ngục theo tầng: phẩm chất quái của một tầng (theo hầm ngục 1/2) và tầng bắt đầu khi vào lại -----
CONFIG.dungeonTier = function (floor, dungeonIndex) {
  const D = this.GAME.DUNGEON, tiers = D.TIERS[dungeonIndex] || D.TIERS[1];
  return (tiers.find(t => floor <= t.to) || tiers[tiers.length - 1]).type;
};
// Hệ số cân bằng của tầng (cộng thẳng): tầng 1–10 → 1,0; 11–20 → 1,1; …  Dùng cho chỉ số quái và tỉ lệ rơi vật phẩm.
CONFIG.dungeonScale = function (floor) {
  const D = this.GAME.DUNGEON;
  return 1 + D.SCALE_PER_STEP * Math.floor((Math.max(1, floor) - 1) / D.STEP);
};
// Thưởng thêm (phần trăm dạng số thập phân) khi lượt chơi đạt tầng topFloor: X0% với topFloor = XY.
CONFIG.dungeonRewardBonus = function (topFloor) {
  return this.GAME.DUNGEON.REWARD_PER_TENS * Math.floor(Math.max(0, topFloor) / 10);
};
CONFIG.dungeonStartFloor = function (best) {
  return Math.max(1, (best || 0) - this.GAME.DUNGEON.REENTRY_BACK);
};
