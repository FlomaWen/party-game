from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from fastapi.staticfiles import StaticFiles
from fastapi.responses import HTMLResponse
from typing import Dict, List
import json
import asyncio
from datetime import datetime

app = FastAPI()

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
            "answered_players": set()
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

        # Attendre 3 secondes avant la question suivante
        await asyncio.sleep(3)

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
                "data": current_question
            })

            # Démarrer le timer
            asyncio.create_task(self.start_question_timer())
        else:
            # Fin du jeu
            await self.broadcast({
                "type": "game_over",
                "message": "Fin du jeu ! 🎉"
            })

    async def check_answer(self, player_id: str, answer: str):
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
            self.game_state["players"][player_id]["score"] += current_question["points"]
            await self.broadcast_leaderboard()
            return {"correct": True, "message": "Bonne réponse ! 🎉"}

        return {"correct": False, "message": "Mauvaise réponse... ❌"}

manager = ConnectionManager()

# Questions du jeu (à adapter selon tes besoins)
QUESTIONS = [
    {
        "id": 1,
        "image": "tahiti-bob.jpg",
        "question": "De quel dessin animé provient cette image ?",
        "answer": "Bob l'éponge",
        "points": 10
    },
    {
        "id": 2,
        "image": "tahiti-bob.jpg",  # Change par ta vraie image
        "question": "Question 2 : Teste !",
        "answer": "Test",
        "points": 10
    },
    # Ajoute tes questions ici
]

# État du jeu
game_state = {
    "current_question_index": 0,
    "question_start_time": None,
    "timer_task": None,
    "answered": False
}

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

    # Si c'est le premier joueur, démarrer la première question
    if len(manager.active_connections) == 1:
        current_question = manager.get_current_question()
        if current_question:
            await manager.broadcast({
                "type": "question",
                "data": current_question
            })
            # Démarrer le timer
            asyncio.create_task(manager.start_question_timer())
    else:
        # Envoyer la question en cours aux nouveaux joueurs
        current_question = manager.get_current_question()
        if current_question:
            await manager.send_personal_message(json.dumps({
                "type": "question",
                "data": current_question
            }), websocket)

    try:
        while True:
            data = await websocket.receive_text()
            message = json.loads(data)

            if message["type"] == "answer":
                result = await manager.check_answer(player_id, message["answer"])
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

    except WebSocketDisconnect:
        manager.disconnect(player_id)
        await manager.broadcast_leaderboard()

# Monter le dossier static pour servir les fichiers CSS, JS, images
app.mount("/static", StaticFiles(directory="static"), name="static")

if __name__ == "__main__":
    import uvicorn
    import os
    # Utilise la variable PORT fournie par Render (ou 8000 en local)
    port = int(os.environ.get("PORT", 8000))
    uvicorn.run(app, host="0.0.0.0", port=port)