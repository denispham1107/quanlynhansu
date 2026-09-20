# Quy tắc bảo trì dự án

## Giao diện mobile và iOS

- Mọi giao diện mới hoặc chỉnh sửa phải được kiểm tra ở chiều rộng 320px, 375px, 390px, 430px và chế độ ngang trước khi triển khai.
- Với CSS Grid/Flex, luôn đặt `min-width: 0` cho phần tử con có input, select, nút hoặc nội dung dài; cột co giãn phải dùng `minmax(0, 1fr)`.
- Các `input[type="date"]`, `input[type="time"]` và `select` native trên iOS phải có `width`, `min-width`, `max-width` và `box-sizing` rõ ràng. Không đặt hai control native cạnh nhau trên màn hình từ 640px trở xuống.
- Không được để nội dung, nút hoặc ô nhập tràn khỏi card, chồng lên nhau hay tạo cuộn ngang. Khi thiếu chỗ, ưu tiên xuống hàng hoặc chuyển thành một cột.
- Sau thay đổi giao diện, phải tăng phiên bản cache của service worker để thiết bị iOS nhận CSS mới.
- Trước khi commit, kiểm tra ít nhất cú pháp, `git diff --check` và rà soát các media query có thể ghi đè quy tắc mobile ở cuối stylesheet.
