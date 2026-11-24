const Auth = {
  emailDomain: "students.rpg-game.example",
  registering: false,
  profileLoads: new Map(),

  normalizeUsername(username) {
    return String(username).trim().toLowerCase();
  },

  normalizeClass(className) {
    return String(className).trim().toLowerCase().replace(/\s+/g, "");
  },

  // Lớp dạng "khối/số lớp", ví dụ 6/5, 7/11, 8/15 (chấp nhận gõ có khoảng trắng hoặc dấu gạch chéo ngược/chấm).
  normalizeRoom(room) {
    return String(room || "").trim().replace(/\s+/g, "").replace(/[\\.\-]/g, "/");
  },

  roomIsValid(grade, room) {
    const value = this.normalizeRoom(room);
    return /^[6-9]\/[0-9]{1,2}$/.test(value) && value.split("/")[0] === String(grade) && Number(value.split("/")[1]) >= 1;
  },

  usernameIsValid(username) {
    return /^[a-z0-9_]{3,20}$/.test(this.normalizeUsername(username));
  },

  internalEmail(className, username) {
    return `${this.normalizeUsername(username)}.${this.normalizeClass(className)}@${this.emailDomain}`;
  },

  identityFromUser(user) {
    const email = String(user.email || "").toLowerCase();
    const match = email.match(/^([a-z0-9_]{3,20})\.([6-9])@students\.rpg-game\.example$/);
    if (!match) throw new Error("Tài khoản này không có thông tin lớp hợp lệ. Hãy liên hệ giáo viên.");
    return { username: match[1], className: match[2] };
  },

  onAuthStateChanged(callback) {
    if (!FirebaseService.configured) {
      callback(null, new Error(FirebaseService.errorMessage));
      return () => {};
    }
    return FirebaseService.auth.onAuthStateChanged(callback);
  },

  async loadStudent(user) {
    if (!FirebaseService.configured) throw new Error("Firebase chưa được cấu hình.");
    const identity = this.identityFromUser(user);
    if (!this.profileLoads.has(user.uid)) {
      const request = FirebaseService.getStudentRef(identity.className, identity.username)
        .get()
        .then(snapshot => {
          if (!snapshot.exists) {
            throw new Error("Không tìm thấy hồ sơ học sinh liên kết với tài khoản này. Hãy liên hệ giáo viên.");
          }
          const profile = snapshot.data();
          if (profile.UID !== user.uid) {
            throw new Error("Không thể xác minh hồ sơ học sinh. Hãy liên hệ giáo viên.");
          }
          return { identity, profile };
        })
        .catch(error => {
          this.profileLoads.delete(user.uid);
          if (error.code === "permission-denied") {
            throw new Error("Không thể đọc hồ sơ học sinh. Hãy kiểm tra Firestore Rules; tài khoản cũ cần được giáo viên liên kết UID và xóa trường Password.");
          }
          throw error;
        });
      this.profileLoads.set(user.uid, request);
    }
    return this.profileLoads.get(user.uid);
  },

  async login(className, username, password) {
    if (!FirebaseService.configured) throw new Error(FirebaseService.errorMessage);
    const normalizedClass = this.normalizeClass(className);
    const normalizedUsername = this.normalizeUsername(username);
    if (!/^[6-9]$/.test(normalizedClass) || !this.usernameIsValid(normalizedUsername)) {
      throw new Error("Thông tin đăng nhập không chính xác.");
    }
    try {
      const credential = await FirebaseService.auth.signInWithEmailAndPassword(
        this.internalEmail(normalizedClass, normalizedUsername),
        password
      );
      return await this.loadStudent(credential.user);
    } catch (error) {
      if (error.code === "auth/invalid-credential"
        || error.code === "auth/user-not-found"
        || error.code === "auth/wrong-password"
        || error.code === "auth/invalid-email") {
        throw new Error("Thông tin đăng nhập không chính xác.");
      }
      throw error;
    }
  },

  async register(className, username, password, nickname, room, character) {
    if (!FirebaseService.configured) throw new Error(FirebaseService.errorMessage);
    const normalizedClass = this.normalizeClass(className);
    const normalizedUsername = this.normalizeUsername(username);
    if (!/^[6-9]$/.test(normalizedClass)) throw new Error("Vui lòng chọn khối lớp hợp lệ.");
    if (!this.usernameIsValid(normalizedUsername)) throw new Error("Tên đăng nhập cần có 3–20 ký tự gồm chữ không dấu, số hoặc dấu gạch dưới.");
    if (!this.roomIsValid(normalizedClass, room)) throw new Error(`Lớp cần có dạng ${normalizedClass}/số lớp, ví dụ ${normalizedClass}/5.`);
    const pickedCharacter = CONFIG.CHARACTERS[character] ? character : CONFIG.DEFAULT_CHARACTER;   // nhân vật chọn lần đầu khi tạo tài khoản

    let credential;
    this.registering = true;
    try {
      try {
        credential = await FirebaseService.auth.createUserWithEmailAndPassword(
          this.internalEmail(normalizedClass, normalizedUsername),
          password
        );
        const profile = {
          UID: credential.user.uid,
          Username: normalizedUsername,
          Class: normalizedClass,
          Nickname: nickname.trim(),
          Room: this.normalizeRoom(room),
          Character: pickedCharacter,
          Golds: 0,
          Crystals: 0,
          LV: 1,
          EXP: 0,
          Equipment: {},
          Enventory: [],
          progress: {}
        };
        await FirebaseService.getStudentRef(normalizedClass, normalizedUsername).set(profile);
      } catch (error) {
        if (credential) {
          try {
            await credential.user.delete();
          } catch (rollbackError) {
            throw new Error("Không tạo được hồ sơ và cũng không thể hủy tài khoản Auth chưa hoàn tất. Hãy liên hệ giáo viên để xử lý trước khi đăng ký lại.");
          }
        }
        if (error.code === "auth/email-already-in-use") {
          throw new Error("Tên đăng nhập này đã được sử dụng trong khối đã chọn.");
        }
        if (error.code === "auth/weak-password") {
          throw new Error("Mật khẩu cần có ít nhất 6 ký tự.");
        }
        if (error.code === "permission-denied" || error.code === "already-exists") {
          throw new Error("Tên đăng nhập này đã được sử dụng trong khối đã chọn hoặc hồ sơ cần được giáo viên liên kết.");
        }
        throw new Error(`Không thể tạo tài khoản. ${error.message || "Vui lòng thử lại."}`);
      }
      try {
        await FirebaseService.auth.signOut();
      } catch (error) {
        throw new Error("Tài khoản đã được tạo nhưng chưa thể đăng xuất an toàn. Hãy tải lại trang hoặc đăng xuất trước khi tiếp tục.");
      }
    } finally {
      this.registering = false;
    }
  },

  async logout() {
    this.profileLoads.clear();
    if (FirebaseService.configured) await FirebaseService.auth.signOut();
  },

  clearProfileCache() {
    this.profileLoads.clear();
    try {
      localStorage.removeItem("rpg_user");
    } catch (error) {
      console.error("Could not clear obsolete local authentication data:", error);
    }
  }
};

window.Auth = Auth;
