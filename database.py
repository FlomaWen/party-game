import os
from sqlalchemy import create_engine, Column, Integer, String, Text, TIMESTAMP, func
from sqlalchemy.ext.declarative import declarative_base
from sqlalchemy.orm import sessionmaker
from sqlalchemy.exc import SQLAlchemyError
from typing import List, Dict

# Récupérer l'URL de la base de données depuis les variables d'environnement
DATABASE_URL = os.getenv("DATABASE_URL")

if not DATABASE_URL:
    # On ne supporte plus le fallback JSON : la DB est obligatoire
    raise RuntimeError(
        "DATABASE_URL n'est pas défini. Cette application nécessite une base PostgreSQL (Neon)."
        " Définis la variable d'environnement DATABASE_URL avec la chaîne de connexion."
    )

# Configuration pour PostgreSQL (Neon)
engine = create_engine(DATABASE_URL, pool_pre_ping=True)
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
Base = declarative_base()

# Modèle de la table Question
class QuestionDB(Base):
    __tablename__ = "questions"

    id = Column(Integer, primary_key=True, index=True, autoincrement=True)
    image = Column(Text, nullable=False)  # URL de l'image
    question = Column(Text, nullable=False)
    answer = Column(String(500), nullable=False)
    created_at = Column(TIMESTAMP, server_default=func.now())

# Créer les tables si elles n'existent pas
try:
    Base.metadata.create_all(bind=engine)
    print("✅ Base de données PostgreSQL connectée et tables initialisées")
except Exception as e:
    raise RuntimeError(f"Impossible d'initialiser la base de données: {e}")


# Fonctions CRUD pour les questions (DB uniquement)
def load_questions() -> List[Dict]:
    """Charge toutes les questions depuis PostgreSQL et retourne une liste de dicts"""
    db = SessionLocal()
    try:
        questions_db = db.query(QuestionDB).order_by(QuestionDB.id).all()
        questions = [
            {"id": q.id, "image": q.image, "question": q.question, "answer": q.answer}
            for q in questions_db
        ]
        return questions
    except SQLAlchemyError as e:
        db.rollback()
        print(f"❌ Erreur lors du chargement des questions: {e}")
        return []
    finally:
        db.close()


def save_question(image: str, question_text: str, answer: str) -> Dict | None:
    """Sauvegarde une nouvelle question dans PostgreSQL et retourne l'objet créé sous forme de dict"""
    db = SessionLocal()
    try:
        new_question = QuestionDB(image=image, question=question_text, answer=answer)
        db.add(new_question)
        db.commit()
        db.refresh(new_question)
        return {"id": new_question.id, "image": new_question.image, "question": new_question.question, "answer": new_question.answer}
    except SQLAlchemyError as e:
        db.rollback()
        print(f"❌ Erreur lors de l'ajout de la question: {e}")
        return None
    finally:
        db.close()


def delete_question(question_id: int) -> bool:
    """Supprime une question par son ID. Retourne True si supprimée."""
    db = SessionLocal()
    try:
        question = db.query(QuestionDB).filter(QuestionDB.id == question_id).first()
        if not question:
            return False
        db.delete(question)
        db.commit()
        return True
    except SQLAlchemyError as e:
        db.rollback()
        print(f"❌ Erreur lors de la suppression: {e}")
        return False
    finally:
        db.close()


def delete_all_questions() -> bool:
    """Supprime toutes les questions (utilitaire)."""
    db = SessionLocal()
    try:
        db.query(QuestionDB).delete()
        db.commit()
        return True
    except SQLAlchemyError as e:
        db.rollback()
        print(f"❌ Erreur lors du reset des questions: {e}")
        return False
    finally:
        db.close()
