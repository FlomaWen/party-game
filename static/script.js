// Générer un ID unique pour le joueur
const playerId = 'player_' + Math.random().toString(36).substr(2, 9);

// Connexion WebSocket
let ws;
let isConnected = false;
let timerInterval = null;
let timeLeft = 10;
let canAnswer = true;

function connect() {
    // Auto-détecte si on est en local (ws://) ou en prod (wss://)
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const wsUrl = `${protocol}//${window.location.host}/ws/${playerId}`;
    ws = new WebSocket(wsUrl);

    ws.onopen = () => {
        console.log('Connecté au serveur');
        isConnected = true;
        updateConnectionStatus(true);
    };

    ws.onmessage = (event) => {
        const message = JSON.parse(event.data);
        handleMessage(message);
    };

    ws.onclose = () => {
        console.log('Déconnecté du serveur');
        isConnected = false;
        updateConnectionStatus(false);

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
        case 'question':
            displayQuestion(message.data);
            startTimer(10);
            canAnswer = true;
            break;

        case 'leaderboard_update':
            updateLeaderboard(message.leaderboard);
            break;

        case 'answer_result':
            showFeedback(message.correct, message.message);
            canAnswer = false;
            break;

        case 'reveal_answer':
            revealAnswer(message.answer);
            break;

        case 'game_over':
            showGameOver(message.message);
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

    setTimeout(() => {
        feedback.classList.add('hidden');
    }, 3000);

    canAnswer = false;
}

// Afficher fin de jeu
function showGameOver(message) {
    const feedback = document.getElementById('feedback');
    feedback.textContent = message;
    feedback.className = 'feedback';
    feedback.style.background = '#4caf50';
    feedback.style.display = 'block';

    // Arrêter le timer
    if (timerInterval) {
        clearInterval(timerInterval);
    }

    // Désactiver l'input
    document.getElementById('answer-input').disabled = true;
    document.getElementById('submit-btn').disabled = true;
}

// Afficher une question
function displayQuestion(question) {
    const questionImage = document.getElementById('question-image');
    const questionText = document.getElementById('question-text');

    if (question.image) {
        questionImage.src = `/static/assets/${question.image}`;
    }

    if (question.question) {
        questionText.textContent = question.question;
    }
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

    if (!canAnswer) {
        alert('Vous avez déjà répondu à cette question !');
        return;
    }

    // Envoyer la réponse au serveur
    ws.send(JSON.stringify({
        type: 'answer',
        answer: answer
    }));

    // Vider le champ
    input.value = '';
}

// Event listeners
document.addEventListener('DOMContentLoaded', () => {
    // Connexion au serveur
    connect();

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

    // Focus automatique sur l'input
    input.focus();
});

// Demander le nom du joueur au chargement
window.addEventListener('load', () => {
    setTimeout(() => {
        const playerName = prompt('Entrez votre nom:', `Joueur ${Math.floor(Math.random() * 1000)}`);
        if (playerName && playerName.trim()) {
            // Attendre que la connexion soit établie
            const sendName = () => {
                if (isConnected && ws.readyState === WebSocket.OPEN) {
                    ws.send(JSON.stringify({
                        type: 'set_name',
                        name: playerName.trim()
                    }));
                    console.log('Nom envoyé:', playerName.trim());
                } else {
                    // Réessayer après 500ms
                    setTimeout(sendName, 500);
                }
            };
            sendName();
        }
    }, 500); // Attendre un peu que la connexion soit établie
});