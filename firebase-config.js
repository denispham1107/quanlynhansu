// Thay toàn bộ thông tin bên dưới bằng Firebase Web App config của dự án bạn.
// Firebase web config có thể đặt ở frontend. Đây KHÔNG phải private key Admin SDK.
// Bảo mật thật sự nằm ở Firebase Authentication + Firestore Security Rules.
export const firebaseConfig = {
  apiKey: "YOUR_FIREBASE_API_KEY",
  authDomain: "YOUR_PROJECT_ID.firebaseapp.com",
  projectId: "YOUR_PROJECT_ID",
  storageBucket: "YOUR_PROJECT_ID.appspot.com",
  messagingSenderId: "YOUR_MESSAGING_SENDER_ID",
  appId: "YOUR_FIREBASE_APP_ID"
};
