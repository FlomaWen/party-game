# ⏱️ Système de Déconnexion par Inactivité

## ✅ Fonctionnalité Implémentée

Les joueurs sont maintenant **automatiquement déconnectés** après **2 minutes d'inactivité** sur l'onglet.

---

## 🎯 Comment Ça Marche

### Détection d'Inactivité
Le système surveille :
1. **Visibilité de l'onglet** : Si l'onglet est en arrière-plan
2. **Activité utilisateur** : Mouvements de souris, clics, touches clavier, scroll, touch

### Timer d'Inactivité
```javascript
const INACTIVITY_TIMEOUT = 2 * 60 * 1000; // 2 minutes
```

---

## 📊 Scénarios

### ✅ Onglet Actif
```
Utilisateur sur l'onglet
→ Activité détectée constamment
→ Timer réinitialisé en permanence
→ Pas de déconnexion
```

### ⚠️ Onglet en Arrière-Plan
```
Utilisateur change d'onglet
→ Timer de 2 minutes démarre
→ Après 2 minutes : DÉCONNEXION
→ Message : "Vous avez été déconnecté pour inactivité"
```

### ⏱️ Retour Avant Timer
```
Utilisateur revient avant 2 minutes
→ Onglet redevient visible
→ Timer réinitialisé
→ Pas de déconnexion
```

---

## 🔧 Détails Techniques

### Événements Surveillés

#### Visibilité de l'Onglet
```javascript
document.addEventListener('visibilitychange', () => {
    if (document.hidden) {
        // Onglet caché → Démarrer timer
        isTabVisible = false;
        resetInactivityTimer();
    } else {
        // Onglet visible → Réinitialiser timer
        isTabVisible = true;
        resetInactivityTimer();
    }
});
```

#### Activités Utilisateur
```javascript
document.addEventListener('mousemove', resetInactivityTimer);
document.addEventListener('mousedown', resetInactivityTimer);
document.addEventListener('keypress', resetInactivityTimer);
document.addEventListener('touchstart', resetInactivityTimer); // Mobile
document.addEventListener('scroll', resetInactivityTimer);
```

### Fonction de Déconnexion
```javascript
function disconnectDueToInactivity() {
    if (ws && ws.readyState === WebSocket.OPEN) {
        // 1. Informer le serveur
        ws.send(JSON.stringify({
            type: 'disconnect_inactive',
            reason: 'Inactivité'
        }));
        
        // 2. Fermer la connexion WebSocket
        ws.close();
        
        // 3. Informer l'utilisateur
        alert('Vous avez été déconnecté pour inactivité. Rafraîchissez la page pour rejoindre.');
    }
}
```

---

## 🎮 Impact sur le Jeu

### Pendant l'Attente (Lobby)
- Joueur inactif → Déconnecté après 2 min
- Compteur de joueurs prêts s'actualise : `3/4` → `3/3`
- Autres joueurs peuvent continuer

### Pendant une Question
- Joueur inactif → Déconnecté après 2 min
- Ne peut plus répondre
- Jeu continue pour les autres

### Après une Question (Phase "Prêt")
- Joueur inactif → Déconnecté après 2 min
- Ne bloque plus les autres joueurs
- Jeu peut continuer sans lui

---

## ⚙️ Configuration

### Modifier le Délai d'Inactivité

Dans `script.js` :
```javascript
// Actuellement : 2 minutes
const INACTIVITY_TIMEOUT = 2 * 60 * 1000;

// Pour changer :
const INACTIVITY_TIMEOUT = 5 * 60 * 1000;  // 5 minutes
const INACTIVITY_TIMEOUT = 1 * 60 * 1000;  // 1 minute
const INACTIVITY_TIMEOUT = 30 * 1000;      // 30 secondes (debug)
```

### Désactiver la Fonctionnalité

Pour désactiver complètement :
```javascript
// Commenter ces lignes :
// document.addEventListener('visibilitychange', ...);
// resetInactivityTimer();
```

---

## 🧪 Tests

### Test 1 : Inactivité Simple
1. Ouvrir le jeu
2. Se connecter
3. Changer d'onglet (aller sur YouTube, etc.)
4. Attendre 2 minutes
5. ✅ Message de déconnexion devrait apparaître

### Test 2 : Retour Actif
1. Ouvrir le jeu
2. Changer d'onglet pendant 1 minute
3. Revenir sur l'onglet du jeu
4. Attendre encore 1 minute
5. ✅ Pas de déconnexion (timer réinitialisé)

### Test 3 : Activité Continue
1. Ouvrir le jeu
2. Bouger la souris régulièrement
3. ✅ Jamais déconnecté

### Test 4 : Plusieurs Joueurs
1. Ouvrir 3 onglets (3 joueurs)
2. Un joueur change d'onglet 2 minutes
3. ✅ Seul ce joueur est déconnecté
4. ✅ Les autres voient le compteur s'actualiser

---

## 💡 Avantages

### ✅ Évite les Blocages
Un joueur AFK ne bloque plus les autres dans la phase "Prêt"

### ✅ Libère les Slots
Les slots de joueurs sont libérés pour d'autres

### ✅ Maintient le Rythme
Le jeu reste fluide sans attendre des joueurs absents

### ✅ Compatibilité Mobile
Fonctionne aussi avec les événements touch sur mobile

---

## 📱 Comportement Mobile

Sur mobile, le système détecte :
- Changement d'application
- Verrouillage de l'écran
- Inactivité tactile

---

## 🔍 Console Debug

Pour voir les logs d'inactivité, ouvrez la console (F12) :

```
✅ "Onglet actif - Timer d'inactivité réinitialisé"
⏱️ "Onglet inactif - Timer d'inactivité activé"
🔴 "Inactivité détectée - Déconnexion..."
```

---

## ⚠️ Messages Utilisateur

### Message de Déconnexion
```
"Vous avez été déconnecté pour inactivité. 
Rafraîchissez la page pour rejoindre."
```

### Pour Rejoindre
1. Cliquer OK sur l'alerte
2. Appuyer sur F5 (ou Ctrl+R)
3. Le jeu se reconnecte automatiquement
4. Nom sauvegardé dans localStorage

---

## 🎯 Recommandations

### Pour les Joueurs
- Restez sur l'onglet du jeu
- Si vous devez partir > 2 min, prévenez les autres
- Pour rejoindre : rafraîchir la page

### Pour l'Admin
- Vous pouvez ajuster le délai dans le code
- 2 minutes est un bon compromis
- Trop court (30s) = frustrant
- Trop long (10min) = joueurs bloqués longtemps

---

## 📊 Statistiques

| Délai | Avantages | Inconvénients |
|-------|-----------|---------------|
| **30s** | Très réactif | Trop strict |
| **1 min** | Rapide | Peut frustrer |
| **2 min** ✅ | Équilibré | Recommandé |
| **5 min** | Tolérant | Bloque trop longtemps |
| **10 min** | Très tolérant | Pratiquement inutile |

---

## 🔄 Reconnexion Automatique

Après déconnexion :
1. Le WebSocket se ferme
2. Le système tente de reconnecter après 3 secondes
3. Si la page est toujours ouverte, reconnexion auto
4. Sinon, l'utilisateur doit rafraîchir

---

## ✅ Checklist de Fonctionnement

- [x] Détection visibilité onglet
- [x] Timer de 2 minutes
- [x] Détection activité souris
- [x] Détection activité clavier
- [x] Détection touch (mobile)
- [x] Détection scroll
- [x] Réinitialisation automatique du timer
- [x] Message d'alerte utilisateur
- [x] Fermeture propre du WebSocket
- [x] Nettoyage du timer à la déconnexion
- [x] Compatible tous navigateurs modernes

---

**Date** : 2025-01-18
**Version** : 7.0 - Auto-déconnexion
**Délai** : 2 minutes d'inactivité
**Statut** : ✅ Fonctionnel et testé

