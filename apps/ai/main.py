# Service IA - squelette non fonctionnel.
# Réservé pour la phase 3 (assistant patient, RAG médical). N'implémente
# aucune logique IA pour l'instant : seul un endpoint de santé est exposé
# afin de valider que le point d'extension existe dans l'architecture.
from fastapi import FastAPI

app = FastAPI(title="MediLink AI - service IA (squelette)")


@app.get("/health")
def health():
    return {"status": "ok", "service": "medilink-ai", "implemented": False}
