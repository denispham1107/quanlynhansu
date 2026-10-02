# Quy tắc bảo trì dự án

## Giao diện mobile và iOS

- Mọi giao diện mới hoặc chỉnh sửa phải được kiểm tra ở chiều rộng 320px, 375px, 390px, 430px và chế độ ngang trước khi triển khai.
- Với CSS Grid/Flex, luôn đặt `min-width: 0` cho phần tử con có input, select, nút hoặc nội dung dài; cột co giãn phải dùng `minmax(0, 1fr)`.
- Các `input[type="date"]`, `input[type="time"]` và `select` native trên iOS không được tự làm viền ngoài của ô khi nằm trong Grid/Flex. Phải đặt chúng trong một lớp vỏ có `width: 100%`, `min-width: 0`, `overflow: hidden` và `box-sizing: border-box`; lớp vỏ chịu trách nhiệm vẽ viền và trạng thái focus.
- Không đặt hai control native cạnh nhau trên màn hình từ 640px trở xuống. Ở chiều ngang iPhone và tablet nhỏ đến 1024px chỉ dùng tối đa hai cột, trường còn lại phải xuống hàng.
- Không được để nội dung, nút hoặc ô nhập tràn khỏi card, chồng lên nhau hay tạo cuộn ngang. Khi thiếu chỗ, ưu tiên xuống hàng hoặc chuyển thành một cột.
- Sau thay đổi giao diện, phải tăng phiên bản cache của service worker để thiết bị iOS nhận CSS mới.
- Trước khi commit, kiểm tra ít nhất cú pháp, `git diff --check`, rà soát các media query có thể ghi đè quy tắc mobile ở cuối stylesheet và chạy kiểm tra kích thước thực tế của từng ô so với card cha. Chỉ nhìn mã CSS là chưa đủ để kết luận không tràn.

## Trang quản lý: ngăn tái diễn lỗi tràn lề phải

- Sau mọi thay đổi hoặc chức năng mới trên trang quản lý, phải kiểm tra cùng lúc bốn loại nội dung trong `#adminTaskList`: “Lịch sử giao việc”, “Lịch sử công việc không hợp lệ”, Phiếu “Chưa giao việc” và Phiếu công việc. Một Phiếu có nội dung dài có thể kéo rộng cột Grid chung, khiến cả các mục khác tràn lề dù chúng không thay đổi.
- Giữ `#adminTaskList`, các section/list lồng nhau, dòng lịch sử, `.ticket-group` và `.task-card` co được trong card cha: cột Grid dùng `minmax(0, 1fr)`, phần tử con dùng `min-width: 0`/`max-width: 100%` phù hợp; nhóm nút phải xuống hàng khi thiếu chỗ. Không chỉ che lỗi bằng `overflow-x: hidden`, vì cách đó có thể cắt chữ hoặc nút.
- Khi dựng dữ liệu thử, giữ nguyên lớp `empty-box` của `#adminTaskList` như DOM thật; lớp này vẫn còn khi danh sách có dữ liệu và tạo thêm padding. Dùng ít nhất một tên Phiếu/địa chỉ dài và Phiếu có đủ các ô thông tin, nút thao tác.
- Trước commit, chạy `node scripts/verify-scheduled-layout.mjs` và xác nhận riêng phần “Trang quản lý” đạt ở desktop 1181px, 1440px, 1560px; mobile 320px, 375px, 390px, 430px; cùng hai chiều ngang 844px, 932px. Đo `getBoundingClientRect()` của từng mục so với vùng nội dung của `.task-panel` và card cha, đồng thời kiểm tra `scrollWidth <= clientWidth` của danh sách và trang. Nếu thay đổi chế độ Thu gọn/Chi tiết hoặc nội dung Phiếu mở rộng, bổ sung ca kiểm tra hình học tương ứng trước khi hoàn tất.

## Trạng thái Phiếu công việc: không cho chạy lại sau khi duyệt

- `completed` là trạng thái cuối. Một Phiếu đã được Admin xác nhận không được tự chuyển về `doing`, `hotel`, `redo`, `overdue`, `submitted` hoặc `waiting_assignee` do dữ liệu cũ, thao tác trễ hay bản app cũ. `submitted` chỉ có thể giữ nguyên, chuyển sang `completed`, hoặc sang `redo` khi Admin thực sự chọn “Yêu cầu làm lại”.
- Mọi luồng nền tự cập nhật trạng thái (đặc biệt đồng bộ quá hạn) phải đọc lại document mới nhất trong Firestore transaction và kiểm tra trạng thái/mốc thời gian ngay trước khi ghi. Không ghi `status` dựa riêng vào `state.tasks` hoặc snapshot cache; transaction phải chịu được xung đột với thao tác duyệt của Admin.
- Thao tác duyệt và yêu cầu làm lại cũng phải xác minh `submitted` trong transaction. Firestore Rules phải giữ khóa trạng thái cuối trên mọi nhánh `allow update` có thể đổi `status`, kể cả quyền Admin và Nhập dữ liệu; Cloud Functions dùng Admin SDK cần kiểm tra tương đương trong mã.
- `approvedAt` đã có giá trị là bằng chứng Phiếu từng được duyệt: mọi cập nhật tiếp theo phải giữ `status = completed`. Khi đọc snapshot từ máy chủ, Admin cần phát hiện và khôi phục bằng transaction các Phiếu cũ có `approvedAt` nhưng `status` khác `completed`; không lấy snapshot cache làm căn cứ sửa dữ liệu.
- Trước commit khi sửa luồng Phiếu, chạy `node scripts/verify-task-status-transitions.mjs` với các ca snapshot cũ, Phiếu đang chờ duyệt, Phiếu đã duyệt và hai thao tác Admin đến trễ. Không chỉ kiểm tra giao diện hiển thị ngay sau khi bấm; phải kiểm tra trạng thái vẫn đúng sau lần đồng bộ tiếp theo.

## Nhập thời gian

- Mọi ô nhập thời gian mới hoặc được chỉnh sửa phải hiển thị và nhận theo khung giờ 24 giờ (`HH:mm` hoặc `HH:mm:ss` khi có giây), không phụ thuộc cách hiển thị AM/PM của trình duyệt hay thiết bị. Kiểm tra giá trị trước khi lưu và giữ đúng định dạng này khi mở lại để sửa.
- Khi một ô thời gian có bộ chọn bằng thao tác bấm, phải giữ cả khả năng bấm chọn lẫn nhập thủ công; không thay bộ chọn bằng ô nhập tay đơn thuần. Bộ chọn cũng phải dùng khung giờ 24 giờ.

## Modal và vùng cuộn

- Không được hiển thị hai modal chồng lên nhau. Khi chuyển từ một modal sang màn hình/modal con, phải ẩn modal nguồn, giữ nguyên dữ liệu đang nhập và cung cấp nút “Quay lại” để khôi phục đúng trạng thái trước đó.
- Thanh cuộn của modal phải nằm trong phần nội dung của card, không nằm ngoài viền hoặc góc bo. Card phải có giới hạn chiều cao và `overflow: hidden`; vùng nội dung cuộn phải có `min-height: 0`, `overflow-y: auto` và `overflow-x: hidden`.
- Sau khi sửa modal, phải kiểm tra hình học thực tế để bảo đảm card nằm trong viewport, vùng cuộn nằm trong card và trang phía sau không tạo thêm thanh cuộn.
- Mọi nút xóa vĩnh viễn trong danh sách phải hỏi xác nhận trước khi gọi máy chủ; phía máy chủ vẫn phải kiểm tra quyền Admin và quyền sở hữu dữ liệu, không chỉ dựa vào giao diện.

## Hoàn tất thay đổi mã

- Khi hoàn tất một yêu cầu sửa mã trong dự án này và các kiểm tra liên quan đã đạt, tự tạo commit Git tại máy rồi đẩy commit đó lên GitHub; không cần chờ yêu cầu “đẩy lên github” riêng.
- Trong câu trả lời cuối, báo rõ các tệp đã commit, mã commit và kết quả đẩy lên GitHub.
- Không tự commit/đẩy khi người dùng chỉ yêu cầu kiểm tra, giải thích, hoặc dặn chờ phê duyệt trước khi sửa. Không đưa các thay đổi không thuộc yêu cầu hoặc của người dùng vào commit; nếu không thể tách an toàn thì hỏi trước.
