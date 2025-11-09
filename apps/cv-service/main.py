"""
CV Processing Service - Microservicio Python para parseo de CVs
Este servicio es un stub en el MVP y puede ser implementado completamente después
"""

from fastapi import FastAPI, UploadFile, File, HTTPException
from fastapi.middleware.cors import CORSMiddleware
import os
from dotenv import load_dotenv

load_dotenv()

app = FastAPI(title="CIO CV Processing Service", version="1.0.0")

# Configurar CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

UPLOAD_DIR = os.getenv("UPLOAD_DIR", "./uploads")
os.makedirs(UPLOAD_DIR, exist_ok=True)


@app.get("/")
async def root():
    return {"message": "CIO CV Processing Service - Stub para MVP"}


@app.post("/parse-cv")
async def parse_cv(file: UploadFile = File(...)):
    """
    Endpoint stub para parsear un CV
    TODO: Implementar lógica de parsing con pdfplumber/PyPDF2 + OpenAI
    """
    
    # Stub: solo retorna datos de ejemplo
    return {
        "success": True,
        "message": "CV procesado (stub)",
        "data": {
            "role": "Desarrollador de Software",
            "location": "Bogotá",
            "experience_years": 3,
            "skills": ["Python", "JavaScript", "React"],
        }
    }


@app.get("/health")
async def health():
    return {"status": "healthy"}


if __name__ == "__main__":
    import uvicorn
    port = int(os.getenv("PORT", 8000))
    uvicorn.run(app, host="0.0.0.0", port=port)

