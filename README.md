# Party Game - Guide d'utilisation

## 🎮 Ajout de Questions

Les joueurs peuvent maintenant ajouter leurs propres questions avant de commencer la partie via l'interface.

### Comment ça marche ?

1. **Avant le jeu** : Sur la page d'accueil, vous verrez un formulaire pour ajouter des questions
2. **Remplissez les champs** :
   - **Image** : Télécharger une image (le serveur uploadera l'image sur Cloudinary et sauvegardera l'URL)
   - **Votre question** : La question à poser aux joueurs
   - **La réponse** : La réponse correcte attendue
3. **Cliquez sur "➕ Ajouter la question"**
4. **La question apparaît dans la liste** en dessous

### Stockage des questions

- Les questions sont maintenant stockées dans une base PostgreSQL (Neon) identifiée par la variable d'environnement `DATABASE_URL`.
- Le fichier `questions.json` n'est plus utilisé par l'application en production ; il sert uniquement pour le script d'import local `seed_db.py`.

---

## 🔁 Importer les questions depuis `questions.json` vers Neon

Si tu as un fichier `questions.json` avec des questions (format fourni dans le repo), utilise le script `seed_db.py` pour les insérer dans la base :

1. Définis la variable d'environnement `DATABASE_URL` (Neon) :

```powershell
$env:DATABASE_URL="postgresql://user:password@host/dbname"
```

2. Lance le script :

```powershell
python seed_db.py
```

Le script va lire `questions.json` et insérer chaque question dans la table `questions`.

---

## 📁 Structure des fichiers

```
party-game/
├── main.py                 # Backend FastAPI avec API REST
├── seed_db.py              # Script pour importer questions.json vers la DB
├── questions.json          # (Optionnel) Fichier JSON source pour l'import
├── requirements.txt        # Dépendances Python
└── static/
    ├── index.html          # Interface avec formulaire de questions
    ├── script.js           # Logique client + gestion questions
    ├── style.css           # Styles (incluant formulaire)
    └── assets/
        └── *.jpg           # Images locales (exemples)
```

---

## 🔌 API Endpoints

### `POST /api/questions`
Ajouter une nouvelle question
```json
{
  "image": "https://res.cloudinary.com/.../abc.jpg",
  "question": "Votre question ?",
  "answer": "La réponse"
}
```

### `GET /api/questions`
Récupérer toutes les questions

### `DELETE /api/questions/{id}`
Supprimer une question spécifique

### `DELETE /api/questions`
Supprimer toutes les questions (reset)

---

## 🚀 Déploiement sur Railway / Render

1. Pousse ton code sur GitHub
2. Connecte ton repo à Railway/Render
3. Ajoute les variables d'environnement :

```
DATABASE_URL=postgresql://user:password@host/dbname
CLOUDINARY_URL=cloudinary://<key>@<cloud_name>
```

4. Build command : `pip install -r requirements.txt`
5. Start command : `uvicorn main:app --host 0.0.0.0 --port $PORT`

Ton application utilisera Neon pour stocker les questions de manière persistante.

---

## 🎯 Améliorations futures

- Timeout de déconnexion pour joueurs inactifs
- Authentification pour protéger l'ajout/suppression des questions
- Interface d'administration pour gérer les questions


Bon jeu ! 🎉
