# Design Process SOP — CEO-approved workflow (v1, 2026-08-30)

> Áp dụng cho mọi game/project mới của AI Company. CEO duyệt quy trình này;
> các phòng ban cập nhật SOP riêng cho khớp, không mâu thuẫn.

## Nguyên tắc

1. **Artifact trước, code sau.** Không ai được code trước khi Design Artifact
   được CEO duyệt.
2. **Một nguồn sự thật trên GitHub.** PRD sống trong repo GitHub
   (thư mục `docs/`), mọi role **đóng góp vào cùng một PRD** bằng pull request
   / commit, không ai giữ bản riêng.
3. **Review chéo bắt buộc.** PM, BA/Architect, Designer, FE, BE đều comment
   trực tiếp trên PRD/design trong PR — quyết định còn tranh luận ghi vào
   Decision Log của PRD.
4. **CEO là gate duy nhất trước develop.** Sau approve, mới được tạo task
   FE/BE; QA tham gia từ khâu viết acceptance để test được định nghĩa trước
   khi code.

## Quy trình 6 bước

### Bước 1 — PM viết PRD draft (trên GitHub)
- PM tạo branch `docs/prd-<project>` hoặc làm trực tiếp `main` nếu repo mới.
- PRD phải có: target player, core fantasy, MoSCoW, MVP scope, acceptance
  criteria định lượng, FUN-GATE, out-of-scope.
- Đánh dấu các phần **cần contribution**: `[BA?]`, `[ARCH?]`, `[DESIGN?]`,
  `[FE?]`, `[BE?]`, `[QA?]`.

### Bước 2 — Design tạo Design Artifact và update vào PRD
- Designer (vai của PM trong bộ 4 profile hiện tại) tạo wireflow, game loop,
  control scheme mobile-first, và visual direction.
- **Không viết tài liệu rời.** Artifact được chèn trực tiếp vào section tương
  ứng của PRD (commit lên cùng branch `docs/prd-<project>`).

### Bước 3 — Đóng góp chéo từ các vai còn lại
- BA/Architect: data model, tech stack, API contract → update đúng section
  PRD, không tạo file trừ khi thật cần.
- FE/BE: review tính khả thi, ước lượng, rủi ro kỹ thuật → comment + commit
  sửa section `[FE?]`/`[BE?]`.
- QA: viết test plan + acceptance mapping vào PRD trước khi có code.

### Bước 4 — PM + Design ngồi hoàn thiện cùng nhau
- PM và Design review chung PRD, xử lý toàn bộ comment còn mở, cập nhật
  Decision Log (quyết định | lý do | người chịu trách nhiệm).
- Output: PRD `READY-FOR-REVIEW` — không còn `[?]` marker, không còn comment
  mở.

### Bước 5 — CEO approve (gate duy nhất)
- CEO đọc PRD trên GitHub (link PR), kết luận `PRD-APPROVED` hoặc
  `REQUEST-CHANGES` kèm lý do cụ thể.
- Không có `PRD-APPROVED` ⇒ không tạo kanban task FE/BE nào.

### Bước 6 — Flow develop như cũ
- CEO decompose kanban theo PRD đã duyệt; FE/BE build song song; QA độc lập
  theo acceptance đã ghi trong PRD; GameHub publish chỉ sau QA-PASS.

## Enforcement

- Kanban card FE/BE đầu tiên phải trích commit SHA của PRD đã duyệt.
-hermes-evidence và evidence gate tiếp tục áp dụng cho code như cũ.
- Vi phạm (code trước PRD-APPROVED) ⇒ task bị block và làm lại theo PRD.

## Áp dụng

- Các project đang chạy (game-fun-rebuild) tiếp tục theo flow cũ đến hết;
  từ PRD tiếp theo áp dụng SOP này.
- Mỗi role update SOP riêng của mình trong 7 ngày để khớp quy trình trên.
