# Party Game - Guide d'utilisation

## 🎮 Ajout de Questions

Les joueurs peuvent maintenant ajouter leurs propres questions avant de commencer la partie !

### Comment ça marche ?

1. **Avant le jeu** : Sur la page d'accueil, vous verrez un formulaire pour ajouter des questions
2. **Remplissez les champs** :
   - **Nom du fichier image** : Le nom de l'image à afficher (ex: `tahiti-bob.jpg`)
   - **Votre question** : La question à poser aux joueurs
   - **La réponse** : La réponse correcte attendue
3. **Cliquez sur "➕ Ajouter la question"**
4. **La question apparaît dans la liste** en dessous avec un compteur
5. **Vous pouvez supprimer** une question en cliquant sur l'icône 🗑️

### Stockage des questions

- Les questions sont stockées dans le fichier `questions.json` sur le serveur
- Ce fichier est sauvegardé automatiquement à chaque ajout/suppression
- Sur Render (hébergement gratuit), ce fichier persiste tant que le serveur est en marche
- **Important** : Sur Render Free, le serveur redémarre après 15 minutes d'inactivité et les questions sont perdues. Pour une persistance permanente, utilisez une base de données.

### Démarrage du jeu

1. Tous les joueurs se connectent
2. Les joueurs ajoutent leurs questions (optionnel)
3. Chaque joueur clique sur "Je suis prêt ! 🎮"
4. Quand tous les joueurs sont prêts, le jeu démarre automatiquement
5. **Si aucune question n'a été ajoutée**, un message d'erreur apparaît et vous devez ajouter au moins une question

## 📁 Structure des fichiers

```
party-game/
├── main.py                 # Backend FastAPI avec API REST
├── questions.json          # Fichier JSON avec toutes les questions
├── requirements.txt        # Dépendances Python
└── static/
    ├── index.html          # Interface avec formulaire de questions
    ├── script.js           # Logique client + gestion questions
    ├── style.css           # Styles (incluant formulaire)
    └── assets/
        └── *.jpg           # Images des questions
```

## 🔌 API Endpoints

### `POST /api/questions`
Ajouter une nouvelle question
```json
{
  "image": "image.jpg",
  "question": "Votre question ?",
  "answer": "La réponse",
  "points": 10
}
```

### `GET /api/questions`
Récupérer toutes les questions

### `DELETE /api/questions/{id}`
Supprimer une question spécifique

### `DELETE /api/questions`
Supprimer toutes les questions (reset)

## 🚀 Déploiement sur Render

1. Poussez votre code sur GitHub
2. Connectez votre repo à Render
3. Les questions seront stockées dans `questions.json` sur le serveur
4. **Note** : Sur le plan gratuit, les fichiers sont effacés au redémarrage

## 💡 Améliorations futures

Pour une persistance permanente des questions :
- Utiliser une base de données (PostgreSQL, MongoDB)
- Utiliser un service de stockage cloud (AWS S3, Google Cloud Storage)
- Ajouter l'authentification des joueurs
- Permettre l'upload d'images

## 🎯 Utilisation

```bash
# Installation
pip install -r requirements.txt

# Lancement local
python main.py

# Accès
http://localhost:8000
```

Bon jeu ! 🎉

