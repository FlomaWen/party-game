from fastapi import FastAPI, WebSocket, WebSocketDisconnect, HTTPException, File, UploadFile
from fastapi.staticfiles import StaticFiles
from fastapi.responses import HTMLResponse, JSONResponse
from typing import Dict
from pydantic import BaseModel
import json
import asyncio
import os
import shutil
from pathlib import Path

app = FastAPI()

# Modèle pour les questions
class Question(BaseModel):
    image: str
    question: str
    answer: str
    points: int = 10

# Chemin vers le fichier JSON
QUESTIONS_FILE = "questions.json"

# Charger les questions depuis le fichier JSON
def load_questions():
    if os.path.exists(QUESTIONS_FILE):
        try:
            with open(QUESTIONS_FILE, "r", encoding="utf-8") as f:
                questions = json.load(f)
                # Ajouter les IDs si manquants
                for idx, q in enumerate(questions):
                    if "id" not in q:
                        q["id"] = idx + 1
                return questions
        except:
            return []
    return []

# Sauvegarder les questions dans le fichier JSON
def save_questions(questions):
    with open(QUESTIONS_FILE, "w", encoding="utf-8") as f:
        json.dump(questions, f, ensure_ascii=False, indent=2)

# Questions du jeu (chargées depuis le fichier)
QUESTIONS = load_questions()

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
            "total_questions": len(QUESTIONS)
        }

    async def connect(self, websocket: WebSocket, player_id: str):
        await websocket.accept()
        self.active_connections[player_id] = websocket
        self.game_state["players"][player_id] = {
            "name": f"Joueur {len(self.active_connections)}",
            "score": 0
        }
        await self.broadcast_leaderboard()

    def disconnect(self, player_id: str):
        if player_id in self.active_connections:
            del self.active_connections[player_id]
        if player_id in self.game_state["players"]:
            del self.game_state["players"][player_id]

        # Si tous les joueurs se déconnectent, reset le jeu
        if len(self.active_connections) == 0:
            print("Tous les joueurs déconnectés - Reset du jeu")
            self.reset_game()

    async def send_personal_message(self, message: str, websocket: WebSocket):
        await websocket.send_text(message)

    async def broadcast(self, message: dict):
        for connection in self.active_connections.values():
            await connection.send_text(json.dumps(message))

    async def broadcast_leaderboard(self):
        # Créer le leaderboard trié par score
        leaderboard = [
            {"name": player["name"], "score": player["score"]}
            for player in self.game_state["players"].values()
        ]
        leaderboard.sort(key=lambda x: x["score"], reverse=True)

        await self.broadcast({
            "type": "leaderboard_update",
            "leaderboard": leaderboard
        })

    async def player_ready(self, player_id: str):
        """Marquer un joueur comme prêt"""
        self.game_state["ready_players"].add(player_id)

        # Envoyer le statut "prêt" à tous
        await self.broadcast({
            "type": "ready_status",
            "ready_count": len(self.game_state["ready_players"]),
            "total_count": len(self.active_connections)
        })

        # Si tous les joueurs sont prêts, démarrer le jeu
        if len(self.game_state["ready_players"]) == len(self.active_connections) and len(self.active_connections) > 0:
            await self.start_game()

    async def start_game(self):
        """Démarrer le jeu"""
        if self.game_state["game_started"]:
            return

        # Recharger les questions depuis le fichier
        global QUESTIONS
        QUESTIONS = load_questions()
        self.game_state["total_questions"] = len(QUESTIONS)
        self.game_state["current_question_index"] = 0

        if len(QUESTIONS) == 0:
            await self.broadcast({
                "type": "error",
                "message": "Aucune question n'a été ajoutée ! Ajoutez des questions avant de commencer."
            })
            # Réinitialiser les joueurs prêts
            self.game_state["ready_players"].clear()
            await self.broadcast({
                "type": "ready_status",
                "ready_count": 0,
                "total_count": len(self.active_connections)
            })
            return

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

        # Attendre 2 secondes avant la question suivante
        await asyncio.sleep(2)

        # Passer à la question suivante
        await self.next_question()

    async def next_question(self):
        """Passe à la question suivante"""
        self.game_state["current_question_index"] += 1
        self.game_state["answered_players"].clear()

        current_question = self.get_current_question()

        if current_question:
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

        # Reset les scores des joueurs
        for player_id in self.game_state["players"]:
            self.game_state["players"][player_id]["score"] = 0

        # Recharger les questions
        global QUESTIONS
        QUESTIONS = load_questions()
        self.game_state["total_questions"] = len(QUESTIONS)

    async def check_answer(self, player_id: str, answer: str, time_left: int):
        # Vérifier si le joueur a déjà répondu
        if player_id in self.game_state["answered_players"]:
            return {"correct": False, "message": "Tu as déjà répondu !"}

        current_question = self.get_current_question()
        if not current_question:
            return {"correct": False, "message": "Pas de question en cours"}

        # Marquer le joueur comme ayant répondu
        self.game_state["answered_players"].add(player_id)

        # Vérifier la réponse
        if answer.lower().strip() == current_question["answer"].lower().strip():
            # Calculer les points selon le temps restant
            if time_left >= 7:  # 10, 9, 8, 7 secondes (3 premières secondes)
                points = 10
            elif time_left >= 4:  # 6, 5, 4 secondes (6 premières secondes)
                points = 7
            elif time_left >= 1:  # 3, 2, 1 secondes (9 premières secondes)
                points = 4
            else:  # 0 seconde
                points = 2

            self.game_state["players"][player_id]["score"] += points
            await self.broadcast_leaderboard()

            # Vérifier si le joueur a gagné (100 points)
            if self.game_state["players"][player_id]["score"] >= 100:
                await self.broadcast({
                    "type": "winner",
                    "player_name": self.game_state["players"][player_id]["name"],
                    "score": self.game_state["players"][player_id]["score"]
                })

            return {"correct": True, "message": f"Bonne réponse ! +{points} pts 🎉", "points": points}

        return {"correct": False, "message": "Mauvaise réponse... ❌"}

manager = ConnectionManager()

# Créer le dossier assets s'il n'existe pas
ASSETS_DIR = Path("static/assets")
ASSETS_DIR.mkdir(parents=True, exist_ok=True)

# API pour uploader une image
@app.post("/api/upload-image")
async def upload_image(file: UploadFile = File(...)):
    try:
        # Vérifier le type de fichier
        if not file.content_type in ["image/png", "image/jpeg", "image/jpg", "image/gif"]:
            raise HTTPException(status_code=400, detail="Seuls les fichiers PNG, JPG et GIF sont acceptés")

        # Générer un nom de fichier unique basé sur le timestamp
        import time
        file_extension = file.filename.split('.')[-1]
        unique_filename = f"question_{int(time.time())}_{os.urandom(4).hex()}.{file_extension}"

        # Chemin complet du fichier
        file_path = ASSETS_DIR / unique_filename

        # Sauvegarder le fichier
        with file_path.open("wb") as buffer:
            shutil.copyfileobj(file.file, buffer)

        return JSONResponse(content={
            "message": "Image uploadée avec succès",
            "filename": unique_filename
        })
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Erreur lors de l'upload: {str(e)}")

# API pour ajouter une question
@app.post("/api/questions")
async def add_question(question: Question):
    questions = load_questions()
    new_question = {
        "id": len(questions) + 1,
        "image": question.image,
        "question": question.question,
        "answer": question.answer,
        "points": question.points
    }
    questions.append(new_question)
    save_questions(questions)

    # Mettre à jour le compteur global
    global QUESTIONS
    QUESTIONS = questions

    return JSONResponse(content={"message": "Question ajoutée avec succès", "question": new_question})

# API pour obtenir toutes les questions
@app.get("/api/questions")
async def get_questions():
    questions = load_questions()
    return JSONResponse(content=questions)

# API pour supprimer toutes les questions (reset)
@app.delete("/api/questions")
async def delete_all_questions():
    save_questions([])
    global QUESTIONS
    QUESTIONS = []
    return JSONResponse(content={"message": "Toutes les questions ont été supprimées"})

# API pour supprimer une question spécifique
@app.delete("/api/questions/{question_id}")
async def delete_question(question_id: int):
    questions = load_questions()
    questions = [q for q in questions if q.get("id") != question_id]
    # Réassigner les IDs
    for idx, q in enumerate(questions):
        q["id"] = idx + 1
    save_questions(questions)
    global QUESTIONS
    QUESTIONS = questions
    return JSONResponse(content={"message": "Question supprimée"})

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

    # Envoyer le statut initial du jeu
    await manager.send_personal_message(json.dumps({
        "type": "ready_status",
        "ready_count": len(manager.game_state["ready_players"]),
        "total_count": len(manager.active_connections),
        "total_questions": manager.game_state["total_questions"]
    }), websocket)

    # Si le jeu a déjà commencé, envoyer la question en cours
    if manager.game_state["game_started"]:
        current_question = manager.get_current_question()
        if current_question:
            await manager.send_personal_message(json.dumps({
                "type": "question",
                "data": current_question,
                "question_number": manager.game_state["current_question_index"] + 1,
                "total_questions": manager.game_state["total_questions"]
            }), websocket)

    try:
        while True:
            data = await websocket.receive_text()
            message = json.loads(data)

            if message["type"] == "answer":
                result = await manager.check_answer(player_id, message["answer"], message.get("time_left", 0))
                await manager.send_personal_message(json.dumps({
                    "type": "answer_result",
                    "correct": result["correct"],
                    "message": result["message"]
                }), websocket)

            elif message["type"] == "set_name":
                # Mettre à jour le nom du joueur
                if player_id in manager.game_state["players"]:
                    manager.game_state["players"][player_id]["name"] = message["name"]
                    # Envoyer le leaderboard mis à jour à tous
                    await manager.broadcast_leaderboard()

            elif message["type"] == "ready":
                await manager.player_ready(player_id)

    except WebSocketDisconnect:
        manager.disconnect(player_id)
        await manager.broadcast_leaderboard()

# Monter le dossier static pour servir les fichiers CSS, JS, images
app.mount("/static", StaticFiles(directory="static"), name="static")

if __name__ == "__main__":
    import uvicorn
    # Utilise la variable PORT fournie par Render (ou 8000 en local)
    port = int(os.environ.get("PORT", 8000))
    uvicorn.run("main:app", host="0.0.0.0", port=port, reload=False)

