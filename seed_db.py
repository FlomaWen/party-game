"""Script d'import : lit `questions.json` local et insère les questions dans PostgreSQL via `database.py`.
Usage:
    python seed_db.py

Prérequis:
- DATABASE_URL défini (Neon / PostgreSQL)
- `questions.json` présent à la racine du projet
"""
import os
import json
from database import save_question, load_questions

QUESTIONS_FILE = "questions.json"

if __name__ == "__main__":
    if not os.getenv("DATABASE_URL"):
        print("ERROR: DATABASE_URL n'est pas défini. Exporte ta chaîne de connexion vers Neon.")
        raise SystemExit(1)

    if not os.path.exists(QUESTIONS_FILE):
        print(f"ERROR: {QUESTIONS_FILE} introuvable")
        raise SystemExit(1)

    with open(QUESTIONS_FILE, "r", encoding="utf-8") as f:
        questions = json.load(f)

    inserted = 0
    for q in questions:
        # Eviter d'insérer les champs points si présents
        image = q.get("image")
        question_text = q.get("question")
        answer = q.get("answer")

        if not image or not question_text or not answer:
            print(f"Skip question (manque de champs): {q}")
            continue

        result = save_question(image=image, question_text=question_text, answer=answer)
        if result:
            inserted += 1
            print(f"Inserted ID={result['id']}")
        else:
            print(f"Failed to insert: {q}")

    print(f"Done. {inserted} questions insérées.")
    print("→ Vérifie dans Neon (ou via load_questions())")

