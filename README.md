# Quest Học Tập

Website học tập RPG cho khối 6–8, đăng nhập học sinh bằng Firebase Authentication, hồ sơ nhân vật trên Firestore, bản đồ phiêu lưu, đọc câu hỏi từ Excel và làm bài (Lựa chọn, Danh sách, Kéo thả).

## Thiết lập Firebase

1. Trong Firebase Console, bật **Authentication > Sign-in method > Email/Password**.
2. Điền `apiKey` và `appId` của ứng dụng web Firebase vào `js/firebase.js`. Học sinh không cần email thật; ứng dụng tạo email nội bộ từ tên đăng nhập và khối.
3. Thêm tên miền chạy website vào **Authentication > Settings > Authorized domains** (ví dụ `localhost` và tên miền GitHub Pages).
4. Tạo Firestore Database rồi áp dụng các quy tắc trong `firestore.rules` từ trang **Firestore Database > Rules**.
5. Chạy website qua HTTP, sau đó đăng ký một tài khoản thử ở mỗi khối 6, 7 và 8.

Tài khoản và hồ sơ dùng đường dẫn Firestore hợp lệ `accounts/{className}/users/{username}`; `className` ban đầu là `6`, `7`, `8` hoặc `9`. Tên đăng nhập được chuẩn hóa thành chữ thường và dùng chung thuật toán khi đăng ký/đăng nhập. Mật khẩu chỉ được Firebase Authentication xử lý, không ghi vào Firestore. Rules chỉ cho học sinh đọc hồ sơ của UID mình và thực hiện các cập nhật tiến trình, mua/trang bị hợp lệ; không cho sửa/xóa tùy ý.

Nếu tạo tài khoản Auth thành công nhưng không tạo được hồ sơ, ứng dụng sẽ cố xóa tài khoản Auth vừa tạo. Nếu thao tác bù trừ cũng thất bại, thông báo sẽ yêu cầu giáo viên xử lý tài khoản chưa hoàn tất trước khi đăng ký lại.

Các hồ sơ tạo bởi phiên bản Firebase cũ có thể chứa trường `Password` dạng plaintext và chưa có `UID`. Không thể dùng trường đó để xác thực hoặc tự động chuyển đổi an toàn; trước khi mở lại các tài khoản cũ, giáo viên/quản trị viên cần liên kết đúng UID Firebase Auth và xóa `Password` bằng công cụ quản trị tin cậy. Rules chặn đọc hồ sơ còn trường này và chặn mọi cập nhật từ trình duyệt.

## Thế giới phiêu lưu

- Khối 6 vào **Rừng Lục Bảo**, khối 7 vào **Vương Quốc Cổ**, khối 8 vào **Miền Đất Huyền Thuật**. Khối được chọn khi đăng ký/đăng nhập và xác minh cùng tài khoản Firebase.
- Tài khoản học sinh xác thực bằng Firebase Authentication; hồ sơ nhân vật được đọc từ Firestore sau khi UID được đối chiếu.
- Mỗi thế giới có danh sách ải cấu hình riêng trong `js/config.js`; thứ tự trong danh sách quyết định tiến trình. Mặc định có 9 vị trí ải, và số lượng được quyết định bởi danh sách đó chứ không bị giới hạn ở 9.
- Mỗi map có `assets/maps/world<N>/world.json` để chỉnh `id`, `name`, `stage_nodes`, `dungeon_nodes` và thưởng mẫu theo thứ tự trong `stage_rewards`/`dungeon_rewards`. Reward gồm `EXP`, `GOLD`, và `drops` với `itemId` cùng `chance` từ 0 đến 1 (0.05 = 5%). Node dùng tọa độ phần trăm; dungeon có `after` là stage cần vượt để mở. Hiện reward được nạp làm metadata của màn; transaction nhận thưởng chưa áp dụng các giá trị/drop riêng này.
- Ải đầu tiên của cả ba thế giới tạm dùng chung `questions/tin_hoc.xlsx` để kiểm thử. Những vị trí còn lại là placeholder chưa có ngân hàng câu hỏi, nên vẫn khóa và không thể bắt đầu.
- Trạng thái hoàn thành lấy từ `Player.data.progress`; thay đổi khi chơi hiện lưu trên trình duyệt này, còn hồ sơ Firestore được giữ nguyên khi đăng nhập.
- Ảnh chọn bản đồ và nền chiến đấu của cả bốn thế giới dùng JPG; ảnh World4 được chuyển từ PNG ở chất lượng JPEG 95. Các biểu tượng và đường ải được vẽ bằng HTML/SVG/CSS.

### Thêm ải

Thêm một mục vào `stages` của thế giới tương ứng trong `js/config.js`:

```js
{ id: 'g6-stage-10', name: 'Tên ải', x: 80, y: 30, file: 'questions/stage-10.xlsx', placeholder: false }
```

Đặt file `.xlsx` trong `questions/`, dùng `id` duy nhất và tọa độ `x`/`y` theo phần trăm bản đồ. Vị trí của mục trong danh sách quyết định ải trước cần vượt. Với ải chưa có câu hỏi, đặt `file: null` và `placeholder: true`; ải đó sẽ không thể bắt đầu.

### Thay bản đồ hoặc ngân hàng câu hỏi

- Để thay ảnh nền bản đồ hoặc chiến đấu, đặt JPG chất lượng cao trong thư mục `assets/maps/world<N>/`; `js/config.js` ghép tên `Selection_Stage_Map.jpg`, `Stage_<i>.jpg` và `Dungeon_<i>.jpg`.
- Để gán Excel khác cho ải, cập nhật trường `file` ở mục stage đó. File phải theo đúng cấu trúc Excel được mô tả bên dưới.

## Chạy thử trên máy
Trình duyệt không cho đọc file Excel khi mở trực tiếp index.html, nên chạy máy chủ cục bộ:

    cd website
    python -m http.server 8000

Rồi mở http://localhost:8000. Đăng nhập Firebase cần chạy website qua HTTP trên tên miền đã được thêm vào Firebase Authorized domains; mở trực tiếp `index.html` chỉ phù hợp để xem giao diện và chọn file Excel cục bộ.

## Đưa lên GitHub Pages
1. Tạo repo mới, đẩy toàn bộ nội dung thư mục `website/` lên nhánh `main`.
2. Settings > Pages > Source: Deploy from a branch > `main` / root.

## Thêm ải mới
1. Đặt file Excel vào `questions/` (ví dụ `toan.xlsx`).
2. Thêm một dòng vào `LEVELS` trong `js/config.js`.

## Cấu trúc file Excel (đọc theo vị trí cột)
| Cột | Nội dung |
|---|---|
| A | STT |
| B | Độ khó |
| C | Mã |
| D | Chủ đề |
| E | Câu hỏi (hỗ trợ `<b>`, `<br>`, xuống dòng `\n`) |
| F | Loại: `Lựa chọn`, `Danh sách`, `Kéo thả` |
| G-N | Lựa chọn 1-8 |
| O | Đáp án: số thứ tự lựa chọn, nhiều đáp án cách nhau dấu phẩy |
| P | Link hình (tùy chọn) |
| Q | Giải thích (tùy chọn) |

- **Lựa chọn:** `O` là các số đúng, ví dụ `2,3` (nhiều đáp án thì hiện ô tích chọn).
- **Danh sách:** câu hỏi chứa `{D}` cho mỗi ô thả xuống; `O` là đáp án theo thứ tự các `{D}`, ví dụ `2,1,3`. Lựa chọn giữ nguyên thứ tự trong Excel.
- Thứ tự câu hỏi trong mỗi lượt được xáo trộn.
- **Kéo thả:** mỗi lựa chọn có dạng `Vế trái\nVế phải`; thẻ giữ nguyên thứ tự trong Excel để học sinh ghép với đúng dòng.

## V2: XP, Gold, trang bị, cửa hàng

- Kết thúc mỗi lượt ải, trình duyệt ghi **một lần** (transaction) tiến trình + Gold + EXP lên Firestore. Không ghi theo từng câu (Plan mục 9.3).
- Cấp độ không giới hạn: cấp L đạt tại `25 × (L-1) × (L+2)` EXP; mốc `100 × N` nhận `50 × N` Crystal (cấp 100: 50; cấp 200: 100). Chỉ số theo cấp lấy từ `assets/characters/<key>/character.json`.
- Cửa hàng/Trang bị: catalog lấy từ `assets/items/equipments.json`. Firestore chỉ lưu ID vật phẩm trong `Enventory` và ID theo ô trong `Equipment`; giá Gold/Crystal và ô trang bị được kiểm tra lại trong Rules. Mua hàng yêu cầu đủ cả hai loại tiền và chưa sở hữu.
- Chỉ số (HP/ATK/DEF/CRIT) tính từ cấp và trang bị khi hiển thị, không lưu lên Firestore.
- Tiến trình không còn lưu `localStorage` (không tin dữ liệu phía máy học sinh).
- Ải chọn bằng file Excel từ máy chỉ để chơi thử, không có thưởng.
- Trong Adventure, đáp án đúng gây sát thương `max(1, người chơi ATK - quái DEF)`; đáp án sai khiến quái phản công với `max(1, quái ATK - người chơi DEF)`. Trang bị có effect `Increase DMG`/`Reduce DMG` chỉnh tương ứng theo phần trăm trong `effect.value`. Quái hồi sinh sau khi bị hạ; sống sót đến hết câu hỏi và hạ ít nhất một quái sẽ thắng, mỗi quái bị hạ cộng thêm 10% thưởng (cộng dồn, vẫn theo trần Rules).
- Mỗi nhân vật có JSON riêng: `assets/characters/archer_f/character.json` và `assets/characters/mage_m/character.json`. JSON cấu hình HP/ATK/DEF, ảnh và frames idle/attack/skill; đặt `castSkill.frame` bằng số frame nguồn (0-based) có trong `attack.frames` để chọn thời điểm bắn. `castSkill.origin.y` đặt Y xuất phát theo sprite, đường bay giữ nguyên Y; `castSkill.target.x` đặt điểm đến theo chiều ngang, không cần `target.y`. Skill được gọi sau khi frame cast kết thúc; hurt/cập nhật HP chờ tới khi hoạt ảnh tấn công kết thúc và đạn tới đích. Các lớp `Character`/`Warrior`/`Archer`/`Mage` trong `js/characters/` nạp dữ liệu JSON (`stats.EXP_scale` = `[HP, ATK, DEF, CRIT]` cộng thêm mỗi cấp); chỉnh chỉ số hoặc hoạt ảnh tại file nhân vật tương ứng. Từ V3 hồ sơ Firestore chỉ lưu LV và EXP.
- Warrior lao lên đánh cận chiến; Mage/Archer đứng xa bắn skill theo đường ngang, giữ nguyên Y tại điểm bắn của nhân vật tới địch, không đổi quỹ đạo. Đạn bay trong 0,24 giây; hiệu ứng hurt và cập nhật HP chỉ xảy ra khi đòn đánh chạm đích. Quy tắc này áp dụng cho Adventure, Boss Raid và cả đối thủ Ranked có nhân vật tầm xa.

### Bảo mật V2 (mức cơ bản, Plan mục 10.4)

`firestore.rules` chỉ cho học sinh sửa hồ sơ của chính mình bằng 3 thao tác: kết thúc lượt ải (Gold ≤ 100, EXP ≤ 200 mỗi lượt, LV khớp EXP, cách lần trước ≥ 20 giây), đổi trang bị (chỉ ID đã sở hữu, đúng ô), mua hàng (thêm đúng một ID trong catalog và trừ đúng Gold/Crystal). Không đổi được UID, Nickname hoặc chỉ số gốc. Danh sách ID/ô/giá trong Rules cần đồng bộ với `assets/items/equipments.json`; metadata vật phẩm không lưu trong Firestore.

Giới hạn còn lại: không có máy chủ nên không kiểm tra được học sinh có thật sự làm đúng bài hay không. Một người rành kỹ thuật vẫn có thể gửi kết quả giả, nhưng mỗi lần chỉ nhận tối đa phần thưởng của một lượt và phải cách nhau 20 giây. Đây không phải chống gian lận tuyệt đối.

**Khi sửa số liệu phải sửa cả hai nơi:** ngưỡng thưởng trong `CONFIG.GAME` (`js/config.js`) và giá/ID/ô vật phẩm trong `assets/items/equipments.json` cùng `firestore.rules`. Sau khi sửa rules, vào Firestore > Rules > Publish.

## Giới hạn hiện tại

Chưa có Boss, xếp hạng, PvP, Gem. Ngoài ải đầu tiên, các ải chưa có file câu hỏi. Công thức XP, thưởng, giá vật phẩm, ngưỡng vượt ải đều là giá trị tạm chờ xác nhận (Plan mục 13.4). Hình nhân vật chưa đổi theo trang bị.
