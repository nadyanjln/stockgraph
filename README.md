# StockGraph

StockGraph adalah aplikasi analisis saham BEI berbasis GraphRAG. Aplikasi ini mengumpulkan berita terkini, mengambil data laporan keuangan, membangun knowledge graph di FalkorDB melalui GraphRAG-SDK, lalu menjawab pertanyaan pengguna dengan bantuan multi-agent chatbot.

## Ringkasan Fitur

- Input kode saham seperti `BBCA`, `BBRI`, `TLKM`, atau beberapa kode sekaligus.
- Input pertanyaan natural language dalam Bahasa Indonesia.
- Crawl berita dari Google News dengan sumber terkurasi.
- Ambil data fundamental dan laporan keuangan emiten.
- Filter dan deduplikasi konten sebelum masuk ke graph.
- Bangun knowledge graph menggunakan GraphRAG-SDK dan FalkorDB.
- Chat dengan graph menggunakan multi-agent reasoning.
- Tiga agent: News Agent dan Financial Statement Agent memakai model mini, Manager Agent memakai GPT-4.1.
- Jawaban realtime/typing animation ditampilkan langsung di Streamlit tanpa LangChain/LangGraph.
- Pertanyaan lanjutan tetap memakai graph yang sudah dibuat.

## Prasyarat

Pastikan sudah tersedia:

- Python sesuai versi project.
- `uv` untuk menjalankan environment Python.
- Docker untuk menjalankan FalkorDB.
- API key OpenAI atau provider LLM lain yang didukung LiteLLM.

## Instalasi

Clone atau buka folder project, lalu jalankan:

```bash
uv sync
```

Jika dependency GraphRAG-SDK belum tersedia:

```bash
uv add "graphrag-sdk[litellm]"
```

Untuk membaca PDF laporan keuangan yang berbentuk scan/gambar, aplikasi memakai PaddleOCR sebagai OCR fallback. Jika belum terpasang:

```bash
uv add paddleocr
```

Jika PaddleOCR meminta runtime PaddlePaddle, install sesuai platform dari dokumentasi PaddleOCR/PaddlePaddle.

## Konfigurasi `.env`

Buat file `.env` di root project.

```env
OPENAI_API_KEY=your_openai_api_key_here
FALKORDB_HOST=localhost
FALKORDB_PORT=6379

NEWS_MODEL=gpt-4o-mini
FINANCIAL_MODEL=gpt-4o-mini
MANAGER_MODEL=gpt-4.1
PORT=8000

STOCKGRAPH_ENABLE_OCR=true
STOCKGRAPH_OCR_MAX_PAGES=12
STOCKGRAPH_OCR_DPI=180
STOCKGRAPH_OCR_TEXT_THRESHOLD=1200
```

## Menjalankan FalkorDB

Jalankan FalkorDB dengan Docker:

```bash
docker run -p 6379:6379 -p 3000:3000 --name falkordb falkordb/falkordb:latest
```

Jika container sudah pernah dibuat sebelumnya:

```bash
docker start falkordb
```

Dashboard FalkorDB dapat dibuka di:

```text
http://localhost:3000
```

## Menjalankan Aplikasi

Jalankan UI Streamlit:

```bash
uv run streamlit run app/services/ui/streamlit_app.py
```

Buka aplikasi di browser:

```text
http://localhost:8501
```

FastAPI hanya diperlukan jika ingin memakai endpoint API:

```bash
uv run uvicorn app.services.ui.server:app --reload --port 8000
```

## Cara Menggunakan Aplikasi

1. Buka halaman utama aplikasi.
2. Masukkan kode saham pada kolom pipeline, misalnya:

```text
BBCA,BBRI,BMRI
```

3. Masukkan pertanyaan atau topik berita yang ingin dianalisis, misalnya:

```text
Bagaimana dampak BI Rate terhadap kinerja bank besar?
```

4. Klik tombol `Build Graph`.
5. Tunggu sampai proses pipeline selesai. Proses ini akan:
   - mengambil data fundamental 3 tahun terakhir terlebih dahulu,
   - membuat keyword pencarian,
   - crawl berita,
   - mengekstrak informasi penting,
   - memfilter konten,
   - meng-ingest dokumen ke GraphRAG-SDK,
   - membuat graph per tahun fiskal.
6. Setelah graph selesai dibuat, gunakan kolom chat untuk bertanya.

Contoh pertanyaan:

```text
Bandingkan kinerja BBCA dan BBRI berdasarkan laba bersih dan sentimen berita.
```

```text
Apa risiko utama untuk saham perbankan jika suku bunga tetap tinggi?
```

```text
Bagaimana prospek TLKM berdasarkan berita dan laporan keuangan terbaru?
```

7. Untuk pertanyaan lanjutan, langsung lanjutkan chat di sesi yang sama. Aplikasi akan memakai history percakapan dan graph yang sudah tersimpan.

## Endpoint API

Health check:

```bash
curl http://localhost:8000/api/health
```

Daftar tahun graph:

```bash
curl http://localhost:8000/api/years
```

Validasi graph:

```bash
curl http://localhost:8000/api/validate/2024
```

Query langsung ke GraphRAG:

```bash
curl -X POST http://localhost:8000/api/query \
  -H "Content-Type: application/json" \
  -d "{\"question\":\"Bagaimana kinerja BBCA?\",\"year\":2024}"
```

Menjalankan pipeline ingestion:

```bash
curl -X POST http://localhost:8000/api/merger/pipeline \
  -H "Content-Type: application/json" \
  -d "{\"stock_codes\":[\"BBCA\",\"BBRI\"],\"question\":\"kinerja bank besar dan BI Rate\",\"max_articles\":4,\"threshold\":0.6,\"try_idx_pdf\":true}"
```

Chat utama tersedia di Streamlit. WebSocket FastAPI tetap ada untuk integrasi eksternal, tetapi bukan UI utama.

## Alur Sistem

```text
Kode saham + pertanyaan
  -> ambil financial statement 3 tahun terakhir
  -> keyword pencarian
  -> crawl berita
  -> ekstraksi informasi
  -> filter relevansi
  -> GraphRAG-SDK rag.ingest
  -> FalkorDB knowledge graph
  -> multi-agent chatbot tanpa LangChain
  -> jawaban + sitasi
```

## Catatan Penting

- Aplikasi menggunakan GraphRAG-SDK untuk ingestion dan query GraphRAG.
- Jalur GraphRAG tidak menggunakan raw Cypher untuk membangun atau mengambil konteks graph.
- Laporan keuangan PDF dibaca dengan native text extraction terlebih dahulu, lalu PaddleOCR otomatis aktif jika teks PDF terlalu sedikit atau dokumen berisi gambar/scan.
- Data berita bergantung pada hasil Google News dan ketersediaan sumber.
- PDF IDX tidak selalu tersedia untuk semua emiten/tahun, sehingga aplikasi dapat memakai fallback data fundamental terstruktur.
- Registry graph per tahun disimpan di `.stockgraph_registry.json`.

## Troubleshooting

Jika dependency belum lengkap:

```bash
uv sync
```

Jika FalkorDB tidak terhubung:

```bash
docker ps
docker start falkordb
```

Jika belum ada tahun graph di aplikasi, jalankan `Build Graph` terlebih dahulu.

Jika jawaban kurang lengkap, gunakan topik pipeline yang lebih spesifik atau naikkan jumlah artikel pada request API.

Jika OCR tidak berjalan, pastikan `paddleocr` dan runtime PaddlePaddle sudah terpasang. Aplikasi tetap berjalan tanpa OCR karena import PaddleOCR dilakukan secara lazy.

## Struktur Folder Penting

```text
app/services/ui/streamlit_app.py       Streamlit UI utama
app/services/ui/server.py              FastAPI API server opsional
app/routes/endpoint.py                 Endpoint umum aplikasi
app/routes/merger_routes.py            Endpoint pipeline ingestion
app/services/database/graph_builder.py Builder dokumen untuk GraphRAG-SDK
app/services/database/graphrag_engine.py Wrapper GraphRAG-SDK
app/core/agent/news_agent.py           News analyst agent
app/core/agent/financial_agent.py      Financial analyst agent
app/core/agent/manager_agent.py        Manager/router/synthesizer agent
app/core/agent/orchestrator.py         Runtime orchestration dan token streaming
app/core/agent/agents.py               Facade kompatibilitas import lama
```
