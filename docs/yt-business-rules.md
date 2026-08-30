> **Tài liệu:** Business Analysis — YouTube Faceless Video Automation Tool
> **Phiên bản:** 1.0 | **Ngày:** 2026-08-12
> **Người viết:** BA | **Trạng thái:** Ready for Dev
> **Phạm vi:** Phân tích workflow, data model, business rules cho pipeline tự động sản xuất video YouTube dạng faceless (narration + nhân vật ảo + subtitle + export CapCut).

---

## MỤC LỤC

1. [Tổng quan nghiệp vụ](#1-tổng-quan-nghiệp-vụ)
2. [Workflow pipeline — Use Case + Activity](#2-workflow-pipeline)
3. [Data model — Entity & Relationship](#3-data-model)
4. [CapCut Draft Format Analysis](#4-capcut-draft-format-analysis)
5. [Business Rules (BR-VT-xx)](#5-business-rules)
6. [Business Rule Detail — Character Consistency](#6-character-consistency)
7. [Business Rule Detail — Lip Sync Accuracy](#7-lip-sync-accuracy)
8. [Edge Cases & Open Questions](#8-edge-cases--open-questions)
9. [Glossary](#9-glossary)
10. [Traceability Matrix](#10-traceability-matrix)

---

## 1. Tổng quan nghiệp vụ

**Bài toán nghiệp vụ:** Tự động hóa quy trình sản xuất video YouTube dạng "faceless" — nơi người tạo nội dung không cần quay phim, chỉ cần viết script (hoặc prompt text) và hệ thống tự sinh ra video hoàn chỉnh: giọng đọc (TTS), hình ảnh nhân vật nhất quán trên mọi scene, subtitle đồng bộ, xuất ra file CapCut để chỉnh sửa cuối.

**Nguồn gốc yêu cầu:** Task t_fd23c564 — "BA tự phân tích, tự quyết model" (không có PRD riêng cho tool này). BA mô hình hóa dựa trên nghiệp vụ sản xuất video thực tế + pipeline công cụ AI phổ biến (TTS, image gen, lip sync, CapCut).

**Stakeholder & actor:**

| Actor | Vai trò |
|---|---|
| **Creator** (người tạo nội dung) | Viết script, duyệt scene, chọn voice/character style, nhận video xuất. |
| **Pipeline Orchestrator** (hệ thống) | Điều phối 6 stage, quản lý timeline, retry, artifact storage. |
| **TTS Service** (ngoài) | Sinh audio từ script line (ElevenLabs, Azure, etc.). |
| **Image Gen Service** (ngoài) | Sinh frame nhân vật theo style reference. |
| **Lip Sync Service** (ngoài) | Đồng bộ miệng nhân vật với audio. |
| **CapCut Export Module** | Lắp timeline thành draft CapCut. |
| **QA/Reviewer** (tùy chọn) | Kiểm character consistency, lip sync trước xuất. |

**Giới hạn scope (Out of scope):**
- Thumbnail generation, SEO, upload YouTube (pipeline khác).
- Video editor full-featured (chỉ xuất draft CapCut, không tự edit).
- Real-time rendering (pipeline batch, không live).

---

## 2. Workflow pipeline

### 2.1 Use Case tổng quan

```
┌─────────────────────────────────────────────────────────┐
│                  Creator                                 │
│   1. Submit Script                                       │
│         │                                                │
│         ▼                                                │
│  ┌──────────────────┐   2. Scene Breakdown              │
│  │ Pipeline         │──────► Segmented scenes/lines     │
│  │ Orchestrator     │                                      │
│  │                  │   3. TTS (per line)                │
│  │                  │──────► Audio clips + timestamps     │
│  │                  │                                      │
│  │                  │   4. Character Frame Gen            │
│  │                  │──────► Images per scene (style-locked)│
│  │                  │                                      │
│  │                  │   5. Lip Sync                       │
│  │                  │──────► Animated frames/video clips   │
│  │                  │                                      │
│  │                  │   6. CapCut Export                   │
│  │                  │──────► .draft_content file            │
│  └──────────────────┘                                      │
│         │                                                │
│         ▼                                                │
│   7. Return CapCut Draft + Artifacts                     │
└─────────────────────────────────────────────────────────┘
```

### 2.2 Activity Diagram — happy path

```
[Creator submits Script]
        │
        ▼
(Validate Script structure)  ──fail──► [Reject: error report]
        │ pass
        ▼
(Segment Script into Scenes/Lines)  ── BR-VT-01, BR-VT-02
        │
        ▼
┌─────────── for each Scene ───────────┐
│  (Generate TTS audio for line)        │ BR-VT-10..13
│        │                              │
│        ▼                              │
│  (Generate Character frame)           │ BR-VT-20..24
│        │                              │
│        ▼                              │
│  (Lip Sync frame ↔ audio)             │ BR-VT-30..33
│        │                              │
│        ▼                              │
│  (Append to Timeline)                 │ BR-VT-40..43
└───────────────────────────────────────┘
        │
        ▼
(Assemble CapCut Draft)  ── BR-VT-50..54
        │
        ▼
(Compute total duration)  ── BR-VT-44
        │
        ▼
[Return draft + artifacts]
```

### 2.3 State Machine — Video Project

```
        ┌──────────┐
        │  DRAFT   │◄──── Creator tạo, nhập script
        └────┬─────┘
             │ submit
             ▼
        ┌──────────┐
        │ SCENE_BREAKDOWN │
        └────┬─────┘
             │
             ▼
        ┌──────────┐
        │   TTS    │◄──── fail ──► (retry up to N) ──► ERROR_TTS
        └────┬─────┘                              │
             │ pass                                ▼
             ▼                                [BLOCKED: needs input]
        ┌──────────┐
        │ CHAR_GEN │◄──── fail ──► ERROR_CHAR
        └────┬─────┘
             │
             ▼
        ┌──────────┐
        │ LIP_SYNC │◄──── fail ──► ERROR_LIPSYNC
        └────┬─────┘
             │
             ▼
        ┌──────────┐
        │ EXPORT   │
        └────┬─────┘
             │
             ▼
        ┌──────────┐
        │  DONE    │
        └──────────┘
```

**State transition rules:**
- Chỉ có thể forward (DRAFT → DONE); không revert.
- ERROR_* → BLOCKED (cho retry manual) hoặc trở lại state trước (auto-retry).
- DONE là terminal, không thể edit — muốn sửa thì clone project mới.

---

## 3. Data model

### 3.1 Entity Relationship Diagram

```
┌─────────────┐        ┌─────────────────┐        ┌─────────────┐
│  VideoProject│ 1───*│     Scene        │ 1───1 │   Line       │
│─────────────│        │─────────────────│        │─────────────│
│ id (PK)     │───────►│ id (PK)         │───────►│ id (PK)     │
│ title       │        │ project_id (FK) │        │ scene_id(FK)│
│ status      │        │ index           │        │ index       │
│ created_at  │        │ bg_description  │        │ text        │
│ script_raw  │        │ speaker_id (FK) │        │ duration_ms │
└──────┬──────┘        └────────┬────────┘        └──────┬──────┘
       │                        │                        │
       │ 1                      │ *                      │ 1
       │                        │                        │
       ▼                        ▼                        ▼
┌─────────────┐        ┌─────────────────┐        ┌─────────────┐
│  Character  │ *───* │   VoiceProfile   │        │  AudioClip   │
│─────────────│        │─────────────────│        │─────────────│
│ id (PK)     │        │ id (PK)         │        │ id (PK)     │
│ name        │        │ name            │        │ line_id (FK)│
│ style_ref   │        │ provider        │        │ url/path    │
│ seed        │        │ voice_id        │        │ duration_ms │
│ prompt_tpl  │        │ language        │        │ sample_rate │
└─────────────┘        │ speed           │        └─────────────┘
                       │ emotion         │
                       └─────────────────┘
                                │
                                ▼
                       ┌─────────────────┐
                       │  VisualAsset     │
                       │─────────────────│
                       │ id (PK)         │
                       │ scene_id (FK)   │
                       │ character_id(FK)│
                       │ type: image/video│
                       │ url/path        │
                       │ width, height   │
                       └─────────────────┘
                                │
                                ▼
                       ┌─────────────────┐
                       │  TimelineEntry   │
                       │─────────────────│
                       │ id (PK)         │
                       │ project_id (FK) │
                       │ scene_index     │
                       │ start_ms, end_ms│
                       │ audio_id (FK)   │
                       │ visual_id (FK)  │
                       │ subtitle_text   │
                       └─────────────────┘
                                │
                                ▼
                       ┌─────────────────┐
                       │  CapCutDraft     │
                       │─────────────────│
                       │ id (PK)         │
                       │ project_id (FK) │
                       │ draft_content(JSON)│
                       │ version         │
                       └─────────────────┘
```

### 3.2 Entity chi tiết

#### VideoProject
Root entity. Một project = một video.

| Field | Type | Ràng buộc | Ghi chú |
|---|---|---|---|
| id | string (UUID) | PK, required | |
| title | string | required, 1–100 char | |
| status | enum | DRAFT \| SCENE_BREAKDOWN \| TTS \| CHAR_GEN \| LIP_SYNC \| EXPORT \| DONE \| ERROR_* | State machine §2.3 |
| script_raw | text | required | Input Creator |
| fps | integer | default 30 | BR-VT-44 |
| resolution | string | default "1920x1080" | |
| aspect_ratio | enum | 16:9 \| 9:16 \| 1:1 | Default 16:9 (YouTube) |
| created_at | datetime | required | |
| total_duration_ms | integer | nullable, set khi DONE | BR-VT-44 |

#### Scene
Đơn vị chia script. Một scene = một khung hình + một đoạn narration.

| Field | Type | Ràng buộc | Ghi chú |
|---|---|---|---|
| id | string | PK | |
| project_id | string | FK → VideoProject | |
| index | integer | required, >= 0, unique trong project | Thứ tự scene |
| bg_description | string | optional | Mô tả background cho image gen |
| speaker_id | string | FK → Character | Nhân vật xuất hiện/đọc |

#### Line
Đoạn text được đọc trong 1 scene. Một scene có đúng 1 line (1:1).

| Field | Type | Ràng buộc | Ghi chú |
|---|---|---|---|
| id | string | PK | |
| scene_id | string | FK → Scene | |
| index | integer | required | |
| text | string | required, non-empty | Script text |
| duration_ms | integer | nullable, set sau TTS | Bằng audio duration |

#### Character
Nhân vật ảo. **Core of consistency problem** (xem §6).

| Field | Type | Ràng buộc | Ghi chú |
|---|---|---|---|
| id | string | PK | |
| name | string | required | "Host", "Guest", etc. |
| style_ref | string | required | Reference image URL hoặc prompt template |
| seed | integer | nullable | Seed cố định cho reproducibility |
| prompt_template | string | required | Template có placeholder cho scene context |
| negative_prompt | string | optional | "blurry, extra fingers, deformed" |

#### VoiceProfile
Cấu hình TTS. Mỗi character có thể map 1 voice.

| Field | Type | Ràng buộc | Ghi chú |
|---|---|---|---|
| id | string | PK | |
| name | string | required | |
| provider | enum | elevenlabs \| azure \| google \| openai | |
| voice_id | string | required | Provider-specific ID |
| language | string | required, BCP-47 | "vi-VN", "en-US" |
| speed | float | 0.5–2.0, default 1.0 | |
| emotion | string | optional | Provider-dependent |

#### AudioClip
Output của TTS cho 1 line.

| Field | Type | Ràng buộc | Ghi chú |
|---|---|---|---|
| id | string | PK | |
| line_id | string | FK → Line | |
| url / path | string | required | Storage path |
| duration_ms | integer | required, > 0 | |
| sample_rate | integer | default 44100 | |

#### VisualAsset
Frame/video clip nhân vật cho 1 scene.

| Field | Type | Ràng buộc | Ghi chú |
|---|---|---|---|
| id | string | PK | |
| scene_id | string | FK → Scene | |
| character_id | string | FK → Character | |
| type | enum | image \| video | video sau lip sync |
| url / path | string | required | |
| width, height | integer | required | |

#### TimelineEntry
Mapping script line ↔ audio ↔ visual ↔ subtitle. Đây là "master timeline" mà CapCut export sẽ đọc.

| Field | Type | Ràng buộc | Ghi chú |
|---|---|---|---|
| id | string | PK | |
| project_id | string | FK | |
| scene_index | integer | required | |
| start_ms | integer | required, >= 0 | |
| end_ms | integer | required, > start_ms | |
| audio_id | string | FK → AudioClip | |
| visual_id | string | FK → VisualAsset | |
| subtitle_text | string | optional | Có thể != line.text (rút gọn) |

#### CapCutDraft
Output cuối. Xem §4 chi tiết.

| Field | Type | Ràng buộc | Ghi chú |
|---|---|---|---|
| id | string | PK | |
| project_id | string | FK | |
| draft_content | JSON (text) | required | Cấu trúc CapCut §4 |
| version | string | required | CapCut version compat |

---

## 4. CapCut Draft Format Analysis

### 4.1 Định dạng — JSON (text), KHÔNG binary

CapCut (desktop, Windows/Mac) lưu draft dưới dạng file `draft_content.json` trong thư mục project (`~/Movies/CapCut/<project>/draft_content.json` / `~/Movies/JianyingPro/...` trên Mac). Đây là **JSON thuần**, có thể read/write bằng code.

> **Caveat (BA-flag):** Format này **không có public official spec** từ ByteDance. Cấu trúc bên dưới được BA tổng hợp từ reverse-engineering cộng đồng (GitHub projects `capcut-draft`, `pycapcut`, tài liệu nội bộ). Version khác nhau có thể lệch field. **Open Question OQ-01** — cần Architect confirm version CapCut target.

### 4.2 Cấu trúc mức cao

```json
{
  "version": "1.0.0",
  "create_id": "<uuid>",
  "canvas_config": {
    "width": 1920,
    "height": 1080,
    "ratio": "original"
  },
  "duration": 5000000,
  "materials": {
    "videos":        [ /* VisualAsset (video type) */ ],
    "audios":        [ /* AudioClip */ ],
    "texts":         [ /* Subtitle entries */ ],
    "stickers":      [],
    "effects":       [],
    "filters":       [],
    "transitions":   [],
    "digital_humans":[]   /* CapCut native avatar — optional */
  },
  "tracks": [
    {
      "id": "<track-uuid>",
      "type": "video",        /* video | audio | text | sticker | effect */
      "flag": 0,
      "sort_order": 0,        /* layer z-order */
      "segments": [
        {
          "id": "<seg-uuid>",
          "material_id": "<ref to materials.videos[i].id>",
          "source_timerange": { "start": 0, "duration": 5000000 },
          "target_timerange": { "start": 0, "duration": 5000000 },
          "clip": { "transform": {...}, "scale": {...} }
        }
      ]
    }
  ],
  "fps": 30
}
```

**Key observations:**
- `materials` = pool tài nguyên (video, audio, text). Mỗi material có `id`.
- `tracks` = timeline layer. Mỗi track chứa `segments`, mỗi segment `reference` material qua `material_id`.
- Thời gian tính bằng **microsecond (μs)**, không phải ms. `duration: 5000000` = 5 giây.
- `source_timerange` = đoạn trong file nguồn được dùng. `target_timerange` = vị trí trên timeline.
- `sort_order` quyết định layer overlapping (cao hơn = trên).

### 4.3 Mapping data model → CapCut

| Data Model entity | CapCut material | CapCut track |
|---|---|---|
| VisualAsset (type=image) | `materials.videos` (image as 1-frame video) | video track |
| VisualAsset (type=video, post lip sync) | `materials.videos` | video track |
| AudioClip | `materials.audios` | audio track |
| Line.text → subtitle | `materials.texts` | text track |
| Character (digital human) | `materials.digital_humans` | video track |

### 4.4 Business rule liên quan CapCut (xem §5, BR-VT-50..54)

- Tất cả timerange tính bằng μs (×1000 từ ms).
- Segment duration phải khớp `source_timerange.duration` (không crop vô cớ).
- Track `sort_order`: video track = 0, text = 10, audio = 20 (convention).
- Mỗi segment phải có `material_id` valid — tham chiếu treo = draft hỏng.

---

## 5. Business Rules

> Quy ước ID: `BR-VT-xx` (VT = Video Tool). Mỗi rule có Source (Task body, BA-proposed) + testable.

### 5.1 Script & Scene segmentation

| ID | Rule | Source | Testable bằng |
|---|---|---|---|
| BR-VT-01 | Script đầu vào phải là text non-empty. Reject nếu empty hoặc chỉ whitespace. | Task §1 | Input "" → reject error "empty script" |
| BR-VT-02 | Script được segment theo dấu câu kết thúc câu (`. ! ?` + newline). Mỗi segment ≥ 1 line, ≤ 200 ký tự. Segment dài hơn → auto-split tại dấu phẩy/dấu cách gần nhất. | BA-proposed | Input 300-char no-punctuation → split thành ≥ 2 lines |
| BR-VT-03 | Scene index bắt đầu từ 0, tăng dần, không skip. | BA-proposed | After segmentation: indices = [0,1,2,...] contiguous |
| BR-VT-04 | Nếu script có markdown header (`# Scene`), tách scene theo header. Header không nằm trong line text. | BA-proposed | Script có "# Intro\n..." → scene 0 with no header text |

### 5.2 Character (xem chi tiết §6)

| ID | Rule | Source | Testable bằng |
|---|---|---|---|
| BR-VT-20 | Mỗi Character có style_ref (image URL hoặc prompt) bắt buộc. | Task §3 | Character without style_ref → validation error |
| BR-VT-21 | Mọi VisualAsset sinh ra cho cùng Character phải dùng cùng seed (nếu có) + cùng prompt_template + style_ref. | Task §3 (consistency) | Gen 2 frames char X → cosine similarity face embedding > 0.85 |
| BR-VT-22 | Nếu image gen không support seed → dùng style reference image làm điều kiện (img2img) thay vì text-only. | BA-proposed | Provider without seed → style_ref image passed as input |
| BR-VT-23 | Character negative_prompt mặc định: "blurry, deformed, extra fingers, watermark, text". | BA-proposed | Default prompt present in request |
| BR-VT-24 | Một scene có tối đa 2 character hiển thị đồng thời (tránh clutter). Nhiều hơn → BA-flag open question. | BA-proposed | Scene with 3 chars → warning |

### 5.3 Voice / TTS

| ID | Rule | Source | Testable bằng |
|---|---|---|---|
| BR-VT-10 | Mỗi Character map tối đa 1 VoiceProfile. Đổi voice = đổi character identity. | BA-proposed | 1:1 char↔voice |
| BR-VT-11 | TTS output audio phải có `duration_ms > 0`. Audio 0-length → retry, fail → ERROR_TTS. | BA-proposed | TTS returns empty → retry |
| BR-VT-12 | Line.duration_ms được set = AudioClip.duration_ms sau khi TTS xong (single source of truth). | BA-proposed | After TTS, Line.duration == AudioClip.duration |
| BR-VT-13 | TTS speed phải trong [0.5, 2.0]. Ngoài range → clamp + warn. | BA-proposed | speed=3.0 → clamp 2.0 + warning |

### 5.4 Lip Sync (xem chi tiết §7)

| ID | Rule | Source | Testable bằng |
|---|---|---|---|
| BR-VT-30 | Lip sync input: VisualAsset (image) + AudioClip. Output: VisualAsset type=video. | Task §1 | After lip sync, VisualAsset.type flips image→video |
| BR-VT-31 | Lip sync output duration phải == input audio duration (±50ms). | BR-VT-31 → §7 | Output video duration - audio duration < 50ms |
| BR-VT-32 | Nếu lip sync fail cho 1 scene → không block toàn project. Đánh dấu scene `lip_sync_skipped`, giữ image tĩnh. | BA-proposed | 1 fail → project continues, scene flagged |
| BR-VT-33 | Lip sync chỉ áp dụng cho character có mặt trong frame. Scene không có character (full background) → skip lip sync. | BA-proposed | No character → no lip sync call |

### 5.5 Timeline assembly

| ID | Rule | Source | Testable bằng |
|---|---|---|---|
| BR-VT-40 | TimelineEntry.start_ms của scene N = sum(duration_ms) của scene 0..N-1. Scenes nối tiếp nhau không có gap (trừ khi intentional pause). | BA-proposed | Timeline contiguous: start[N] = end[N-1] |
| BR-VT-41 | Mỗi TimelineEntry phải có audio_id AND visual_id non-null. Missing → ERROR. | BA-proposed | Entry without audio → reject |
| BR-VT-42 | subtitle_text mặc định = Line.text. Cho phép override (rút gọn cho hiển thị). | BA-proposed | subtitle override works |
| BR-VT-43 | Nếu VisualAsset là image (lip sync skipped), duration trên timeline = audio duration (giữ frame tĩnh). | BA-proposed | Image duration = audio duration |
| BR-VT-44 | Project.total_duration_ms = end_ms của TimelineEntry cuối cùng. Project chỉ DONE khi total_duration > 0. | BA-proposed | DONE project has duration > 0 |

### 5.6 CapCut Export

| ID | Rule | Source | Testable bằng |
|---|---|---|---|
| BR-VT-50 | CapCutDraft.draft_content là JSON hợp lệ, parse được bởi `json.loads`. | Task §3 | json.loads succeeds |
| BR-VT-51 | Tất cả timerange trong draft_content tính bằng microsecond (μs), = ms × 1000. Sai đơn vị → draft lệch thời gian. | §4 | start_ms * 1000 == draft timerange |
| BR-VT-52 | Mỗi segment trong `tracks[].segments` phải có `material_id` tham chiếu tới material tồn tại trong `materials`. Tham chiếu treo → draft hỏng khi mở. | §4 | All material_id resolve |
| BR-VT-53 | Track `sort_order`: video = 0, text/subtitle = 10, audio = 20. Đảm bảo subtitle hiện trên video. | §4 | sort_order values as spec |
| BR-VT-54 | canvas_config.width × height phải khớp Project.resolution. | §4 | Draft canvas == project resolution |

---

## 6. Character Consistency

Đây là **bài toán cốt lõi** của faceless video: nhân vật phải trông giống nhau trên mọi scene — nếu scene 1 nhân vật tóc đen áo đỏ, scene 5 không thể thành tóc vàng áo xanh.

### 6.1 Phương pháp đảm bảo (layered defense)

**Layer 1 — Seed locking (deterministic gen)**
- Character có `seed` cố định. Cùng seed + cùng prompt → output gần giống nhau.
- BR-VT-21 yêu cầu: mọi gen cho character X dùng cùng seed.
- Hạn chế: không phải provider nào cũng support seed (Midjourney có, Stable Diffusion có, DALL-E không).

**Layer 2 — Style reference image (img2img)**
- Khi seed không available hoặc không đủ, dùng **reference image** làm điều kiện đầu vào.
- Character.style_ref là URL/đường dẫn ảnh gốc. Mỗi gen mới lấy ảnh này làm conditioning.
- BR-VT-22 quy định: provider không có seed → dùng style_ref image.

**Layer 3 — Prompt template cố định**
- Character.prompt_template là template với placeholder cho biến scene (cảm xúc, tư thế, background).
- Phần "identity" (gender, age, hairstyle, clothing) **cố định trong template**, không bao giờ để AI tự do.

**Layer 4 — Post-gen consistency check (optional, QA gate)**
- Sinh xong tất cả frames → chạy face embedding (ArcFace, etc.) trên từng frame.
- Tính cosine similarity giữa frame đầu (reference) và mọi frame khác.
- BR-VT-21 threshold: similarity > 0.85 → PASS. < 0.85 → flag, regenerate hoặc warn.

### 6.2 Decision tree

```
Need character frame for scene N
        │
        ▼
Provider supports seed?
├── YES ──► Use fixed seed + prompt_template → gen frame
│
└── NO  ──► Has style_ref image?
            ├── YES ──► img2img with style_ref + prompt_template → gen frame
            └── NO  ──► ERROR: cannot guarantee consistency (BR-VT-20 violated)
```

### 6.3 Ví dụ prompt_template (reference cho Dev)

```
"[gender], [age_group], [ethnicity], [hair_style], [hair_color],
[clothing_description], [distinguishing_features].
{{scene_context}}.
Style: {{art_style}}, high detail, consistent lighting."
```

`{{scene_context}}` là phần thay đổi per scene (emotion, pose, background). Identity block (trước `{{scene_context}}`) **cố định**.

---

## 7. Lip Sync Accuracy

### 7.1 Định nghĩa bài toán

Lip sync = làm miệng nhân vật (trong frame tĩnh) cử động khớp với audio phát ra. Có 2 hướng triển khai:

**Hướng A — Frame-level mouth animation (per-frame)**
- Mỗi frame video (ở fps target) có 1 trạng thái miệng (viseme) được tính từ audio.
- Độ chính xác: **frame-level**. Tolerance: ±1 frame (≈33ms @ 30fps).
- Phù hợp: character có mặt rõ, chi tiết cao.

**Hướng B — Wav2Lip / SadTalker style (deep learning)**
- Model học end-to-end, sinh video từ image + audio.
- Độ chính xác: không frame-level perfect, nhưng tổng thể khớp phoneme.
- Tolerance: đánh giá bằng **LSE-D** (Lip Sync Error — Distance) và **LSE-C** (Confidence). Benchmark Wav2Lip: LSE-D < 10.

### 7.2 Business decision — BA đề xuất

| Trường hợp | Tolerance | Lý do |
|---|---|---|
| **Narration video** (faceless chính) | Wav2Lip/SadTalker, LSE-D < 10 | Khán giả nhìn character từ xa, không soi frame. Chấp nhận "khá khớp". |
| **Close-up talking head** | Frame-level, ±1 frame (33ms) | Khán giả nhìn miệng rõ, lệch sẽ thấy. |
| **Scene không có character nói** | Skip (BR-VT-33) | Không cần. |

**Rule tổng (BR-VT-31):** Output video duration phải == input audio duration ± 50ms. Đây là ràng buộc cứng — nếu video ngắn/dài hơn audio, timeline lệch, subtitle lệch, toàn bộ pipeline hỏng.

### 7.3 Validation

```
After lip sync:
  output_video_duration_ms = ?
  input_audio_duration_ms  = ?
  delta = abs(output - input)
  if delta > 50ms → ERROR, retry or skip scene (BR-VT-32)
  if delta <= 50ms → PASS
```

---

## 8. Edge Cases & Open Questions

### 8.1 Edge Cases

| EC-ID | Tình huống | Xử lý đề xuất |
|---|---|---|
| EC-01 | Script chỉ 1 câu ngắn ("Hello world.") | Pipeline vẫn chạy, 1 scene, duration ngắn. Cho phép. |
| EC-02 | Script 10000+ ký tự | Cảnh báo performance, nhưng không reject. Segmentation tạo nhiều scene. |
| EC-03 | TTS trả audio dài bất thường (10x text length) | Flag anomaly, có thể loop/garbage. Cảnh báo Creator. |
| EC-04 | Image gen trả ảnh không có mặt người | Lip sync không thể chạy. BR-VT-33: scene không có character face → skip lip sync, dùng ảnh tĩnh. |
| EC-05 | Lip sync service timeout | BR-VT-32: retry N lần, fail → skip scene (image tĩnh), không block project. |
| EC-06 | CapCut version mismatch (draft không mở được) | OQ-01: cần Architect fix target version. |
| EC-07 | 2 character nói cùng lúc trong 1 scene | TTS phức tạp (overlay audio). BA-flag: ngoài scope v1, chỉ support 1 speaker/scene. |
| EC-08 | Subtitle text dài quá khung hình | BR-VT-42: subtitle override, rút gọn hoặc wrap. Cần rule wrap (OQ-02). |
| EC-09 | Character đổi quần áo giữa scene (do style drift) | Layer 4 consistency check (§6.1) phát hiện, flag. |
| EC-10 | Audio TTS có khoảng lặng đầu/cuối (silence padding) | Trim silence hoặc keep? BA đề xuất **keep** (đơn giản), nhưng timeline phải tính duration đầy đủ. OQ-03. |

### 8.2 Open Questions (cần Architect / PM confirm)

| OQ-ID | Câu hỏi | Lý do cần | Ai quyết |
|---|---|---|---|
| OQ-01 | CapCut target version chính xác? (desktop Win/Mac, version nào?) | Format draft_content có thể lệch giữa version. | Architect |
| OQ-02 | Subtitle wrap rule: bao nhiêu ký tự/dòng? Font size? | Ảnh hưởng subtitle display. | PM/UX |
| OQ-03 | TTS silence padding: trim hay keep? | Ảnh hưởng timeline density. | PM |
| OQ-04 | Image gen provider cụ thể? (Midjourney / SD / DALL-E) → quyết định có seed không. | Ảnh hưởng consistency strategy (Layer 1 vs Layer 2). | Architect |
| OQ-05 | Lip sync provider cụ thể? (Wav2Lip / SadTalker / commercial API) | Quyết định tolerance metric. | Architect |
| OQ-06 | Có cần multi-speaker (dialogue giữa 2 character)? | v1 chỉ support 1 speaker/scene (EC-07). Scope. | PM |

---

## 9. Glossary

| Thuật ngữ | Định nghĩa |
|---|---|
| **Faceless video** | Video YouTube không hiện mặt người thật, dùng narration + visual (ảnh/video AI gen). |
| **Scene** | Đơn vị chia script, 1 scene = 1 khung hình + 1 đoạn narration. |
| **Line** | Đoạn text trong 1 scene, được TTS đọc. |
| **TTS** | Text-to-Speech, sinh giọng nói từ text. |
| **Lip sync** | Đồng bộ cử động miệng nhân vật với audio. |
| **Viseme** | Trạng thái miệng tương ứng 1 phoneme (âm vị). |
| **CapCut draft** | File JSON chứa timeline dự án CapCut, có thể mở bằng CapCut desktop. |
| **Seed** | Số nguyên đầu vào cho image gen, đảm bảo reproducibility. |
| **img2img** | Image gen có ảnh điều kiện đầu vào (không chỉ text prompt). |
| **LSE-D / LSE-C** | Metric đánh giá lip sync quality (SyncNet). |
| **Style drift** | Hiện tượng nhân vật biến dạng dần qua nhiều gen do AI không lock identity. |

---

## 10. Traceability Matrix

| Task yêu cầu | Section xử lý | Business Rule |
|---|---|---|
| Workflow: Script → Scene → TTS → Char gen → Lip sync → CapCut | §2 (Use Case + Activity + State) | BR-VT-01..54 |
| Data model: Script | §3.2 (VideoProject, Scene, Line) | BR-VT-01..04 |
| Data model: Character | §3.2 (Character), §6 | BR-VT-20..24 |
| Data model: Voice | §3.2 (VoiceProfile) | BR-VT-10..13 |
| Data model: Timeline | §3.2 (TimelineEntry) | BR-VT-40..44 |
| CapCut draft format | §4 | BR-VT-50..54 |
| Character consistency | §6 | BR-VT-21, BR-VT-22 |
| Lip sync accuracy / tolerance | §7 | BR-VT-30..33 |
| Deliverable file | `docs/yt-business-rules.md` (file này) | — |

---

> **Handoff note:** Tài liệu này là **spec nghiệp vụ** cho downstream. Architect nên đọc §3 (data model) + §4 (CapCut format) + §8.2 (open questions) trước khi thiết kế kiến trúc. QA nên lấy BR-VT-xx làm cơ sở test case. Các OQ-xx cần được resolve trước khi Dev bắt đầu implement.
