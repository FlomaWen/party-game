from fastapi import FastAPI, WebSocket, WebSocketDisconnect, HTTPException, File, UploadFile, Body, Request
from fastapi.staticfiles import StaticFiles
from fastapi.responses import HTMLResponse, JSONResponse
from fastapi.middleware.cors import CORSMiddleware
from typing import Dict
from pydantic import BaseModel
import json
import asyncio
import os
import shutil
from pathlib import Path
import logging
import cloudinary
import cloudinary.uploader
import random

# ✨ NOUVEAU : Import de la gestion de la base de données
from database import load_questions as db_load_questions, save_question as db_save_question, delete_question as db_delete_question

# ✨ Configuration Cloudinary
CLOUDINARY_URL = os.getenv("CLOUDINARY_URL")
if CLOUDINARY_URL:
    cloudinary.config(url=CLOUDINARY_URL)
    print("✅ Cloudinary configuré")
else:
    print("⚠️ CLOUDINARY_URL non définie")

# Configuration des logs
IS_PRODUCTION = os.getenv("RENDER") is not None or os.getenv("PORT") is not None or os.getenv("RAILWAY_ENVIRONMENT") is not None
if IS_PRODUCTION:
    logging.basicConfig(level=logging.WARNING)
else:
    logging.basicConfig(level=logging.INFO)

app = FastAPI(
    title="Party Game",
    docs_url=None if IS_PRODUCTION else "/docs",
    redoc_url=None if IS_PRODUCTION else "/redoc"
)

# Configuration CORS pour permettre le chargement des images externes
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Modèle pour les questions
class Question(BaseModel):
    image: str
    question: str
    answer: str

# ✨ NOUVEAU : Charger les questions depuis PostgreSQL/Neon (ou JSON en local)
QUESTIONS = db_load_questions()

# Gestionnaire de connexions
class ConnectionManager:
    def __init__(self):
        self.active_connections: Dict[str, WebSocket] = {}
        self.game_state = {
            "players": {},
            "current_question": None,
            "leaderboard": [],
            "current_question_index": 0,
            "question_start_time": None,
            "timer_task": None,
            "answered_players": set(),
            "ready_players": set(),
            "game_started": False,
            "total_questions": len(QUESTIONS),
            "used_question_ids": set()  # IDs des questions déjà posées
        }

    async def connect(self, websocket: WebSocket, player_id: str):
        await websocket.accept()
        self.active_connections[player_id] = websocket
        self.game_state["players"][player_id] = {
            "name": f"Joueur {len(self.active_connections)}",
            "score": 0,
            "last_answer": "",
            "answered": False
        }
        await self.broadcast_leaderboard()

    async def disconnect(self, player_id: str):
        if player_id in self.active_connections:
            del self.active_connections[player_id]
        if player_id in self.game_state["players"]:
            del self.game_state["players"][player_id]

        # Retirer le joueur de la liste des prêts
        if player_id in self.game_state["ready_players"]:
            self.game_state["ready_players"].discard(player_id)

        # Broadcast le nouveau statut si des joueurs sont encore connectés
        if len(self.active_connections) > 0:
            await self.broadcast_ready_status()
            await self.broadcast_leaderboard()

        # Si tous les joueurs se déconnectent, reset le jeu
        if len(self.active_connections) == 0:
            if not IS_PRODUCTION:
                print("🔄 Tous les joueurs déconnectés - Reset du jeu")
            else:
                logging.info("All players disconnected - Game reset")
            self.reset_game()

    async def send_personal_message(self, message: str, websocket: WebSocket):
        await websocket.send_text(message)

    async def broadcast(self, message: dict):
        for connection in self.active_connections.values():
            await connection.send_text(json.dumps(message))

    async def broadcast_leaderboard(self):
        # Créer le leaderboard trié par score
        leaderboard = [
            {
                "name": player["name"],
                "score": player["score"],
                "last_answer": player.get("last_answer", ""),
                "answered": player.get("answered", False)
            }
            for player in self.game_state["players"].values()
        ]
        leaderboard.sort(key=lambda x: x["score"], reverse=True)

        await self.broadcast({
            "type": "leaderboard_update",
            "leaderboard": leaderboard
        })

    async def broadcast_ready_status(self):
        """Envoyer le statut prêt avec la liste détaillée des joueurs"""
        players_status = []
        for player_id, player_data in self.game_state["players"].items():
            players_status.append({
                "id": player_id,
                "name": player_data["name"],
                "ready": player_id in self.game_state["ready_players"]
            })

        await self.broadcast({
            "type": "ready_status",
            "ready_count": len(self.game_state["ready_players"]),
            "total_count": len(self.active_connections),
            "players": players_status
        })

    async def player_ready(self, player_id: str):
        """Marquer un joueur comme prêt"""
        self.game_state["ready_players"].add(player_id)

        # Envoyer le statut "prêt" à tous avec la liste des joueurs
        await self.broadcast_ready_status()

        # Si tous les joueurs sont prêts, démarrer le jeu
        if len(self.game_state["ready_players"]) == len(self.active_connections) and len(self.active_connections) > 0:
            if not self.game_state["game_started"]:
                await self.start_game()
            else:
                # Si le jeu a déjà commencé, passer à la question suivante
                await self.next_question()

    async def start_game(self):
        """Démarrer le jeu"""
        if self.game_state["game_started"]:
            return

        # Recharger les questions depuis la base de données
        all_questions = db_load_questions()

        # Filtrer pour exclure les questions déjà utilisées
        available_questions = [
            q for q in all_questions
            if q["id"] not in self.game_state["used_question_ids"]
        ]

        # Si toutes les questions ont été utilisées, afficher un message
        if len(available_questions) == 0:
            await self.broadcast({
                "type": "error",
                "message": "Toutes les questions ont déjà été posées ! Ajoutez de nouvelles questions ou redémarrez le serveur."
            })
            # Réinitialiser les joueurs prêts
            self.game_state["ready_players"].clear()
            await self.broadcast({
                "type": "ready_status",
                "ready_count": 0,
                "total_count": len(self.active_connections)
            })
            return

        # Assigner les questions disponibles
        global QUESTIONS
        QUESTIONS = available_questions

        # Mélanger l'ordre des questions pour cette partie
        try:
            random.shuffle(QUESTIONS)
        except Exception:
            # si shuffle échoue, on laisse l'ordre tel quel
            logging.exception("Impossible de shuffle QUESTIONS")
        self.game_state["total_questions"] = len(QUESTIONS)
        self.game_state["current_question_index"] = 0

        self.game_state["game_started"] = True

        # Envoyer le signal de démarrage
        await self.broadcast({
            "type": "game_start",
            "total_questions": self.game_state["total_questions"]
        })

        # Attendre 2 secondes puis démarrer la première question
        await asyncio.sleep(2)

        current_question = self.get_current_question()
        if current_question:
            # Marquer cette question comme utilisée
            if "id" in current_question:
                self.game_state["used_question_ids"].add(current_question["id"])

            await self.broadcast({
                "type": "question",
                "data": current_question,
                "question_number": self.game_state["current_question_index"] + 1,
                "total_questions": self.game_state["total_questions"]
            })
            asyncio.create_task(self.start_question_timer())

    def get_current_question(self):
        idx = self.game_state["current_question_index"]
        if idx < len(QUESTIONS):
            return QUESTIONS[idx]
        return None

    async def start_question_timer(self):
        """Lance un timer de 10 secondes pour la question"""
        await asyncio.sleep(10)

        # Révéler la réponse
        current_question = self.get_current_question()
        if current_question:
            await self.broadcast({
                "type": "reveal_answer",
                "answer": current_question["answer"]
            })

        # Attendre 3 secondes pour voir la réponse
        await asyncio.sleep(3)

        # Reset les joueurs prêts pour la synchronisation
        self.game_state["ready_players"].clear()

        # Demander aux joueurs de se préparer pour la question suivante
        await self.broadcast({
            "type": "waiting_next_question",
            "message": "Préparez-vous pour la question suivante !"
        })

        # Envoyer le statut initial (personne n'est prêt)
        await self.broadcast_ready_status()

    async def next_question(self):
        """Passe à la question suivante"""
        self.game_state["current_question_index"] += 1
        self.game_state["answered_players"].clear()

        # Réinitialiser les réponses pour la nouvelle question
        for player_id in self.game_state["players"]:
            self.game_state["players"][player_id]["last_answer"] = ""
            self.game_state["players"][player_id]["answered"] = False

        current_question = self.get_current_question()

        if current_question:
            # Marquer cette question comme utilisée
            if "id" in current_question:
                self.game_state["used_question_ids"].add(current_question["id"])

            # Envoyer la nouvelle question
            await self.broadcast({
                "type": "question",
                "data": current_question,
                "question_number": self.game_state["current_question_index"] + 1,
                "total_questions": self.game_state["total_questions"]
            })

            # Démarrer le timer
            asyncio.create_task(self.start_question_timer())
        else:
            # Fin du jeu - trouver le gagnant
            leaderboard = [
                {"name": player["name"], "score": player["score"]}
                for player in self.game_state["players"].values()
            ]
            leaderboard.sort(key=lambda x: x["score"], reverse=True)

            winner = leaderboard[0] if leaderboard else None

            await self.broadcast({
                "type": "game_over",
                "message": "Fin du jeu ! 🎉",
                "winner": winner
            })

    def reset_game(self):
        """Reset complet du jeu"""
        self.game_state["current_question_index"] = 0
        self.game_state["question_start_time"] = None
        self.game_state["answered_players"].clear()
        self.game_state["ready_players"].clear()
        self.game_state["game_started"] = False

        # Reset les scores et réponses des joueurs
        for player_id in self.game_state["players"]:
            self.game_state["players"][player_id]["score"] = 0
            self.game_state["players"][player_id]["last_answer"] = ""
            self.game_state["players"][player_id]["answered"] = False

        # NE PAS réinitialiser used_question_ids pour garder l'historique des questions
        # Les questions utilisées restent marquées même après reset

        # Recharger les questions (elles seront filtrées dans start_game)
        global QUESTIONS
        all_questions = db_load_questions()
        self.game_state["total_questions"] = len(all_questions)

    async def check_answer(self, player_id: str, answer: str, time_left: int):
        # Vérifier si le joueur a déjà trouvé la bonne réponse
        if player_id in self.game_state["answered_players"]:
            return {"correct": False, "message": "Tu as déjà répondu correctement ! ✓"}

        current_question = self.get_current_question()
        if not current_question:
            return {"correct": False, "message": "Pas de question en cours"}

        # Vérifier la réponse
        if answer.lower().strip() == current_question["answer"].lower().strip():
            # Marquer le joueur comme ayant trouvé la bonne réponse
            self.game_state["answered_players"].add(player_id)
            self.game_state["players"][player_id]["answered"] = True
            self.game_state["players"][player_id]["last_answer"] = "Réponse trouvée ✓"

            # Calculer les points selon le temps restant
            if time_left >= 7:
                points = 10
            elif time_left >= 4:
                points = 7
            elif time_left >= 1:
                points = 4
            else:
                points = 2

            self.game_state["players"][player_id]["score"] += points
            await self.broadcast_leaderboard()

            # Vérifier si le joueur a gagné (300 points)
            if self.game_state["players"][player_id]["score"] >= 300:
                await self.broadcast({
                    "type": "winner",
                    "player_name": self.game_state["players"][player_id]["name"],
                    "score": self.game_state["players"][player_id]["score"]
                })

            return {"correct": True, "message": f"Bonne réponse ! +{points} pts 🎉", "points": points}

        # Mauvaise réponse - sauvegarder et le joueur peut réessayer
        self.game_state["players"][player_id]["last_answer"] = answer
        self.game_state["players"][player_id]["answered"] = False
        await self.broadcast_leaderboard()
        return {"correct": False, "message": "Mauvaise réponse... Réessaie ! ❌", "can_retry": True}

manager = ConnectionManager()

# Créer le dossier assets s'il n'existe pas
ASSETS_DIR = Path("static/assets")
ASSETS_DIR.mkdir(parents=True, exist_ok=True)

# API pour uploader une image vers Cloudinary
@app.post("/api/upload-image")
async def upload_image(file: UploadFile = File(...)):
    try:
        if not file.content_type in ["image/png", "image/jpeg", "image/jpg", "image/gif"]:
            raise HTTPException(status_code=400, detail="Seuls les fichiers PNG, JPG et GIF sont acceptés")

        # Upload vers Cloudinary
        if CLOUDINARY_URL:
            result = cloudinary.uploader.upload(
                file.file,
                folder="party-game-questions",
                resource_type="image"
            )
            image_url = result["secure_url"]

            return JSONResponse(content={
                "message": "Image uploadée avec succès sur Cloudinary",
                "url": image_url
            })
        else:
            # Fallback local si pas de Cloudinary (dev)
            import time
            file_extension = file.filename.split('.')[-1]
            unique_filename = f"question_{int(time.time())}_{os.urandom(4).hex()}.{file_extension}"
            file_path = ASSETS_DIR / unique_filename

            with file_path.open("wb") as buffer:
                shutil.copyfileobj(file.file, buffer)

            return JSONResponse(content={
                "message": "Image uploadée localement",
                "url": f"/static/assets/{unique_filename}"
            })

    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Erreur lors de l'upload: {str(e)}")

# ✨ NOUVEAU : API pour ajouter une question (avec PostgreSQL/Neon)
@app.post("/api/questions")
async def add_question(request: Request, payload: dict | None = Body(None)):
    """Ajoute une question. Tente d'extraire les champs depuis JSON ou depuis form-data.
    Retourne des erreurs explicites et loggue le payload reçu pour faciliter le debug.
    """
    try:
        # 1) Essayer de lire JSON proprement
        data: dict = {}
        if payload and isinstance(payload, dict):
            data = payload
        else:
            try:
                data = await request.json()
                if not isinstance(data, dict):
                    data = {}
            except Exception:
                data = {}

        # 2) Si les champs essentiels manquent, tenter de lire form-data
        if not any(k in data for k in ("image", "question", "answer", "url", "secure_url")):
            try:
                form = await request.form()
                # form may contain UploadFile or str values
                for k, v in form.items():
                    if hasattr(v, 'filename'):
                        # upload fields become UploadFile; we keep filename (but image URL should come from upload endpoint)
                        data[k] = v.filename
                    else:
                        data[k] = str(v)
            except Exception:
                # ignore form parsing errors
                pass

        # 3) Log keys and raw body for debugging
        try:
            raw_body = (await request.body()).decode('utf-8', errors='replace')
        except Exception:
            raw_body = ''
        logging.info(f"Received /api/questions payload keys: {list(data.keys())}, raw_body={raw_body}")

        # 4) Support multiple key names for image
        image = (data.get("image") or data.get("url") or data.get("image_url") or data.get("secure_url") or data.get("imageUrl"))
        question_text = data.get("question") or data.get("question_text")
        answer = data.get("answer")

        # 5) Validation simple
        if not image or not isinstance(image, str) or not image.strip():
            logging.warning(f"Invalid /api/questions payload (missing/invalid image): {data}")
            return JSONResponse(status_code=400, content={
                "detail": "Champ 'image' manquant ou invalide",
                "received_keys": list(data.keys()),
                "raw_body": raw_body
            })
        if not question_text or not isinstance(question_text, str) or not question_text.strip():
            logging.warning(f"Invalid /api/questions payload (missing/invalid question): {data}")
            return JSONResponse(status_code=400, content={
                "detail": "Champ 'question' manquant ou invalide",
                "received_keys": list(data.keys()),
                "raw_body": raw_body
            })
        if not answer or not isinstance(answer, str) or not answer.strip():
            logging.warning(f"Invalid /api/questions payload (missing/invalid answer): {data}")
            return JSONResponse(status_code=400, content={
                "detail": "Champ 'answer' manquant ou invalide",
                "received_keys": list(data.keys()),
                "raw_body": raw_body
            })

        # Trim values
        image = image.strip()
        question_text = question_text.strip()
        answer = answer.strip()

        # Sauvegarder en base
        new_question = db_save_question(image=image, question_text=question_text, answer=answer)

        if new_question:
            global QUESTIONS
            QUESTIONS = db_load_questions()
            manager.game_state["total_questions"] = len(QUESTIONS)

            return JSONResponse(content={"message": "Question ajoutée avec succès", "question": new_question})

        logging.error(f"Failed to insert question into DB, payload: {data}")
        raise HTTPException(status_code=500, detail="Erreur lors de l'ajout en base")

    except HTTPException:
        # laisser passer les erreurs HTTP explicites
        raise
    except Exception as e:
        logging.exception("Unexpected error in /api/questions")
        raise HTTPException(status_code=500, detail=f"Erreur serveur: {str(e)}")

# API pour obtenir toutes les questions
@app.get("/api/questions")
async def get_questions():
    questions = db_load_questions()
    return JSONResponse(content=questions)

# API pour supprimer toutes les questions (reset)
@app.delete("/api/questions")
async def delete_all_questions():
    questions = db_load_questions()
    for q in questions:
        db_delete_question(q["id"])

    global QUESTIONS
    QUESTIONS = []
    manager.game_state["total_questions"] = 0

    return JSONResponse(content={"message": "Toutes les questions ont été supprimées"})

# ✨ NOUVEAU : API pour supprimer une question spécifique (avec PostgreSQL/Neon)
@app.delete("/api/questions/{question_id}")
async def delete_question_api(question_id: int):
    success = db_delete_question(question_id)

    if success:
        global QUESTIONS
        QUESTIONS = db_load_questions()
        manager.game_state["total_questions"] = len(QUESTIONS)

        return JSONResponse(content={"message": "Question supprimée"})
    else:
        raise HTTPException(status_code=404, detail="Question non trouvée")

# API pour reset le jeu
@app.post("/api/reset-game")
async def reset_game():
    manager.reset_game()
    await manager.broadcast({
        "type": "game_reset",
        "message": "Le jeu a été réinitialisé"
    })
    return JSONResponse(content={"message": "Jeu réinitialisé"})

@app.get("/")
async def get():
    try:
        with open("static/index.html", "r", encoding="utf-8") as f:
            return HTMLResponse(content=f.read())
    except FileNotFoundError:
        return HTMLResponse(content="<h1>Erreur: fichier index.html introuvable</h1>", status_code=404)

@app.websocket("/ws/{player_id}")
async def websocket_endpoint(websocket: WebSocket, player_id: str):
    await manager.connect(websocket, player_id)

    # Envoyer le statut de préparation et le nombre total de questions
    await manager.send_personal_message(json.dumps({
        "type": "ready_status",
        "ready_count": len(manager.game_state["ready_players"]),
        "total_count": len(manager.active_connections),
        "total_questions": manager.game_state["total_questions"]
    }), websocket)

    # Si le jeu est en cours, envoyer la question actuelle au nouveau joueur
    if manager.game_state["game_started"]:
        current_question = manager.get_current_question()
        if current_question:
            # Envoyer d'abord le signal de démarrage du jeu
            await manager.send_personal_message(json.dumps({
                "type": "game_start",
                "total_questions": manager.game_state["total_questions"]
            }), websocket)

            # Puis envoyer la question en cours
            await manager.send_personal_message(json.dumps({
                "type": "question",
                "data": current_question,
                "question_number": manager.game_state["current_question_index"] + 1,
                "total_questions": manager.game_state["total_questions"]
            }), websocket)

            # Envoyer le leaderboard actuel
            await manager.send_personal_message(json.dumps({
                "type": "leaderboard_update",
                "leaderboard": [
                    {
                        "name": player["name"],
                        "score": player["score"],
                        "last_answer": player.get("last_answer", ""),
                        "answered": player.get("answered", False)
                    }
                    for player in sorted(
                        manager.game_state["players"].values(),
                        key=lambda x: x["score"],
                        reverse=True
                    )
                ]
            }), websocket)

    try:
        while True:
            data = await websocket.receive_text()
            message = json.loads(data)

            if message["type"] == "answer":
                result = await manager.check_answer(player_id, message["answer"], message.get("time_left", 0))
                response = {
                    "type": "answer_result",
                    "correct": result["correct"],
                    "message": result["message"]
                }
                if "points" in result:
                    response["points"] = result["points"]
                await manager.send_personal_message(json.dumps(response), websocket)

            elif message["type"] == "set_name":
                if player_id in manager.game_state["players"]:
                    manager.game_state["players"][player_id]["name"] = message["name"]
                    await manager.broadcast_leaderboard()

            elif message["type"] == "ready":
                await manager.player_ready(player_id)

    except WebSocketDisconnect:
        await manager.disconnect(player_id)
        await manager.broadcast_leaderboard()

app.mount("/static", StaticFiles(directory="static"), name="static")

if __name__ == "__main__":
    import uvicorn
    port = int(os.environ.get("PORT", 8000))
    uvicorn.run("main:app", host="0.0.0.0", port=port, reload=False)