# ĐẶC TẢ YÊU CẦU WEBSITE HỌC TẬP KẾT HỢP GAME RPG

> Phiên bản tổng hợp: 04/11/2026  
> Mục đích: Tài liệu yêu cầu đầu vào để thiết kế, xây dựng và kiểm thử website.  
> Lưu ý: Tài liệu phân biệt **yêu cầu đã được người dùng nêu/chốt** với **đề xuất kỹ thuật hoặc nội dung cần xác nhận**. Không xem các đề xuất chưa được chốt là yêu cầu bắt buộc.

---

## 1. Mục tiêu và định hướng

Xây dựng một website học tập kết hợp trò chơi nhập vai/chiến thuật (RPG), giúp học sinh vừa ôn luyện kiến thức vừa có động lực tham gia thông qua nhân vật, nhiệm vụ, trang bị, Boss, bảng xếp hạng và phần thưởng.

### 1.1. Đối tượng sử dụng

- Đối tượng chính: học sinh THCS.
- Quy mô dự kiến: khoảng **600–700 tài khoản học sinh**.
- Số người có thể cùng tham gia một trận Boss: khoảng **60–70 học sinh**.
- Có tài khoản/quyền dành cho giáo viên để quản lý nội dung và theo dõi hoạt động.
- Giao diện, câu chữ và thao tác cần đơn giản, phù hợp với học sinh THCS.

### 1.2. Định hướng trải nghiệm

- Phong cách hình ảnh: **pixel art cổ điển**.
- Tổ chức học tập dưới dạng nhiệm vụ, vượt ải, chiến đấu theo lượt hoặc hoạt động chung.
- Hình ảnh và tài nguyên phải nhẹ để website tải nhanh.
- Ưu tiên cách triển khai dễ quản lý, chi phí thấp, có thể duy trì lâu dài.

---

## 2. Nền tảng và kiến trúc triển khai

### 2.1. Nền tảng dự kiến

| Thành phần | Công nghệ/giải pháp dự kiến | Vai trò |
|---|---|---|
| Hosting website | GitHub Pages | Lưu trữ và phục vụ website tĩnh |
| Giao diện | HTML, CSS, JavaScript | Hiển thị website và xử lý tương tác |
| Cơ sở dữ liệu/đồng bộ | Firebase | Lưu tài khoản, hồ sơ nhân vật, tiến trình và dữ liệu nhiều người chơi |
| Ngân hàng câu hỏi | File Excel (`.xlsx`) | Lưu câu hỏi, phương án và đáp án |
| Đọc Excel | Thư viện JavaScript như SheetJS | Đọc nội dung file Excel ngay trên trình duyệt |
| Đồ họa | Pixel art, ảnh sprite nhẹ | Nhân vật, quái vật, Boss, bản đồ, vật phẩm |

**Đây là kiến trúc đề xuất đã được thảo luận, không phải xác nhận rằng mọi dịch vụ/tài khoản đã được tạo.**

### 2.2. Nguyên tắc kiến trúc

- Website ưu tiên chạy trên hosting tĩnh; không yêu cầu máy chủ riêng chỉ để phục vụ các trang HTML/CSS/JS.
- File câu hỏi Excel được đặt trong thư mục của website để giáo viên có thể cập nhật rồi tải phiên bản mới lên.
- JavaScript trên trình duyệt đọc câu hỏi và kiểm tra đáp án.
- Firebase dùng cho dữ liệu cần lưu lâu dài và đồng bộ giữa các thiết bị/người chơi.
- Không gửi yêu cầu lên Firebase cho từng thao tác không cần thiết, đặc biệt không gửi request cho mỗi câu trả lời sai.
- Các thay đổi quan trọng cần đồng bộ có thể được gom theo lô hoặc chỉ gửi ở thời điểm phù hợp (ví dụ khi kết thúc bài, nhận thưởng hoặc cập nhật trận Boss).
- Cần thiết kế cập nhật dữ liệu dùng chung an toàn khi nhiều học sinh thao tác đồng thời, nhất là HP Boss.

### 2.3. Lưu ý về quy mô và chi phí

- Thiết kế cần tính đến 600–700 tài khoản, nhưng không đồng nghĩa tất cả đều hoạt động đồng thời.
- Cần kiểm tra giới hạn gói miễn phí và chi phí thực tế của Firebase tại thời điểm triển khai.
- Nếu dùng Firebase Realtime Database, cần đặc biệt kiểm tra giới hạn kết nối đồng thời của gói đang sử dụng; số người trong trận Boss có thể lên đến 60–70.
- Nếu dùng Firestore, cần dự toán lượt đọc, lượt ghi, dung lượng và băng thông.
- Tránh đọc/ghi dữ liệu liên tục theo từng khung hình hoặc từng giây nếu không cần thiết.
- Không coi gói miễn phí là không giới hạn; cần có phương án theo dõi mức sử dụng và cảnh báo chi phí.
- GitHub Pages chỉ phục vụ nội dung tĩnh; không tự thực hiện logic máy chủ hoặc bảo đảm tính toàn vẹn dữ liệu game.

---

## 3. Tài khoản và hồ sơ học sinh

### 3.1. Thông tin tài khoản

Yêu cầu đã nêu:

- Giáo viên cần quản lý được tài khoản học sinh.
- Thông tin nhận diện học sinh dự kiến chỉ cần **tên và lớp**.
- Học sinh có **nickname** để hiển thị khi tham gia game, tránh công khai tên thật trong hoạt động chung.

Khuyến nghị bảo mật đã trao đổi:

- Không dùng tên + lớp làm mật khẩu.
- Nên cấp mã tài khoản riêng và PIN/mật khẩu riêng.
- Chỉ thu thập dữ liệu thật sự cần thiết; không cần yêu cầu ngày sinh, địa chỉ nhà hoặc số điện thoại nếu không có lý do nghiệp vụ.
- Hạn chế hiển thị thông tin cá nhân trên bảng xếp hạng và màn hình Boss.

### 3.2. Hồ sơ nhân vật

Mỗi học sinh có một nhân vật riêng. Hồ sơ cần lưu được tối thiểu:

- Tài khoản/người chơi liên quan.
- Nickname.
- Nhân vật đã chọn (ARcher_M,Magical_F,..)
- Cấp độ (Level).
- Kinh nghiệm (XP).
- Vàng (Gold).
- Crystal.
- Trang bị đang sử dụng.
- Tiến trình phiêu lưu/vượt ải.
- Thành tích và dữ liệu xếp hạng cần thiết.

### 3.3. Chỉ số nhân vật dự kiến

Các chỉ số đã được đề xuất trong quá trình thảo luận:

| Chỉ số | Ý nghĩa |
|---|---|
| HP | Điểm sinh lực |
| ATK | Sức tấn công |
| DEF | Phòng thủ |
| CRIT | Tỷ lệ hoặc khả năng chí mạng |
| LEVEL | Cấp độ nhân vật |
| XP | Điểm kinh nghiệm |
| GOLD | Tiền tệ trong game |
| Crystal | Tiền tệ trong game (hiếm hơn)|

Công thức tính chỉ số, giới hạn tối đa và tốc độ tăng cấp: 

---

## 4. Ngân hàng câu hỏi và file Excel

### 4.1. Nguyên tắc lưu câu hỏi

- Câu hỏi được lưu trong file Excel `.xlsx`.
- File Excel được đặt trong thư mục website (ví dụ `questions/`).
- JavaScript đọc file Excel trực tiếp trên trình duyệt.
- Giáo viên có thể cập nhật nội dung bằng cách sửa file Excel rồi tải file mới lên máy chủ github. không load file trực tiếp từ web.

### 4.2. Cấu trúc dữ liệu Excel đề xuất
câu hỏi có nhiều dạng như: nhiều lựa chọn, ghép nối, đúng/sai, danh sách (file execl `questions/Mau_Cauhoi.xlsx` đính kèm)


### 4.3. Cách sử dụng câu hỏi

- Website lấy câu hỏi từ file Excel để tạo bài luyện tập/nhiệm vụ.
- Mỗi File excel sẽ tượng trưng cho từng ải cần phải vượt
- Hệ thống cần hỗ trợ câu hỏi trắc nghiệm tối thiểu 4 phương án A, B, C, D.
- Cần tránh để câu hỏi lặp quá thường xuyên trong cùng một lượt chơi nếu ngân hàng câu hỏi đủ lớn.
- Mỗi Ải dùng hết câu hỏi trong file mới được tính hoàn thành.


### 4.4. Quyết định về bảo mật đáp án

Người dùng đã chủ động chọn **không đặt yêu cầu bảo mật đáp án** để giảm độ phức tạp và chi phí:

- File Excel có thể chứa cả câu hỏi và đáp án.
- Trình duyệt đọc và kiểm tra đáp án ngay trên máy học sinh.
- Không cần gửi request lên máy chủ để xác thực từng câu trả lời.
- Chấp nhận rằng học sinh có kiến thức kỹ thuật vẫn có thể xem đáp án trong file hoặc mã JavaScript.

**Phân biệt quan trọng:** Chấp nhận công khai đáp án không có nghĩa là cho phép học sinh tự sửa vàng, XP, damage hoặc dữ liệu chung của game.

---

## 5. Các chế độ chơi

Website dự kiến có các chế độ sau. Mức độ ưu tiên triển khai được nêu ở mục 12.

### 5.1. Chế độ Phiêu lưu (Adventure)

Đây là chế độ chơi phổ biến, có thể chơi độc lập.

Yêu cầu đã thảo luận:

- Không có Boss chung và không yêu cầu PvP.
- Học sinh làm bài/trả lời câu hỏi để nhận vàng và trang bị.
- Chế độ phiêu lưu sẽ chia ra 4 bản đồ (ứng với hs lớp 6,7,8,9), mỗi bản đồ có 8-12 ải, mỗi ải có số câu hỏi bằng 1 file excel bao gồm đáp án.
- Tiến trình được chia thành các màn hoặc ải.
- Để vượt ải, học sinh phải hoàn thành một bài **Bộ câu hỏi trong 1 file excel** và đạt ngưỡng yêu cầu.
- Khi vượt ải, người chơi mở khóa màn tiếp theo hoặc nhận cơ hội có trang bị tốt hơn.
- Cần lưu tiến trình để học sinh có thể tiếp tục ở lần truy cập sau.
- Màn chiến đấu dùng nền toàn màn hình; thẻ câu hỏi nổi, cao khoảng 90% khung và đủ trong để vẫn nhìn thấy cảnh phía sau. Trên điện thoại yêu cầu xoay ngang để dùng bố cục thống nhất với máy tính.
- Nhân vật và quái vật hiển thị ở tỉ lệ 200%, đứng gần nhau hơn; mỗi quái vật có sprite Idle và Animation riêng.
- Làm hết được các câu với tỉ lệ trên 80% và hạ được ít nhất 1 quái trong ải
- Số lần được làm lại: vô hạn
- Cách chọn câu hỏi và độ khó theo từng ải (Ngẫu nhiên, sẽ nâng cấp sau)
- Phần thưởng cụ thể cho từng ải: 

### 5.2. Chế độ Săn Boss chung (Boss Raid)

Đây là chế độ nhiều học sinh cùng tham gia đánh một Boss.

Yêu cầu đã nêu:

- Khoảng 60–70 học sinh có thể cùng đánh một Boss.
- Tất cả người chơi trong trận nhìn thấy **một thanh HP chung** của Boss.
- Khi học sinh trả lời đúng, nhân vật gây damage lên Boss.
- HP Boss giảm và thay đổi được đồng bộ để những người chơi khác nhìn thấy.
- Boss có cơ chế phản công tất cả người chơi sau mỗi khoảng thời gian X giây.
- Đồng hồ phản công là đồng hồ chung của trận, không phải mỗi học sinh một bộ đếm độc lập.
- Nếu HP nhân vật về 0 thì nhân vật bị hạ gục.

Các tình huống cần thiết kế:

- Khi người chơi bị hạ gục: có được hồi sinh không, hồi sinh sau bao lâu, hay phải chờ hết trận? -Có sau 10s
- Người chơi vào trận muộn có được tham gia không? -Có
- Khi Boss bị đánh bại, trận kết thúc và phần thưởng được chia thế nào? -Chia theo sát thương
- Nếu Boss phản công đúng lúc nhiều người đang gửi damage, dữ liệu phải được xử lý nhất quán.
- Cần tránh cập nhật HP Boss theo cách khiến các lượt đánh đồng thời ghi đè lẫn nhau.

Thông số minh họa từng được đưa ra, **không phải thông số đã chốt**:

- Boss HP: 100.000.
- Damage cơ bản của Boss: 100.
- Boss phản công mỗi 30 giây.
- Mỗi lần phản công gây 200 damage.

### 5.3. Chế độ PvP

Chế độ đấu giữa hai học sinh, dự kiến triển khai sau.

Ý tưởng đã thảo luận:

- Học sinh bật chức năng tìm trận.
- Hệ thống tìm người chơi đang online để ghép đối thủ.
- Hai người tham gia trận đấu.
- Hai bên trả lời câu hỏi theo lượt từ bộ câu hỏi chung.
- Trả lời đúng gây sát thương lên đối thủ.
- Trận đấu kết thúc khi HP một trong hai về 0.

Các quy tắc chi tiết (ghép trận, thời gian chờ, lượt đi, số câu, tính damage, hòa trận, bỏ trận) **chưa được chốt**.

---

## 6. Vật phẩm, trang bị và cửa hàng

### 6.1. Trang bị

Các vị trí trang bị đã được đề xuất:

- Vũ khí.
- Giáp.
- Mũ.
- Phụ kiện.
- Trang phục/hiệu ứng ngoại hình.

### 6.2. Cửa hàng

- Có cửa hàng để học sinh sử dụng tiền tệ trong game mua vật phẩm.
- Có thể có vật phẩm tác động đến sức mạnh nhân vật.
- Vật phẩm được quy định trong file `asset/items/equipments.json`

### 6.3. Tiền tệ

mô hình hai loại tiền:

- **Gold:** nhận từ hoạt động học tập, làm nhiệm vụ hoặc chơi game.
- **Crystal:** loại tiền hiếm, có thể nhận từ thành tích hoặc sự kiện. Hoàn thành ải với tỉ lệ đúng trên 85% hoặc HP còn lại >80% (+1 Crystal); Dungeon thứ 2: mỗi 5 quái hạ được +1 Crystal, tối đa 5 mỗi lượt

### 6.4. Nâng cấp và cân bằng

Các nội dung cần thiết kế sau:

- Giá mua từng vật phẩm.
- Chỉ số cộng thêm của trang bị.
- Cách nâng cấp và chi phí nâng cấp. (Cập nhật ở phiên V6).

---

## 7. Rank, bảng xếp hạng và phần thưởng (V6)

Các tính năng đã được đề xuất:

- Rank người chơi.
- Bảng xếp hạng.
- Phần thưởng cho người có thành tích cao.
- Có thể có bảng xếp hạng theo nhiều tiêu chí:
  - XP.
  - Damage gây ra cho Boss.
  - Số ải đã vượt.
  - Số câu trả lời đúng.
  - Thành tích PvP.

## 8. Giao diện và tài nguyên đồ họa

### 8.1. Phong cách
- Màn hình chia 2 phần: 35% bên trái màn hình là hoạt ảnh, trận đánh với boss, 65% còn lại là bộ câu hỏi (nền câu hỏi nên có độ trong suốt 50%)
- Pixel art cổ điển.
- Giao diện mang cảm giác game nhập vai/chiến thuật.
- Thân thiện với học sinh THCS.
- Các nút thao tác và thông tin quan trọng phải dễ nhìn, dễ hiểu.

### 8.2. Tài nguyên hình ảnh dự kiến

- Nhân vật người chơi.
- Quái vật và Boss.
- Bản đồ/khu vực phiêu lưu.
- Vũ khí, giáp, mũ, phụ kiện.
- Biểu tượng tiền tệ, XP, HP và các chỉ số.
- Hiệu ứng chiến đấu và thông báo nhận thưởng.

### 8.3. Hiệu năng

- Ưu tiên sprite/ảnh pixel art có dung lượng thấp.
- Tối ưu kích thước ảnh và số lượng tài nguyên tải cùng lúc.
- Tránh hiệu ứng nặng không cần thiết.
- Giao diện cần hoạt động tốt trên máy tính; khả năng tương thích điện thoại cũng nên được tính đến trong thiết kế responsive.
-Giao diện điện thoại yêu cầu màn hình ngang đễ dễ tương thích
- Tạo các khối cơ bản, giao diện chứa UI sẽ được hoàn thiện ở V5.
---

## 9. Lưu trữ, đồng bộ và quy tắc dữ liệu

### 9.1. Dữ liệu cần lưu lâu dài

Tối thiểu cần lưu:

- Tài khoản và thông tin lớp.
- Nickname.
- Nhân vật đã chọn (thuộc class nào, nam hay nữ).
- Level, EXP
- Gold
- Crystal.
- Trang bị và vật phẩm sở hữu.
- Tiến trình phiêu lưu.
- Thành tích/xếp hạng.
- Kết quả các hoạt động cần thiết.
- Trạng thái trận Boss và dữ liệu người tham gia khi trận đang diễn ra.

### 9.2. Dữ liệu cần đồng bộ

- Hồ sơ nhân vật sau khi có thay đổi quan trọng.
- Phần thưởng sau khi hoàn thành nhiệm vụ/bài.
- Giao dịch cửa hàng.
- Trang bị sau khi thay đổi.
- HP Boss và trạng thái trận Boss.
- Trạng thái HP của người chơi trong trận.
- Kết quả trận và phần thưởng cuối trận.

### 9.3. Nguyên tắc giảm request/chi phí

- Không gửi request cho mỗi câu trả lời sai.
- Có thể xử lý đáp án ngay trong trình duyệt.
- Chỉ đồng bộ các sự kiện cần thiết.
- Có thể gom nhiều thay đổi damage trong một khoảng thời gian ngắn trước khi đồng bộ, nhưng phải bảo đảm không mất lượt đánh.
- Không cập nhật dữ liệu game liên tục nếu không có thay đổi thực tế.
- Tránh tải lại toàn bộ hồ sơ hoặc toàn bộ danh sách người chơi khi chỉ cần cập nhật một phần nhỏ.

---

## 10. Chống gian lận và quyền ghi dữ liệu

### 10.1. Mức độ chấp nhận

Người dùng chấp nhận không bảo mật đáp án nhằm tiết kiệm chi phí và giảm độ phức tạp. Tuy nhiên, các tài sản và kết quả game vẫn cần được bảo vệ ở mức hợp lý.

### 10.2. Rủi ro đã nhận diện

Nếu website chỉ chạy JavaScript trên trình duyệt và tin mọi dữ liệu do trình duyệt gửi lên, học sinh có thể tìm cách:

- Sửa biến damage trong JavaScript.
- Sửa Gold, XP, HP hoặc chỉ số nhân vật.
- Sửa dữ liệu lưu trong `localStorage`.
- Can thiệp vào dữ liệu trước khi gửi lên Firebase.
- Gửi giá trị không hợp lệ nếu Firebase Security Rules cho phép.

### 10.3. Yêu cầu bảo vệ

- Không cho tài khoản học sinh tự do ghi bất kỳ giá trị Gold, XP, damage hoặc HP nào.
- Firebase Security Rules phải giới hạn quyền đọc/ghi theo tài khoản và loại dữ liệu.
- Không để một học sinh tùy ý sửa hồ sơ của học sinh khác.
- Các giao dịch mua vật phẩm phải kiểm tra số dư và giá vật phẩm.
- Không tin giá trị damage/Gold chỉ vì nó được gửi từ JavaScript phía người chơi.
- Cập nhật HP Boss phải xử lý an toàn khi nhiều người chơi đánh cùng lúc; cần dùng cơ chế transaction/atomic update phù hợp hoặc xử lý qua máy chủ.
- Không để dữ liệu quan trọng có thể bị ghi đè tùy ý bằng một lần cập nhật hồ sơ thông thường.

### 10.4. Mức chống gian lận thực tế

Có hai mức cần phân biệt:

1. **Chống gian lận cơ bản:** Firebase Rules giới hạn quyền ghi, cấu trúc dữ liệu tách biệt, kiểm tra giá trị và giao dịch. Giúp hạn chế các thao tác sửa dữ liệu đơn giản.
2. **Chống gian lận mạnh:** Máy chủ tự xác thực kết quả, tính damage/phần thưởng và cập nhật dữ liệu có thẩm quyền. Mức này an toàn hơn nhưng làm tăng độ phức tạp và có thể phát sinh chi phí backend.

Với định hướng tiết kiệm chi phí, có thể bắt đầu bằng mức cơ bản và chấp nhận rủi ro còn lại. Tuy nhiên, không được quảng bá mức này là chống gian lận tuyệt đối.

---

## 11. Cấu trúc thư mục đề xuất

Cấu trúc khởi đầu đã được đề xuất:

```text
website/
├── index.html
├── questions/
│   ├── World1/
│   ├── World2/
│   ├── World3/
|   └── World4/
├── assets/
│   ├── characters/
│   ├── monsters/
│   ├── maps/
│   ├── items/
│   └── ui/
├── games/
│   ├── adventure.js
│   ├── boss-battle.js
│   └── pvp.js
├── js/
│   ├── firebase.js
│   ├── auth.js
│   ├── quiz.js
│   ├── player.js
│   ├── inventory.js
│   ├── shop.js
│   └── leaderboard.js
└── css/
    └── style.css
```

Đây là cấu trúc tham khảo; có thể điều chỉnh khi bắt đầu lập trình, miễn là phân tách rõ dữ liệu câu hỏi, tài nguyên, giao diện và logic game.

---

## 12. Lộ trình phát triển đề xuất

Lộ trình đã được đề xuất để tránh làm toàn bộ hệ thống cùng lúc:

| Giai đoạn | Phạm vi |
|---|---|
| V1 | Đăng nhập, hồ sơ nhân vật, đọc Excel, hiển thị và làm bài |
| V2 | XP, Gold, trang bị, cửa hàng |
| V3 | Chế độ Phiêu lưu, nhiệm vụ và vượt ải |
| V4 | Rank, bảng xếp hạng và phần thưởng |
| V5 | Săn Boss online nhiều người, UI |
| V6 | PvP, tìm trận và đấu giữa hai học sinh |

Ưu tiên hoàn thiện V1–V3 trước khi triển khai Boss online. PvP để sau cùng vì có thêm nhiều quy tắc đồng bộ và xử lý trận đấu.

---

## 13. Các nội dung được chốt — cần xác nhận trước khi hoàn thiện:ĐÃ CHỐT


### 13.1. Cách giáo viên quản lý câu hỏi

- Phương án A: Giáo viên sửa file Excel rồi tải file mới lên website. -Chốt

### 13.2. Phân chia lớp và bảng xếp hạng

- Phương án A: Mỗi Khối có bảng xếp hạng riêng.(bỏ bảng toàn trường)

### 13.3. Phạm vi Boss

- Mỗi Stage có 1 quái vật được quy định trong `assets/monsters/stage_monster.json`
- Super Boss (Boss Raid) chung sẽ là sự kiện theo khối (V4)

### 13.4. Các thông số gameplay khác
CÔNG THỨC DAMAGE CHUNG: Damage=[ATK(my)-DEF(enemy)] Nhân/Chia hệ số tăng giảm % dmg
- CRIT x2 Dmg
- Damage và chu kỳ phản công của Monster: Theo công thức chung, Tấn công mỗi khi trả lời sai và sau 20s mà chưa trả lời câu hỏi
- HP tối đa của nhân vật: 100000.
- Cách hồi sinh sau khi bị hạ gục: Chơi lại ải.
- Thời lượng một trận Boss: Không có.
- Điều kiện thắng/thua: Thắng khi hạ HP quái về 0, thua khi HP player về 0
- Cách chia thưởng khi Super Boss (boss Raid) bị hạ: Theo lượng Dmg (V4)
- Ngưỡng vượt ải và cách mở khóa màn: Hạ quái của ải và đạt lv nhất định (+5 lv mỗi ải: Ải 1: require lv1, ải 2 require:lv6).
- Công thức lên cấp và nhận XP: lv1: 100EXP, mỗi lV tăng 50EXP để lên cấp (lv1:100, lv2:150, lv3:1=200).
- Giá vật phẩm: Quy định trong `equipments.json`.
- Tỉ lệ rớt vật phẩm và phần thưởng: quy định trong `asset/maps/world.json` của mỗi world.
- Tiêu chí, chu kỳ và phần thưởng xếp hạng(V4).
- Quy tắc ghép trận và kết thúc trận PvP(V6).
- Quy tắc thưởng thêm: Mỗi quái hạ được sẽ tăng 10% phần thưởng (5% đối với dungeon) (cộng dồn không tích luỹ, 1 quái tăng 10%, 3 quái là 15%).
### 13.5. Chế độ Stage và Dungeon
- Stage được tính là hoàng thành khi hạ được 1 nhất 1 quái và đúng được 70% câu.
- Dungeon là chế độ đánh quái vô tận, dừng khi người chơi hết HP, số quái được quy địnhtrong `asset/maps/world.json`.
### 13.6. Quyết định kỹ thuật cần xác nhận

- Chọn Firebase Realtime Database, Cloud Firestore kết hợp.
- Phương thức đăng nhập và cấp tài khoản.
- Quy tắc Firebase Security Rules.
- Cơ chế cập nhật HP Boss đồng thời.
- Có cần backend/server-authoritative cho Boss và giao dịch hay chấp nhận chống gian lận cơ bản.
- Hỗ trợ điện thoại ở mức nào.
- Có cần trang quản trị giáo viên trong phiên bản đầu hay không.

---

## 14. Tiêu chí nghiệm thu tối thiểu

### 14.1. Tài khoản và nhân vật

- Học sinh đăng nhập được bằng tài khoản được cấp.
- Mỗi học sinh có hồ sơ nhân vật riêng.
- Nickname được dùng trong các hoạt động công khai.
- Dữ liệu nhân vật được lưu và khôi phục khi đăng nhập lại.

### 14.2. Câu hỏi

- Website đọc được file Excel đúng cấu trúc.
- Câu hỏi và các phương án hiển thị chính xác.
- Kiểm tra đáp án hoạt động đúng.
- Giáo viên có thể thay file Excel mới thông qua máy chủ github khi public web.

### 14.3. Phiêu lưu và phần thưởng

- Học sinh làm bài và nhận kết quả.
- Tiến trình vượt ải được lưu.
- Gold/XP và vật phẩm được cập nhật đúng theo quy tắc đã cấu hình.
- Cửa hàng không cho mua nếu không đủ tiền.

### 14.4. Boss online

- Nhiều học sinh cùng tham gia một trận.
- Người chơi nhìn thấy HP Boss chung được cập nhật.
- Damage của các lượt đánh không bị mất khi nhiều người thao tác gần như đồng thời.
- Boss phản công theo đồng hồ chung.
- HP người chơi được cập nhật đúng.
- Kết quả và phần thưởng trận được lưu nhất quán.

### 14.5. Bảo mật và ổn định

- Học sinh không thể sửa hồ sơ của người khác.
- Không thể tùy ý ghi tăng Gold/XP bằng quyền ghi thông thường.
- Không thể cập nhật HP Boss theo cách làm mất lượt đánh của người khác.
- Website xử lý được quy mô mục tiêu đã đặt ra trong thử nghiệm thực tế.
- Có theo dõi mức sử dụng Firebase và chi phí.

---

## 15. Nguyên tắc không được hiểu sai khi triển khai

1. **Công khai đáp án là quyết định có chủ đích.** Không cần xây dựng cơ chế giấu đáp án hoặc gọi server kiểm tra từng câu.
2. **Không đồng nghĩa công khai tài sản game.** Gold, XP, damage, HP, trang bị và dữ liệu chung vẫn cần quy tắc ghi phù hợp.
3. **GitHub Pages là hosting tĩnh.** Không tự cung cấp backend để xác thực giao dịch hoặc chống gian lận.
4. **Firebase không tự động bảo đảm game công bằng.** Cần thiết kế Security Rules, cấu trúc dữ liệu và giao dịch đồng thời đúng cách.
5. **Thông số Boss từng nêu chỉ là ví dụ.** Không tự ý coi HP 100.000, damage 100/200 hoặc chu kỳ 30 giây là cấu hình cuối.
6. **PvP là tính năng dự kiến, chưa phải ưu tiên đầu tiên.**

---

## 16. Tóm tắt yêu cầu cốt lõi

Website cần là một nền tảng học tập kết hợp RPG cho khoảng 600–700 học sinh THCS, giao diện pixel art nhẹ, host dự kiến trên GitHub Pages, dùng Firebase để lưu và đồng bộ dữ liệu người chơi. Giáo viên quản lý câu hỏi qua file Excel đặt trong thư mục website; trình duyệt đọc và kiểm tra đáp án trực tiếp, chấp nhận đáp án công khai để giảm chi phí. Học sinh có tài khoản, nickname và nhân vật riêng; có các chỉ số, XP, vàng, trang bị, cửa hàng và chế độ phiêu lưu vượt ải. Hệ thống dự kiến mở rộng sang Boss Raid chung khoảng 60–70 người, bảng xếp hạng và PvP. Cần bảo vệ dữ liệu tài sản game và xử lý cập nhật Boss an toàn khi nhiều người chơi cùng thao tác. Ưu tiên làm phiên bản cơ bản trước, sau đó mở rộng theo từng giai đoạn.
**LƯU Ý:** Chỉ làm việc và gửi lại những file đã sửa đổi theo đúng cấu trúc thư mục

**Trạng thái:** Đây là bản đặc tả tổng hợp từ các trao đổi hiện có. Các nội dung được đánh dấu “đề xuất”, “dự kiến” hoặc “chưa chốt” cần được xác nhận trước khi triển khai chính thức.
