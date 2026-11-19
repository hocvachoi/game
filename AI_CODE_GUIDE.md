# Hướng dẫn mã nguồn cho AI

> Phạm vi sản phẩm hiện tại: **V3 + cập nhật V4** (theo lộ trình trong `Plan.md`; mục 7–9 mô tả hiện trạng V3, mục 12 mô tả các thay đổi V4 đã làm).

Tài liệu này giúp AI tìm đúng file trước khi sửa, hiểu luồng dữ liệu và áp dụng yêu cầu sản phẩm hiện hành. Đây là bản đồ mã nguồn theo hiện trạng repository, không thay thế hành vi thực tế trong code. Khi tài liệu và code mâu thuẫn, hãy xác minh code đang chạy và cập nhật lại tài liệu nếu cần. Phân biệt yêu cầu đã chốt với đề xuất/chưa chốt trong `Plan.md`; không tự biến ý tưởng tương lai thành yêu cầu V2.

## 1. Tổng quan kiến trúc

Đây là website tĩnh HTML/CSS/JavaScript chạy phía trình duyệt, không có backend Node.js trong repository. Firebase Authentication dùng cho tài khoản; Firestore lưu hồ sơ và áp dụng quyền ghi qua `firestore.rules`. Câu hỏi được đọc từ file Excel bằng SheetJS.

```text
index.html
  ├─ nạp CSS, thư viện Firebase và SheetJS
  ├─ nạp js/config.js → cấu hình thế giới, ải, quy tắc game (CONFIG.GAME), vật phẩm
  ├─ nạp js/characters/*.js → lớp Character/Warrior/Archer/Mage + roster.js (danh sách, bộ nạp JSON)
  ├─ nạp js/firebase.js → FirebaseService
  ├─ nạp js/auth.js, quiz.js, player.js, inventory.js, shop.js, stage-monster.js
  ├─ nạp js/sprites.js → Stage (các hiệu ứng chiến đấu hiện có)
  ├─ nạp games/adventure.js → Adventure (vòng chơi ải)
  ├─ nạp js/world-map.js → WorldMap
  └─ nạp js/main.js → nối DOM, đăng nhập và điều hướng

Đăng nhập → Auth.loadStudent → Player.load → WorldMap.open
→ Adventure.start → Quiz.parse/pick/run → Stage.fx
→ Adventure.finish → Player.saveRun → Firestore transaction
```

### Phạm vi yêu cầu sản phẩm V2

Theo lộ trình ở `Plan.md`, V2 kế thừa nền tảng V1 (đăng nhập, hồ sơ, đọc Excel và làm bài) và tập trung vào **XP, Gold, trang bị và cửa hàng**. Khi làm tính năng thuộc phạm vi này, cần tuân thủ các yêu cầu sau:

- Mỗi học sinh dùng hồ sơ nhân vật riêng; dữ liệu cần thiết được lưu và khôi phục khi đăng nhập lại. Dùng nickname trong nội dung công khai, không đưa tên thật lên bảng/hoạt động chung nếu không cần thiết.
- Câu hỏi lấy từ file Excel trong `questions/`; giáo viên cập nhật file theo cấu trúc được parser hỗ trợ mà không cần sửa logic game. Đáp án có thể nằm trong file và được kiểm tra trên trình duyệt theo quyết định hiện tại; không gọi Firebase cho từng đáp án sai.
- Hồ sơ V2 cần duy trì Level, XP, Gold, chỉ số, vật phẩm sở hữu và trang bị đang dùng. Catalog vật phẩm là `assets/items/equipments.json`; `js/config.js` nạp catalog cho giao diện, còn `firestore.rules` xác nhận ID/ô/giá khi giao dịch. Logic mua/trang bị nằm ở `js/player.js`, `js/shop.js` và `js/inventory.js`.
- Cửa hàng không cho mua nếu không đủ Gold. Mua hàng và trang bị phải cập nhật nhất quán; không tin số dư, giá hoặc chỉ số do client tự gửi nếu Rules không xác nhận hợp lệ.
- Hạn chế đọc/ghi không cần thiết để kiểm soát chi phí Firebase. Chỉ đồng bộ thay đổi cần lưu; không đồng bộ mỗi lần người chơi trả lời sai hoặc theo từng khung hình.
- Giữ kiến trúc hosting tĩnh hiện tại; không giả định GitHub Pages cung cấp backend. Không đưa bí mật hoặc mật khẩu vào mã nguồn phía trình duyệt.
- Tiêu chí nghiệm thu V2: đăng nhập và tải lại đúng hồ sơ; bài Excel hiển thị/chấm đúng; thay file câu hỏi cùng cấu trúc không cần sửa code; tiến trình/phần thưởng XP và Gold được lưu đúng theo quy tắc hiện hành; mua hàng bị từ chối khi thiếu tiền; vật phẩm sở hữu/trang bị hiển thị đúng sau khi tải lại.

**Giới hạn phạm vi:** V3 trong `Plan.md` là Phiêu lưu/vượt ải; Boss Raid, bảng xếp hạng và PvP thuộc các giai đoạn sau. Dù đã có một phần mã hoặc placeholder, không xem các chế độ đó là yêu cầu V2 hay tính năng đã hoàn thiện. Các quy tắc chưa chốt trong `Plan.md` (ví dụ công thức thống kê/phần thưởng, mô hình xếp hạng, cấu hình Boss/PvP, lựa chọn cơ sở dữ liệu hoặc mức hỗ trợ điện thoại) không được tự chọn làm quy tắc sản phẩm; hỏi người dùng trước khi triển khai nếu công việc phụ thuộc vào chúng.

### Thứ tự nạp script quan trọng

Các script trong `index.html` là script cổ điển, không phải module; phần sau sử dụng các global được định nghĩa trước đó. Nếu thêm script hoặc đổi thứ tự, kiểm tra các phụ thuộc:

- `js/config.js` phải có trước `js/characters/*.js`, `player.js`, `inventory.js`, `shop.js`, `leaderboard.js`, `world-map.js`, `main.js`; trong `js/characters/`: `character.js` → `warrior.js`/`archer.js`/`mage.js` → `roster.js`. `js/inventory.js` (định nghĩa `Ui`, `Inventory`) phải có trước `js/shop.js` và `main.js`; `js/leaderboard.js` (`Rank`) phải có trước `main.js` (`player.js` chỉ gọi `Rank` lúc chạy).
- `js/stage-monster.js` dùng `Character.validSheet` nên phải nạp sau `js/characters/character.js`.
- Firebase SDK phải có trước `js/firebase.js`; file này phải có trước `auth.js` và `player.js`.
- `js/quiz.js` phải có trước `games/adventure.js`; nó cũng định nghĩa helper DOM `el()` được dùng ở các file sau.
- `js/sprites.js` phải có trước `games/adventure.js`.
- `games/adventure.js`, `js/world-map.js`, và các module ứng dụng phải có trước `js/main.js`.

## 2. Bản đồ từng file

### File ở thư mục gốc

| File | Nội dung / chức năng | Khi nào cần sửa |
|---|---|---|
| `index.html` | Khung DOM của các màn hình đăng nhập, đăng ký, bản đồ, cửa hàng/trang bị và chơi ải; nạp CDN, CSS và JavaScript. Các `id` trong file được nhiều JS/CSS truy cập trực tiếp. | Thêm/sửa cấu trúc màn hình, biểu mẫu, vùng bản đồ/chiến đấu hoặc script. Khi đổi `id`, tìm và cập nhật mọi selector tương ứng trong JS/CSS. |
| `css/style.css` | Giao diện toàn website, layout responsive, màn chơi, HUD, bản đồ, vật phẩm và các hiệu ứng CSS. | Sửa màu sắc, bố cục, kích thước, responsive hoặc hiệu ứng trình bày. Không đặt quy tắc gameplay ở đây. |
| `firestore.indexes.json` | 6 chỉ mục kép của bảng xếp hạng (3 theo khối + 3 theo lớp). | Triển khai bằng `firebase deploy --only firestore:indexes` hoặc tạo tay theo mục 12. Đổi bộ lọc/sắp xếp của `Rank.fetch` thì phải cập nhật. |
| `firestore.rules` | Quyền đọc/tạo/cập nhật/xóa hồ sơ; xác thực danh tính; kiểm tra transaction nhận thưởng, mua hàng và trang bị ở máy chủ Firestore. | Thay đổi quyền truy cập hoặc điều kiện dữ liệu được ghi. Mọi thay đổi cần được kiểm tra và Publish trong Firebase Console. |
| `README.md` | Hướng dẫn cấu hình, chạy, triển khai và nội dung Excel. Có một số ghi chú phiên bản cũ; kiểm chứng với code hiện tại trước khi dựa vào chi tiết hành vi. | Cập nhật hướng dẫn cho người dùng/nhà triển khai sau khi thay đổi setup hoặc chức năng. |
| `Plan.md` | Đặc tả và ý tưởng sản phẩm, gồm yêu cầu đã nêu và đề xuất/chưa chốt. Không phải toàn bộ nội dung trong file đã được triển khai. | Cập nhật kế hoạch hoặc yêu cầu; không dùng riêng file này làm bằng chứng rằng một tính năng đã chạy. |
| `AI_CODE_GUIDE.md` | Bản đồ code, luồng tương tác và hướng dẫn chọn file để sửa dành cho AI. | Cập nhật khi cấu trúc file, luồng chính, giới hạn hoặc đường dẫn asset thay đổi. |

### `js/`

| File | Nội dung / chức năng | Tương tác / lưu ý khi sửa |
|---|---|---|
| `js/config.js` | Khởi tạo danh sách thế giới/ải, tải `world.json` (node, reward, `dungeon_monsters`), `CONFIG.GAME` (quy tắc lên cấp, đồng hồ, thưởng), slot và catalog vật phẩm. Không còn số câu/lượt hay tỉ lệ vượt ải. | `CONFIG.loadWorlds()` gắn node/reward/`monsters` vào stage/dungeon trước khi render. Hằng số `[RULES]` phải khớp `firestore.rules`. |
| `js/characters/character.js` | Lớp cơ sở `Character`: nạp/kiểm tra `character.json`, `statsAt(level)` (chỉ số gốc + `EXP_scale` × (level-1)), `verifySprites()`. | Mọi nhân vật dùng chung; không đặt dữ liệu riêng từng nhân vật ở đây. |
| `js/characters/warrior.js`, `archer.js`, `mage.js` | Lớp nghề: `classKey`, kiểu đánh mặc định, có bắt buộc `skill`/`castSkill` hay không (tầm xa thì bắt buộc). | Thêm nghề mới = thêm file kế thừa `Character` + nạp trong `index.html` trước `roster.js`. |
| `js/characters/roster.js` | `CONFIG.CHARACTERS` (key = tên thư mục), `CONFIG.loadCharacters()`, `CONFIG.character()`, `CONFIG.selectCharacter()` (chỉ đổi trong bộ nhớ), `CONFIG.classPrefix()`. | Nhân vật lỗi JSON hoặc thiếu ảnh bị loại khỏi danh sách (cảnh báo console). **Lựa chọn nhân vật lưu theo tài khoản** ở Firestore (trường `Character`, do `Player.setCharacter`), không còn `localStorage`. |
| `js/firebase.js` | Khởi tạo Firebase SDK compat và cung cấp `FirebaseService`, gồm `auth`, `db` và đường dẫn hồ sơ `accounts/{class}/users/{username}`. | Thay đổi cấu hình Firebase hoặc cách tạo service/ref. SDK được nạp trong `index.html`; không đặt mật khẩu trong file này. |
| `js/auth.js` | Đăng ký/đăng nhập/đăng xuất, chuẩn hóa tên đăng nhập/lớp, tạo email nội bộ, đọc hồ sơ và kiểm tra UID. | Được gọi bởi `main.js`; dùng `FirebaseService`. Khi đổi định dạng danh tính phải phối hợp với email identity trong `firestore.rules` và hồ sơ hiện hữu. |
| `js/player.js` | State người chơi phía client; cấp/chỉ số (nhân vật + trang bị **đúng nghề**); `fillTopBar(prefix)` cho thanh trên của Cửa hàng/Trang bị/Xếp hạng; transaction mua đồ, `setEquip` (ràng buộc `class`), `setCharacter` (đổi nghề → reset trang bị), `saveRun(level, outcome)` lưu thưởng, **Crystal**, tiến trình, vật phẩm rơi và bản ghi xếp hạng cùng một transaction. | Dùng bởi đăng nhập, bản đồ, cửa hàng, trang bị, xếp hạng, Adventure. Quy tắc Crystal ở `CONFIG.GAME.CRYSTAL`; trần mỗi lượt khớp `firestore.rules`. |
| `js/quiz.js` | Đọc cấu trúc Excel, xáo trộn, hiển thị ba dạng câu hỏi, chấm đáp án. `Quiz.run` có `cb.begin` (đồng hồ), `cb.loop` (Dungeon làm lặp vô hạn); `cb.result` có thể trả Promise để khóa nút tới khi đòn đánh chạm đích. | `games/adventure.js` cung cấp câu hỏi và callback. Cột Excel được mô tả trong `README.md`. `el()` là helper dùng chung ở nhiều file. |
| `js/world-map.js` | Màn chọn ải: ảnh bản đồ theo tỉ lệ gốc, thông tin người chơi trên ảnh và các nút thao tác bên ngoài khung; nút ải/hầm ngục theo % tọa độ; **bấm nút ải → hiện thanh trạng thái** (`#stage-info`) có nút vào ải, bấm lại/✕/vùng trống/Esc để ẩn; trạng thái khóa/mở/hoàn thành. | Dùng `CONFIG.WORLDS` và `Player.data.progress`; callback từ `main.js` khởi động `Adventure`. Số ải hiển thị = số phần tử `stage_nodes` (≤ 12). |
| `js/sprites.js` | Đối tượng `Stage` tải/vẽ nền, nhân vật và đối thủ; Mage/Archer bắn theo `castSkill.frame` trên đường ngang, giữ nguyên Y tại điểm bắn. Hurt/cập nhật HP chỉ xảy ra khi cả hoạt ảnh tấn công kết thúc và đạn đã tới đích. | `games/adventure.js`, `games/boss-battle.js` và `games/ranked.js` dùng chung `Stage`; đạn bay 240 ms. Đối thủ quái/Boss mặc định cận chiến, cần `sprites.skill` và `castSkill` nếu cấu hình tầm xa. |
| `js/stage-monster.js` | `StageMonster`: nạp `assets/monsters/<key>/<key>.json`, ánh xạ ải → quái (`forStage`), danh sách quái dungeon (`poolFor`), `attackInterval(monster)` (= `ANSWER_TIMEOUT_SEC` của quái, thiếu thì dùng mặc định config). | Không đọc `monster.json` nữa. **Tên file JSON phải đúng `<key>.json` và đường dẫn sprite đúng hoa/thường** (GitHub Pages phân biệt hoa/thường). Quái chưa có JSON bị bỏ qua, thiếu hết thì dùng `FALLBACK`. |
| `js/shop.js` | Màn **Cửa hàng** (UI theo `Shop_UI.PNG`): thẻ gọn (V4) gồm icon, phẩm chất, tên trên `Panel_name` giữ tỉ lệ 269:61 và **nút hiển thị số tiền** (không còn chữ "Mua"; chỉ số/hiệu ứng/nghề xem ở tooltip); thẻ lọc (Tag) theo `slot`; công tắc "Chỉ đồ dùng được"; túi đồ bên phải. | Gọi `Player.buy` qua `Ui.act`. Dữ liệu từ `CONFIG.ITEMS`. |
| `js/inventory.js` | `Ui` (thông báo + chạy thao tác ghi chống bấm đúp), `Tip` (tooltip vật phẩm rê chuột/focus, dùng chung Cửa hàng + Trang bị) và `Inventory`: hàm dùng chung (icon, phẩm chất, ô vật phẩm, thẻ lọc) và màn **Trang bị** chia đôi (UI theo `Equipment_UI.PNG`, icon tab/ô lấy từ `assets/ui/`): TRÁI nhân vật động + chỉ số + 4 ô đang mặc + chọn nhân vật; PHẢI kho đồ cuộn được. **V4:** không còn khung chi tiết lớn — rê chuột để xem tên/chỉ số (tooltip), bấm ô kho đồ = mặc/thay/tháo, bấm ô đang mặc = tháo; thiết bị cảm ứng (`hover: none`) chạm lần 1 = chọn, thanh thao tác gọn `#equip-info` có nút Mặc/Tháo. | Đổi nghề có hộp xác nhận vì sẽ tháo hết trang bị. Quy tắc chỉ số ở `player.js`, catalog ở `config.js`. |
| `js/main.js` | Điểm nối form/nút với Auth, Player, bản đồ, cửa hàng, trang bị, xếp hạng, Adventure; điều hướng màn hình; `setAppBackground()` (nền tổng = ảnh bản đồ làm mờ `#app-bg`). | Thay đổi luồng điều hướng/DOM event tại đây. Không còn chức năng chọn file Excel từ máy. |
| `js/leaderboard.js` | `Rank`: bảng xếp hạng **theo tuần**, chọn phạm vi **Lớp** (trường `Room`) hoặc **Khối** (tab Ải đã vượt / Hầm ngục 1 / Hầm ngục 2; phần thưởng riêng mỗi bảng ở `CONFIG.RANK.REWARDS`; thiếu chỉ mục thì hiện link tạo), top 10 + hạng của bản thân, cache `localStorage` 5 phút, `Rank.entry()` tạo bản ghi, mốc tuần. | Dữ liệu `leaderboards/<khối>/entries/<UID>` ghi cùng transaction nhận thưởng; xem mục 9. |

### `games/`

| File | Nội dung / chức năng | Tương tác / lưu ý khi sửa |
|---|---|---|
| `games/adventure.js` | Luồng Stage/Dungeon: tải Excel, chiến đấu (sát thương, CRIT, đồng hồ trả lời), xác định thắng/thua và gọi `Player.saveRun`. Hằng số `PASS_RATIO = 0.7` nằm ở đây. `Adventure.guard` (V4) che câu hỏi khi rời trang. | Cầu nối giữa `WorldMap`, `Quiz`, `Stage`, `StageMonster` và `Player`. Chỉ thay đổi ở đây khi yêu cầu liên quan trực tiếp đến vòng chơi ải; không đặt công thức/cấu hình chung ở đây nếu thuộc `config.js`/`player.js`. |
| `games/boss-battle.js` | **V4:** `Raid` — Boss Raid cả khối, mở 19:00–21:00 VN mỗi ngày (mục 12.9). Dùng lại `Adventure`/`Stage`/`Quiz`; gửi sát thương 1 phút/lần; top 10. | Hằng số ở `CONFIG.RAID`; bảng `[RULES]` khớp khối `match /raids/...` trong `firestore.rules`. Boss: `assets/raid/raid_boss.json`. |
| `games/ranked.js` | **Giai đoạn 3:** `Ranked` — đấu xếp hạng trong lớp với bản chụp của bạn cùng lớp (mục 12 bên dưới). Dùng lại `Adventure`/`Stage`/`Quiz`; có bảng đọc/ghi ở đầu file. | Hằng số ở `CONFIG.RANKED`; mục `[RULES]` khớp khối `match /ranked/...` trong `firestore.rules`. |
| `games/pvp.js` | Hiện chỉ có chú thích về ý tưởng PvP; chưa có triển khai. | Không sửa như thể đã có gameplay PvP. Đây là tính năng chưa hoạt động. |

### `assets/` và `questions/`

#### Quy ước asset hiện hành

- Adventure hiện render ảnh nền theo ải phủ toàn màn hình, sprite nhân vật/quái vật và thẻ câu hỏi nổi; bóng đổ đã bỏ khỏi sprite. Trên điện thoại yêu cầu xoay ngang. `Stage` trong `js/sprites.js` xử lý sprite, HP, hiệu ứng và skill; Mage/Archer giữ cách đánh tầm xa.
- `assets/maps/` chứa bản đồ chọn lớp/thế giới và ảnh nền theo từng ải ở định dạng JPG. `Selection_Stage_Map.jpg` là ảnh nền chọn map; `Stage_<i>.jpg` và `Dungeon_<i>.jpg` là ảnh nền chiến đấu. `World1`–`World4` lần lượt dành cho lớp 6–9.
- Mỗi `assets/maps/World<N>/world.json` quản lý metadata của một map: `id` (`world1`–`world4`), `name`, `stage_nodes`, `dungeon_nodes`, `stage_rewards` và `dungeon_rewards`. Các mảng node/reward đi theo thứ tự index stage/dungeon; dungeon node có `after` là stage cần vượt để mở.
- Reward mẫu có dạng `{ "EXP": 20, "GOLD": 10, "drops": [{ "itemId": "iron_sword", "chance": 0.05 }] }`; `chance` là xác suất 0–1 (ví dụ `0.05` = 5%). Dữ liệu được gắn vào `stage.reward`/`dungeon.reward`; đây là metadata cấu hình, không đồng nghĩa phần thưởng đã được áp dụng bởi hệ thống transaction hiện tại.
- `assets/characters/` tổ chức theo từng nhân vật: mỗi thư mục có `character.json` riêng định nghĩa tên/kiểu đánh, chỉ số, sprite sheets, frames và tọa độ bắn. `GameCharacter` trong `js/config.js` nạp cấu hình; `Stage` bắn skill sau frame tấn công cuối rồi vẽ hiệu ứng va chạm/cập nhật HP.
- `assets/monsters/` tổ chức theo từng quái vật: mỗi thư mục con đại diện cho một quái vật và chứa JSON riêng theo key, theo quy ước `assets/monsters/<monster_key>/<monster_key>.json` (ví dụ `undead_knight/undead_knight.json`). JSON này là nguồn dữ liệu chuẩn cho tên, kiểu, chỉ số, sprite/frames và skill nếu có.
- Không dùng `assets/monsters/monster.json` làm catalog hay nguồn định nghĩa đặc điểm quái vật; không thêm dữ liệu quái vật mới vào file này. `stage_monster.json` chỉ ánh xạ `Stage_i` sang `monster_key` (quái Dungeon khai báo ở `dungeon_monsters` trong `world.json`), không chứa bản sao stats/sprite. Loader (`js/stage-monster.js`) lấy JSON từ thư mục của key được chọn.
- Tên file hiện có có thể chưa khớp đầy đủ quy ước trên. Khi thao tác asset, đối chiếu file thật và giữ nguyên casing; không tự tạo tài nguyên còn thiếu hoặc đoán tên nhân vật.

| Đường dẫn | Nội dung / chức năng | Lưu ý |
|---|---|---|
| `assets/maps/World1/world.json` – `assets/maps/World4/world.json` | Tên world, vị trí stage/dungeon, điều kiện mở dungeon và reward mẫu từng màn. | Tải bằng `CONFIG.loadWorlds()` trước khi render map; chỉnh node theo phần trăm và reward cùng index tương ứng. |
| `assets/characters/<character>/` | Thư mục của một nhân vật (ví dụ `Archer_F`, `Archer_M`, `Magical_F`, `Magical_M`, `Warrior_F`, `Warrior_M`), chứa asset và `character.json`. | Chỉnh đặc điểm, HP/ATK/DEF, sheets/frames và vị trí bắn skill ở JSON của chính nhân vật đó; `castSkill.frame` là số frame nguồn 0-based, phải có trong `attack.frames`. Skill được bắn sau khi frame này kết thúc; `origin.y` chọn Y của người bắn, đạn giữ nguyên Y; `target.x` chọn đích ngang. |
| `assets/monsters/<monster_key>/` | Thư mục của một quái vật, gồm sprites và JSON riêng `<monster_key>.json` (ví dụ `undead_knight/undead_knight.json`). | Mỗi thư mục đại diện cho đúng một quái vật. JSON là nguồn chuẩn cho đặc điểm, stats, sprites/frames và skill nếu có. |
| `assets/monsters/monster.json` | File định nghĩa quái vật kiểu cũ, không thuộc quy ước cấu hình hiện hành. | Không dùng để thêm/đọc đặc điểm quái; ưu tiên JSON riêng bên trong thư mục của từng quái vật. |
| `assets/monsters/stage_monster.json` | Có thể ánh xạ thế giới/ải tới `monster_key`. | Chỉ làm nhiệm vụ chọn key; không chứa định nghĩa hoặc dữ liệu stats/sprite của quái vật. |
| `assets/items/equipments.json` | Catalog vật phẩm: ID, ô trang bị, chỉ số, hiệu ứng, ảnh và giá Gold/Crystal. | `js/config.js` nạp catalog cho cửa hàng/trang bị; `firestore.rules` kiểm tra ID/ô/giá và Firestore chỉ lưu ID trong hồ sơ. |
| `assets/items/helmet_legendary.png`, `assets/items/sword_legendary.png` | Ảnh vật phẩm mũ và kiếm. | Đường dẫn ảnh được khai báo trong `equipments.json`; một số item hiện dùng chung ảnh mũ. |
| `assets/maps/World1/` – `assets/maps/World4/` | Ảnh JPG chọn map (`Selection_Stage_Map.jpg`), nền từng ải (`Stage_<i>.jpg`) và ảnh Dungeon (`Dungeon_<i>.jpg`). | Tương ứng lần lượt lớp 6–9. World4 đã chuyển từ PNG sang JPEG quality 95. |
| `questions/` | Ngân hàng câu hỏi Excel mẫu/dùng bởi các world và ải cấu hình hiện tại. | Cấu trúc cột và quy ước loại câu hỏi nằm trong `README.md`; parser ở `js/quiz.js`. |

Khi thêm hoặc đổi ảnh/animation: giữ đúng quy ước class, số frame, kích thước mỗi frame và casing; kiểm tra file tồn tại.

## 3. Các luồng tương tác cần biết

### Đăng ký và đăng nhập

1. `index.html` cung cấp form.
2. `js/main.js` kiểm tra dữ liệu form và gọi `Auth`.
3. `js/auth.js` chuẩn hóa tên/lớp và xác thực Firebase Authentication.
4. `js/firebase.js` cung cấp kết nối và Firestore document.
5. `auth.js` đọc hồ sơ và xác nhận `UID`; `main.js` gọi `Player.load()`.
6. `main.js` gọi `WorldMap.open()` cho thế giới tương ứng với lớp.

### Bắt đầu và hoàn tất một ải

1. `js/config.js` cung cấp danh sách ải và file Excel.
2. `js/world-map.js` kiểm tra ải mở chưa rồi gọi callback bắt đầu.
3. `games/adventure.js` tải file, dùng `js/quiz.js` để parse và chọn câu hỏi.
4. `Adventure.run()` mở màn chơi, gọi `Stage.init()`/`Stage.reset()` và chạy quiz.
5. Mỗi đáp án gọi `Stage.fx()`; sát thương và cập nhật thanh HP đợi tới lúc kết thúc hoạt ảnh tấn công (và đạn bay tới đích với class tầm xa).
6. Khi hết câu, `Adventure.finish()` xác định đậu/trượt; khi vượt ải thì gọi hiệu ứng `Stage.defeat()`.
7. Với ải game hợp lệ, `Player.saveRun()` ghi tiến trình/thưởng bằng transaction; `firestore.rules` kiểm tra dữ liệu cập nhật. File Excel người dùng chọn để chơi thử không nhận thưởng theo logic hiện tại.

### Cửa hàng và trang bị (V3 mới)

1. `main.js` mở `Shop.open()` hoặc `Inventory.open()` (hai màn riêng, chuyển qua lại bằng tab ở đầu panel).
2. `shop.js` render catalog từ `CONFIG.ITEMS`; `inventory.js` render màn Trang bị.
3. Thao tác đi qua `Ui.act()` → `Player.buy()` / `Player.setEquip()` / `Player.setCharacter()`.
4. `Player.tx()` đọc hồ sơ mới nhất và ghi transaction.
5. `firestore.rules` quyết định cuối cùng giao dịch mua/trang bị có hợp lệ hay không.

## 4. Chọn file theo loại yêu cầu

| Yêu cầu | Bắt đầu tìm ở | File liên quan cần kiểm tra |
|---|---|---|
| Thêm/chỉnh tên thế giới, ải, file câu hỏi, vị trí nút ải | `js/config.js` | `js/world-map.js`, `README.md` |
| Sửa khóa/mở ải, đường đi, thông tin ải | `js/world-map.js` | `js/config.js`, `css/style.css` |
| Đổi số câu/lượt, ngưỡng vượt | `js/config.js` | `games/adventure.js` |
| Sửa cách đọc/hiển thị/chấm câu hỏi | `js/quiz.js` | `games/adventure.js`, `questions/*.xlsx`, `README.md` |
| Cập nhật/tổ chức ảnh nền, nhân vật, monster hoặc animation | Thư mục tương ứng trong `assets/` | Quy ước asset ở mục này; không cần nối renderer nếu không được yêu cầu |
| Thay đổi render/hiệu ứng chiến đấu | `js/sprites.js` | `games/adventure.js`, `index.html`, `css/style.css` và các asset liên quan; xác nhận trước nếu cần render nền/nhân vật |
| Sửa Gold/EXP, cấp, chỉ số, giao dịch game | `js/player.js` | `js/config.js`, `firestore.rules`, `README.md` |
| Sửa danh sách giá/cấp/bonus vật phẩm | `js/config.js` | `js/player.js`, `js/shop.js`, `js/inventory.js`, `firestore.rules` |
| Sửa quyền đọc/ghi dữ liệu | `firestore.rules` | `js/auth.js`, `js/player.js`, `js/config.js` |
| Sửa form, điều hướng, đăng xuất hoặc event của màn hình | `js/main.js` | `index.html`, module liên quan, `css/style.css` |
| Sửa bố cục, màu, mobile hoặc hiệu ứng CSS | `css/style.css` | `index.html` và selector dùng trong JS |
| Cấu hình Firebase hoặc dịch vụ | `js/firebase.js` | Firebase Console, `firestore.rules`, `js/auth.js` |

## 5. Ranh giới và lưu ý khi sửa

- Không trộn hoạt ảnh với logic game: `Stage` là trình bày; kết quả câu hỏi ở `Quiz`/`Adventure`; dữ liệu và giao dịch ở `Player`/`firestore.rules`.
- Không chỉnh các số được đánh dấu `[RULES]` ở riêng `config.js` hoặc riêng `firestore.rules`; hai phía phải đồng bộ.
- Khi đổi ID HTML trong `index.html`, kiểm tra `getElementById`, selector CSS và event trong `main.js`/các module.
- Khi thêm JS, giữ đúng thứ tự phụ thuộc trong `index.html`.
- Dùng đường dẫn asset tương đối từ thư mục website; xác nhận file thực sự tồn tại và URL trả thành công trước khi sửa hiệu ứng.
- Firebase Rules là giới hạn bảo mật thật sự cho Firestore. Kiểm tra phía trình duyệt chỉ hỗ trợ UX, không thay thế Rules.
- `Plan.md` có yêu cầu/đề xuất chưa triển khai; `pvp.js` chưa là tính năng hoạt động (`boss-battle.js` và `leaderboard.js` đã hoạt động từ V4).
- README có các đoạn mô tả thuộc phiên bản khác nhau. Nếu chúng mâu thuẫn, đối chiếu `main.js`, module nghiệp vụ và `firestore.rules`; cập nhật README nếu thay đổi ảnh hưởng hướng dẫn sử dụng.
- Không có `package.json` hoặc bộ test tự động trong cấu trúc hiện tại. Có thể chạy website bằng HTTP server cục bộ (hướng dẫn trong `README.md`) và xác minh trực tiếp trên trình duyệt.

## 6. Ghi chú triển khai so với tài liệu

- `index.html` nạp `games/adventure.js` và `games/boss-battle.js` (V4); `games/pvp.js` không được nạp và vẫn là placeholder.
- `js/leaderboard.js` và `games/boss-battle.js` được nạp và hoạt động (mục 9, 12). PvP vẫn là placeholder.
- Asset nhân vật hiện được tổ chức theo thư mục riêng và có JSON hướng dẫn riêng. Kiểm tra thư mục thực tế trước khi chọn nhân vật; không mặc định mỗi class chỉ có một biến thể.
- **Tương thích runtime (V3):** `js/stage-monster.js` đã đọc `assets/monsters/<key>/<key>.json`; `CONFIG.CHARACTERS` đăng ký đủ 6 nhân vật nhưng chỉ nhân vật có JSON hợp lệ **và** đủ file ảnh mới xuất hiện trong danh sách chọn. Hiện `Magical_F` và `Warrior_M` bị loại vì `character.json` trỏ tới file ảnh không có trong thư mục (thư mục chứa ảnh tên `Magical_M_*`/`Warrior_F_*`). Các thư mục quái `Bandits`, `Drowner`, `devil_bird`, `giant_slime`, `killer_bat` đang trống nên chưa dùng được; `assets/monsters/monster.json` là file cũ không còn được đọc.
- `README.md` chứa hướng dẫn cũ và mới nối tiếp nhau; dùng luồng/code hiện tại làm căn cứ khi rà soát phần lưu Firestore, tiến trình và phần thưởng.


## 7. Cập nhật V3: bản đồ ảnh, quái vật theo ải, sprite mới

- **Ảnh map**: `assets/maps/World<N>/Selection_Stage_Map.jpg` là nền màn chọn ải; `Stage_<i>.jpg` / `Dungeon_<i>.jpg` là nền trận đánh. Khối 6→World1, 7→World2, 8→World3, 9→World4 (`makeWorld()` trong `js/config.js`).
- **Tọa độ và reward của map**: chỉnh `stage_nodes`/`dungeon_nodes` trong `assets/maps/World<N>/world.json`; mỗi node có tọa độ theo phần trăm, dungeon có thêm `after`. `dungeon_monsters` (tùy chọn) là mảng song song với `dungeon_nodes`, mỗi phần tử là danh sách `monster_key` có thể xuất hiện trong dungeon đó. `stage_rewards`/`dungeon_rewards` là các mảng theo cùng thứ tự index, mỗi phần tử chứa EXP, GOLD và `drops` (`itemId`, `chance` từ 0 đến 1). `CONFIG.loadWorlds()` xác thực cấu trúc rồi gắn node/reward vào đối tượng từng màn.
- **Câu hỏi**: `questions/World<N>/Stage_<i>.xlsx`, `Dungeon_<i>.xlsx`. `stageCount` trong `makeWorld()` = số ải đã có file; số ải thật của map = số `stage_nodes` (World1=8, World2=12, World3=10, World4=9).
- **Mở khóa**: vượt ải i-1 và đạt cấp `1 + 5*(i-1)` (`CONFIG.GAME.STAGE_LEVEL_STEP`, Plan 13.4) → mở ải i. Điều kiện mở dungeon lấy từ `dungeon_nodes[].after` trong JSON world. Id tiến trình: `g<lớp>-stage-NN`, `g<lớp>-dungeon-N`.
- **World config**: mỗi map có `assets/maps/World<N>/world.json`, tải bằng `CONFIG.loadWorlds()` trước khi hiển thị. Từ V3, `Player.saveRun()` dùng đúng reward này làm thưởng gốc (xem mục 8).
- **Quái vật theo ải**: mỗi `assets/monsters/<monster_key>/` là một quái vật, cấu hình tại `<monster_key>.json` trong chính thư mục đó. `stage_monster.json` nếu dùng chỉ ánh xạ `default`/`worlds.World<N>.Stage_<i>`/`Dungeon_<i>` sang key; loader lấy JSON từ thư mục tương ứng. Không dùng `monster.json` để định nghĩa quái.
- **Sprite**: JSON riêng của mỗi nhân vật/quái vật khai báo stats và sprites/frames. Nhân vật dùng `assets/characters/<character>/character.json` (`stats.EXP_scale` = `[HP, ATK, DEF, CRIT]` cộng thêm mỗi cấp từ cấp 2); nhân vật tầm xa khai báo skill và tọa độ bắn, được `CONFIG.loadCharacters()` tải. Skill được gọi sau frame nguồn `castSkill.frame`; hurt/HP chờ tới cuối hoạt ảnh và lúc đạn tới đích. Quái vật dùng `assets/monsters/<monster_key>/<monster_key>.json`. Quái vật tầm xa khai báo skill và tọa độ bắn, Loader cần giữ các cấu hình này đồng bộ với `js/sprites.js` và `Stage.init({background, monster, character})`.
- `assets/items/equipments.json` là catalog được nạp bởi `CONFIG.loadItems()`; khi sửa ID/ô/giá, phải cập nhật bảng kiểm tra tương ứng trong `firestore.rules`. Firestore chỉ lưu ID trang bị và thông tin hồ sơ người chơi.
- Adventure render ảnh nền phủ toàn màn hình, sprite nhân vật/quái vật và thẻ câu hỏi nổi ở cạnh phải; các selector tương ứng ở cuối `css/style.css`. Font chữ pixel là **VT323** (`--pixel`, có glyph tiếng Việt); chữ thường vẫn là Be Vietnam Pro.

## 8. Hệ thống V3 đã triển khai (theo Plan mục 13.4–13.5)

- **Nhân vật OOP**: `Character` (`js/characters/character.js`) + `Warrior`/`Archer`/`Mage` mỗi lớp một file; dữ liệu cụ thể vẫn ở `assets/characters/<key>/character.json`. Chỉ số = `statsAt(cấp)` (gốc + `EXP_scale` × (cấp-1)) + trang bị. CRIT là tỉ lệ %.
- **Công thức sát thương**: `max(1, ATK - DEF)` × hệ số hiệu ứng trang bị (`IncreaseDMG` / `Reduce DMG`). **CRIT**: xác suất = CRIT% của nhân vật (JSON + trang bị) hoặc `stats.CRIT` của quái (JSON quái) → nhân đôi sát thương.
- **Đồng hồ trả lời**: quá `ANSWER_TIMEOUT_SEC` **của từng quái** (khai báo trong `<monster_key>.json`, xem như tốc độ tấn công) giây chưa trả lời thì quái tấn công, lặp lại mỗi chu kỳ. Quái không khai báo dùng mặc định `CONFIG.GAME.ANSWER_TIMEOUT_SEC` = 20s (Plan 13.4). Hiện: Undead Knight 15s, Killer Bat 10s.
- **Câu hỏi**: làm hết mọi câu trong file Excel (không còn `QUESTIONS_PER_RUN`/`PASS_RATIO` trong config). **Stage hoàn thành** khi người chơi còn sống, hạ ≥ 1 quái và đúng ≥ 70% (`Adventure.PASS_RATIO`; Plan 5.1 có chỗ ghi 80% nhưng mục 13.5 đã chốt 70%). Quái hồi sinh khi bị hạ trong Stage.
- **Dungeon**: danh sách quái ở `dungeon_monsters` trong `world.json`; hạ quái thì quái mới (ngẫu nhiên trong danh sách) xuất hiện, câu hỏi lặp lại (xáo lại), kết thúc khi người chơi hết HP. Tiến trình dungeon lưu `best` = số quái hạ nhiều nhất, không bao giờ `passed`.
- **Thưởng** (`Player.saveRun(level, outcome)`): thưởng gốc `EXP`/`GOLD`/`drops` từ `world.json`. Thắng Stage: × (1 + 10% × số quái hạ); Dungeon: × (1 + 5% × số quái hạ) (Plan 13.4 ghi 5% cho dungeon, mục "Cần làm" cũ ghi 10%; đã theo Plan); cộng thẳng, không lũy tiến. Thua hoặc chưa vượt ải: × max(10%, sát thương đã gây / HP một quái, tối đa 100%). Vật phẩm rơi: chỉ khi thắng (Dungeon: hạ ≥ 1 quái), tối đa 1 món/lượt, bỏ qua món đã có, random phía client. `CONFIG.GAME.REWARD.repeatFactor = 1` (Plan không giảm thưởng khi chơi lại).
- **Lên cấp**: lv1 cần 100 EXP, mỗi cấp tăng thêm 50 (EXP để đạt cấp L = 25·(L-1)·(L+2)). `MAX_LEVEL = 100` là giá trị tạm do Plan chưa nêu (ải 12 cần cấp 56).
- **Firestore**: hồ sơ lưu `LV`, `EXP`, `Golds`, `Crystals`, `Equipment`, `Enventory`, `progress`, `Room` (lớp, vd `6/5`; V4), `ClassChangedAt` (mốc đổi NGHỀ gần nhất, giờ máy chủ; tùy chọn), `Character` (tùy chọn; thiếu = `Archer_F`). `Equipment`/`Enventory` chứa **ID chữ** (vd `iron_sword`). `firestore.rules`: trần mỗi lượt Gold 20000 / EXP 60000 / Crystal 5, `LV` khớp `EXP`, thêm đúng 1 ID vật phẩm hợp lệ khi nhận thưởng; trang bị phải thuộc nghề của `Character`; đổi nghề phải đưa `Equipment` về rỗng cùng lúc.

## 9. Hệ thống đã triển khai từ danh sách "Những việc cần làm" (V3 cập nhật)

- **Crystal** (đã chốt): hoàn thành Stage với tỉ lệ đúng **> 85%** hoặc HP còn lại **> 80%** → +1; Dungeon thứ 2 mỗi 5 quái hạ → +1, tối đa 5/lượt. Cấu hình `CONFIG.GAME.CRYSTAL`; Rules giới hạn +5/lượt. Plan 6.3 (ghi "dưới 5 câu sai") đã được thay bằng quy tắc này.
- **Nhân vật theo tài khoản + ràng buộc nghề** (đã chốt): trường Firestore `Character` (vd `Archer_F`). Đổi **nghề** (Archer/Magical/Warrior) → `Equipment` về `{}` ngay trong cùng lần ghi; đổi giới tính cùng nghề giữ trang bị. Vật phẩm có `class` (Warrior/Archer/Mage|Magical; rỗng = mọi nghề) chỉ mặc được đúng nghề; chỉ số bỏ qua trang bị sai nghề. Rules: `classesOf()` (danh sách ID → nghề, **phải cập nhật khi đổi catalog**), `charKeys()`, `validCharacter()`.
- **Catalog vật phẩm**: loader chuẩn hóa `image` (bỏ dấu `/` đầu), `quality` (chữ thường; bảng nhãn/màu `CONFIG.QUALITIES`), `classes`. Hiệu ứng (`effect`) chỉ hiển thị; hiện chỉ `Increase/Reduce DMG` được áp dụng khi đánh.
- **Chọn ải**: bỏ chọn file Excel từ máy; `stage_nodes`/`dungeon_nodes` của World1/3/4 đã cập nhật theo số trên ảnh (World2 giữ nguyên); `after` của hầm ngục lấy theo đường chấm nối trên ảnh (W1: 1 và 4; W3: 1 và 5; W4: 2 và 6). Ảnh World1/3 là 1280×720, World2/4 là 1672×941; khung bản đồ tự lấy tỉ lệ từ ảnh.
- **Sửa dữ liệu khi làm**: `world1/world.json` đổi tên thành "Vương Quốc Cổ Đại" (khớp ảnh); `killer_bat/Killer_Bat.json` đổi thành `killer_bat.json` và sửa `Killer_Bat_Animation.png` → `Killer_Bat_animation.png` cho đúng file thật.
- **Xếp hạng theo tuần, theo khối** (`js/leaderboard.js`, Rules `leaderboards/{khối}/entries/{UID}`, đã chốt): 3 tab — Ải đã vượt (số lượt vượt ải trong tuần, tính cả chơi lại), Hầm ngục 1, Hầm ngục 2 (kỷ lục số quái hạ trong tuần). **Không còn bảng vĩnh viễn.** Reset **07:00 sáng thứ Hai giờ Việt Nam** = 00:00 UTC thứ Hai nên Rules tính từ `request.time` (`WeekStart`); sang tuần mới bản ghi cũ tự bị bỏ qua. Bản ghi `{Nickname, LV, WeekStart, WeekClears, Dung1Week, Dung2Week, UpdatedAt}` (không có tên đăng nhập), ghi bằng `set` cùng transaction nhận thưởng, chỉ khi điểm thay đổi (thắng ải, hoặc phá kỷ lục hầm ngục của tuần); bắt buộc `profile.LastReward == request.time`. Hiển thị **top 10 + hạng của bản thân** (truy vấn `limit(10)` + truy vấn đếm `count()` với `limit(1000)`). Giới hạn tải: mỗi học sinh tải mới tối đa 1 lần/5 phút/tab (`CONFIG.RANK.REFRESH_SEC`), lưu ở `localStorage` nên tải lại trang không né được — **chỉ ở trình duyệt**. Ước tính ~11–12 lượt đọc mỗi lần tải một tab. Nếu Rules từ chối riêng phần xếp hạng (vd đồng hồ máy lệch tuần) thì thưởng vẫn lưu và báo "chưa cập nhật bảng xếp hạng".
- **Admin khôi phục mật khẩu**: file riêng `admin_reset_password.html` (HTML + CSS + JS trong một file, **không thuộc repo game**). Quản trị đăng nhập Google (cần quyền IAM trên dự án Firebase) rồi gọi Identity Toolkit Admin API (`accounts:lookup`/`accounts:update`) để đặt mật khẩu mới. Không chứa bí mật. Chạy qua `localhost` và thêm domain vào Authorized domains; bật provider Google.
## 10. Giao diện
- Tạo các khối cơ bản, giao diện chứa UI sẽ được hoàn thiện ở V5.
## 11. Vấn đề chưa chốt / giả định cần người dùng xác nhận

- **Crystal mỗi lần vượt ải hay chỉ lần đầu?**: Mỗi ải nhậ tối đa 5 crystal/ngày
- **Xếp hạng**: (b) chống gian lận cơ bản — Rules không kiểm chứng được số ải/kỷ lục thật, chỉ giới hạn tốc độ tăng (+1 ải/lượt, kỷ lục ≤ 1000, tối thiểu 20s/lượt); (c) đồng hạng ở top 10 xếp tùy ý (không có chỉ mục phụ); (d) truy vấn đếm `count()` trên SDK compat 10.14.1 chưa kiểm chứng — nếu không có, hiển thị "ngoài top 10" không kèm số hạng; (e) giới hạn 5 phút không chặn được người cố ý dùng công cụ trình duyệt; (f) **phải tạo 6 chỉ mục kép Firestore** (xem mục 12.1; có sẵn `firestore.indexes.json`, hoặc bấm link hiện trên màn Xếp hạng).
- **Trao thưởng bảng xếp hạng** (V4): đã làm theo phương án A (mục 12.8), thưởng top 10 chia bậc 1/2/3/4–10. Còn mở: có thưởng Crystal/vật phẩm không, có tự động hóa không (cần Cloud Functions/gói Blaze).
- **Mốc reset tuần** giả định giờ Việt Nam (UTC+7); nếu cần múi giờ khác phải đổi cả `Rank.weekStart` lẫn `weekStart()` trong Rules.
- **Dungeon `after`** của World1/3/4 suy ra từ ảnh (xem mục 9): Xác nhận.
- **Cửa hàng** vẫn cho mua đồ không hợp nghề khi tắt "Chỉ đồ dùng được" (đổi nghề sau này vẫn dùng được): Giũ tính năng này
- **Mage_F, Warrior_M** vẫn thiếu/lệch tên file ảnh nên không xuất hiện trong danh sách chọn; Rules vẫn cho phép chọn vì key hợp lệ.
- **Admin mật khẩu** chưa được thử trên dự án thật: cần xác nhận Google đã bật, domain được phép và tài khoản quản trị đủ quyền IAM. Hướng dẫn thực hiện.
- **Rules mới chưa được chạy thử bằng Firebase Emulator** — phải Publish `firestore.rules` rồi test mua/mặc/đổi nghề/nhận thưởng/xem BXH trước khi đưa cho học sinh.
- Điện thoại dọc: bản đồ co theo 90% chiều rộng nên nút nhỏ; mức hỗ trợ điện thoại vẫn chưa chốt (Plan): YÊU CẦU ĐT DÙNG MÀN HÌNH NGANG TRONG MỌI HOẠT ĐỘNG (Các nút thu nhỏ và cập nhật UI vào V5)
- Random vật phẩm rơi và CRIT chạy trên trình duyệt (chống gian lận mức cơ bản, Plan 10.4): XÁC NHẬN GIỮ NGUYÊN.


## 12. V4 — đã triển khai

1. **Chỉ mục kép Firestore.** 6 chỉ mục (collection `entries`), khai báo sẵn trong `firestore.indexes.json`:
   - Theo khối: `WeekStart ↑` + (`WeekClears` | `Dung1Week` | `Dung2Week`) `↓`.
   - Theo lớp: `Room ↑` + `WeekStart ↑` + (`WeekClears` | `Dung1Week` | `Dung2Week`) `↓`.

   Cách tạo: (a) `firebase deploy --only firestore:indexes`; hoặc (b) mở từng bảng — nếu thiếu chỉ mục, màn Xếp hạng hiện liên kết "Bấm vào đây để tạo chỉ mục" (lấy từ thông báo lỗi Firestore, cũng in ra console); bấm, chọn Create, đợi trạng thái *Enabled* rồi bấm "Thử lại".
2. **Nhập lớp.** Đăng ký có ô "Lớp của bạn" (dạng `6/5`, `7/11`, `8/15`; số đầu phải trùng khối đã chọn) → lưu `Room`. Hồ sơ cũ chưa có `Room`: sau đăng nhập hiện hộp nhập lớp một lần (`main.js` `askRoom`, `Player.setRoom`). Rules `validRoom`: chỉ đặt được khi chưa có và phải khớp khối; sửa sau này phải nhờ giáo viên trong Console. `Auth.normalizeRoom/roomIsValid` chuẩn hóa đầu vào.
3. **Bảng xếp hạng theo lớp và khối.** Hai nút phạm vi (Lớp `x/y` | Khối `x`) × ba tab. Bản ghi `leaderboards/<khối>/entries/<UID>` có thêm `Room` (Rules bắt buộc khớp hồ sơ); bảng lớp lọc `Room == lớp của mình`. Phần thưởng mỗi bảng ở `CONFIG.RANK.REWARDS[scope][tab].gold` (mặc định 100 Gold) chỉ để HIỂN THỊ trên bảng; số Gold thực tế do giáo viên nhập khi chốt ở trang admin (mục 12.8) — nhớ chỉnh hai nơi cho khớp. Học sinh chưa có `Room` không được ghi điểm lên bảng (thưởng vẫn lưu).
4. **UI Trang bị/Cửa hàng.** Tooltip `Tip` (hover/focus) thay khung chi tiết; nút mua hiển thị số tiền (chi tiết ở bảng file mục 2).
5. **ID vật phẩm dạng chữ.** Khóa trong `equipments.json`, `itemId` trong `world.json` và các bảng trong `firestore.rules` đều dùng ID chữ (`[a-z][a-z0-9_]{2,40}`; loader kiểm tra). Firestore chỉ lưu ID sở hữu/đang mặc; chỉ số trang bị cộng ở trình duyệt (`Player.stats`). Khi thêm vật phẩm: thêm vào `equipments.json` rồi cập nhật các bảng `[RULES]` (validItemId, classesOf, danh sách theo ô, giá Gold, giá Crystal).

   | ID cũ | ID mới | ID cũ | ID mới |
   |---|---|---|---|
   | 201 | `warlord_helmet` | 215 | `magic_staff` |
   | 202 | `warlord_armor` | 216 | `leather_armor` |
   | 203 | `warlord_sword` | 217 | `iron_helmet` |
   | 204 | `warlord_ring` | 218 | `old_necklace` |
   | 213 | `iron_sword` | 214 | `short_bow` |

   **Hồ sơ cũ còn ID số** trong `Enventory`/`Equipment` sẽ bị bỏ qua (không hiện, không tính chỉ số) và Rules không cho thêm ID số; cần sửa tay trong Console theo bảng trên.
6. **Che câu hỏi khi rời trang.** `Adventure.guard` (`games/adventure.js`): `visibilitychange` (đổi tab) và `window blur` (bấm ô địa chỉ, chuyển cửa sổ) → ẩn nội dung `#quiz`, hiện `#quiz-shield`; chỉ bỏ che khi cửa sổ có focus và bấm "Tiếp tục". **Đồng hồ trả lời và quái vẫn chạy khi bị che.** Đếm số lần rời trang trong lượt (chỉ hiển thị, chưa lưu). Chỉ là rào cản cơ bản: không chặn chụp màn hình, thiết bị thứ hai, hoặc cửa sổ chia đôi màn hình không làm mất focus.
8. **Chốt thưởng xếp hạng (phương án A, giáo viên bấm chốt).**
   - Trang admin (repo GitHub Pages riêng `mysite`, file `index.html` = `admin_reset_password.html` cũ + thẻ "Chốt thưởng xếp hạng tuần") đăng nhập Google, đọc `leaderboards/<khối>/entries`, chọn **top 10** từng bảng (mỗi lớp và mỗi khối × 3 tab; xếp hạng kiểu thi đấu — đồng điểm cùng hạng; điểm 0 bỏ qua) chia 4 bậc thưởng: hạng 1, hạng 2, hạng 3, hạng 4–10 (lưới 6 bảng × 4 bậc nhập ngay trên trang; mỗi ô gồm **Gold và Crystal**, mặc định 100 Gold + 3/2/1/1 Crystal, mọi bảng Ải/Hầm ngục 1/Hầm ngục 2 đều có Crystal), rồi tạo phiếu `rewards/<UID>/vouchers/<tuần>_<phạm vi>_<tab>` = `{ Title ("Hạng n …"), Gold, WeekStart, Board, Claimed:false, CreatedAt }`. Có bước **Xem trước** trước khi **Chốt**; phiếu đã tồn tại bị bỏ qua (Rules chỉ cho `create`, không ghi đè/xóa).
   - Game: sau khi vào, `main.js` `checkRewards()` đọc phiếu chưa nhận (1 truy vấn, tối đa 20), hiện hộp thông báo; bấm Nhận → `Player.claimVoucher` chạy transaction: `Golds += Gold`, `LastClaim = <id phiếu>`, phiếu `Claimed = true`. Rules `validClaim` (hồ sơ) + rule `update` của phiếu ràng buộc chéo bằng `get/getAfter` nên mỗi phiếu chỉ nhận một lần và đúng số Gold.
   - Điểm tuần trước: khi học sinh chơi sang tuần mới, bản ghi xếp hạng cũ được chép vào `PrevWeekStart/PrevWeekClears/PrevDung1/PrevDung2` (Rules `prevOk`), nên admin chốt được tuần trước **sau** khi tuần mới đã bắt đầu, nhưng chỉ giữ MỘT tuần: phải chốt trong tuần kế tiếp.
   - **Giữ đăng nhập admin:** trang admin đặt persistence LOCAL nên F5 không phải đăng nhập lại và chốt thưởng dùng được ngay; token quyền Google Cloud (đổi mật khẩu học sinh) chỉ ở bộ nhớ, mất sau F5/1 giờ nên có nút "Cấp quyền đổi mật khẩu".
   - **Quản trị:** hàm `isAdmin()` đầu `firestore.rules` có email `THAY_EMAIL_ADMIN@gmail.com` — phải thay bằng email Google dùng để đăng nhập trang admin rồi Publish rules. Cũng cần thêm domain GitHub Pages vào Authentication > Authorized domains.
   - Giới hạn: trần 5000 Gold và 50 Crystal mỗi phiếu (Rules). Thưởng xếp hạng tuần gồm Gold + Crystal (chưa có trang bị; Boss Raid có thêm trang bị); chưa có tự động hóa (cần Cloud Functions/gói Blaze).
9. **Boss Raid (V4).** Nút **Boss Raid** ở màn bản đồ.
   - **Giờ mở:** 19:00–21:00 giờ Việt Nam mỗi ngày (ngoài giờ bấm nút chỉ báo giờ mở). Rules cho vào/tạo trận trong 12:00–14:00 UTC và nhận lượt gửi sát thương cuối đến 21:03.
   - **Trận:** mỗi khối một Boss mỗi ngày, `raids/<khối>_<yyyymmdd>` = `{ MaxHP, Damage, CreatedAt }`; người vào đầu tiên tạo (Rules ép `MaxHP` = `bossMax()`, mặc định 100.000 — chưa chốt, chỉnh ở `CONFIG.RAID.BOSS_HP` **và** `bossMax()` trong rules). Mỗi người có `raids/<id>/players/<UID>` = `{ Nickname, Damage, LastFlush }`.
   - **Câu hỏi:** gộp file Excel của TẤT CẢ ải có câu hỏi trong thế giới của khối, lặp vô tận (không cần đạt cấp/vượt ải trước).
   - **Sát thương:** tính ở trình duyệt theo công thức Adventure (ATK − DEF, hiệu ứng tăng sát thương, CRIT ×2). Gom lại, **mỗi ~2 phút** (`FLUSH_SEC` = 120) gửi một lần bằng `FieldValue.increment` (1 batch ghi `players/<UID>` + `raids/<id>`, cộng nguyên tử nên không ghi đè nhau) rồi đọc lại HP Boss 1 lần. Giữa hai lần đọc, HP hiển thị = HP đã biết − sát thương vừa gây. Rules: ≤ 40.000/lần (`CONFIG.RAID.MAX_FLUSH_DAMAGE`), cách nhau ≥ 105s (`MIN_FLUSH_GAP_SEC`), Boss tăng đúng bằng phần tăng của người gửi (getAfter).
   - **Boss đánh người chơi:** (1) trả lời sai → Boss đánh; (2) **phản công mỗi 20 giây** (`CONFIG.RAID.COUNTER_SEC`) theo đồng hồ đếm ngược ở trình duyệt, hiển thị trên thanh Raid, không đồng bộ giữa người chơi. Công thức sát thương lấy ATK/DEF/CRIT trong `raid_boss.json`. Không còn đồng hồ "quá giờ trả lời" riêng của Adventure trong Raid. Hết HP → hồi sinh sau 10 giây (`REVIVE_SEC`); lúc chờ hồi sinh đồng hồ phản công tạm dừng. Chu kỳ phản công chung toàn trận theo Plan 5.2 **không** làm (cần máy chủ).
   - **Hiệu ứng đồng đội đang đánh:** sau mỗi lần đọc HP, phần sát thương của người khác = HP mới − HP cũ − phần mình vừa gửi, chia ngẫu nhiên thành nhiều số bay lên Boss kèm nickname (lấy từ top 10, đọc 1 lần khi vào trận = 10 lượt đọc, cập nhật lại khi mở bảng Top 10), rải trong chu kỳ và làm thanh máu tụt dần. **Tổng đúng dữ liệu thật; từng con số/nickname là minh họa** (không biết ai đánh bao nhiêu); không tốn thêm lượt đọc/ghi nào khác. Mã: `Raid.playOthers/spawnFloat/clearFx`.
   - **Xếp hạng:** chỉ TOP 10 sát thương (truy vấn `limit 10`, mở bảng "Top 10" hoặc màn kết quả, cache 1 phút); ngoài top 10 không có hạng. Bảng xếp hạng tuần cũng bỏ truy vấn đếm hạng ngoài top 10.
   - **Thưởng:** trang admin, thẻ "Chốt thưởng Boss Raid" (xếp hạng kiểu thi đấu: cùng điểm cùng hạng; người đồng hạng ở ranh giới top 10 cũng nhận như bậc 4–10): chọn ngày + khối, **Xem trước** (HP Boss, top 10), **Chốt** → phiếu `rewards/<UID>/vouchers/raid_<id>` theo bậc hạng 1 / 2 / 3 / 4–10, mỗi bậc gồm Gold, Crystal và ID trang bị tùy chọn (mặc định 300/3, 200/2, 150/1, 100/0, không trang bị). Phiếu giờ có thể chứa `Gold`, `Crystals`, `ItemId` (Rules `validClaim`/`itemClaimOk`); đã có trang bị thì không thêm lần nữa.
   - **Boss/sprite:** `assets/raid/raid_boss.json` + `Raid_Boss_Idle.png` / `Raid_Boss_Animation.png` (hiện là bản sao sprite slime; ghi đè ảnh khi có ảnh mới, chỉnh `frames` nếu số khung khác).
   - **Chi phí ước tính** (60–70 người chơi liên tục 2 giờ): mỗi lần gửi (2 phút) = 2 lượt ghi + 1 lượt đọc HP + ~2 lượt đọc do Rules (get/getAfter) → ~8.400 ghi và ~12.600 đọc/ngày (bằng khoảng một nửa so với chu kỳ 1 phút), thoải mái dưới hạn mức miễn phí (20.000 ghi, 50.000 đọc/ngày). Tăng `FLUSH_SEC` giảm thêm nhưng HP Boss cập nhật chậm hơn (nhớ giữ `MIN_FLUSH_GAP_SEC` ≈ 0,9 × `FLUSH_SEC` và `MAX_FLUSH_DAMAGE` tỉ lệ tương ứng, cả trong rules); bảng xếp hạng tuần/phiếu thưởng tính riêng.
   - **Giới hạn bảo mật:** sát thương do trình duyệt tự tính; Rules chỉ chặn giá trị vượt trần/tần suất. Người sửa mã vẫn gửi được đúng mức trần mỗi phút.
10. **Giai đoạn 1 (cập nhật sau V4): bảng lớp, tắt truy vấn khối, giới hạn đổi nghề.**
   - **Bảng xếp hạng:** bảng **Lớp** là bảng chính (truy vấn `Room == lớp` + `WeekStart`, `limit 10`, ≤ 10 lượt đọc, cache 5 phút). Tab **Khối** vẫn hiện nhưng **không truy vấn** (`CONFIG.RANK.GRADE_BOARD_ENABLED = false`; đặt `true` để mở lại). Trang admin vẫn chốt thưởng cả Lớp và Khối (admin đọc toàn bộ bản ghi của khối nên không phụ thuộc cờ này).
   - **Tiết kiệm đọc/ghi:** điểm của mình giữ bản sao trong `localStorage` (`Rank.ownEntry`: 1 lượt đọc lần đầu, sau đó 0); mỗi lượt đổi điểm chỉ **ghi** 1 lần, không đọc lại bản ghi của mình (`Player.tx(..., { skipRankRead: true })`). Trình duyệt tự kiểm tra có lọt top 10 không (`Rank.afterRun`, so với người thứ 10 trong cache của bảng Lớp): lọt/đổi chỗ thì đánh dấu cache cũ và **lần mở bảng kế tiếp** tải lại đúng 1 lần; chưa lọt thì giữ nguyên. Nếu bản sao lệch (chơi máy khác), Rules từ chối → game đọc lại bản ghi 1 lần rồi thử lại. Bảng đọc/ghi chi tiết nằm ở đầu `js/leaderboard.js`.
   - **Đổi nghề (class):** class = nghề suy từ `Character` (Archer/Mage/Warrior). Đổi NGHỀ tối đa 1 lần / 24 giờ (`CONFIG.CLASS_CHANGE_HOURS`, Rules `validCharacter` dùng `duration.value(24,'h')` — sửa cả hai nơi): lưu `ClassChangedAt = request.time`, trình duyệt đếm ngược từ mốc đã có trong hồ sơ nên không tốn đọc. Đổi giới tính/kiểu nhân vật CÙNG nghề không giới hạn. Sau này Ranked dùng class của B (nghề) để tính đúng trang bị.
   - **`progress.tries` giữ nguyên:** mỗi lượt chơi vẫn ghi hồ sơ (Gold/EXP) nên bỏ `tries` không giảm lượt đọc/ghi.
11. **Giai đoạn 2 (cập nhật sau V4): Boss Raid theo lịch, phòng chờ, hai Boss mỗi ngày** — thay thế các mô tả "một Boss mỗi ngày, 19:00–21:00 cố định" ở mục 9.
   - **Lịch (đổi tại đây):** `CONFIG.RAID.SCHEDULE` trong `js/config.js`, khóa = thứ theo cách gọi Việt Nam (2 = Thứ Hai … 7 = Thứ Bảy, 8 = Chủ Nhật), giá trị = danh sách khối. Mặc định: T2, T3, T5, T7 → khối 7; T4, T6 → khối 6 và 8; Chủ nhật → khối 9. **Phải sửa cả hàm `scheduledGrades()` trong `firestore.rules`** (khóa rules = `dayOfWeek()`: 1 = Thứ Hai … 7 = Chủ Nhật, tức khóa config trừ 1) rồi Publish lại rules. Nên thử một lần đúng ngày để chắc quy ước thứ khớp. Khối không đúng lịch bấm nút chỉ thấy thông báo lịch.
   - **Biến cấu hình** (`CONFIG.RAID`, mục `[RULES]` phải khớp rules): cửa mở 19:00–21:00 (`OPEN_MIN/CLOSE_MIN`), `START_PLAYERS` = 5, `MAX_PLAYERS` = 70, `BOSS_MIN` = 15, `BOSS2_DELAY_MIN` = 5, `LATEST_START_MIN` = 22:30 (Boss 2 muộn nhất), `FLUSH_SEC` = 120, `MAX_FLUSH_DAMAGE` = 60000, `FEW_PLAYERS_UNTIL` = 10 và `FEW_PLAYERS_BONUS` = 0,10, `BOSS_HP` mỗi khối (mặc định 100.000; sửa cả `bossMax()` trong rules).
   - **Luồng một ngày của một khối:** Boss 1 được người đầu tiên bấm vào tạo ra ở trạng thái chờ (chưa có `StartAt`). Người chờ đọc tài liệu Boss mỗi 15 giây, tối đa 10 phút (không dùng `onSnapshot`). Người thứ 5 vào (trước 21:00) làm máy chủ ghi `StartAt` → Boss bắt đầu. Không đủ 5 người trước 21:00 thì hôm đó không có Raid. Boss 1 kéo dài tối đa 15 phút kể từ `StartAt`; **hết giờ mà chưa hạ = thất bại**; Boss đã mở chạy nốt kể cả quá 21:00. Hạ Boss: người nào phát hiện `Damage >= MaxHP` ghi `DefeatedAt` (một người thành công, người khác bị Rules từ chối). **Boss 2** xuất hiện 5 phút sau khi Boss 1 kết thúc (mốc = `DefeatedAt` hoặc `StartAt` + 15 phút), có `StartAt` = giờ người đầu tiên bấm vào, không cần đủ 5 người, bắt đầu muộn nhất 22:30; mỗi Boss tối đa 70 người; người chơi Boss 1 tự bấm vào Boss 2 (đếm ngược tính ở trình duyệt).
   - **Ít người thì tăng sát thương:** dưới 10 người, mỗi người thiếu +10% sát thương cho mọi người chơi (5 người = +50%), lấy từ trường `Players` đọc mỗi chu kỳ, không tốn thêm lượt đọc. **Đã bỏ giảm DEF Boss.**
   - **Dữ liệu:** `raids/<khối>_<yyyymmdd>_<1|2>` = `{ MaxHP, Damage, Players, Slot, CreatedAt, StartAt?, DefeatedAt? }`; `raids/<id>/players/<UID>` = `{ Nickname, Damage, LastFlush }`. Vào Boss = 1 transaction (đọc Boss + tài liệu của mình; ghi `Players` + 1 và tạo tài liệu người chơi cùng lúc, Rules kiểm tra chéo bằng `exists/existsAfter/getAfter`).
   - **Thưởng (trang admin, thẻ "Chốt thưởng Boss Raid"):** chọn ngày + khối + Boss 1/2. Boss bị hạ = đủ thưởng; **thất bại = 50% Gold và Crystal (làm tròn xuống), không có trang bị** (admin tính sẵn khi Xem trước; xác định thất bại bằng `Damage < MaxHP`).
   - **Chi phí ước tính mỗi người mỗi Boss 15 phút:** ~18 ghi, ~80 đọc (vào Boss 2 ghi + ~6 đọc; 7 chu kỳ gửi 14 ghi + ~28 đọc gồm cả đọc do Rules; kết thúc 2 ghi + ~14 đọc; top 10 lúc bắt đầu/kết thúc/mở bảng ~40 đọc; phòng chờ ~8 đọc cho người chờ). Mỗi Boss tối đa 70 người: ~1.300 ghi và ~5.600 đọc; mỗi khối mỗi ngày (2 Boss) ~2.600 ghi và ~11.200 đọc.
12. **Giai đoạn 3: Ranked (đấu xếp hạng trong lớp).** Nút **Ranked** ở màn bản đồ; mã ở `games/ranked.js`, cấu hình `CONFIG.RANKED`.
   - **Dữ liệu:** MỘT tài liệu cho mỗi lớp `ranked/<khối>_<số lớp>` (vd `ranked/6_5`) = `{ <UID>: { N, Lv, Ch, Eq, Pt, D, Cnt, Win, LS, B } }` (N tên, Lv cấp, Ch nhân vật có nghề, Eq trang bị đang mặc, Pt điểm, D ngày VN yyyymmdd, Cnt số trận đã bắt đầu hôm nay, Win số thắng hôm nay, LS giờ bắt đầu trận gần nhất, B UID đối thủ). Học sinh chỉ `get` tài liệu, **không truy vấn/liệt kê**; chỉ ghi được trường mang UID của mình và chỉ khi lớp trong hồ sơ khớp (Rules `inMyRoom`, +1 lượt đọc hồ sơ mỗi lần ghi).
   - **Luồng:** lần đầu vào Ranked được tặng 10 điểm (đăng ký). Bấm "Tìm đối thủ": game chọn ngẫu nhiên một bạn **trong ±10 hạng quanh mình** (cả trên lẫn dưới, không có đối thủ mặc định; chưa ai khác đăng ký thì không đấu được) và ghi bắt đầu trận (Cnt + 1, bản chụp mới của mình, B). B **không cần online**: chỉ số tính từ bản chụp (cấp + nghề + trang bị, `Player.statsOf`, trang bị chỉ cộng đúng nghề lúc chụp — đây là lý do cần lưu nghề), sprite là sprite nhân vật của B lật ngang. Khi đổi nhân vật, chỉ trường `Ch` của bản chụp được đồng bộ với `Character` trong hồ sơ; `firestore.rules` chỉ cho phép cập nhật khi hai giá trị khớp.
   - **Luật trận (giống đánh quái ở Ải):** trả lời đúng → gây sát thương lên B; trả lời sai hoặc hết đồng hồ (20 giây/câu) → B đánh mình; HP mình về 0 trước = **thua**, HP B về 0 trước = **thắng** (không cần hết bộ câu hỏi; câu hỏi lặp từ tất cả ải của khối). **Thắng được 10 + max(0, điểm B − điểm A)** (phần chênh tối đa `MAX_DIFF` = 100); thua không mất điểm.
   - **Giới hạn:** 5 trận/ngày tính cả thắng và thua, **tính lúc BẮT ĐẦU trận** (bỏ dở giữa chừng vẫn tính là một trận, không có điểm) để không né giới hạn bằng cách thoát khi thua; reset 0 giờ giờ VN. Báo thắng phải cách lúc bắt đầu ≥ 30 giây, mỗi lần thắng cần một trận đã bắt đầu (Win ≤ Cnt).
   - **Đọc/ghi:** xem bảng ở đầu `games/ranked.js`: mở màn/xem top 10 = 1 lượt đọc (cache 5 phút; đọc "của mình" hay "top 10" tốn như nhau vì cả lớp nằm trong 1 tài liệu); đăng ký 1 ghi; bắt đầu trận 1 đọc + 1 ghi; thắng thêm 1 đọc + 1 ghi; thua không ghi; trong lúc đánh 0. Trung bình khoảng 3 đọc + 1,6 ghi mỗi trận (kể cả lượt đọc do Rules).
   - **Bảng xếp hạng:** chỉ hiển thị top 10 của lớp mình (hạng của mình chỉ hiện nếu nằm trong top 10).
   - **Thưởng tuần (trang admin, thẻ "Chốt thưởng Ranked"):** điểm Ranked **cộng dồn, không reset**; admin đọc mỗi lớp 1 tài liệu, lấy top 10 có điểm > 10 (đồng điểm cùng hạng), tạo phiếu `rk_<tuần>_<khối>_<lớp>` theo 4 bậc (hạng 1, 2, 3, 4–10) mặc định 100 Gold, chỉnh được. Nên chốt vào cuối tuần.
   - **Giới hạn bảo mật:** kết quả trận do trình duyệt tự báo, Rules chỉ kiểm tra giới hạn/công thức, **không biết thắng thật hay không** — một học sinh sửa mã vẫn có thể báo thắng tối đa 5 lần/ngày với phần cộng tối đa 110 điểm.
7. **Quy định dự án:** chỉ thao tác và gửi lại những file đã thay đổi.

**V5 — GIAO DIỆN THEO BẢNG MÀU (đã làm):**
- Bảng màu `#18345A #101B2D #243C5B #D8B65D #F5D68C #80602D #080F1B` khai báo thành biến `--c-*` ở khối `[18]` cuối `css/style.css`; khối `[19]` xử lý bo góc và thanh chỉ số.
- **Không còn dùng** `panel_avatar.png`, `hp_bar.png`, `exp_bar.png` (+ `hp_fill/exp_fill`): khung avatar, HUD người chơi, thanh HP/EXP/HP quái được vẽ bằng CSS (bo góc 6–12px). Khung `.ui-frame/.ui-panel` cũng là CSS bo góc thay vì 9-slice. Nút tròn/huy hiệu/`gold_bar`/`crystal_bar` giữ nguyên tỉ lệ ảnh.
- Màn chọn ải: avatar, Gold/Crystal và 6 nút thao tác ở `.map-rail` (cột phải, ngoài ảnh bản đồ; điện thoại dọc: dưới bản đồ). `#stage-info` vẫn hiện ở CUỐI bản đồ như cũ.
- Chiến binh (`js/sprites.js` → `Sprites.heroLunge`): lao tới trong lúc chạy các khung tấn công, giữ vị trí tới khung cuối, hết hoạt ảnh mới lướt về (CSS `lunge-go` / `lunge-back`; thời lượng = số khung × 80ms). Quái vật cận chiến vẫn dùng `lunge` cũ.
- **Quái vật OOP (`js/monsters/monster.js`)**: `Monster` + `WarriorMonster` / `ArcherMonster` / `MageMonster` (giống `Character` + 3 nghề). `Monster.create(json)` chọn lớp con theo trường `"Class"` trong `assets/monsters/<key>/<key>.json`; kiểu đánh mặc định: Warrior = cận chiến, Archer/Mage = tầm xa, `"attackStyle"` trong JSON ưu tiên hơn. `StageMonster` tạo quái bằng `Monster.create`; `Stage.isRanged('mob')` đọc `monster.ranged`. Đối thủ Ranked vẫn là object thường (đường cũ). Script `js/monsters/monster.js` phải nạp trước `js/stage-monster.js`.
- Quái cận chiến (Warrior) dùng chung `Stage.meleeLunge(who)` với người chơi: lao tới, giữ ở khung cuối rồi lướt về (hero sang phải, mob sang trái).
- **Khung vật phẩm theo phẩm chất**: `Inventory.icon(it)` gán class `q-normal|uncommon|rare|epic|legendary` cho `.item-icon`; CSS khối `[20]` đặt nền `assets/ui/<quality>_frame.png` (giữ nguyên hình), ảnh vật phẩm thu về 62% trong lòng khung. Dùng chung cho Cửa hàng, kho đồ (`.tile`) và ô đang mặc (`.slot-box`). Phẩm chất lạ → khung normal.
- Đã bỏ icon `inv_*.png` trên các tab lọc (`Inventory.tagBar`) và `Panel_name.png` ở tên vật phẩm (các ảnh này chưa dùng nữa, chưa xóa khỏi `assets/ui`). Viền các khung/nút dày hơn (3→4–5px) ở khối `[20]`.
- **Kẻ địch = khối `.enemy`** (index.html): `<div class="enemy"><div class="hp" id="mobhp">…</div><canvas id="mob"></canvas></div>` — thanh HP nằm trên sprite quái (`margin-right:20px`), vị trí/kích thước đặt trên `.enemy` (khối `[21]` style.css) nên thanh HP luôn đi theo quái. (Lỗi mất thanh HP trước đó do khối `[19]` đặt `position:relative` cho `.hp` khiến thanh rơi ra ngoài khung.)
- **Thứ tự lớp sprite**: người chơi z=3 luôn trên quái z=2; sprite đang tấn công (`.is-attacking`, `lunge-go`, `lunge-back`; `Stage.drawHero/drawMob` bật/tắt `is-attacking`) lên z=4; thanh HP z=5; đạn skill z=6.
**Cập nhật V5:**
**Giai đoạn 1 (ĐÃ LÀM):** tên quái trên thanh HP (`.enemy-info`, lề phải 40% bề rộng sprite quái; tên đặt bởi `Stage.reset` qua `#mob-name`); `shop-item` cố định 170×170 + `#shop-list{scrollbar-gutter:stable}`; bỏ `q-badge` khỏi thẻ cửa hàng (tooltip vẫn dùng); item-icon 80px / ảnh 64px, tên + giá bên phải, `.coin` không nền/bo góc trong thẻ; sprite ở màn Trang bị cắt `CONFIG.PORTRAIT_CROP_RIGHT` = 50px bên phải (`Inventory.startPortrait`). CSS ở khối `[22]`.
**Giai đoạn 2 (ĐÃ LÀM):** hầm ngục theo tầng vô hạn — mỗi tầng 1 quái, phẩm chất theo `CONFIG.GAME.DUNGEON.TIERS` (tầng 1–10 normal, 11–20 uncommon, 21–40 rare, 41–70 epic, 71+ legendary) lấy từ trường `type` trong `<monster_key>.json` (`Monster.quality`, `StageMonster.forFloor`, thiếu quái đúng phẩm chất thì dùng phẩm chất gần nhất, thấp hơn trước). Pool quái hầm ngục = `dungeon_monsters` trong `world.json`. Kỷ lục XY → vào lại từ tầng X1 (`CONFIG.dungeonStartFloor`); `progress[<id>].best` của hầm ngục = TẦNG cao nhất. Nút `#dungeon-exit` (Thoát hầm ngục, vẫn lưu thưởng/kỷ lục) + nhãn `#floor-badge`. Xếp hạng hầm ngục theo tầng cao nhất, KHÔNG reset: trường `Dung1Floor`/`Dung2Floor` trong `leaderboards/<khối>/entries/<UID>` (tab `weekly:false`), cần publish `firestore.rules` + `firestore.indexes.json` mới (chỉ mục Room + Dung1Floor/Dung2Floor). Điểm tuần cũ `Dung1Week/Dung2Week` vẫn ghi (số quái hạ) nhưng không còn dùng để xếp hạng. Avatar HUD bản đồ dùng `assets/characters/<key>/avatar.png`.\n**Yêu cầu gốc Giai đoạn 1:**
-  thêm tên phía trên thanh hp; <div> <div>Name</> <div>HP bar>=</>. cả 2 có marin right khoảng 40% kích thước sprite nhân vật.
-  Thống nhất khung kích thước của `shop-item` ( không để thanh scroll làm thay đổi kích thước)
-  loại bỏ `q-badge` (khung ảnh đã thể hiện phẩm chất, không cần thiết cho thẻ này).
-  UI của `shop-item `sẽ là: 170x170px khung `item-icon q-..` 80px img bên trong có kích thước 64px. Cấu trúc: `item-icon q-` nằm bên trái, name và giá bán nằm bên phải (`coin gold`,`coin gem` không tạo backround và bo góc nữa).
- sprite nhân vật trong cửa hàng được cắt đi 50px theo chiều dọc bên phải ảnh
**Giai đoạn 2:**
- Hầm ngục được chia theo tầng (vô hạn) xếp hạng tính theo tầng đã vượt (k reset)
- tầng 1-10: quái normal, 11-20: uncommon, 21-40: Rare, 40-70: epic, 71 trở đi: legend (chọn quái ngẫu nhiên trong phù hợp với class)
- Mỗi quái có `type` trong `monster.json` để biết phẩm chất của chúng.
- Thêm mục thoát hầm ngục, người chơi chơi được đến tầng XY khi vào lại sẽ đánh tầng X1. Vẫn lưu ải đã vượt cao nhất là tầng XY.
**Giai đoạn 3:** Trang bị
- Thêm các hiệu ứng cho trang bị. Trang bị dùng `type` và `value` trong equipment.json để nhận hiệu ứng.
- Các hiệu ứng bao gồm:
   Tên                        Hiệu ứng
Ban phước                     Hồi HP theo [x] % mỗi lượt 
Đoạt huyết                    Hút máu, hồi HP theo [x]%dmg đã gây ra
Gai góc                       Gây sát thương [x] khi bị tấn công
Đột kích                      Tăng [x]% dmg khi chí mạng
Thánh thuẫn                   có [x]% dmg nhận bằng 0
Cường tráng                   Giảm [x]% dmg khi bị chí mạng
Trừng phạt                    có [x]% gây thêm dmg =25% hp địch (max 2000)
Cuồng chiến                   mỗi 10% HP mất tăng [x]% dmg gây ra
[x] là giá trị của `value`.
