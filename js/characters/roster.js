// Danh sách nhân vật chọn được: key = tên thư mục trong assets/characters/. Thêm nhân vật mới: tạo thư mục + character.json
// rồi thêm một dòng vào CONFIG.CHARACTERS (dùng lớp nghề tương ứng).
CONFIG.CHARACTERS = {
  Archer_F: new Archer('Archer_F', 'Cung thủ nữ'),
  Archer_M: new Archer('Archer_M', 'Cung thủ nam'),
  Mage_F: new Mage('Mage_F', 'Pháp sư nữ'),
  Mage_M: new Mage('Mage_M', 'Pháp sư nam'),
  Warrior_F: new Warrior('Warrior_F', 'Chiến binh nữ'),
  Warrior_M: new Warrior('Warrior_M', 'Chiến binh nam')
};
CONFIG.DEFAULT_CHARACTER = 'Archer_F';
CONFIG.selectedCharacter = CONFIG.DEFAULT_CHARACTER;
CONFIG.charactersLoaded = false;
CONFIG.charactersPromise = null;

// Nhân vật hợp lệ đang chọn (nếu lựa chọn cũ không còn tồn tại thì dùng nhân vật mặc định / đầu tiên).
CONFIG.character = function () {
  return this.CHARACTERS[this.selectedCharacter] || this.CHARACTERS[this.DEFAULT_CHARACTER] || Object.values(this.CHARACTERS)[0];
};
// Chỉ đổi nhân vật đang dùng trong bộ nhớ; việc LƯU lựa chọn theo tài khoản do Player.setCharacter (Firestore, trường Character) đảm nhiệm.
CONFIG.selectCharacter = function (key) {
  if (!this.CHARACTERS[key]) return;
  this.selectedCharacter = key;
};
// Tiền tố tên nghề của key nhân vật ('Archer_F' → 'Archer'); phải khớp classPrefix() trong firestore.rules.
CONFIG.classPrefix = function (key) { return String(key || '').split('_')[0]; };

// Nạp JSON từng nhân vật. Nhân vật lỗi cấu hình hoặc thiếu ảnh bị loại khỏi danh sách (cảnh báo trong console).
CONFIG.loadCharacters = function () {
  if (this.charactersLoaded) return Promise.resolve();
  if (!this.charactersPromise) {
    this.charactersPromise = Promise.all(Object.entries(this.CHARACTERS).map(async ([key, character]) => {
      try {
        await character.load();
        if (!(await character.verifySprites())) throw new Error('thiếu file ảnh sprite');
      } catch (error) {
        console.warn(`Bỏ qua nhân vật ${key}:`, error.message);
        delete this.CHARACTERS[key];
      }
    })).then(() => {
      if (!Object.keys(this.CHARACTERS).length) throw new Error('Không có nhân vật nào dùng được. Hãy kiểm tra assets/characters.');
      if (!this.CHARACTERS[this.selectedCharacter]) this.selectedCharacter = this.character().key;
      this.charactersLoaded = true;
    }).catch(error => {
      this.charactersPromise = null;
      throw error;
    });
  }
  return this.charactersPromise;
};
