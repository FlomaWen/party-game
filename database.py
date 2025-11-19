import os
from sqlalchemy import create_engine, Column, Integer, String, Text
from sqlalchemy.ext.declarative import declarative_base
from sqlalchemy.orm import sessionmaker
import json

# Récupérer l'URL de la base de données depuis les variables d'environnement
DATABASE_URL = os.getenv("DATABASE_URL")

# Configuration pour Neon PostgreSQL
if DATABASE_URL:
    # Neon utilise déjà "postgresql://" donc pas besoin de modifier
    engine = create_engine(DATABASE_URL, pool_pre_ping=True)
    SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
    Base = declarative_base()

    # Modèle de la table Question
    class QuestionDB(Base):
        __tablename__ = "questions"

        id = Column(Integer, primary_key=True, index=True, autoincrement=True)
        image = Column(Text, nullable=False)  # URL de l'image (peut être longue)
        question = Column(Text, nullable=False)
        answer = Column(String(500), nullable=False)

    # Créer les tables si elles n'existent pas
    try:
        Base.metadata.create_all(bind=engine)
        print("✅ Base de données PostgreSQL connectée (Neon)")
    except Exception as e:
        print(f"❌ Erreur de connexion PostgreSQL: {e}")
        engine = None
        SessionLocal = None
else:
    print("⚠️ Pas de DATABASE_URL - Mode JSON local")
    engine = None
    SessionLocal = None
    QuestionDB = None

# Fonctions CRUD pour les questions
def load_questions():
    """Charge toutes les questions depuis PostgreSQL"""
    if not DATABASE_URL or not SessionLocal:
        return load_questions_from_json()

    try:
        db = SessionLocal()
        questions_db = db.query(QuestionDB).order_by(QuestionDB.id).all()

        questions = [
            {
                "id": q.id,
                "image": q.image,
                "question": q.question,
                "answer": q.answer
            }
            for q in questions_db
        ]

        db.close()
        print(f"✅ {len(questions)} questions chargées depuis Neon")
        return questions
    except Exception as e:
        print(f"❌ Erreur lors du chargement: {e}")
        return []

def save_question(image: str, question_text: str, answer: str):
    """Sauvegarde une nouvelle question dans PostgreSQL"""
    if not DATABASE_URL or not SessionLocal:
        return save_question_to_json(image, question_text, answer)

    try:
        db = SessionLocal()

        new_question = QuestionDB(
            image=image,
            question=question_text,
            answer=answer
        )

        db.add(new_question)
        db.commit()
        db.refresh(new_question)

        result = {
            "id": new_question.id,
            "image": new_question.image,
            "question": new_question.question,
            "answer": new_question.answer
        }

        db.close()
        print(f"✅ Question ajoutée : ID {result['id']}")
        return result
    except Exception as e:
        print(f"❌ Erreur lors de l'ajout: {e}")
        return None

def delete_question(question_id: int):
    """Supprime une question de PostgreSQL"""
    if not DATABASE_URL or not SessionLocal:
        return delete_question_from_json(question_id)

    try:
        db = SessionLocal()
        question = db.query(QuestionDB).filter(QuestionDB.id == question_id).first()

        if question:
            db.delete(question)
            db.commit()
            db.close()
            print(f"✅ Question {question_id} supprimée")
            return True

        db.close()
        print(f"⚠️ Question {question_id} non trouvée")
        return False
    except Exception as e:
        print(f"❌ Erreur lors de la suppression: {e}")
        return False

def delete_all_questions():
    """Supprime toutes les questions (reset)"""
    if not DATABASE_URL or not SessionLocal:
        return delete_all_questions_json()

    try:
        db = SessionLocal()
        db.query(QuestionDB).delete()
        db.commit()
        db.close()
        print("✅ Toutes les questions supprimées")
        return True
    except Exception as e:
        print(f"❌ Erreur lors du reset: {e}")
        return False

# ========================================
# Fonctions de fallback pour le mode local (JSON)
# ========================================

QUESTIONS_FILE = "questions.json"

def load_questions_from_json():
    """Mode local : charger depuis JSON"""
    if os.path.exists(QUESTIONS_FILE):
        try:
            with open(QUESTIONS_FILE, "r", encoding="utf-8") as f:
                questions = json.load(f)
                # Ajouter les IDs si manquants
                for idx, q in enumerate(questions):
                    if "id" not in q:
                        q["id"] = idx + 1
                print(f"✅ {len(questions)} questions chargées depuis JSON")
                return questions
        except Exception as e:
            print(f"❌ Erreur JSON: {e}")
            return []
    return []

def save_question_to_json(image, question_text, answer):
    """Mode local : sauvegarder dans JSON"""
    questions = load_questions_from_json()
    new_id = max([q["id"] for q in questions], default=0) + 1

    new_question = {
        "id": new_id,
        "image": image,
        "question": question_text,
        "answer": answer
    }

    questions.append(new_question)

    with open(QUESTIONS_FILE, "w", encoding="utf-8") as f:
        json.dump(questions, f, ensure_ascii=False, indent=2)

    print(f"✅ Question ajoutée au JSON : ID {new_id}")
    return new_question

def delete_question_from_json(question_id):
    """Mode local : supprimer du JSON"""
    questions = load_questions_from_json()
    questions = [q for q in questions if q["id"] != question_id]

    with open(QUESTIONS_FILE, "w", encoding="utf-8") as f:
        json.dump(questions, f, ensure_ascii=False, indent=2)

    print(f"✅ Question {question_id} supprimée du JSON")
    return True

def delete_all_questions_json():
    """Mode local : supprimer toutes les questions du JSON"""
    with open(QUESTIONS_FILE, "w", encoding="utf-8") as f:
        json.dump([], f)
    print("✅ Toutes les questions supprimées du JSON")
    return True