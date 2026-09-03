# Deploy chức năng Nạp Google Calendar

Phiên bản này dùng 2 Callable Cloud Functions:

- `getGoogleCalendarImportSettings`: đọc Calendar ID và trạng thái đã lưu API Key.
- `importGoogleCalendarEvents`: lưu/cập nhật cấu hình và nạp sự kiện thành Phiếu.

Calendar ID được lưu phía máy chủ. API Key được mã hóa AES-256-GCM trước khi lưu tại:

`serverSecrets/googleCalendarImport`

Frontend không được phép đọc trực tiếp document này và Cloud Function không trả API Key về trình duyệt.

## Cài thư viện

```powershell
npm.cmd --prefix functions install
```

## Deploy Functions và Firestore Rules

```powershell
firebase.cmd deploy --only functions:getGoogleCalendarImportSettings,functions:importGoogleCalendarEvents,firestore:rules --project quanlynhansu-6e63b
```

Nếu CLI không nhận danh sách Function riêng:

```powershell
firebase.cmd deploy --only functions,firestore:rules --project quanlynhansu-6e63b
```

Không cần deploy Storage Rules. Secret `WORK_ORDER_SETTINGS_PASSWORD` hiện có được dùng làm khóa dẫn xuất để mã hóa API Key.
