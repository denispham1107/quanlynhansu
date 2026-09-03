# Triển khai mật khẩu bảo vệ Cài đặt

Mật khẩu **không nằm trong mã nguồn**. Hãy lưu mật khẩu bằng Firebase Secret Manager.

## 1. Cài dependencies của Cloud Functions

```bash
npm --prefix functions install
```

## 2. Tạo/cập nhật secret

```bash
firebase functions:secrets:set WORK_ORDER_SETTINGS_PASSWORD
```

Firebase CLI sẽ yêu cầu nhập giá trị bí mật. Không ghi giá trị đó vào file, GitHub, commit hoặc ảnh chụp màn hình.

## 3. Deploy Functions và Firestore Rules

```bash
firebase deploy --only functions:verifyWorkOrderSettingsPassword,functions:saveWorkOrderControlSettings,firestore:rules
```

Không cần deploy Storage Rules cho thay đổi này.

## 4. Kiểm tra

- Đăng xuất rồi đăng nhập lại tài khoản Admin.
- Bấm **Cài đặt**.
- Nhập mật khẩu đã lưu trong Secret Manager.
- Sau khi vào Cài đặt, thử lưu một thay đổi.

> Cloud Functions được đặt tại region `asia-southeast1`; frontend cũng gọi đúng region này.
