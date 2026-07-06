SHOP TASK - PHIÊN BẢN V8

*** QUAN TRỌNG - BẮT BUỘC ĐỌC ***
Bản này thay đổi cách Admin giao việc:
- TRƯỚC ĐÂY: mỗi lần bấm "+ Thêm công việc" chỉ tạo 1 công việc giao cho 1 người.
- BÂY GIỜ: Admin bấm "+ Tạo phiếu công việc", tự đặt TÊN PHIẾU, rồi bên trong phiếu
  đó có thể bấm "+ Thêm công việc" nhiều lần để thêm nhiều công việc con, MỖI công việc
  con lại giao cho MỘT nhân viên khác nhau tuỳ ý. Bấm "Tạo phiếu & giao việc" để tạo tất
  cả cùng lúc. Trang Admin sẽ hiển thị công việc được nhóm lại theo từng phiếu.

Vì tính năng này thêm 1 collection Firestore mới (workOrders) và 2 trường mới trong
collection tasks (workOrderId, workOrderName), BẮT BUỘC phải publish lại nội dung
firestore.rules mới (xem phần FIRESTORE RULES bên dưới). Nếu không cập nhật rules,
khi Admin bấm "Tạo phiếu & giao việc" sẽ bị lỗi "permission-denied".

--------------------------------------------------------------

PHIÊN BẢN V2 (đã có từ trước) - vẫn còn nguyên trong bản này:
1) Lọc công việc theo ngày giao việc:
   - Tất cả ngày
   - Hôm nay
   - Chọn 1 ngày
   - Khoảng ngày từ ngày A đến ngày B
   Có ở cả trang Admin và trang Nhân viên.

2) Thông báo realtime:
   - Khi Admin giao việc thành công: Admin và nhân viên được giao đều có thông báo.
   - Khi nhân viên báo hoàn thành: Admin nhận thông báo chờ duyệt.
   - Khi Admin xác nhận hoàn thành: Admin và nhân viên đều có thông báo kết quả.
   - Khi Admin yêu cầu làm lại: nhân viên nhận thông báo.

3) Hỗ trợ thông báo hệ thống trên thiết bị:
   - Desktop/Android: bấm nút “Bật thông báo” trên website.
   - iPhone/iOS: nên mở bằng Safari và Add to Home Screen để dùng như PWA. Một số trình duyệt/iOS có thể chỉ hiện thông báo khi web/PWA đang mở.
   - Đây là thông báo client-side qua Browser Notification API + Service Worker, không dùng secret backend.

CÁC FILE CẦN UP LÊN GITHUB
- index.html
- styles.css
- app.js
- firebase-config.js
- firestore.rules
- firebase.json
- manifest.webmanifest
- sw.js
- icon-192.png
- icon-512.png

LƯU Ý FIREBASE CONFIG
Không ghi đè firebase-config.js hiện tại nếu file trên GitHub của bạn đã có apiKey mới chạy được.
Nếu copy cả thư mục này lên GitHub, hãy thay lại firebase-config.js bằng config thật của bạn.

FIRESTORE RULES
Bạn phải copy nội dung firestore.rules mới và dán vào:
Firebase Console > Firestore Database > Rules > Publish
Nếu không cập nhật rules mới, chức năng notification sẽ báo lỗi permission-denied.

CÁCH TEST
1. Đăng nhập Admin.
2. Bấm “Bật thông báo”.
3. Tạo/giao công việc cho nhân viên.
4. Kiểm tra chuông thông báo ở góc trên.
5. Đăng nhập nhân viên trên điện thoại hoặc trình duyệt khác, bấm “Bật thông báo”.
6. Nhân viên bấm Hoàn thành.
7. Admin xác nhận hoàn thành.
8. Kiểm tra thông báo ở cả Admin và Nhân viên.
