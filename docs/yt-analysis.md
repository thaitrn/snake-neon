# YouTube Faceless Video Automation Tool — Phân tích yêu cầu & Kiến trúc đề xuất

> **Product Analysis Document**
> Version: 0.1 (Draft) | Owner: PM | Date: 2026-08-12
> Status: Chờ CEO review
> Related: Task t_ba44957e

---

## 1. Tóm tắt sản phẩm (Executive Summary)

**YouTube Faceless Video Automation Tool** là pipeline CLI (Python + Node.js) giúp tự động hoá
sản xuất video YouTube dạng "faceless" — không cần quay phim người thật. Từ một kịch bản
(script), tool sinh ra:

- **Nhân vật AI đồng nhất** xuyên suốt video (character consistency)
- **Giọng đọc TTS** khớp chính xác với subtitle (lip sync + timeline mapping)
- **Draft CapCut** có sẵn clip, subtitle, transitions/motions — mở lên chỉ cần tinh chỉnh rồi export

Mục tiêu: **giảm thời gian sản xuất 1 video faceless từ ~8 giờ xuống < 30 phút**, giữ chất lượng
đủ để upload YouTube mà không cần edit thủ công nhiều.

**User chính:** Sếp (content creator solo), chạy trên máy local (macOS), không cần server.

---

## 2. Phân tích yêu cầu

### 2.1. Yêu cầu nguồn (từ CEO)

| # | Yêu cầu | Mô tả | Độ khó |
|---|---------|-------|--------|
| R1 | Character consistency | Nhân vật AI đồng nhất qua mọi scene/shot | 🔴 Cao |
| R2 | Lip sync | Ghép thoại với giọng đọc khớp chính xác — Python mapping scriptline ↔ subtitle | 🔴 Cao |
| R3 | CapCut export | Nhập draft vào CapCut, thêm motions có sẵn (Node.js sửa draft) | 🟡 Trung bình |
| R4 | Automation E2E | Pipeline chạy end-to-end, 1 lệnh ra video | 🟡 Trung bình |

### 2.2. Phân loại MoSCoW

**Must (MVP)**
- Nhập script (markdown/txt) → chia scene + line
- TTS sinh voice + timeline (timestamp mỗi line)
- Sinh ảnh nhân vật đồng nhất (character reference → per-scene images)
- Lip sync (image + audio → talking-head video clip)
- Ghép clip + subtitle thành timeline
- Xuất CapCut draft (JSON) với clip + subtitle aligned

**Should (v0.2)**
- Auto-cut / scene transition suggestions
- Background music bed + ducking tự động
- Multi-character (2+ nhân vật thoại)
- B-roll / overlay images per scene

**Could (v0.3+)**
- GPU-less mode (cloud API thay local model)
- Web UI dashboard thay CLI
- Batch render (nhiều script cùng lúc)
- Auto-upload YouTube

**Won't (this scope)**
- Real human footage replacement
- Multi-language auto-dub (riêng project khác)
- Live streaming

---

## 3. User Stories & Acceptance Criteria

### US-1: Sinh video từ script
**As** content creator,
**I want** chạy 1 lệnh với file script đầu vào,
**So that** tôi có draft CapCut sẵn sàng chỉnh sửa.

Acceptance:
- [ ] Lệnh `faceless build script.md --out ./output/` chạy thành công
- [ ] Output có: `voice.mp3`, `clips/*.mp4`, `subtitle.srt`, `project.draft.json`
- [ ] Mở `project.draft.json` trong CapCut → thấy timeline đầy đủ clip + subtitle
- [ ] Tổng runtime < 30 phút cho video 5 phút (trên máy có GPU)

### US-2: Character consistency
**As** creator,
**I want** nhân vật xuất hiện đồng nhất qua mọi scene,
**So that** người xem nhận ra "host" duy nhất.

Acceptance:
- [ ] Có 1 character reference image (lock-face) đầu vào
- [ ] Mọi scene image sinh ra có cùng gương mặt/phong cách nhân vật (IP-Adapter hoặc LoRA)
- [ ] Nếu thay reference image → toàn bộ video đổi nhân vật nhất quán
- [ ] Có flag `--consistency strict|balanced|off`

### US-3: Lip sync khớp subtitle
**As** creator,
**I want** miệng nhân vật khớp với giọng đọc và subtitle đi đúng timing,
**So that** không bị lệch hình–âm–chữ.

Acceptance:
- [ ] Mỗi scriptline → 1 TTS audio segment + 1 SRT entry cùng start/end time
- [ ] Lip sync model chạy per-segment, ghép seamless
- [ ] Lệch max giữa subtitle và audio < 100ms
- [ ] Silent gap giữa các line được detect và trim tự động

### US-4: CapCut draft với motions
**As** creator,
**I want** mở CapCut thấy draft có clip + motions sẵn,
**So that** chỉ cần review + export.

Acceptance:
- [ ] Node.js script sinh `draft_content.json` đúng schema CapCut (desktop)
- [ ] Mỗi clip có segment, transform, animation entry
- [ ] Subtitle import thành text track với đúng timing
- [ ] Motion template (zoom-in, fade, shake) apply được per-clip từ config

---

## 4. Pipeline tổng thể (Input → Output)

```
                        ┌─────────────────────────────────────────────────────────┐
                        │                   FACELESS PIPELINE                      │
                        └─────────────────────────────────────────────────────────┘

  ┌──────────┐
  │ script.md│  (input: markdown/txt, có cấu trúc scene/line)
  └────┬─────┘
       │
       ▼
  ┌─────────────────┐    Python
  │ 1. Script Parser │  ─ chia scene, line, metadata (speaker, emotion, b-roll hint)
  │  (python)        │
  └────┬─────────────┘
       │
       ├──► ┌────────────────────┐
       │    │ 2a. TTS Engine      │  ─ per-line → audio segment + timestamp
       │    │    (python)         │  ─ voice cloning (ElevenLabs / XTTS)
       │    └────┬────────────────┘
       │         │
       │         ▼
       │    ┌────────────────────┐
       │    │ 2b. Subtitle Gen    │  ─ merge timestamps → SRT/ASS
       │    │    (python)         │
       │    └────┬────────────────┘
       │         │
       └──► ┌────────────────────────────┐
            │ 3. Character Image Gen      │  ─ per-scene image, consistent character
            │    (python — ComfyUI API)  │  ─ IP-Adapter + locked seed + ref image
            └────┬────────────────────────┘
                 │
                 ▼
            ┌────────────────────────────┐
            │ 4. Lip Sync                │  ─ image + audio → talking-head video
            │    (python — SadTalker/    │  ─ per scene-line pair
            │     Wav2Lip)               │
            └────┬────────────────────────┘
                 │
                 ▼
            ┌────────────────────────────┐
            │ 5. Timeline Assembler      │  ─ concat clips + align subtitle
            │    (python)                │  ─ output master timeline JSON
            └────┬────────────────────────┘
                 │
                 ▼
            ┌────────────────────────────┐
            │ 6. CapCut Draft Builder    │  ─ Node.js: timeline JSON → draft_content.json
            │    (node.js)               │  ─ add motions, transitions, text track
            └────┬────────────────────────┘
                 │
                 ▼
        ┌────────────────────────────────────┐
        │  OUTPUT                             │
        │  ├── voice.mp3                      │
        │  ├── clips/*.mp4 (per-scene)        │
        │  ├── subtitle.srt                   │
        │  ├── timeline.json (intermediate)   │
        │  └── project.draft.json (CapCut)    │
        └────────────────────────────────────┘
                 │
                 ▼
        Creator mở CapCut → review → export → YouTube
```

**Lưu ý pipeline:**
- Bước 1–5 là Python, chạy tuần tự (mỗi bước đọc output bước trước)
- Bước 6 là Node.js, nhận `timeline.json` làm input
- Có thể cache từng bước (re-run chỉ bước thay đổi) — quan trọng vì render lâu

---

## 5. Data Model

### 5.1. Tổng quan entity

```
Script ──1:N──► Scene ──1:N──► Line
                                │
                ┌───────────────┼───────────────┐
                │               │               │
            Voice          ImageAsset       LipClip
           (audio)          (png/jpg)        (mp4)
                │               │               │
                └───────► SubtitleEntry ◄───────┘
                              │
                        Timeline (master)
                              │
                        CapCutDraft
```

### 5.2. Schema chi tiết

**Script** (root)
```json
{
  "id": "vid_2026_001",
  "title": "5 bí quyết đầu tư chứng khoán",
  "source_file": "script.md",
  "character_ref": "assets/characters/host_a.png",
  "voice_id": "eleven_multilingual_v2_xxxx",
  "language": "vi",
  "created_at": "2026-08-12T10:00:00+07:00"
}
```

**Scene**
```json
{
  "id": "scene_01",
  "index": 1,
  "setting": "studio_grey_bg",
  "emotion": "neutral",
  "broll_hint": "chart_upward",
  "lines": ["line_01", "line_02"]
}
```

**Line** (unit nhỏ nhất — map 1:1 với TTS segment + SRT entry + lip clip)
```json
{
  "id": "line_01",
  "scene_id": "scene_01",
  "index": 1,
  "speaker": "host",
  "text": "Chào bạn, hôm nay mình sẽ chia sẻ 5 bí quyết...",
  "emotion": "cheerful",
  "tts": {
    "audio_path": "output/audio/line_01.mp3",
    "duration_sec": 4.32,
    "start_ms": 0,
    "end_ms": 4320
  },
  "image": {
    "path": "output/images/scene_01_line_01.png",
    "seed": 42891,
    "prompt": "host_a, studio grey bg, cheerful, looking at camera"
  },
  "lip_clip": {
    "path": "output/clips/line_01.mp4",
    "model": "sadtalker_v0.0.1",
    "fps": 25,
    "duration_sec": 4.32
  }
}
```

**SubtitleEntry** (SRT row)
```json
{
  "index": 1,
  "line_id": "line_01",
  "start_ms": 0,
  "end_ms": 4320,
  "text": "Chào bạn, hôm nay mình sẽ chia sẻ 5 bí quyết..."
}
```

**Timeline** (master — input cho CapCut builder)
```json
{
  "video_id": "vid_2026_001",
  "total_duration_ms": 312000,
  "fps": 25,
  "resolution": "1920x1080",
  "tracks": [
    {
      "type": "video",
      "clips": [
        {
          "line_id": "line_01",
          "path": "output/clips/line_01.mp4",
          "start_ms": 0,
          "end_ms": 4320,
          "motion": "zoom_in_slow"
        }
      ]
    },
    {
      "type": "audio",
      "path": "output/voice.mp3"
    },
    {
      "type": "subtitle",
      "entries": [ /* SubtitleEntry[] */ ]
    }
  ]
}
```

**CapCutDraft** (output Node.js — tham chiếu schema CapCut `draft_content.json`)
- Wraps timeline thành `materials`, `tracks`, `segments` theo CapCut schema
- Tham chiếu: field `materials.videos[]`, `materials.audios[]`, `materials.texts[]`,
  `tracks[]` với `segments[]` chứa `target_timerange`, `source_timerange`, `clip.transform`

### 5.3. Mapping scriptline ↔ subtitle ↔ clip

Đây là **trái tim** của R2 (lip sync). Mối quan hệ:

```
1 Line  =  1 TTS segment  =  1 SRT entry  =  1 Lip clip  =  1 CapCut segment
```

Timestamp duy nhất nguồn sự thật là **TTS output** (vì audio là anchor). Mọi entity khác
(subtitle, clip, timeline) đều đọc start_ms/end_ms từ TTS. Nhờ vậy:
- Subtitle KHÔNG bao giờ lệch audio (cùng timestamp source)
- Lip clip duration khớp audio duration
- CapCut segment placement khớp timeline

---

## 6. Tech Stack đề xuất (per component)

| Component | Ngôn ngữ | Tool/Library | Lý do |
|-----------|----------|--------------|-------|
| **CLI / Orchestrator** | Python | `typer` + `rich` | CLI gọn, logging đẹp, dễ debug từng bước |
| **Script Parser** | Python | `markdown-it-py` + custom | Parse markdown có frontmatter, chia scene theo heading |
| **TTS Engine** | Python | **ElevenLabs API** (primary) hoặc **Coqui XTTS v2** (open-source fallback) | ElevenLabs: chất lượng nhất, voice cloning 1-shot. XTTS: chạy local, free, chất lượng khá |
| **Subtitle Gen** | Python | `pysrt` hoặc custom SRT writer | Đơn giản, format chuẩn SRT |
| **Character Image Gen** | Python | **ComfyUI** (qua API) + **IP-Adapter FaceID** + locked seed | IP-Adapter cho consistency 1-shot; ComfyUI reproducible workflow; LoRA optional cho character cụ thể |
| **Lip Sync** | Python | **SadTalker** (primary) hoặc **Wav2Lip** (fallback nhanh) | SadTalker: chất lượng cao, expression tự nhiên. Wav2Lip: nhanh, nhẹ hơn |
| **Timeline Assembler** | Python | `moviepy` (concat/inspect) hoặc `ffmpeg-python` | Ghép clip, verify duration, sinh master timeline.json |
| **CapCut Draft Builder** | **Node.js** | Custom + tham chiếu `capcut-draft` community schema | Sửa `draft_content.json` trực tiếp — không có lib chính thức, phải dùng schema community |
| **Cache / State** | Python | SQLite hoặc JSON manifest per video | Re-run incremental, tránh render lại bước đã xong |
| **Config** | YAML | `pydantic-settings` | Character profile, voice id, model path, output dir |

### 6.1. Runtime requirements
- **OS:** macOS (Apple Silicon ưu tiên — MPS cho PyTorch)
- **GPU:** Khuyến nghị GPU riêng (NVIDIA 8GB+ VRAM) cho SadTalker + ComfyUI. Trên Mac M-series dùng MPS, chậm hơn nhưng chạy được
- **Node.js:** v20 LTS
- **Python:** 3.11+
- **CapCut:** Desktop Pro (bản desktop mới nhất, lưu draft dạng JSON)

---

## 7. Technical Risks & Unknowns

### 🔴 Rủi ro cao

| # | Risk | Impact | Mitigation |
|---|------|--------|------------|
| RK1 | **Character consistency chưa hoàn hảo** — IP-Adapter vẫn bị drift gương mặt qua nhiều scene, đặc biệt góc nghiêng/expo khác | Nhân vật trông "hơi khác" mỗi scene → kém chuyên nghiệp | 1) Lock seed + prompt template nghiêm ngặt. 2) Train LoRA riêng cho character (cần 15–20 ảnh ref, tốn thời gian setup). 3) Đặt kỳ vọng: "consistency ở mức nhận diện được", không pixel-perfect |
| RK2 | **SadTalker/Wav2Lip chất lượng chưa reach commercial** (HeyGen/D-ID) — có artifact, miệng đôi khi lệch | Video trông "AI-generated" rõ | 1) Dùng SadTalker (tốt hơn Wav2Lip). 2) Crop chặt mặt, giảm artifacts. 3) Nếu sếp cần chất lượng top → budget cho HeyGen API ($0.5–1/min). 4) Đánh giá thực tế trước khi cam kết |
| RK3 | **CapCut draft schema không có docs chính thức** — ByteDance thay schema bất cứ lúc nào giữa các version | Draft builder break sau update CapCut | 1) Pin version CapCut. 2) Export 1 draft mẫu → reverse-engineer schema. 3) Tham khảo community repo (xem Unknowns). 4) Wrapper layer isolation — schema break chỉ fix 1 module |

### 🟡 Rủi ro trung bình

| # | Risk | Impact | Mitigation |
|---|------|--------|------------|
| RK4 | **Render time dài** — SadTalker + ComfyUI qua nhiều scene có thể 1–2h cho video 5 phút | Trải nghiệm chậm | 1) Cache từng line. 2) Parallel render per-line (nếu GPU đủ). 3) Progress bar + resume |
| RK5 | **ElevenLabs chi phí** — ~$0.3/1000 chars, video 5 phút ~3000 chars = ~$1/video | Chi phí chạy dài | 1) XTTS local cho draft/iterate, ElevenLabs cho final. 2) Cache audio |
| RK6 | **Vietnamese TTS quality** — một số engine đọc sai số/tên riêng | Giọng nghe "robot", sai tên | 1) Test cả ElevenLabs (multilingual v2) và XTTS với tiếng Việt. 2) Dictionary override cho thuật ngữ |
| RK7 | **Subtitle timing lệch khi TTS có pause dài** | Subtitle hiện quá sớm/trễ | 1) Trim silence trước khi tính timestamp. 2) FFmpeg silencedetect |

### ❓ Unknowns (cần CEO confirm hoặc R&D)

| # | Question | Cần ai |
|---|----------|--------|
| U1 | **CapCut draft schema** — chưa có lib chính thức. Có 2 hướng: (a) dùng community package `capcut-draft` trên npm, (b) tự reverse-engineer từ draft mẫu. Sếp có preference? | CEO + R&D |
| U2 | **Character style** — nhân vật kiểu gì? (anime, realistic 3D, illustration flat, AI avatar estilo HeyGen?) — quyết định model gen ảnh và lip sync approach | CEO |
| U3 | **GPU situation** — sếp có GPU NVIDIA riêng không, hay chạy trên Mac M-series? Quyết định model chọn (SadTalker NVIDIA-only friendly) | CEO |
| U4 | **Budget cho API** — ElevenLabs / HeyGen có cần trả phí không, hay prefer open-source 100%? | CEO |
| U5 | **Multi-language** — chỉ tiếng Việt, hay có plan mở rộng (Eng, Trung)? Ảnh hưởng voice cloning approach | CEO |
| U6 | **CapCut version** — sếp dùng CapCut Desktop Pro bản nào? Schema khác nhau giữa version. Cần export 1 draft mẫu để tôi phân tích schema chính xác | CEO |

---

## 8. MVP Definition & Roadmap

### Phase 0 — Spike / Proof of concept (1–2 tuần)
**Goal:** Chứng minh 3 khối khó nhất chạy được trên máy sếp.

- [ ] **S0.1:** Cài ComfyUI + IP-Adapter, generate 5 ảnh cùng character → đánh giá consistency
- [ ] **S0.2:** Chạy SadTalker với 1 ảnh + 1 audio → đánh giá chất lượng lip sync
- [ ] **S0.3:** Export 1 draft CapCut mẫu → đọc `draft_content.json` → reverse schema
- [ ] **S0.4:** Chạy ElevenLabs + XTTS với text tiếng Việt → so sánh chất lượng

**Gate:** Nếu S0.1–S0.2 đạt "dùng được" → tiếp tục Phase 1. Nếu không → revisit approach
(cân nhắc HeyGen API commercial).

### Phase 1 — MVP vertical slice (2–3 tuần)
**Goal:** 1 script ngắn (3 scene, ~1 phút) chạy E2E ra CapCut draft.

- [ ] CLI: `faceless build`
- [ ] Script parser (scene/line)
- [ ] TTS (1 engine, chọn sau spike)
- [ ] Image gen (1 character, 3 scene)
- [ ] Lip sync (1 model)
- [ ] Timeline assembler
- [ ] CapCut draft builder (video + subtitle, chưa motion)

### Phase 2 — Character + Motions (2 tuần)
- [ ] Character profile system (nhiều character, swap dễ)
- [ ] Consistency tuning (seed lock, prompt template)
- [ ] CapCut motions (zoom, fade, shake) per-clip
- [ ] Subtitle styling (font, position)

### Phase 3 — Polish + Scale (2 tuần)
- [ ] Cache/incremental render
- [ ] Background music + ducking
- [ ] B-roll overlay per scene
- [ ] Multi-character dialogue
- [ ] Batch mode

---

## 9. Câu hỏi mở cho CEO (cần quyết định trước Phase 0)

1. **U2 — Character style:** Nhân vật realistic, anime, hay illustration flat? (quyết định model)
2. **U3 — Hardware:** Có GPU NVIDIA không? Hay Mac M-series?
3. **U4 — Budget:** OK trả phí ElevenLabs/HeyGen, hay open-source only?
4. **U6 — CapCut version:** Đang dùng bản nào? Có thể export 1 draft mẫu cho tôi không?
5. **Video length target:** 1–2 phút (shorts) hay 5–10 phút (long-form)? (ảnh hưởng render cost)
6. **Output cadence:** Bao nhiêu video/tuần? (quyết định cần batch hay không)

---

## 10. Kết luận

Pipeline kỹ thuật khả thi với stack Python (TTS + image gen + lip sync) + Node.js (CapCut draft).
Ba rủi ro lớn nhất là **character consistency**, **lip sync quality**, và **CapCut schema instability**.

Khuyến nghị: **chạy Phase 0 spike ngay** để validate 3 khối khó trước khi commit Phase 1.
Đặc biệt phải thử thật trên máy sếp — kết quả trên paper và kết quả thực tế lip sync/consistency
thường khác nhiều. Đừng build toàn bộ pipeline rồi mới phát hiện khối khó nhất không reach.

---

> **Next action (PM):** Chờ CEO trả lời 6 câu hỏi mở → tạo task spike cho Architect/Dev để
> validate S0.1–S0.4. Sau spike, update doc này thành v0.2 với tech stack final.
