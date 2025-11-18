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
            "leaderboard": []
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

    async def check_answer(self, player_id: str, answer: str):
        # Logique de vérification de réponse (à adapter selon tes questions)
        correct_answer = "Bob l'éponge"  # Exemple

        if answer.lower().strip() == correct_answer.lower().strip():
            self.game_state["players"][player_id]["score"] += 10
            await self.broadcast_leaderboard()
            return True
        return False

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
    # Ajoute tes questions ici
]

@app.get("/")
async def get():
    with open("static/index.html", "r", encoding="utf-8") as f:
        return HTMLResponse(content=f.read())

@app.websocket("/ws/{player_id}")
async def websocket_endpoint(websocket: WebSocket, player_id: str):
    await manager.connect(websocket, player_id)

    # Envoyer la première question
    await manager.send_personal_message(json.dumps({
        "type": "question",
        "data": QUESTIONS[0]
    }), websocket)

    try:
        while True:
            data = await websocket.receive_text()
            message = json.loads(data)

            if message["type"] == "answer":
                is_correct = await manager.check_answer(player_id, message["answer"])
                await manager.send_personal_message(json.dumps({
                    "type": "answer_result",
                    "correct": is_correct,
                    "message": "Bonne réponse !" if is_correct else "Mauvaise réponse..."
                }), websocket)

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