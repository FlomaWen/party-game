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
        case 'ready_status':
            updateReadyStatus(message.ready_count, message.total_count);
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

        case 'winner':
            showWinner(message.player_name, message.score);
            break;

        case 'game_over':
            showGameOver(message.message, message.winner);
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

// Mettre à jour le statut "Prêt"
function updateReadyStatus(readyCount, totalCount) {
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
}

// Démarrer le jeu
function startGame(totalQuestions) {
    gameStarted = true;

    // Cacher le bouton prêt
    document.getElementById('ready-container').classList.add('hidden');

    // Afficher la zone de jeu
    document.getElementById('game-area').classList.remove('hidden');

    // Afficher le compteur de questions
    document.getElementById('question-counter').classList.remove('hidden');
    document.getElementById('ready-status').classList.add('hidden');

    // Mettre à jour le nombre total de questions
    document.getElementById('total-questions').textContent = totalQuestions;
}

// Afficher une question
function displayQuestion(question, questionNumber, totalQuestions) {
    const questionImage = document.getElementById('question-image');
    const questionText = document.getElementById('question-text');
    const currentQuestionSpan = document.getElementById('current-question');

    if (question.image) {
        questionImage.src = `/static/assets/${question.image}`;
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

    // Envoyer la réponse au serveur avec le temps restant
    ws.send(JSON.stringify({
        type: 'answer',
        answer: answer,
        time_left: timeLeft
    }));

    // Vider le champ
    input.value = '';
}

// Event listeners
document.addEventListener('DOMContentLoaded', () => {
    // Connexion au serveur
    connect();

    // Charger les questions existantes
    loadQuestions();

    // Afficher le nom du fichier sélectionné
    const fileInput = document.getElementById('form-question-image');
    const fileNameDisplay = document.getElementById('file-name');

    fileInput.addEventListener('change', (e) => {
        const file = e.target.files[0];
        if (file) {
            fileNameDisplay.textContent = file.name;
        } else {
            fileNameDisplay.textContent = 'Aucun fichier sélectionné';
        }
    });

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

// Charger les questions existantes depuis le serveur
async function loadQuestions() {
    try {
        const response = await fetch('/api/questions');
        const questions = await response.json();

        const questionsCount = document.getElementById('questions-count');
        const questionsItems = document.getElementById('questions-items');

        questionsCount.textContent = questions.length;
        questionsItems.innerHTML = '';

        questions.forEach(question => {
            const questionItem = document.createElement('div');
            questionItem.className = 'question-item';
            questionItem.innerHTML = `
                <div class="question-content">
                    <span class="question-number">#${question.id}</span>
                    <span>${question.question}</span>
                    <span class="question-answer">(Réponse: ${question.answer})</span>
                </div>
                <button class="delete-question-btn" onclick="deleteQuestion(${question.id})">🗑️</button>
            `;
            questionsItems.appendChild(questionItem);
        });
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
    if (!file.type.match('image/(png|jpeg|jpg)')) {
        alert('Veuillez sélectionner une image PNG ou JPG !');
        return;
    }

    try {
        // Désactiver le bouton pendant l'upload
        const addBtn = document.getElementById('add-question-btn');
        addBtn.disabled = true;
        addBtn.textContent = '⏳ Upload en cours...';

        // Étape 1: Upload de l'image
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
        const imageName = uploadResult.filename;

        // Étape 2: Créer la question avec le nom de l'image
        const questionResponse = await fetch('/api/questions', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                image: imageName,
                question: question,
                answer: answer,
                points: 10
            })
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
            throw new Error('Erreur lors de l\'ajout de la question');
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
