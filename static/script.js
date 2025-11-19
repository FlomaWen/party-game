// Générer un ID unique pour le joueur
const playerId = 'player_' + Math.random().toString(36).substr(2, 9);

// Connexion WebSocket
let ws;
let isConnected = false;
let timerInterval = null;
let timeLeft = 10;
let canAnswer = true;
let isReady = false;
let gameStarted = false;
let playerName = null;
let isAdmin = false;

// Système de détection d'inactivité
let inactivityTimer = null;
let lastActivityTime = Date.now();
const INACTIVITY_TIMEOUT = 2 * 60 * 1000; // 2 minutes en millisecondes
let isTabVisible = true;

// Fonction pour détecter l'activité
function resetInactivityTimer() {
    lastActivityTime = Date.now();

    // Annuler l'ancien timer
    if (inactivityTimer) {
        clearTimeout(inactivityTimer);
    }

    // Créer un nouveau timer
    inactivityTimer = setTimeout(() => {
        if (!isTabVisible) {
            console.log('Inactivité détectée - Déconnexion...');
            disconnectDueToInactivity();
        }
    }, INACTIVITY_TIMEOUT);
}

// Fonction pour gérer la déconnexion par inactivité
function disconnectDueToInactivity() {
    if (ws && ws.readyState === WebSocket.OPEN) {
        // Informer le serveur de la déconnexion
        ws.send(JSON.stringify({
            type: 'disconnect_inactive',
            reason: 'Inactivité'
        }));

        // Fermer la connexion
        ws.close();

        // Afficher un message
        alert('Vous avez été déconnecté pour inactivité. Rafraîchissez la page pour rejoindre.');
    }
}

// Détection de la visibilité de l'onglet
document.addEventListener('visibilitychange', () => {
    if (document.hidden) {
        // Onglet caché
        isTabVisible = false;
        console.log('Onglet inactif - Timer d\'inactivité activé');
        resetInactivityTimer();
    } else {
        // Onglet visible
        isTabVisible = true;
        console.log('Onglet actif - Timer d\'inactivité réinitialisé');
        resetInactivityTimer();
    }
});

// Détecter l'activité de l'utilisateur (mouvements, clics, touches)
document.addEventListener('mousemove', resetInactivityTimer);
document.addEventListener('mousedown', resetInactivityTimer);
document.addEventListener('keypress', resetInactivityTimer);
document.addEventListener('touchstart', resetInactivityTimer);
document.addEventListener('scroll', resetInactivityTimer);

// Fonction pour vérifier si l'utilisateur est admin
function checkAdminStatus() {
    const adminCode = localStorage.getItem('adminCode');
    return adminCode === 'kiki';
}

// Fonction pour sauvegarder le statut admin
function setAdminStatus(code) {
    if (code === 'kiki') {
        localStorage.setItem('adminCode', code);
        isAdmin = true;
        return true;
    }
    return false;
}

// Fonction pour révoquer le statut admin
function revokeAdminStatus() {
    localStorage.removeItem('adminCode');
    isAdmin = false;
}

// Fonction pour sauvegarder le nom dans localStorage
function savePlayerName(name) {
    localStorage.setItem('playerName', name);
    playerName = name;
    updatePlayerNameDisplay();
}

// Fonction pour récupérer le nom depuis localStorage
function getPlayerName() {
    return localStorage.getItem('playerName');
}

// Fonction pour effacer le nom du localStorage
function clearPlayerName() {
    localStorage.removeItem('playerName');
    playerName = null;
    updatePlayerNameDisplay();
}

// Fonction pour mettre à jour l'affichage du nom
function updatePlayerNameDisplay() {
    const display = document.getElementById('player-name-display');
    if (display && playerName) {
        display.textContent = `👤 ${playerName}`;
    }
}

function connect() {
    // Auto-détecte si on est en local (ws://) ou en prod (wss://)
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const wsUrl = `${protocol}//${window.location.host}/ws/${playerId}`;
    ws = new WebSocket(wsUrl);

    ws.onopen = () => {
        console.log('Connecté au serveur');
        isConnected = true;
        updateConnectionStatus(true);

        // Démarrer le timer d'inactivité
        resetInactivityTimer();
    };

    ws.onmessage = (event) => {
        const message = JSON.parse(event.data);
        handleMessage(message);
    };

    ws.onclose = () => {
        console.log('Déconnecté du serveur');
        isConnected = false;
        updateConnectionStatus(false);

        // Arrêter le timer d'inactivité
        if (inactivityTimer) {
            clearTimeout(inactivityTimer);
            inactivityTimer = null;
        }

        // Reconnecter après 3 secondes
        setTimeout(connect, 3000);
    };

    ws.onerror = (error) => {
        console.error('Erreur WebSocket:', error);
    };
}

// Gestion des messages du serveur
function handleMessage(message) {
    switch (message.type) {
        case 'ready_status':
            updateReadyStatus(message.ready_count, message.total_count, message.players);
            if (message.total_questions) {
                document.getElementById('total-questions').textContent = message.total_questions;
            }
            break;

        case 'game_start':
            startGame(message.total_questions);
            break;

        case 'question':
            displayQuestion(message.data, message.question_number, message.total_questions);
            startTimer(10);
            canAnswer = true;
            // Réactiver l'input pour la nouvelle question
            document.getElementById('answer-input').disabled = false;
            document.getElementById('submit-btn').disabled = false;
            document.getElementById('answer-input').focus();
            // Cacher le bouton prêt et la liste des joueurs pendant la question
            document.getElementById('ready-container').classList.add('hidden');
            document.getElementById('players-status-container').classList.add('hidden');
            break;

        case 'leaderboard_update':
            updateLeaderboard(message.leaderboard);
            break;

        case 'answer_result':
            if (message.correct) {
                // Bonne réponse - bloquer les nouvelles tentatives
                showFeedback(true, message.message);
                canAnswer = false;
                // Désactiver temporairement l'input
                document.getElementById('answer-input').disabled = true;
                document.getElementById('submit-btn').disabled = true;
            } else {
                // Mauvaise réponse - permettre de réessayer
                showFeedback(false, message.message);
                // L'input reste actif pour réessayer
            }
            break;

        case 'reveal_answer':
            revealAnswer(message.answer);
            break;

        case 'waiting_next_question':
            // Phase d'attente entre les questions
            showWaitingPhase(message.message);
            break;

        case 'winner':
            showWinner(message.player_name, message.score);
            break;

        case 'game_over':
            showGameOver(message.message, message.winner);
            break;

        case 'game_reset':
            // Le jeu a été reset - recharger la page
            console.log('Jeu réinitialisé par le serveur');
            location.reload();
            break;

        default:
            console.log('Message non géré:', message);
    }
}

// Démarrer le timer
function startTimer(seconds) {
    timeLeft = seconds;
    const timerElement = document.getElementById('timer');

    // Arrêter l'ancien timer si existant
    if (timerInterval) {
        clearInterval(timerInterval);
    }

    // Mettre à jour immédiatement
    updateTimerDisplay();

    // Démarrer le nouveau timer
    timerInterval = setInterval(() => {
        timeLeft--;
        updateTimerDisplay();

        if (timeLeft <= 0) {
            clearInterval(timerInterval);
        }
    }, 1000);
}

// Mettre à jour l'affichage du timer
function updateTimerDisplay() {
    const timerElement = document.getElementById('timer');
    timerElement.textContent = timeLeft;

    // Changer la couleur selon le temps restant
    timerElement.className = 'timer';
    if (timeLeft <= 3) {
        timerElement.classList.add('danger');
    } else if (timeLeft <= 5) {
        timerElement.classList.add('warning');
    }
}

// Révéler la réponse
function revealAnswer(answer) {
    const feedback = document.getElementById('feedback');
    feedback.textContent = `La réponse était : ${answer}`;
    feedback.className = 'feedback';
    feedback.style.background = '#2196F3';
    feedback.style.display = 'block';

    // Cacher après 2 secondes (le backend gère le passage à la question suivante)
    setTimeout(() => {
        feedback.style.display = 'none';
    }, 2000);

    canAnswer = false;
}

// Afficher la phase d'attente entre les questions
function showWaitingPhase(message) {
    // Réinitialiser l'état "prêt"
    isReady = false;

    // Afficher le conteneur avec le bouton prêt
    const readyContainer = document.getElementById('ready-container');
    readyContainer.classList.remove('hidden');

    // Afficher la liste des joueurs
    document.getElementById('players-status-container').classList.remove('hidden');

    // Réinitialiser le bouton prêt
    const readyBtn = document.getElementById('ready-btn');
    readyBtn.classList.remove('clicked');
    readyBtn.textContent = 'Prêt pour la suite ! 🎮';
    readyBtn.disabled = false;

    // Afficher un message
    showFeedback(true, message);

    // Afficher la modal de prêt
    showReadyModal();
}

// Mettre à jour le statut "Prêt"
function updateReadyStatus(readyCount, totalCount, players) {
    const readyStatus = document.getElementById('ready-status');
    const readyCountSpan = document.getElementById('ready-count');

    readyCountSpan.textContent = `${readyCount}/${totalCount}`;

    if (readyCount === totalCount && totalCount > 0) {
        readyStatus.textContent = 'Tous les joueurs sont prêts ! Démarrage... ';
        readyStatus.appendChild(readyCountSpan);
    } else {
        readyStatus.textContent = 'En attente des joueurs... ';
        readyStatus.appendChild(readyCountSpan);
        readyStatus.innerHTML += ' prêts';
    }

    // Mettre à jour la liste des joueurs si fournie
    if (players) {
        updatePlayersStatusList(players);
    }
}

// Mettre à jour la liste des joueurs avec leur statut
function updatePlayersStatusList(players) {
    const playersList = document.getElementById('players-status-list');
    playersList.innerHTML = '';

    players.forEach(player => {
        const playerItem = document.createElement('div');
        playerItem.className = `player-status-item ${player.ready ? 'ready' : 'not-ready'}`;

        playerItem.innerHTML = `
            <span class="player-status-name">${player.name}</span>
            <div class="player-status-indicator">
                <span class="status-dot-indicator ${player.ready ? 'ready' : 'not-ready'}"></span>
                <span>${player.ready ? '✓ Prêt' : '⏳ En attente'}</span>
            </div>
        `;

        playersList.appendChild(playerItem);
    });
}

// Démarrer le jeu
function startGame(totalQuestions) {
    gameStarted = true;

    // Cacher le bouton prêt et le formulaire d'ajout de questions
    document.getElementById('ready-container').classList.add('hidden');
    document.getElementById('add-question-container').classList.add('hidden');

    // Afficher la zone de jeu
    document.getElementById('game-area').classList.remove('hidden');

    // Afficher le compteur de questions
    document.getElementById('question-counter').classList.remove('hidden');
    document.getElementById('ready-status').classList.add('hidden');

    // Cacher la liste des joueurs pendant le jeu
    document.getElementById('players-status-container').classList.add('hidden');

    // Mettre à jour le nombre total de questions
    document.getElementById('total-questions').textContent = totalQuestions;
}

// Afficher une question
function displayQuestion(question, questionNumber, totalQuestions) {
    const questionImage = document.getElementById('question-image');
    const questionText = document.getElementById('question-text');
    const currentQuestionSpan = document.getElementById('current-question');

    if (question.image) {
        // Vérifier si c'est une URL complète (http:// ou https://) ou un fichier local
        if (question.image.startsWith('http://') || question.image.startsWith('https://')) {
            questionImage.src = question.image;
        } else {
            questionImage.src = `/static/assets/${question.image}`;
        }
    }

    if (question.question) {
        questionText.textContent = question.question;
    }

    // Mettre à jour le compteur
    if (questionNumber && totalQuestions) {
        currentQuestionSpan.textContent = questionNumber;
        document.getElementById('total-questions').textContent = totalQuestions;
    }
}

// Afficher le gagnant
function showWinner(playerName, score) {
    const feedback = document.getElementById('feedback');
    feedback.textContent = `🏆 ${playerName} a gagné avec ${score} points ! 🏆`;
    feedback.className = 'feedback';
    feedback.style.background = '#FFD700';
    feedback.style.color = '#000';
    feedback.style.display = 'block';
    feedback.style.fontSize = '2.5rem';

    // Arrêter le timer
    if (timerInterval) {
        clearInterval(timerInterval);
    }

    // Désactiver l'input
    document.getElementById('answer-input').disabled = true;
    document.getElementById('submit-btn').disabled = true;

    // Ajouter un message pour refresh
    setTimeout(() => {
        feedback.innerHTML += '<br><small style="font-size: 1.2rem;">Rafraîchissez la page pour rejouer</small>';
    }, 2000);

    // Marquer que le jeu est terminé
    localStorage.setItem('gameEnded', 'true');

    // Afficher le modal de redémarrage au lieu de réinitialiser automatiquement
    showRestartModal();
}

// Afficher fin de jeu
function showGameOver(message, winner) {
    const feedback = document.getElementById('feedback');

    if (winner) {
        feedback.textContent = `🎉 ${winner.name} gagne avec ${winner.score} points ! 🎉`;
        feedback.style.background = '#FFD700';
        feedback.style.color = '#000';
    } else {
        feedback.textContent = message;
        feedback.style.background = '#4caf50';
    }

    feedback.className = 'feedback';
    feedback.style.display = 'block';
    feedback.style.fontSize = '2.5rem';

    // Arrêter le timer
    if (timerInterval) {
        clearInterval(timerInterval);
    }

    // Désactiver l'input
    document.getElementById('answer-input').disabled = true;
    document.getElementById('submit-btn').disabled = true;

    // Ajouter un message pour refresh
    setTimeout(() => {
        feedback.innerHTML += '<br><small style="font-size: 1.2rem;">Rafraîchissez la page pour rejouer</small>';
    }, 2000);

    // Marquer que le jeu est terminé
    localStorage.setItem('gameEnded', 'true');

    // Afficher le modal de redémarrage au lieu de réinitialiser automatiquement
    showRestartModal();
}

// Mettre à jour le leaderboard
function updateLeaderboard(leaderboard) {
    const leaderboardList = document.getElementById('leaderboard-list');
    leaderboardList.innerHTML = '';

    leaderboard.forEach((player, index) => {
        const item = document.createElement('div');
        item.className = 'leaderboard-item';

        // Ajouter des classes spéciales pour le podium
        if (index === 0) item.classList.add('first');
        else if (index === 1) item.classList.add('second');
        else if (index === 2) item.classList.add('third');

        item.innerHTML = `
            <span>
                <span class="player-rank">${index + 1}.</span>
                ${player.name}
            </span>
            <span class="player-score">${player.score} pts</span>
        `;

        leaderboardList.appendChild(item);
    });
}

// Afficher le feedback
function showFeedback(isCorrect, message) {
    const feedback = document.getElementById('feedback');
    feedback.textContent = message;
    feedback.className = 'feedback';
    feedback.classList.add(isCorrect ? 'correct' : 'incorrect');

    // Cacher après 2 secondes
    setTimeout(() => {
        feedback.classList.add('hidden');
    }, 2000);
}

// Mettre à jour le status de connexion
function updateConnectionStatus(connected) {
    const statusDot = document.querySelector('.status-dot');
    const statusText = document.getElementById('status-text');

    if (connected) {
        statusDot.classList.add('connected');
        statusText.textContent = 'Connecté';
    } else {
        statusDot.classList.remove('connected');
        statusText.textContent = 'Déconnecté';
    }
}

// Envoyer une réponse
function submitAnswer() {
    const input = document.getElementById('answer-input');
    const answer = input.value.trim();

    if (!answer) {
        alert('Veuillez entrer une réponse !');
        return;
    }

    if (!isConnected) {
        alert('Vous n\'êtes pas connecté au serveur !');
        return;
    }

    // Envoyer la réponse au serveur avec le temps restant
    ws.send(JSON.stringify({
        type: 'answer',
        answer: answer,
        time_left: timeLeft
    }));

    // Vider le champ pour permettre une nouvelle tentative
    input.value = '';
}

// Event listeners
document.addEventListener('DOMContentLoaded', () => {
    // Vérifier si le jeu était terminé avant le refresh
    if (localStorage.getItem('gameEnded') === 'true') {
        console.log('Jeu terminé détecté - Reset du jeu');
        // Nettoyer le flag
        localStorage.removeItem('gameEnded');
        // Le serveur se reset automatiquement à la reconnexion
    }

    // Vérifier le statut admin au chargement
    isAdmin = checkAdminStatus();
    updateAdminButtonState();

    // Connexion au serveur
    connect();

    // Charger les questions existantes
    loadQuestions();

    // Afficher le nom du fichier sélectionné
    const fileInput = document.getElementById('form-question-image');
    const fileNameDisplay = document.getElementById('file-name');

    if (fileInput && fileNameDisplay) {
        fileInput.addEventListener('change', (e) => {
            const file = e.target.files[0];
            if (file) {
                fileNameDisplay.textContent = file.name;
            } else {
                fileNameDisplay.textContent = 'Aucun fichier sélectionné';
            }
        });
    }


    // Bouton "Ajouter question"
    const addQuestionBtn = document.getElementById('add-question-btn');
    addQuestionBtn.addEventListener('click', addQuestion);

    // Permettre d'ajouter avec Enter sur les champs texte uniquement
    document.getElementById('form-question-text').addEventListener('keypress', (e) => {
        if (e.key === 'Enter') addQuestion();
    });
    document.getElementById('form-question-answer').addEventListener('keypress', (e) => {
        if (e.key === 'Enter') addQuestion();
    });

    // Bouton "Afficher questions (Admin)"
    const adminToggleBtn = document.getElementById('admin-toggle-btn');
    adminToggleBtn.addEventListener('click', toggleAdminMode);

    // Bouton "Prêt"
    const readyBtn = document.getElementById('ready-btn');
    readyBtn.addEventListener('click', () => {
        if (!isReady && isConnected) {
            isReady = true;
            readyBtn.classList.add('clicked');
            readyBtn.textContent = 'Prêt ! ✓';
            readyBtn.disabled = true;

            // Envoyer le signal "prêt" au serveur
            ws.send(JSON.stringify({
                type: 'ready'
            }));
        }
    });

    // Bouton "Changer mon nom"
    const changeNameBtn = document.getElementById('change-name-btn');
    changeNameBtn.addEventListener('click', () => {
        if (gameStarted) {
            alert('Impossible de changer de nom pendant la partie !');
            return;
        }

        const newName = prompt('Entrez votre nouveau nom:', playerName || '');
        if (newName && newName.trim() && newName.trim() !== playerName) {
            savePlayerName(newName.trim());

            // Envoyer le nouveau nom au serveur
            if (isConnected && ws.readyState === WebSocket.OPEN) {
                ws.send(JSON.stringify({
                    type: 'set_name',
                    name: playerName
                }));
                showFeedback(true, `Nom changé en "${playerName}" ✓`);
            }
        }
    });

    // Bouton de soumission
    const submitBtn = document.getElementById('submit-btn');
    submitBtn.addEventListener('click', submitAnswer);

    // Entrée avec la touche Enter
    const input = document.getElementById('answer-input');
    input.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') {
            submitAnswer();
        }
    });
});

// Demander le nom du joueur au chargement
window.addEventListener('load', () => {
    setTimeout(() => {
        // Vérifier si un nom existe déjà dans le localStorage
        const savedName = getPlayerName();

        if (savedName && savedName.trim()) {
            // Utiliser le nom sauvegardé
            playerName = savedName.trim();
            console.log('Nom récupéré du localStorage:', playerName);
            updatePlayerNameDisplay();
        } else {
            // Demander un nouveau nom
            const newName = prompt('Entrez votre nom:', `Joueur ${Math.floor(Math.random() * 1000)}`);
            if (newName && newName.trim()) {
                savePlayerName(newName.trim());
            }
        }

        // Attendre que la connexion soit établie puis envoyer le nom
        const sendName = () => {
            if (isConnected && ws.readyState === WebSocket.OPEN && playerName) {
                ws.send(JSON.stringify({
                    type: 'set_name',
                    name: playerName
                }));
                console.log('Nom envoyé:', playerName);
                updatePlayerNameDisplay();
            } else {
                // Réessayer après 500ms
                setTimeout(sendName, 500);
            }
        };
        sendName();
    }, 500); // Attendre un peu que la connexion soit établie
});

// Charger les questions existantes depuis le serveur
async function loadQuestions() {
    try {
        const response = await fetch('/api/questions');
        const questions = await response.json();

        const questionsCount = document.getElementById('questions-count');
        const questionsItems = document.getElementById('questions-items');

        questionsCount.textContent = questions.length;

        // Vérifier si l'utilisateur est admin
        if (isAdmin) {
            // Admin : afficher la liste complète avec réponses cachées
            questionsItems.innerHTML = '';
            questions.forEach(question => {
                const questionItem = document.createElement('div');
                questionItem.className = 'question-item';
                questionItem.innerHTML = `
                    <div class="question-content">
                        <span class="question-number">#${question.id}</span>
                        <span>${question.question}</span>
                        <span class="question-answer">🔒 Réponse cachée</span>
                    </div>
                    <button class="delete-question-btn" onclick="deleteQuestion(${question.id})">🗑️</button>
                `;
                questionsItems.appendChild(questionItem);
            });
        } else {
            // Joueur normal : message indiquant qu'il faut être admin
            questionsItems.innerHTML = `
                <div class="admin-message">
                    <p>🔒 Seul l'administrateur peut voir les questions</p>
                    <p class="admin-hint">Nombre total : ${questions.length} question(s)</p>
                </div>
            `;
        }
    } catch (error) {
        console.error('Erreur lors du chargement des questions:', error);
    }
}

// Ajouter une question
async function addQuestion() {
    const imageInput = document.getElementById('form-question-image');
    const textInput = document.getElementById('form-question-text');
    const answerInput = document.getElementById('form-question-answer');

    const file = imageInput.files[0];
    const question = textInput.value.trim();
    const answer = answerInput.value.trim();

    if (!file || !question || !answer) {
        alert('Veuillez remplir tous les champs et sélectionner une image !');
        return;
    }

    // Vérifier le type de fichier
    if (!file.type.match('image/(png|jpeg|jpg|gif)')) {
        alert('Veuillez sélectionner une image PNG, JPG ou GIF !');
        return;
    }

    try {
        // Désactiver le bouton pendant l'upload
        const addBtn = document.getElementById('add-question-btn');
        addBtn.disabled = true;
        addBtn.textContent = '⏳ Upload en cours...';

        // Étape 1: Upload de l'image vers Cloudinary
        const formData = new FormData();
        formData.append('file', file);

        const uploadResponse = await fetch('/api/upload-image', {
            method: 'POST',
            body: formData
        });

        if (!uploadResponse.ok) {
            throw new Error('Erreur lors de l\'upload de l\'image');
        }

        const uploadResult = await uploadResponse.json();
        // Supporter différentes formes de réponse (url, filename, secure_url)
        const imageUrl = uploadResult.url || uploadResult.filename || uploadResult.secure_url;

        // DEBUG: log upload result and resolved imageUrl
        console.log('uploadResult:', uploadResult);
        console.log('resolved imageUrl:', imageUrl);

        if (!imageUrl) {
            throw new Error('Upload OK mais aucune URL de l\'image retournée par le serveur');
        }

        // Étape 2: Créer la question avec l'URL
        const payload = { image: imageUrl, question: question, answer: answer };
        console.log('POST /api/questions payload:', payload);

        const questionResponse = await fetch('/api/questions', {
             method: 'POST',
             headers: {
                 'Content-Type': 'application/json'
             },
             body: JSON.stringify(payload)
         });

        if (questionResponse.ok) {
            // Vider les champs
            imageInput.value = '';
            textInput.value = '';
            answerInput.value = '';
            document.getElementById('file-name').textContent = 'Aucun fichier sélectionné';

            // Recharger la liste des questions
            await loadQuestions();

            // Afficher un message de succès
            showFeedback(true, 'Question ajoutée avec succès ! ✅');
        } else {
            // Lire le corps de la réponse pour obtenir les détails d'erreur envoyés par le serveur
            const text = await questionResponse.text();
            let details = text;
            try {
                details = JSON.parse(text);
            } catch (e) {
                // not JSON
            }
            console.error('POST /api/questions failed', questionResponse.status, details);
            // Afficher le message détaillé si présent
            const detailMsg = (details && (details.detail || details.message)) || JSON.stringify(details);
            showFeedback(false, `Erreur lors de l'ajout de la question ❌ (${detailMsg})`);
            // Réactiver le bouton et sortir
            addBtn.disabled = false;
            addBtn.textContent = '➕ Ajouter la question';
            return;
        }
    } catch (error) {
        console.error('Erreur lors de l\'ajout de la question:', error);
        showFeedback(false, 'Erreur lors de l\'ajout de la question ❌');
    } finally {
        // Réactiver le bouton
        const addBtn = document.getElementById('add-question-btn');
        addBtn.disabled = false;
        addBtn.textContent = '➕ Ajouter la question';
    }
}

// Supprimer une question
async function deleteQuestion(questionId) {
    if (!isAdmin) {
        alert('Seul l\'administrateur peut supprimer des questions !');
        return;
    }

    if (!confirm('Voulez-vous vraiment supprimer cette question ?')) {
        return;
    }

    try {
        const response = await fetch(`/api/questions/${questionId}`, {
            method: 'DELETE'
        });

        if (response.ok) {
            // Recharger la liste des questions
            await loadQuestions();
            showFeedback(true, 'Question supprimée ! 🗑️');
        } else {
            throw new Error('Erreur lors de la suppression');
        }
    } catch (error) {
        console.error('Erreur lors de la suppression de la question:', error);
        showFeedback(false, 'Erreur lors de la suppression ❌');
    }
}

// Basculer le mode admin
function toggleAdminMode() {
    if (isAdmin) {
        // Déjà admin, demander si on veut se déconnecter
        if (confirm('Voulez-vous quitter le mode administrateur ?')) {
            revokeAdminStatus();
            updateAdminButtonState();
            loadQuestions();
            showFeedback(true, 'Mode administrateur désactivé');
        }
    } else {
        // Demander le code admin
        const code = prompt('Entrez le code administrateur :');
        if (code) {
            if (setAdminStatus(code)) {
                updateAdminButtonState();
                loadQuestions();
                showFeedback(true, 'Mode administrateur activé ! ✅');
            } else {
                showFeedback(false, 'Code incorrect ! ❌');
            }
        }
    }
}

// Mettre à jour l'état du bouton admin
function updateAdminButtonState() {
    const adminBtn = document.getElementById('admin-toggle-btn');
    if (isAdmin) {
        adminBtn.textContent = '✓ Mode Admin actif';
        adminBtn.classList.add('admin-active');
    } else {
        adminBtn.textContent = '🔐 Afficher questions (Admin)';
        adminBtn.classList.remove('admin-active');
    }
}

// Réinitialise l'état client comme si on venait d'arriver sur la page
function resetToInitialState() {
    console.log('Reset client: clearing local state and reloading page');

    // Fermer la WebSocket proprement
    try {
        if (ws) {
            try { ws.close(); } catch (e) { console.warn('ws close error', e); }
            ws = null;
        }
    } catch (e) {
        console.warn('Error closing websocket during reset', e);
    }

    // Effacer les données locales liées au joueur
    localStorage.removeItem('playerName');
    localStorage.removeItem('adminCode');
    localStorage.removeItem('gameEnded');

    // Réinitialiser variables en mémoire (sécuritaire)
    playerName = null;
    isAdmin = false;
    isReady = false;
    gameStarted = false;
    canAnswer = true;

    // Recharger la page pour repartir à zéro (le code au chargement demandera le nom)
    setTimeout(() => {
        location.reload();
    }, 250);
}

// Modal handling
function showRestartModal() {
    const modal = document.getElementById('restart-modal');
    if (!modal) return;
    modal.style.display = 'flex';
    modal.setAttribute('aria-hidden', 'false');
}

function hideRestartModal() {
    const modal = document.getElementById('restart-modal');
    if (!modal) return;
    modal.style.display = 'none';
    modal.setAttribute('aria-hidden', 'true');
}

// Wire modal buttons
document.addEventListener('DOMContentLoaded', () => {
    const confirmBtn = document.getElementById('restart-confirm');
    const cancelBtn = document.getElementById('restart-cancel');

    if (confirmBtn) {
        confirmBtn.addEventListener('click', () => {
            hideRestartModal();
            resetToInitialState();
        });
    }
    if (cancelBtn) {
        cancelBtn.addEventListener('click', () => {
            hideRestartModal();
            // Keep user on the page; allow them to review leaderboard
        });
    }
});

// Ready modal handling
function showReadyModal() {
    const modal = document.getElementById('ready-modal');
    if (!modal) return;
    modal.style.display = 'flex';
    modal.setAttribute('aria-hidden', 'false');
}

function hideReadyModal() {
    const modal = document.getElementById('ready-modal');
    if (!modal) return;
    modal.style.display = 'none';
    modal.setAttribute('aria-hidden', 'true');
}

// wire ready modal buttons
document.addEventListener('DOMContentLoaded', () => {
    const readyConfirm = document.getElementById('ready-confirm');
    const readyCancel = document.getElementById('ready-cancel');
    if (readyConfirm) {
        readyConfirm.addEventListener('click', () => {
            hideReadyModal();
            // set ready and send ws message
            if (!isReady && isConnected && ws && ws.readyState === WebSocket.OPEN) {
                isReady = true;
                const readyBtn = document.getElementById('ready-btn');
                if (readyBtn) { readyBtn.classList.add('clicked'); readyBtn.textContent = 'Prêt ! ✓'; readyBtn.disabled = true; }
                ws.send(JSON.stringify({ type: 'ready' }));
            }
        });
    }
    if (readyCancel) {
        readyCancel.addEventListener('click', () => {
            hideReadyModal();
        });
    }

    // override ready button behaviour to open modal
    const readyBtn = document.getElementById('ready-btn');
    if (readyBtn) {
        readyBtn.addEventListener('click', (e) => {
            // if already clicked, do nothing
            if (isReady) return;
            showReadyModal();
        });
    }
});
