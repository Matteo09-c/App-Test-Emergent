# App Test Emergent

Questo repository contiene un'app con due parti principali:
- backend (FastAPI / Python)
- frontend (Create React App)

Questa README spiega come avviare il progetto in locale, come testarlo e come usare Docker/Docker Compose.

## Prerequisiti
- Node.js 18+ e npm (o yarn)
- Python 3.10+ e pip
- virtualenv (consigliato)
- Docker e docker-compose (opzionali per containerizzazione)

## Panoramica comandi rapidi
- Avviare backend in dev:
  - cd backend
  - python -m venv .venv
  - source .venv/bin/activate  (Windows: .\.venv\Scripts\Activate.ps1)
  - pip install -r requirements.txt
  - uvicorn server:app --reload --host 0.0.0.0 --port 8000
  (Se l'app non è `server:app`, vedi la sezione “Entrypoint backend” sotto)
- Avviare frontend in dev:
  - cd frontend
  - npm install
  - npm start  (apre su http://localhost:3000)
- Eseguire test:
  - Backend: dalla root o da backend: `pytest`
  - Frontend: `cd frontend && npm test`

## Docker & docker-compose
- Per eseguire entrambi in container usa:
  - docker-compose up --build
- I servizi standard esposti:
  - Backend: http://localhost:8000
  - Frontend: http://localhost:3000 (o nginx su 80 se si usa Dockerfile multi-stage)

## Variabili d'ambiente
- Vedi `.env.example` nella root per la lista delle variabili raccomandate.
- Copia `.env.example` in `.env` e completa i valori prima di lanciare `docker-compose` o avviare il backend.

## EntryPoint backend (importante)
- Ho assunto che il backend esponga un oggetto ASGI `app` dentro `backend/server.py` (es. `app = FastAPI()`).
- Se il tuo server usa nome o path diversi (es. `backend/app.py` o package `backend.main:app`), modifica il comando uvicorn di conseguenza:
  - uvicorn backend.server:app --reload --host 0.0.0.0 --port 8000
  - oppure: uvicorn backend.main:app --reload --host 0.0.0.0 --port 8000

## Cosa ho aggiunto
- `.env.example` (root) con le variabili più probabili
- Dockerfile per backend e frontend
- docker-compose.yml per avviare backend, frontend e MongoDB (opzionale)
- workflow GitHub Actions per test CI (backend + frontend)
- Makefile con comandi utili

## Nota finale
- Non ho potuto leggere `backend/server.py` per estrarre automaticamente le variabili d'ambiente richieste; ho messo una lista esaustiva ma generica in `.env.example`. Verifica `server.py` e aggiungi/aggiorna le variabili mancanti.