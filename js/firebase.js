// Khởi tạo Firebase (SDK compat nạp trong index.html). Cung cấp FirebaseService cho auth.js / player.js.
// apiKey của ứng dụng web không phải bí mật; bảo mật thật nằm ở firestore.rules (Plan mục 10).
const FirebaseService = (() => {
  const firebaseConfig = {
    apiKey: "AIzaSyAjQl3xaPsaRaeDvkFBc_bIOX8zq5aOG3k",
    authDomain: "rpgacademy-fb964.firebaseapp.com",
    projectId: "rpgacademy-fb964",
    storageBucket: "rpgacademy-fb964.firebasestorage.app",
    messagingSenderId: "616514645039",
    appId: "1:616514645039:web:2a0b0ccd4d13e49748eada"
  };
  const svc = { configured: false, errorMessage: '', auth: null, db: null };
  try {
    if (!window.firebase) throw new Error('Không tải được thư viện Firebase. Hãy kiểm tra kết nối mạng.');
    if (!firebase.apps.length) firebase.initializeApp(firebaseConfig);
    svc.auth = firebase.auth();
    svc.db = firebase.firestore();
    svc.configured = true;
  } catch (e) {
    svc.errorMessage = e.message || 'Firebase chưa được cấu hình.';
  }
  svc.getStudentRef = (className, username) =>
    svc.db.collection('accounts').doc(String(className)).collection('users').doc(String(username));
  return svc;
})();
