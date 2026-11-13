"""Isolated native conversion; called by the ingestion worker, not a server."""
import json, sys
from pathlib import Path
from app.main import extract_pdf_in_process
if __name__=='__main__':
 text,segments,engine=extract_pdf_in_process(Path(sys.argv[1]))
 Path(sys.argv[2]).write_text(json.dumps(dict(text=text,segments=segments,engine=engine),ensure_ascii=False),encoding='utf-8')
