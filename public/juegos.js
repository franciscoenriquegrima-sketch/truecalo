// Tab switching
document.querySelectorAll('.games-tabs .tab').forEach(tab => {
  tab.addEventListener('click', () => {
    document.querySelectorAll('.games-tabs .tab').forEach(t => t.classList.remove('active'));
    tab.classList.add('active');
    const game = tab.dataset.game;
    document.getElementById('panelSnake').classList.toggle('hidden', game !== 'snake');
    document.getElementById('panelCheckers').classList.toggle('hidden', game !== 'checkers');
  });
});

// ==========================================
// 1. NOKIA SNAKE
// ==========================================
(() => {
  const canvas = document.getElementById('snakeCanvas');
  const ctx = canvas.getContext('2d');
  const scoreEl = document.getElementById('snakeScore');
  const bestEl = document.getElementById('snakeBest');
  const gridSize = 16;
  const cells = canvas.width / gridSize;

  let snake = [];
  let dir = { x: 1, y: 0 };
  let nextDir = { x: 1, y: 0 };
  let food = { x: 10, y: 10 };
  let score = 0;
  let best = Number(localStorage.getItem('truecalo_snake_best') || 0);
  let timer = null;
  let paused = false;
  let gameOver = false;

  bestEl.textContent = best;

  function spawnFood() {
    let pos;
    do {
      pos = {
        x: Math.floor(Math.random() * cells),
        y: Math.floor(Math.random() * cells)
      };
    } while (snake.some(s => s.x === pos.x && s.y === pos.y));
    food = pos;
  }

  function resetSnake() {
    snake = [
      { x: 6, y: 10 },
      { x: 5, y: 10 },
      { x: 4, y: 10 }
    ];
    dir = { x: 1, y: 0 };
    nextDir = { x: 1, y: 0 };
    score = 0;
    paused = false;
    gameOver = false;
    scoreEl.textContent = '0';
    spawnFood();
    if (timer) clearInterval(timer);
    timer = setInterval(tick, 125);
    draw();
  }

  function setDirection(name) {
    if (name === 'UP' && dir.y !== 1) nextDir = { x: 0, y: -1 };
    if (name === 'DOWN' && dir.y !== -1) nextDir = { x: 0, y: 1 };
    if (name === 'LEFT' && dir.x !== 1) nextDir = { x: -1, y: 0 };
    if (name === 'RIGHT' && dir.x !== -1) nextDir = { x: 1, y: 0 };
  }

  function tick() {
    if (paused || gameOver) return;
    dir = nextDir;
    const head = {
      x: (snake[0].x + dir.x + cells) % cells,
      y: (snake[0].y + dir.y + cells) % cells
    };

    if (snake.some(s => s.x === head.x && s.y === head.y)) {
      gameOver = true;
      clearInterval(timer);
      draw();
      return;
    }

    snake.unshift(head);
    if (head.x === food.x && head.y === food.y) {
      score += 10;
      scoreEl.textContent = score;
      if (score > best) {
        best = score;
        bestEl.textContent = best;
        localStorage.setItem('truecalo_snake_best', String(best));
      }
      spawnFood();
    } else {
      snake.pop();
    }
    draw();
  }

  function draw() {
    ctx.fillStyle = '#9bbc0f';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    // Subtle pixel grid
    ctx.strokeStyle = 'rgba(15, 56, 15, 0.08)';
    ctx.lineWidth = 1;
    for (let i = 0; i <= cells; i++) {
      ctx.beginPath();
      ctx.moveTo(i * gridSize, 0);
      ctx.lineTo(i * gridSize, canvas.height);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(0, i * gridSize);
      ctx.lineTo(canvas.width, i * gridSize);
      ctx.stroke();
    }

    // Food
    ctx.fillStyle = '#0f380f';
    ctx.fillRect(food.x * gridSize + 3, food.y * gridSize + 3, gridSize - 6, gridSize - 6);

    // Snake
    snake.forEach((seg, idx) => {
      ctx.fillStyle = idx === 0 ? '#0f380f' : '#306230';
      ctx.fillRect(seg.x * gridSize + 1, seg.y * gridSize + 1, gridSize - 2, gridSize - 2);
    });

    if (gameOver || paused) {
      ctx.fillStyle = 'rgba(15, 56, 15, 0.82)';
      ctx.fillRect(36, 120, canvas.width - 72, 76);
      ctx.fillStyle = '#9bbc0f';
      ctx.font = 'bold 20px monospace';
      ctx.textAlign = 'center';
      ctx.fillText(gameOver ? 'FIN DEL JUEGO' : 'PAUSA', canvas.width / 2, 156);
      ctx.font = '13px monospace';
      ctx.fillText(gameOver ? 'Pulsa Iniciar para reintentar' : 'Pulsa Pausa para seguir', canvas.width / 2, 178);
    }
  }

  document.addEventListener('keydown', e => {
    if (document.getElementById('panelSnake').classList.contains('hidden')) return;
    const map = {
      ArrowUp: 'UP', w: 'UP', W: 'UP',
      ArrowDown: 'DOWN', s: 'DOWN', S: 'DOWN',
      ArrowLeft: 'LEFT', a: 'LEFT', A: 'LEFT',
      ArrowRight: 'RIGHT', d: 'RIGHT', D: 'RIGHT'
    };
    if (map[e.key]) {
      e.preventDefault();
      setDirection(map[e.key]);
    }
  });

  document.querySelectorAll('.dpad-btn').forEach(btn => {
    btn.addEventListener('click', () => setDirection(btn.dataset.dir));
  });

  document.getElementById('btnSnakeStart').addEventListener('click', resetSnake);
  document.getElementById('btnSnakePause').addEventListener('click', () => {
    if (!gameOver) {
      paused = !paused;
      draw();
    }
  });

  resetSnake();
})();

// ==========================================
// 2. DAMAS (CHECKERS)
// ==========================================
(() => {
  const boardEl = document.getElementById('checkersBoard');
  const statusEl = document.getElementById('checkersStatus');
  const countsEl = document.getElementById('checkersCounts');
  const modeSel = document.getElementById('checkersMode');

  let board = [];
  let turn = 'p1'; // p1 (bottom, green) vs p2 (top, terracotta)
  let selected = null;
  let validMoves = [];
  let winner = null;

  function initBoard() {
    board = Array.from({ length: 8 }, () => Array(8).fill(null));
    for (let r = 0; r < 8; r++) {
      for (let c = 0; c < 8; c++) {
        if ((r + c) % 2 === 1) {
          if (r < 3) board[r][c] = { player: 'p2', king: false };
          if (r > 4) board[r][c] = { player: 'p1', king: false };
        }
      }
    }
    turn = 'p1';
    selected = null;
    validMoves = [];
    winner = null;
    renderBoard();
  }

  function getPieceMoves(r, c, piece) {
    const dirs = [];
    if (piece.player === 'p1' || piece.king) dirs.push([-1, -1], [-1, 1]);
    if (piece.player === 'p2' || piece.king) dirs.push([1, -1], [1, 1]);

    const moves = [];
    for (const [dr, dc] of dirs) {
      const nr = r + dr;
      const nc = c + dc;
      if (nr >= 0 && nr < 8 && nc >= 0 && nc < 8) {
        if (!board[nr][nc]) {
          moves.push({ r: nr, c: nc, capture: null });
        } else if (board[nr][nc].player !== piece.player) {
          const jr = nr + dr;
          const jc = nc + dc;
          if (jr >= 0 && jr < 8 && jc >= 0 && jc < 8 && !board[jr][jc]) {
            moves.push({ r: jr, c: jc, capture: { r: nr, c: nc } });
          }
        }
      }
    }
    return moves;
  }

  function getAllMovesForPlayer(player) {
    const all = [];
    for (let r = 0; r < 8; r++) {
      for (let c = 0; c < 8; c++) {
        const p = board[r][c];
        if (p && p.player === player) {
          getPieceMoves(r, c, p).forEach(m => all.push({ fromR: r, fromC: c, ...m }));
        }
      }
    }
    return all;
  }

  function applyMove(fromR, fromC, move) {
    const piece = board[fromR][fromC];
    board[fromR][fromC] = null;
    if (move.capture) {
      board[move.capture.r][move.capture.c] = null;
    }
    if ((piece.player === 'p1' && move.r === 0) || (piece.player === 'p2' && move.r === 7)) {
      piece.king = true;
    }
    board[move.r][move.c] = piece;
    selected = null;
    validMoves = [];

    const nextPlayer = turn === 'p1' ? 'p2' : 'p1';
    const nextMoves = getAllMovesForPlayer(nextPlayer);
    if (!nextMoves.length) {
      winner = turn;
    } else {
      turn = nextPlayer;
    }

    renderBoard();

    if (!winner && turn === 'p2' && modeSel.value === 'ai') {
      setTimeout(runAiTurn, 380);
    }
  }

  function runAiTurn() {
    if (winner || turn !== 'p2') return;
    const all = getAllMovesForPlayer('p2');
    if (!all.length) {
      winner = 'p1';
      renderBoard();
      return;
    }
    const captures = all.filter(m => m.capture);
    const pool = captures.length ? captures : all;
    const chosen = pool[Math.floor(Math.random() * pool.length)];
    applyMove(chosen.fromR, chosen.fromC, chosen);
  }

  function renderBoard() {
    let p1Count = 0;
    let p2Count = 0;
    board.forEach(row =>
      row.forEach(cell => {
        if (cell?.player === 'p1') p1Count++;
        if (cell?.player === 'p2') p2Count++;
      })
    );
    countsEl.textContent = `Verdes: ${p1Count} · Terracota: ${p2Count}`;

    if (winner) {
      statusEl.textContent =
        winner === 'p1'
          ? '🎉 ¡Ganan las Fichas Verdes!'
          : modeSel.value === 'ai'
            ? '🤖 ¡Gana la Máquina (Terracota)!'
            : '🎉 ¡Ganan las Fichas Terracota!';
    } else {
      statusEl.textContent =
        turn === 'p1'
          ? 'Turno: Fichas Verdes'
          : modeSel.value === 'ai'
            ? 'Turno: Máquina pensando...'
            : 'Turno: Fichas Terracota';
    }

    boardEl.innerHTML = '';
    for (let r = 0; r < 8; r++) {
      for (let c = 0; c < 8; c++) {
        const isDark = (r + c) % 2 === 1;
        const cellEl = document.createElement('button');
        cellEl.type = 'button';
        cellEl.className = `checker-cell ${isDark ? 'dark' : 'light'}`;

        const moveTarget = validMoves.find(m => m.r === r && m.c === c);
        if (moveTarget) cellEl.classList.add('valid-move');
        if (selected && selected.r === r && selected.c === c) cellEl.classList.add('selected');

        const piece = board[r][c];
        if (piece) {
          const pieceEl = document.createElement('span');
          pieceEl.className = `checker-piece ${piece.player} ${piece.king ? 'king' : ''}`;
          pieceEl.textContent = piece.king ? '👑' : '';
          cellEl.appendChild(pieceEl);
        }

        cellEl.addEventListener('click', () => {
          if (winner) return;
          if (turn === 'p2' && modeSel.value === 'ai') return;

          if (moveTarget && selected) {
            applyMove(selected.r, selected.c, moveTarget);
            return;
          }
          if (piece && piece.player === turn) {
            selected = { r, c };
            validMoves = getPieceMoves(r, c, piece);
            renderBoard();
          }
        });

        boardEl.appendChild(cellEl);
      }
    }
  }

  document.getElementById('btnCheckersReset').addEventListener('click', initBoard);
  modeSel.addEventListener('change', initBoard);
  initBoard();
})();
