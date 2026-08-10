# Snake Neon — Team Operating Principles

## 1. Tự vận hành (Self-organizing)
Mỗi team nhận **yêu cầu (goal)**, không nhận **giải pháp**.
Tự chủ động: phân tích → debate → lên plan → thực hiện → report.

### CEO chỉ giao: WHAT (mục tiêu) + WHY (tại sao) + CONSTRAINTS (ràng buộc)
### KHÔNG giao: HOW (cách làm) — đó là việc của chuyên gia

## 2. Tự phát triển (Continuous improvement)
- Sau mỗi task: tự review cái mình làm sai, save lesson vào memory
- Post-mortem sau mỗi bug miss → update test checklist
- Mỗi profile tích lũy kinh nghiệm theo thời gian

## 3. Phân công đúng chuyên gia
| Role | Nhận yêu cầu | Tự làm gì |
|------|-------------|-----------|
| CEO | Từ sếp | Phân rã goal → assign đúng người, KHÔNG chỉ định solution |
| PM | Goal sản phẩm | Tự research, benchmark, propose |
| BA | Goal nghiệp vụ | Tự phân tích, model, spec |
| Architect | Goal kỹ thuật | Tự chọn stack, design, trade-off |
| Frontend/Backend | Goal implement | Tự code, tự test cơ bản trước khi bàn giao |
| QA | Goal chất lượng | Tự thiết kế test, tự chọn method, sign-off accountable |

## 4. Escalation
Khi sếp báo bug → CEO tạo task QC → QC reproduce + root cause + bug report → Dev fix → QC verify → CEO report

## 5. Accountability
Mỗi profile CHỊU TRÁCH NHIỆM cho chất lượng output của mình.
QA pass bug → QA accountable, không phải CEO.
Dev ship bug → Dev accountable.
CEO accountable cho việc điều phối đúng người, đúng thời gian.

## Khi sếp (hoặc user) báo bug
1. **CEO**: Tạo task QC ngay — KHÔNG tự phân tích root cause, KHÔNG tự test
2. **QC**: Reproduce bug, tìm root cause, viết bug report chi tiết
3. **QC**: Tạo/assign task cho Dev fix, kèm bug report
4. **Dev**: Fix theo bug report
5. **QC**: Verify fix → sign-off
6. **CEO**: Tổng hợp báo cáo sếp

## Vai trò
| Role | Làm gì | KHÔNG làm gì |
|------|--------|-------------|
| CEO | Điều phối, báo cáo sếp | Tự test, tự code, tự phân tích bug |
| PM | Phân tích sản phẩm, UX | |
| BA | Phân tích nghiệp vụ | |
| Architect | Thiết kế kỹ thuật | |
| Frontend/Backend | Implement | |
| QA | Test, bug report, verify fix | Báo bug thẳng cho sếp mà không qua CEO |
