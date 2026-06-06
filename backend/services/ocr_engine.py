"""
GPT-4o vision OCR engine for medical bill extraction.
Handles PDF (via pdf2image) and images (PNG/JPG/TIFF).
Returns rich structured JSON matching the frontend ReviewStep schema.
"""
from __future__ import annotations

import asyncio
import base64
import io
import json
import uuid
from pathlib import Path

from backend.config import settings

_UUID_NS = uuid.UUID("6ba7b810-9dad-11d1-80b4-00c04fd430c8")
_client = None


def _get_client():
    global _client
    if _client is None:
        from openai import AsyncOpenAI
        _client = AsyncOpenAI(api_key=settings.OPENAI_API_KEY)
    return _client


SYSTEM_PROMPT = """You are an expert document parser specialising in medical bills, pharmacy receipts, and expense invoices.
You will receive one or more page images. Extract ALL structured data and return ONLY valid JSON.

Schema:
{
  "document_type": "invoice|bill|receipt|ledger|statement|other",
  "invoice_number": "",
  "invoice_date": "",
  "due_date": "",
  "vendor":  { "name":"","address":"","gstin":"","pan":"","phone":"","email":"" },
  "buyer":   { "name":"","address":"","gstin":"","pan":"" },
  "line_items": [
    { "description":"","hsn_sac":"","quantity":null,"unit":"","rate":null,"amount":null }
  ],
  "taxes": {
    "taxable_amount":null,
    "cgst_rate":null,"cgst_amount":null,
    "sgst_rate":null,"sgst_amount":null,
    "igst_rate":null,"igst_amount":null,
    "cess_amount":null
  },
  "subtotal":null,"discount":null,"total_amount":null,
  "amount_in_words":"","payment_terms":"",
  "bank_details":{"bank_name":"","account_no":"","ifsc":"","branch":""},
  "notes":"","raw_fields":{}
}

Rules:
- Return ONLY the JSON object — no markdown, no prose.
- Numbers: plain float/int, no commas, no currency symbols.
- Dates: DD-MM-YYYY where possible.
- GSTIN: exactly 15 chars, copy verbatim.
- Merge data across all pages.
- Missing field → null (numbers) or "" (strings)."""


def _encode_page(img, max_short: int = 1024) -> str:
    """Resize so the short side ≤ max_short, then base64-encode as PNG."""
    w, h = img.size
    short = min(w, h)
    if short > max_short:
        scale = max_short / short
        img = img.resize((int(w * scale), int(h * scale)))
    buf = io.BytesIO()
    img.save(buf, format="PNG", optimize=True)
    return base64.b64encode(buf.getvalue()).decode()


async def _call_vision(b64_pages: list[str], filename: str) -> dict:
    """Single GPT-4o call with all page images."""
    content: list[dict] = [
        {"type": "text", "text": f"Document: {filename}. Extract all bill/invoice data."},
    ]
    for b64 in b64_pages:
        content.append({
            "type": "image_url",
            "image_url": {"url": f"data:image/png;base64,{b64}", "detail": "high"},
        })
    resp = await _get_client().chat.completions.create(
        model="gpt-4o",
        messages=[
            {"role": "system", "content": SYSTEM_PROMPT},
            {"role": "user", "content": content},
        ],
        temperature=0,
        response_format={"type": "json_object"},
        max_tokens=4096,
    )
    return json.loads(resp.choices[0].message.content)


def bill_upload_id(filename: str) -> str:
    """Deterministic UUID v5 for a filename — idempotent re-uploads."""
    return str(uuid.uuid5(_UUID_NS, filename))


async def process_pdf_async(pdf_bytes: bytes, filename: str, dpi: int = 200) -> dict:
    """PDF bytes → images (threadpool) → GPT-4o → structured JSON."""
    loop = asyncio.get_event_loop()
    try:
        from pdf2image import convert_from_bytes
        pages = await loop.run_in_executor(
            None,
            lambda: convert_from_bytes(pdf_bytes, dpi=dpi),
        )
        b64_pages = [_encode_page(pg) for pg in pages[:20]]
    except Exception:
        # pdf2image/poppler unavailable — extract text layer via pypdf
        try:
            import pypdf
            reader = pypdf.PdfReader(io.BytesIO(pdf_bytes))
            text = "\n".join(page.extract_text() or "" for page in reader.pages[:20])
        except Exception:
            text = f"[Could not extract text from {filename}]"
        result = await _call_text_ocr(text, filename)
        result["_source_file"] = filename
        result["_upload_id"] = bill_upload_id(filename)
        return result

    result = await _call_vision(b64_pages, filename)
    result["_source_file"] = filename
    result["_upload_id"] = bill_upload_id(filename)
    return result


async def _call_text_ocr(text: str, filename: str) -> dict:
    """Extract structured data from plain text (PDF text layer fallback)."""
    resp = await _get_client().chat.completions.create(
        model="gpt-4o",
        messages=[
            {"role": "system", "content": SYSTEM_PROMPT},
            {"role": "user", "content": f"Document: {filename}\n\nExtracted text:\n{text[:8000]}"},
        ],
        temperature=0,
        response_format={"type": "json_object"},
        max_tokens=4096,
    )
    return json.loads(resp.choices[0].message.content)


async def process_image_async(image_bytes: bytes, filename: str, mime: str = "image/jpeg") -> dict:
    """Image bytes → GPT-4o → structured JSON."""
    from PIL import Image
    loop = asyncio.get_event_loop()
    img = await loop.run_in_executor(None, lambda: Image.open(io.BytesIO(image_bytes)))
    b64 = _encode_page(img)
    result = await _call_vision([b64], filename)
    result["_source_file"] = filename
    result["_upload_id"] = bill_upload_id(filename)
    return result


async def process_file_async(file_bytes: bytes, filename: str, mime: str) -> dict:
    """Route to PDF or image processor based on MIME type."""
    if "pdf" in mime.lower() or filename.lower().endswith(".pdf"):
        return await process_pdf_async(file_bytes, filename)
    return await process_image_async(file_bytes, filename, mime)
