// Générer un ID unique pour le joueur
const playerId = 'player_' + Math.random().toString(36).substr(2, 9);

// Connexion WebSocket
let ws;
let isConnected = false;

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
            break;

        case 'leaderboard_update':
            updateLeaderboard(message.leaderboard);
            break;

        case 'answer_result':
            showFeedback(message.correct, message.message);
            break;

        default:
            console.log('Message non géré:', message);
    }
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
    const playerName = prompt('Entrez votre nom:', `Joueur ${Math.floor(Math.random() * 1000)}`);
    if (playerName) {
        // Envoyer le nom au serveur (à implémenter côté backend)
        setTimeout(() => {
            if (isConnected) {
                ws.send(JSON.stringify({
                    type: 'set_name',
                    name: playerName
                }));
            }
        }, 1000);
    }
});