// 全局变量定义
const BOARD_SIZE = 15; // 棋盘大小 15x15
let gameMode = 'two'; // two:双人本地, ai:人机, online:在线对战
let gameRule = 'normal'; // normal:普通规则, professional:禁手规则
let aiDifficulty = 'easy'; // easy/medium/hard
let boardSkin = 'wood'; // 棋盘皮肤: wood/green/blue

// 游戏状态
let chessboard = []; // 棋盘数据: 0空, 1黑棋, 2白棋
let currentPlayer = 1; // 当前玩家: 1黑, 2白
let gameOver = false;
let moveHistory = []; // 落子历史，用于悔棋

// 在线对战相关
let ws = null; // WebSocket连接
let roomId = ''; // 房间ID
let playerRole = 1; // 玩家角色: 1黑, 2白
let isCreator = false; // 是否是房间创建者
let isReady = false; // 是否准备就绪
let onlineOpponentReady = false; // 对手是否准备

// DOM元素
const boardEl = $('#chessboard');
const statusEl = $('#status');
const restartBtn = $('#restartBtn');
const undoBtn = $('#undoBtn');
const difficultyPanel = $('#difficultyPanel');
const onlinePanel = $('#onlinePanel');
const roomIdInput = $('#roomId'); // 房间ID输入框
const createRoomBtn = $('#createRoomBtn');
const joinRoomBtn = $('#joinRoomBtn');
const readyBtn = $('#readyBtn');
const leaveRoomBtn = $('#leaveRoomBtn');
const player1El = $('#player1');
const player2El = $('#player2');
const previewPiece = $('#previewPiece');
const boardWrapper = $('#boardWrapper');

// 工具函数
function $(selector) {
    return document.querySelector(selector);
}

function $$(selector) {
    return document.querySelectorAll(selector);
}

// 初始化棋盘数据
function initBoardData() {
    chessboard = Array(BOARD_SIZE).fill().map(() => Array(BOARD_SIZE).fill(0));
    moveHistory = [];
}

// 渲染棋盘DOM
function renderBoard() {
    boardEl.innerHTML = '';
    for (let row = 0; row < BOARD_SIZE; row++) {
        for (let col = 0; col < BOARD_SIZE; col++) {
            const cell = document.createElement('div');
            cell.className = 'chess-cell';
            cell.dataset.row = row;
            cell.dataset.col = col;
            
            // 绘制落子
            if (chessboard[row][col] !== 0) {
                const piece = document.createElement('div');
                piece.className = `chess-piece ${chessboard[row][col] === 1 ? 'black' : 'white'}`;
                cell.appendChild(piece);
            }
            
            // 绑定点击事件
            cell.addEventListener('click', () => handleCellClick(row, col));
            
            boardEl.appendChild(cell);
        }
    }
    
    // 绑定鼠标移动事件（预览棋子）
    boardWrapper.addEventListener('mousemove', handleMouseMove);
    boardWrapper.addEventListener('mouseleave', () => {
        previewPiece.style.display = 'none';
    });
}

// 处理鼠标移动（预览棋子）
function handleMouseMove(e) {
    if (gameOver || (gameMode === 'online' && currentPlayer !== playerRole)) {
        previewPiece.style.display = 'none';
        return;
    }
    
    const rect = boardEl.getBoundingClientRect();
    const cellSize = rect.width / BOARD_SIZE;
    
    // 计算鼠标所在的格子
    const col = Math.floor((e.clientX - rect.left) / cellSize);
    const row = Math.floor((e.clientY - rect.top) / cellSize);
    
    // 检查是否在棋盘范围内且格子为空
    if (row >= 0 && row < BOARD_SIZE && col >= 0 && col < BOARD_SIZE && chessboard[row][col] === 0) {
        previewPiece.style.display = 'block';
        previewPiece.className = `chess-piece ${currentPlayer === 1 ? 'black' : 'white'}`;
        previewPiece.style.left = `${col * cellSize + cellSize/2 - previewPiece.offsetWidth/2}px`;
        previewPiece.style.top = `${row * cellSize + cellSize/2 - previewPiece.offsetHeight/2}px`;
    } else {
        previewPiece.style.display = 'none';
    }
}

// 处理格子点击
function handleCellClick(row, col) {
    // 游戏结束、格子已有棋子、在线对战不是当前玩家回合，都不能落子
    if (gameOver || chessboard[row][col] !== 0 || (gameMode === 'online' && currentPlayer !== playerRole)) {
        return;
    }
    
    // 禁手规则检查（仅黑棋）
    if (gameRule === 'professional' && currentPlayer === 1) {
        if (isForbiddenMove(row, col)) {
            statusEl.textContent = '黑棋禁手点！不能落子';
            return;
        }
    }
    
    // 落子
    placePiece(row, col, currentPlayer, true);
    
    // 检查游戏结果
    const result = checkGameResult(row, col);
    if (result) {
        gameOver = true;
        statusEl.textContent = result;
        restartBtn.disabled = false;
        undoBtn.disabled = true;
        
        // 在线对战：发送游戏结束消息
        if (gameMode === 'online') {
            sendMessage({
                type: 'gameOver',
                roomId,
                winner: currentPlayer,
                reason: result
            });
        }
        return;
    }
    
    // 切换玩家
    currentPlayer = currentPlayer === 1 ? 2 : 1;
    
    // 在线对战：发送落子消息
    if (gameMode === 'online') {
        sendMessage({
            type: 'move',
            roomId,
            row,
            col,
            player: currentPlayer === 1 ? 2 : 1 // 发送的是刚落子的玩家
        });
    }
    
    // 人机对战：AI落子
    if (gameMode === 'ai' && currentPlayer === 2 && !gameOver) {
        setTimeout(() => aiMove(), 500);
    }
    
    // 更新状态
    updateStatusText();
}

// 落子（公共方法）
function placePiece(row, col, player, saveHistory) {
    chessboard[row][col] = player;
    
    // 保存历史（用于悔棋）
    if (saveHistory) {
        moveHistory.push({ row, col, player });
    }
    
    // 更新DOM
    const cell = $(`.chess-cell[data-row="${row}"][data-col="${col}"]`);
    const piece = document.createElement('div');
    piece.className = `chess-piece ${player === 1 ? 'black' : 'white'}`;
    cell.appendChild(piece);
    
    // 启用悔棋按钮
    undoBtn.disabled = moveHistory.length === 0;
}

// 检查游戏结果
function checkGameResult(row, col) {
    const player = chessboard[row][col];
    const directions = [
        [0, 1],  // 水平
        [1, 0],  // 垂直
        [1, 1],  // 右下
        [1, -1]  // 左下
    ];
    
    for (const [dx, dy] of directions) {
        let count = 1;
        
        // 正向计数
        for (let i = 1; i < 5; i++) {
            const r = row + dx * i;
            const c = col + dy * i;
            if (r >= 0 && r < BOARD_SIZE && c >= 0 && c < BOARD_SIZE && chessboard[r][c] === player) {
                count++;
            } else {
                break;
            }
        }
        
        // 反向计数
        for (let i = 1; i < 5; i++) {
            const r = row - dx * i;
            const c = col - dy * i;
            if (r >= 0 && r < BOARD_SIZE && c >= 0 && c < BOARD_SIZE && chessboard[r][c] === player) {
                count++;
            } else {
                break;
            }
        }
        
        // 五子连珠
        if (count >= 5) {
            return `${player === 1 ? '黑棋' : '白棋'}获胜！`;
        }
    }
    
    // 检查平局（棋盘满）
    const isFull = chessboard.every(row => row.every(cell => cell !== 0));
    if (isFull) {
        return '平局！棋盘已满';
    }
    
    return null;
}

// 禁手规则检查（仅黑棋）
function isForbiddenMove(row, col) {
    // 简易禁手检查：三三、四四、长连
    const tempBoard = JSON.parse(JSON.stringify(chessboard));
    tempBoard[row][col] = 1;
    
    // 检查活三数量
    let liveThreeCount = 0;
    // 检查活四数量
    let liveFourCount = 0;
    // 检查长连
    let isLongLine = false;
    
    const directions = [[0,1], [1,0], [1,1], [1,-1]];
    
    // 检查长连（超过5子）
    for (const [dx, dy] of directions) {
        let count = 1;
        // 正向
        for (let i = 1; i < 6; i++) {
            const r = row + dx * i;
            const c = col + dy * i;
            if (r >= 0 && r < BOARD_SIZE && c >= 0 && c < BOARD_SIZE && tempBoard[r][c] === 1) {
                count++;
            } else {
                break;
            }
        }
        // 反向
        for (let i = 1; i < 6; i++) {
            const r = row - dx * i;
            const c = col - dy * i;
            if (r >= 0 && r < BOARD_SIZE && c >= 0 && c < BOARD_SIZE && tempBoard[r][c] === 1) {
                count++;
            } else {
                break;
            }
        }
        if (count > 5) {
            isLongLine = true;
            break;
        }
    }
    
    // 简易活三/活四检查（完整禁手规则较复杂，这里做简化版）
    if (!isLongLine) {
        // 实际商用版需完善，这里保证游戏能运行即可
        return false;
    }
    
    return isLongLine || liveThreeCount >= 2 || liveFourCount >= 2;
}

// AI落子
function aiMove() {
    if (gameOver) return;
    
    let bestRow = -1;
    let bestCol = -1;
    
    // 简单难度：随机落子
    if (aiDifficulty === 'easy') {
        const emptyCells = [];
        for (let row = 0; row < BOARD_SIZE; row++) {
            for (let col = 0; col < BOARD_SIZE; col++) {
                if (chessboard[row][col] === 0) {
                    emptyCells.push({ row, col });
                }
            }
        }
        const randomCell = emptyCells[Math.floor(Math.random() * emptyCells.length)];
        bestRow = randomCell.row;
        bestCol = randomCell.col;
    } else {
        // 中等/困难难度：简单的攻防逻辑（优先堵玩家的活四，其次自己活四，再活三）
        // 遍历所有空位置，评分
        let maxScore = -1;
        for (let row = 0; row < BOARD_SIZE; row++) {
            for (let col = 0; col < BOARD_SIZE; col++) {
                if (chessboard[row][col] === 0) {
                    // 模拟落子评分
                    const score = evaluateMove(row, col, 2); // AI是白棋
                    if (score > maxScore) {
                        maxScore = score;
                        bestRow = row;
                        bestCol = col;
                    }
                }
            }
        }
    }
    
    // AI落子
    if (bestRow !== -1 && bestCol !== -1) {
        handleCellClick(bestRow, bestCol);
    }
}

// 评估落子分数
function evaluateMove(row, col, player) {
    const tempBoard = JSON.parse(JSON.stringify(chessboard));
    tempBoard[row][col] = player;
    
    let score = 0;
    const directions = [[0,1], [1,0], [1,1], [1,-1]];
    
    // 检查各方向的棋子数量
    for (const [dx, dy] of directions) {
        let count = 1;
        let blocked = 0;
        
        // 正向
        let r = row + dx;
        let c = col + dy;
        while (r >= 0 && r < BOARD_SIZE && c >= 0 && c < BOARD_SIZE && tempBoard[r][c] === player) {
            count++;
            r += dx;
            c += dy;
        }
        if (r >= 0 && r < BOARD_SIZE && c >= 0 && c < BOARD_SIZE && tempBoard[r][c] !== 0) {
            blocked++;
        }
        
        // 反向
        r = row - dx;
        c = col - dy;
        while (r >= 0 && r < BOARD_SIZE && c >= 0 && c < BOARD_SIZE && tempBoard[r][c] === player) {
            count++;
            r -= dx;
            c -= dy;
        }
        if (r >= 0 && r < BOARD_SIZE && c >= 0 && c < BOARD_SIZE && tempBoard[r][c] !== 0) {
            blocked++;
        }
        
        // 评分规则
        if (count >= 5) score += 10000; // 五连
        else if (count === 4 && blocked === 0) score += 1000; // 活四
        else if (count === 4 && blocked === 1) score += 100; // 冲四
        else if (count === 3 && blocked === 0) score += 50; // 活三
        else if (count === 3 && blocked === 1) score += 10; // 眠三
        else if (count === 2 && blocked === 0) score += 5; // 活二
    }
    
    // 同时评估对手的落子威胁
    const opponent = player === 1 ? 2 : 1;
    tempBoard[row][col] = opponent;
    for (const [dx, dy] of directions) {
        let count = 1;
        let blocked = 0;
        
        // 正向
        let r = row + dx;
        let c = col + dy;
        while (r >= 0 && r < BOARD_SIZE && c >= 0 && c < BOARD_SIZE && tempBoard[r][c] === opponent) {
            count++;
            r += dx;
            c += dy;
        }
        if (r >= 0 && r < BOARD_SIZE && c >= 0 && c < BOARD_SIZE && tempBoard[r][c] !== 0) {
            blocked++;
        }
        
        // 反向
        r = row - dx;
        c = col - dy;
        while (r >= 0 && r < BOARD_SIZE && c >= 0 && c < BOARD_SIZE && tempBoard[r][c] === opponent) {
            count++;
            r -= dx;
            c -= dy;
        }
        if (r >= 0 && r < BOARD_SIZE && c >= 0 && c < BOARD_SIZE && tempBoard[r][c] !== 0) {
            blocked++;
        }
        
        // 防守评分
        if (count >= 5) score += 10000;
        else if (count === 4 && blocked === 0) score += 2000; // 优先堵活四
        else if (count === 4 && blocked === 1) score += 500;
        else if (count === 3 && blocked === 0) score += 200; // 优先堵活三
    }
    
    return score;
}

// 悔棋
function undoMove() {
    if (moveHistory.length === 0 || gameOver) return;
    
    const lastMove = moveHistory.pop();
    chessboard[lastMove.row][lastMove.col] = 0;
    
    // 更新DOM
    const cell = $(`.chess-cell[data-row="${lastMove.row}"][data-col="${lastMove.col}"]`);
    cell.innerHTML = '';
    
    // 切换玩家
    currentPlayer = lastMove.player;
    
    // 更新按钮状态
    undoBtn.disabled = moveHistory.length === 0;
    
    // 在线对战不支持悔棋（避免同步问题）
    if (gameMode === 'online') {
        undoBtn.disabled = true;
        statusEl.textContent = '在线对战暂不支持悔棋';
        return;
    }
    
    updateStatusText();
}

// 更新状态文本
function updateStatusText() {
    if (gameOver) return;
    
    if (gameMode === 'two') {
        statusEl.textContent = `${currentPlayer === 1 ? '黑棋' : '白棋'}回合，请落子`;
    } else if (gameMode === 'ai') {
        statusEl.textContent = currentPlayer === 1 ? '你的回合（黑棋）' : 'AI思考中（白棋）';
    } else if (gameMode === 'online') {
        statusEl.textContent = currentPlayer === playerRole ? '该你落子' : '等待对手落子';
    }
}

// 重置在线对战状态
function resetOnlineState() {
    roomId = '';
    playerRole = 1;
    isCreator = false;
    isReady = false;
    onlineOpponentReady = false;
    roomIdInput.value = '';
    roomIdInput.readOnly = false; // 恢复输入框可编辑
    player1El.textContent = '未连接';
    player2El.textContent = '未连接';
    readyBtn.disabled = true;
    readyBtn.textContent = '准备开始';
    leaveRoomBtn.disabled = true;
    if (ws) {
        ws.close();
        ws = null;
    }
}

// 发送WebSocket消息
function sendMessage(message) {
    if (ws && ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify(message));
    } else {
        statusEl.textContent = '未连接到服务器，请重新创建/加入房间';
    }
}

// 连接WebSocket
function connectWebSocket() {
    // 本地测试用localhost，公网部署替换为服务器IP
    const wsUrl = `ws://localhost:8080?roomId=${roomId}&role=${playerRole}`;
    ws = new WebSocket(wsUrl);
    
    // 连接成功
    ws.onopen = () => {
        statusEl.textContent = `正在连接房间 ${roomId}...`;
    };
    
    // 接收消息
    ws.onmessage = (e) => {
        const message = JSON.parse(e.data);
        handleWebSocketMessage(message);
    };
    
    // 连接关闭
    ws.onclose = () => {
        statusEl.textContent = '与服务器断开连接！';
        gameOver = true;
        readyBtn.disabled = true;
        leaveRoomBtn.disabled = true;
        previewPiece.style.display = 'none';
    };
    
    // 连接错误
    ws.onerror = (error) => {
        statusEl.textContent = '连接失败！请先启动WebSocket服务器';
        console.error('WebSocket错误：', error);
    };
}

// 处理WebSocket消息
function handleWebSocketMessage(message) {
    console.log('收到服务器消息：', message);
    
    switch (message.type) {
        case 'createRoomSuccess':
            // 创建房间成功
            player1El.textContent = '你（黑棋）';
            player2El.textContent = '等待对手加入...';
            statusEl.textContent = `房间创建成功！房间ID：${message.roomId}，等待对手加入`;
            readyBtn.disabled = false;
            break;
            
        case 'joinRoomSuccess':
            // 加入房间成功
            player2El.textContent = '你（白棋）';
            player1El.textContent = '对手（黑棋）';
            statusEl.textContent = `成功加入房间 ${message.roomId}，点击"准备开始"`;
            readyBtn.disabled = false;
            break;
            
        case 'playerJoined':
            // 对手加入房间
            player2El.textContent = '对手（白棋）';
            statusEl.textContent = '对手已加入，请点击"准备开始"';
            break;
            
        case 'playerReady':
            // 对手准备就绪
            onlineOpponentReady = true;
            statusEl.textContent = '对手已准备，等待你确认';
            break;
            
        case 'gameStart':
            // 游戏开始
            gameOver = false;
            currentPlayer = message.currentPlayer;
            statusEl.textContent = playerRole === currentPlayer ? 
                '游戏开始！该你落子' : '游戏开始！等待对手落子';
            break;
            
        case 'move':
            // 对手落子
            placePiece(message.row, message.col, message.player, false);
            currentPlayer = message.player === 1 ? 2 : 1;
            checkGameResult(message.row, message.col);
            updateStatusText();
            break;
            
        case 'gameOver':
            // 游戏结束
            gameOver = true;
            const winnerText = message.winner === playerRole ? '你' : '对手';
            statusEl.textContent = `${winnerText}获胜！(${message.reason})`;
            leaveRoomBtn.disabled = false;
            break;
            
        case 'playerLeft':
            // 对手离开
            statusEl.textContent = '对手已离开房间！';
            gameOver = true;
            player2El.textContent = '对手（已离开）';
            readyBtn.disabled = true;
            leaveRoomBtn.disabled = false;
            break;
            
        case 'error':
            // 错误消息
            statusEl.textContent = `错误：${message.msg}`;
            resetOnlineState();
            break;
    }
}

// 创建房间（修复：自动填充ID并设为只读）
function createRoom() {
    // 生成随机房间ID
    roomId = Math.random().toString(36).substring(2, 8).toUpperCase();
    roomIdInput.value = roomId; // 自动填充到输入框
    roomIdInput.readOnly = true; // 创建后设为只读，避免误改
    isCreator = true;
    playerRole = 1; // 创建者默认黑棋
    
    // 连接WebSocket
    connectWebSocket();
    
    // 发送创建房间消息
    setTimeout(() => {
        sendMessage({
            type: 'createRoom',
            roomId,
            role: playerRole
        });
    }, 100);
    
    // 更新UI
    player1El.textContent = '你（黑棋）';
    player2El.textContent = '等待对手加入...';
    createRoomBtn.disabled = true;
    joinRoomBtn.disabled = true;
}

// 加入房间（修复：读取手动输入的ID）
function joinRoom() {
    roomId = roomIdInput.value.trim();
    if (!roomId) {
        alert('请输入房间ID！');
        return;
    }
    
    isCreator = false;
    playerRole = 2; // 加入者默认白棋
    
    // 连接WebSocket
    connectWebSocket();
    
    // 发送加入房间消息
    setTimeout(() => {
        sendMessage({
            type: 'joinRoom',
            roomId,
            role: playerRole
        });
    }, 100);
    
    // 更新UI：加入后输入框只读
    roomIdInput.readOnly = true;
    player2El.textContent = '你（白棋）';
    player1El.textContent = '对手（黑棋）';
    createRoomBtn.disabled = true;
    joinRoomBtn.disabled = true;
}

// 准备开始游戏
function readyGame() {
    isReady = true;
    readyBtn.textContent = '已准备';
    readyBtn.disabled = true;
    
    // 发送准备消息
    sendMessage({
        type: 'playerReady',
        roomId,
        role: playerRole
    });
    
    statusEl.textContent = '你已准备，等待对手...';
}

// 离开房间（修复：恢复输入框可编辑）
function leaveRoom() {
    sendMessage({
        type: 'leaveRoom',
        roomId,
        role: playerRole
    });
    
    // 重置状态：恢复输入框可编辑
    resetOnlineState();
    initGame();
    createRoomBtn.disabled = false;
    joinRoomBtn.disabled = false;
    statusEl.textContent = '已离开房间，请重新选择模式';
}

// 初始化游戏
function initGame() {
    initBoardData();
    renderBoard();
    gameOver = false;
    currentPlayer = 1; // 黑棋先行
    restartBtn.disabled = false;
    undoBtn.disabled = true;
    previewPiece.style.display = 'none';
    
    // 在线对战模式重置
    if (gameMode !== 'online') {
        resetOnlineState();
    }
    
    updateStatusText();
}

// 页面加载完成初始化
window.addEventListener('load', () => {
    // 默认选中状态
    $$('.rule-btn')[0].classList.add('active');
    $$('.skin-btn')[0].classList.add('active');
    
    // 模式选择（核心：在线对战面板显示逻辑）
    $$('.mode-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            // 移除所有模式按钮的active状态
            $$('.mode-btn').forEach(b => b.classList.remove('active'));
            // 给当前点击的按钮加active
            btn.classList.add('active');
            // 记录当前游戏模式
            gameMode = btn.dataset.mode;
            
            // 显示/隐藏对应面板
            if (gameMode === 'ai') {
                difficultyPanel.style.display = 'flex';
                onlinePanel.style.display = 'none';
            } else if (gameMode === 'online') {
                difficultyPanel.style.display = 'none';
                onlinePanel.style.display = 'flex'; // 显示在线对战面板
            } else { // two模式
                difficultyPanel.style.display = 'none';
                onlinePanel.style.display = 'none';
            }
            
            // 初始化游戏
            initGame();
        });
    });
    
    // 难度选择
    $$('.diff-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            $$('.diff-btn').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            aiDifficulty = btn.dataset.diff;
            initGame();
        });
    });
    
    // 规则选择
    $$('.rule-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            $$('.rule-btn').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            gameRule = btn.dataset.rule;
            initGame();
        });
    });
    
    // 皮肤选择
    $$('.skin-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            $$('.skin-btn').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            boardSkin = btn.dataset.skin;
            boardEl.className = `skin-${boardSkin}`;
        });
    });
    
    // 重新开始
    restartBtn.addEventListener('click', initGame);
    
    // 悔棋
    undoBtn.addEventListener('click', undoMove);
    
    // 在线对战按钮
    createRoomBtn.addEventListener('click', createRoom);
    joinRoomBtn.addEventListener('click', joinRoom);
    readyBtn.addEventListener('click', readyGame);
    leaveRoomBtn.addEventListener('click', leaveRoom);
    
    // 初始化游戏
    initGame();
});