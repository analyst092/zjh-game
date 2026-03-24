// 炸金花 - 多人联机（PeerJS P2P 版）
// 支持 3-5 人跨设备联机，房主作为中心节点广播状态

class Card {
    constructor(suit, value) { this.suit = suit; this.value = value; }
    get symbol() { return { hearts:'♥', diamonds:'♦', clubs:'♣', spades:'♠' }[this.suit]; }
    get color() { return (this.suit==='hearts'||this.suit==='diamonds') ? 'red' : 'black'; }
    get display() { return {1:'A',2:'2',3:'3',4:'4',5:'5',6:'6',7:'7',8:'8',9:'9',10:'10',11:'J',12:'Q',13:'K'}[this.value]; }
    toJSON() { return { s: this.suit, v: this.value }; }
    static fromJSON(o) { return new Card(o.s, o.v); }
}

class MultiplayerGame {
    constructor() {
        const userStr = localStorage.getItem('zjh_current_user');
        if (!userStr) { window.location.href = 'multiplayer-login.html'; return; }

        this.currentUser = JSON.parse(userStr);
        this.isHost = false;
        this.roomCode = '';
        this.peer = null;
        this.conn = null;            // client → host 连接
        this.conns = {};             // host → { username: conn } 所有客户端连接
        this.players = [];           // [{ username, nickname, chips, ready }]
        this.gameState = null;
        this.selectedRaiseAmount = 20;

        this.setupUI();
    }

    // ==================== UI 初始化 ====================
    setupUI() {
        document.getElementById('current-nickname').textContent = this.currentUser.nickname;

        document.getElementById('btn-create-room').addEventListener('click', () => this.createRoom());
        document.getElementById('btn-join-room').addEventListener('click', () => this.joinRoom());
        document.getElementById('btn-do-join').addEventListener('click', () => this.doJoinRoom());
        document.getElementById('btn-cancel-wait').addEventListener('click', () => this.disconnect());
        document.getElementById('btn-disconnect').addEventListener('click', () => this.disconnect());

        document.getElementById('btn-ready').addEventListener('click', () => this.toggleReady());
        document.getElementById('btn-start-mp').addEventListener('click', () => this.startGame());

        document.getElementById('btn-check').addEventListener('click', () => this.doAction('check'));
        document.getElementById('btn-call').addEventListener('click', () => this.doAction('call'));
        document.getElementById('btn-raise').addEventListener('click', () => this.openRaiseModal());
        document.getElementById('btn-fold').addEventListener('click', () => this.doAction('fold'));
        document.getElementById('btn-next-round').addEventListener('click', () => this.nextRound());

        document.querySelectorAll('.raise-option-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                document.querySelectorAll('.raise-option-btn').forEach(b => b.classList.remove('selected'));
                btn.classList.add('selected');
                this.selectedRaiseAmount = parseInt(btn.dataset.amount);
                this.updateRaiseModal();
            });
        });
        document.getElementById('custom-raise').addEventListener('input', (e) => {
            this.selectedRaiseAmount = Math.max(20, parseInt(e.target.value) || 20);
            document.querySelectorAll('.raise-option-btn').forEach(b => b.classList.remove('selected'));
            this.updateRaiseModal();
        });
        document.getElementById('confirm-raise-btn').addEventListener('click', () => {
            this.closeRaiseModal();
            this.doAction('raise', this.selectedRaiseAmount);
        });
        document.getElementById('cancel-raise-btn').addEventListener('click', () => this.closeRaiseModal());
        document.getElementById('raise-modal').addEventListener('click', (e) => {
            if (e.target.id === 'raise-modal') this.closeRaiseModal();
        });

        document.getElementById('result-close-btn').addEventListener('click', () => {
            document.getElementById('result-overlay').style.display = 'none';
        });

        document.getElementById('join-code-input').addEventListener('keydown', (e) => {
            if (e.key === 'Enter') this.doJoinRoom();
        });
    }

    showScreen(id) {
        ['setup-screen', 'waiting-screen', 'game-screen'].forEach(s => {
            document.getElementById(s).style.display = s === id ? 'flex' : 'none';
        });
    }

    // ==================== 创建房间 ====================
    createRoom() {
        this.roomCode = this.genCode();
        this.isHost = true;
        this.conns = {};
        this.players = [{ username: this.currentUser.username, nickname: this.currentUser.nickname, chips: 1000, ready: false }];

        document.getElementById('room-code-display').textContent = this.roomCode;
        this.showScreen('waiting-screen');
        this.waitLog('正在创建房间...');
        this.renderWaitingPlayers();

        this.initPeer('zjh-' + this.roomCode);
    }

    // ==================== 加入房间 ====================
    joinRoom() {
        document.getElementById('join-input-area').style.display = 'flex';
        document.getElementById('join-code-input').focus();
    }

    doJoinRoom() {
        const code = document.getElementById('join-code-input').value.trim().toUpperCase();
        if (code.length < 4) { alert('请输入有效的房间码'); return; }

        this.roomCode = code;
        this.isHost = false;
        this.players = [{ username: this.currentUser.username, nickname: this.currentUser.nickname, chips: 1000, ready: false }];

        document.getElementById('join-input-area').style.display = 'none';
        document.getElementById('room-code-display').textContent = code;
        this.showScreen('waiting-screen');
        this.waitLog('正在连接房间...');
        this.renderWaitingPlayers();

        this.peer = new Peer();
        this.peer.on('open', () => {
            const hostId = 'zjh-' + this.roomCode;
            this.conn = this.peer.connect(hostId, { reliable: true });
            this.setupClientConn(this.conn);
        });
        this.peer.on('error', (err) => {
            if (err.type === 'peer-unavailable') this.waitLog('找不到房间，请检查房间码');
            else this.waitLog('连接错误: ' + err.type);
        });
    }

    // ==================== PeerJS：房主 ====================
    initPeer(peerId) {
        this.peer = new Peer(peerId);
        this.peer.on('open', () => this.waitLog('房间已创建，等待玩家加入...'));
        this.peer.on('connection', (conn) => this.setupHostConn(conn));
        this.peer.on('error', (err) => {
            if (err.type === 'unavailable-id') {
                this.waitLog('房间码冲突，请重试');
                setTimeout(() => this.disconnect(), 2000);
            } else {
                this.waitLog('错误: ' + err.type);
            }
        });
    }

    setupHostConn(conn) {
        conn.on('open', () => {
            console.log('Client connected:', conn.peer);
        });

        conn.on('data', (msg) => {
            if (msg.type === 'join') {
                const p = msg.player;
                if (this.players.find(pl => pl.username === p.username)) return;
                if (this.players.length >= 5) { conn.send({ type: 'error', msg: '房间已满' }); return; }

                this.players.push({ username: p.username, nickname: p.nickname, chips: 1000, ready: false });
                this.conns[p.username] = conn;
                conn.username = p.username;

                // 通知新玩家当前房间状态
                conn.send({ type: 'room_info', players: this.players });
                // 广播给所有其他人
                this.broadcastAll({ type: 'player_join', player: this.players[this.players.length - 1] });

                this.renderWaitingPlayers();
                this.waitLog(`${p.nickname} 已加入 (${this.players.length}/5)`);
            }

            if (msg.type === 'ready') {
                const p = this.players.find(pl => pl.username === msg.username);
                if (p) { p.ready = msg.ready; this.broadcastAll({ type: 'player_ready', username: msg.username, ready: msg.ready }); this.renderWaitingPlayers(); }
            }

            if (msg.type === 'action') {
                this.processClientAction(msg.username, msg.action, msg.amount);
            }
        });

        conn.on('close', () => {
            const uname = conn.username;
            if (uname) {
                const p = this.players.find(pl => pl.username === uname);
                this.players = this.players.filter(pl => pl.username !== uname);
                delete this.conns[uname];
                if (p) {
                    this.broadcastAll({ type: 'player_leave', username: uname, nickname: p.nickname });
                    this.waitLog(`${p.nickname} 已离开 (${this.players.length}/5)`);
                }
                this.renderWaitingPlayers();
            }
        });
    }

    // ==================== PeerJS：客户端 ====================
    setupClientConn(conn) {
        conn.on('open', () => {
            conn.send({ type: 'join', player: this.currentUser });
            this.waitLog('已连接，等待同步...');
        });

        conn.on('data', (msg) => this.onMessage(msg));

        conn.on('close', () => {
            this.waitLog('与房主的连接已断开');
            setTimeout(() => this.disconnect(), 2000);
        });

        conn.on('error', () => this.waitLog('连接出错'));
    }

    // ==================== 消息处理 ====================
    onMessage(msg) {
        switch (msg.type) {
            case 'room_info':
                this.players = msg.players;
                this.renderWaitingPlayers();
                this.waitLog('已加入房间，准备开始');
                break;
            case 'player_join':
                if (!this.players.find(p => p.username === msg.player.username)) {
                    this.players.push(msg.player);
                }
                this.renderWaitingPlayers();
                this.waitLog(`${msg.player.nickname} 加入了房间 (${this.players.length}/5)`);
                break;
            case 'player_leave':
                this.players = this.players.filter(p => p.username !== msg.username);
                this.renderWaitingPlayers();
                this.waitLog(`${msg.nickname} 离开了 (${this.players.length}/5)`);
                break;
            case 'player_ready':
                const rp = this.players.find(p => p.username === msg.username);
                if (rp) rp.ready = msg.ready;
                this.renderWaitingPlayers();
                break;
            case 'start':
            case 'state':
                this.gameState = msg.state;
                this.switchToGame();
                break;
            case 'result':
                this.gameState = msg.state;
                this.renderGame();
                this.showResult();
                break;
            case 'next_round':
                this.gameState = null;
                this.showScreen('waiting-screen');
                this.players.forEach(p => p.ready = false);
                this.renderWaitingPlayers();
                this.waitLog('房主正在准备新一局...');
                break;
            case 'error':
                this.waitLog(msg.msg);
                break;
        }
    }

    // ==================== 广播（房主用）====================
    broadcastAll(msg) {
        Object.values(this.conns).forEach(c => { if (c.open) c.send(msg); });
    }

    sendToOne(username, msg) {
        const c = this.conns[username];
        if (c && c.open) c.send(msg);
    }

    // ==================== 等待界面渲染 ====================
    renderWaitingPlayers() {
        const slots = document.getElementById('waiting-slots');
        slots.innerHTML = '';

        for (let i = 0; i < 5; i++) {
            const p = this.players[i];
            const div = document.createElement('div');
            div.className = 'w-slot';

            if (p) {
                const isSelf = p.username === this.currentUser.username;
                div.classList.add('occupied');
                if (p.ready) div.classList.add('ready');

                div.innerHTML = `
                    <div class="w-slot-name">${p.nickname}${isSelf ? ' (我)' : ''}</div>
                    <div class="w-slot-chips">💰 ${p.chips}</div>
                    <div class="w-slot-ready ${p.ready ? 'yes' : ''}">${p.ready ? '✓ 已准备' : '未准备'}</div>
                `;
            } else {
                div.classList.add('empty');
                div.innerHTML = `<div class="w-slot-name">空座位</div>`;
            }

            slots.appendChild(div);
        }

        // 更新准备按钮
        const me = this.players.find(p => p.username === this.currentUser.username);
        const readyBtn = document.getElementById('btn-ready');
        if (me && me.ready) { readyBtn.textContent = '取消准备'; readyBtn.classList.add('is-ready'); }
        else { readyBtn.textContent = '准备就绪'; readyBtn.classList.remove('is-ready'); }

        // 更新开始按钮
        const canStart = this.players.length >= 3 && this.players.every(p => p.ready);
        document.getElementById('btn-start-mp').disabled = !canStart;
        document.getElementById('player-count-text').textContent = `${this.players.length}/5`;

        if (this.isHost) {
            document.getElementById('host-hint').style.display = 'block';
        }
    }

    waitLog(text) { document.getElementById('waiting-log').textContent = text; }

    // ==================== 准备/开始 ====================
    toggleReady() {
        const me = this.players.find(p => p.username === this.currentUser.username);
        if (!me) return;
        me.ready = !me.ready;

        if (this.isHost) {
            this.broadcastAll({ type: 'player_ready', username: this.currentUser.username, ready: me.ready });
            this.renderWaitingPlayers();
        } else {
            this.conn.send({ type: 'ready', username: this.currentUser.username, ready: me.ready });
        }
    }

    startGame() {
        if (!this.isHost || this.players.length < 3) return;

        const deck = this.createDeck();
        this.shuffle(deck);

        const playerStates = this.players.map(p => ({
            username: p.username,
            nickname: p.nickname,
            chips: p.chips,
            cards: deck.splice(0, 3).map(c => c.toJSON()),
            folded: false, roundBet: 0, totalBet: 0, status: '', handType: ''
        }));

        const ante = 10;
        playerStates.forEach(p => { p.chips -= ante; p.roundBet = ante; p.totalBet = ante; });

        const dealerIdx = Math.floor(Math.random() * playerStates.length);
        const turnIdx = this.nextActive(playerStates, dealerIdx);

        this.gameState = {
            phase: 'playing',
            players: playerStates,
            pot: playerStates.length * ante,
            currentBet: ante,
            currentTurnIndex: turnIdx,
            dealerIndex: dealerIdx,
            lastRaiserIndex: -1,
            roundNum: 1,
            baseBet: ante,
            result: null
        };

        this.switchToGame();
        this.broadcastAll({ type: 'start', state: this.gameState });
    }

    nextRound() {
        if (!this.isHost) return;
        this.gameState = null;
        this.players.forEach(p => p.ready = false);
        this.broadcastAll({ type: 'next_round' });
        this.showScreen('waiting-screen');
        this.renderWaitingPlayers();
        this.waitLog('准备新一局...');
    }

    // ==================== 操作处理 ====================
    doAction(action, amount) {
        if (!this.gameState || this.gameState.phase !== 'playing') return;
        const myIdx = this.gameState.players.findIndex(p => p.username === this.currentUser.username);
        if (myIdx < 0 || this.gameState.currentTurnIndex !== myIdx) return;

        if (this.isHost) {
            this.processAction(myIdx, action, amount);
            this.broadcastAll({ type: 'state', state: this.gameState });
            if (this.gameState.phase === 'showdown') {
                this.broadcastAll({ type: 'result', state: this.gameState });
            }
        } else {
            this.conn.send({ type: 'action', username: this.currentUser.username, action, amount });
        }
    }

    processClientAction(username, action, amount) {
        const idx = this.gameState.players.findIndex(p => p.username === username);
        if (idx < 0 || idx !== this.gameState.currentTurnIndex) return;
        this.processAction(idx, action, amount);
        this.broadcastAll({ type: 'state', state: this.gameState });
        if (this.gameState.phase === 'showdown') {
            this.broadcastAll({ type: 'result', state: this.gameState });
        }
    }

    processAction(idx, action, amount) {
        const p = this.gameState.players[idx];
        const gs = this.gameState;

        switch (action) {
            case 'check':
                if (gs.currentBet > p.roundBet) return;
                p.status = 'checked';
                break;
            case 'call': {
                const need = gs.currentBet - p.roundBet;
                const pay = Math.min(need, p.chips);
                p.chips -= pay; p.roundBet += pay; p.totalBet += pay; gs.pot += pay;
                p.status = 'called';
                break;
            }
            case 'raise': {
                const callNeed = gs.currentBet - p.roundBet;
                const pay = Math.min(callNeed + amount, p.chips);
                p.chips -= pay; p.roundBet += pay; p.totalBet += pay; gs.pot += pay;
                if (p.roundBet > gs.currentBet) { gs.currentBet = p.roundBet; gs.lastRaiserIndex = idx; }
                p.status = 'raised';
                break;
            }
            case 'fold':
                p.folded = true;
                p.status = 'folded';
                break;
        }
        this.advanceTurn();
    }

    advanceTurn() {
        const gs = this.gameState;
        const active = gs.players.filter(p => !p.folded);

        if (active.length <= 1) { this.resolveShowdown(); return; }
        if (active.every(p => p.chips <= 0)) { this.resolveShowdown(); return; }

        if (this.isBettingRoundOver()) {
            gs.players.forEach(p => { p.roundBet = 0; p.status = ''; });
            gs.currentBet = 0; gs.lastRaiserIndex = -1; gs.roundNum++;
            if (gs.roundNum > 3) { this.resolveShowdown(); return; }
            const next = this.nextActive(gs.players, gs.dealerIndex);
            if (next < 0) { this.resolveShowdown(); return; }
            gs.currentTurnIndex = next;
        } else {
            gs.currentTurnIndex = this.nextActive(gs.players, gs.currentTurnIndex);
            if (gs.currentTurnIndex < 0) { this.resolveShowdown(); return; }
        }
    }

    isBettingRoundOver() {
        const active = this.gameState.players.filter(p => !p.folded);
        if (active.length <= 1) return true;
        return active.every(p => p.roundBet === this.gameState.currentBet || p.chips <= 0);
    }

    nextActive(players, from) {
        for (let i = 1; i <= players.length; i++) {
            const idx = (from + i) % players.length;
            if (!players[idx].folded && players[idx].chips > 0) return idx;
        }
        return -1;
    }

    resolveShowdown() {
        const gs = this.gameState;
        const active = gs.players.filter(p => !p.folded);

        active.forEach(p => {
            const hand = this.getHandType(p.cards.map(c => Card.fromJSON(c)));
            p.handType = hand.type; p._hand = hand;
        });

        let winners;
        if (active.length === 1) { winners = active; }
        else {
            winners = [active[0]];
            for (let i = 1; i < active.length; i++) {
                const cmp = this.compareHands(active[i]._hand, winners[0]._hand);
                if (cmp > 0) winners = [active[i]];
                else if (cmp === 0) winners.push(active[i]);
            }
        }

        const winEach = Math.floor(gs.pot / winners.length);
        winners.forEach(w => { w.chips += winEach; w.status = 'winner'; });
        gs.players.forEach(p => { delete p._hand; if (p.status !== 'winner' && !p.folded) p.status = 'loser'; });

        gs.phase = 'showdown';
        gs.result = { winners: winners.map(w => w.username), pot: gs.pot, winAmount: winEach };
    }

    disconnect() {
        if (this.conn) { try { this.conn.close(); } catch (e) {} }
        Object.values(this.conns).forEach(c => { try { c.close(); } catch (e) {} });
        if (this.peer) { try { this.peer.destroy(); } catch (e) {} }
        this.conn = null; this.conns = {}; this.peer = null;
        this.players = []; this.gameState = null;
        this.showScreen('setup-screen');
    }

    // ==================== 牌型 ====================
    createDeck() {
        const suits = ['hearts','diamonds','clubs','spades'];
        const deck = [];
        for (const s of suits) for (let v = 1; v <= 13; v++) deck.push(new Card(s, v));
        return deck;
    }

    shuffle(a) { for (let i = a.length-1; i > 0; i--) { const j = Math.floor(Math.random()*(i+1)); [a[i],a[j]]=[a[j],a[i]]; } }

    getHandType(cards) {
        const s = [...cards].sort((a,b) => a.value - b.value);
        const v = s.map(c => c.value), su = s.map(c => c.suit);
        if (v[0]===v[1] && v[1]===v[2]) return { type:'豹子', rank:6, high:v[0] };
        const isF = su[0]===su[1] && su[1]===su[2];
        let isSt = false, sH = 0;
        if (v[2]-v[0]===2 && v[1]-v[0]===1) { isSt=true; sH=v[2]; }
        if (v[0]===1 && v[1]===2 && v[2]===3) { isSt=true; sH=3; }
        if (v[0]===1 && v[1]===12 && v[2]===13) { isSt=true; sH=14; }
        if (isF && isSt) return { type:'同花顺', rank:5, high:sH };
        if (isF) return { type:'同花', rank:4, high:Math.max(...v.map(x=>x===1?14:x)) };
        if (isSt) return { type:'顺子', rank:3, high:sH };
        if (v[0]===v[1] || v[1]===v[2]) {
            const pv = v[0]===v[1]?v[0]:v[1], sv = v[0]===v[1]?v[2]:v[0];
            return { type:'对子', rank:2, pair:pv, single:sv===1?14:sv };
        }
        return { type:'单张', rank:1, values:v.map(x=>x===1?14:x).sort((a,b)=>b-a) };
    }

    compareHands(a, b) {
        if (a.rank!==b.rank) return a.rank-b.rank;
        if (['豹子','同花顺','同花','顺子'].includes(a.type)) return a.high-b.high;
        if (a.type==='对子') return a.pair!==b.pair ? a.pair-b.pair : a.single-b.single;
        for (let i=0;i<3;i++) if (a.values[i]!==b.values[i]) return a.values[i]-b.values[i];
        return 0;
    }

    genCode() {
        const c = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
        let r = '';
        for (let i=0;i<4;i++) r += c[Math.floor(Math.random()*c.length)];
        return r;
    }

    // ==================== 游戏 UI ====================
    switchToGame() {
        this.showScreen('game-screen');
        this.renderGame();
    }

    renderGame() {
        if (!this.gameState) return;
        const gs = this.gameState;
        document.getElementById('pot-amount').textContent = gs.pot;

        const myIdx = gs.players.findIndex(p => p.username === this.currentUser.username);

        // 计算座位映射：当前玩家在 seat-0（底部），逆时针排列
        const seatOrder = [];
        for (let i = 0; i < gs.players.length; i++) {
            seatOrder.push((myIdx + i) % gs.players.length);
        }

        // 渲染5个座位
        for (let s = 0; s < 5; s++) {
            const seatEl = document.getElementById(`seat-${s}`);
            if (s < seatOrder.length) {
                const pIdx = seatOrder[s];
                const p = gs.players[pIdx];
                const isSelf = p.username === this.currentUser.username;
                const isActive = pIdx === gs.currentTurnIndex && gs.phase === 'playing';
                const isDealer = pIdx === gs.dealerIndex;
                const isShowdown = gs.phase === 'showdown';

                let cardHTML = '';
                if (p.cards && p.cards.length) {
                    if (isSelf || isShowdown) {
                        cardHTML = `<div class="seat-cards">${p.cards.map(c => {
                            const card = Card.fromJSON(c);
                            return `<div class="seat-mini-card ${card.color}"><span>${card.display}</span><span class="mini-suit">${card.symbol}</span></div>`;
                        }).join('')}</div>`;
                    } else {
                        cardHTML = `<div class="seat-cards">${[0,1,2].map(() => '<div class="seat-mini-card card-back">🂠</div>').join('')}</div>`;
                    }
                }

                let statusHTML = '';
                if (p.status==='folded') statusHTML = '<div class="seat-status folded-status">弃牌</div>';
                else if (p.status==='winner') statusHTML = '<div class="seat-status winner-status">🏆 赢家</div>';
                else if (p.status==='raised') statusHTML = '<div class="seat-status raised">加注</div>';
                else if (p.status==='called') statusHTML = '<div class="seat-status called">跟注</div>';
                else if (p.status==='checked') statusHTML = '<div class="seat-status checked">看牌</div>';
                else if (p.status==='loser') statusHTML = '<div class="seat-status folded-status">落败</div>';
                else if (isActive) statusHTML = '<div class="seat-status betting">⏳ 思考中</div>';

                let handHTML = '';
                if (p.handType && (isSelf || isShowdown)) handHTML = `<div class="seat-hand-type">${p.handType}</div>`;

                seatEl.innerHTML = `
                    <div class="seat-card ${isActive?'active':''} ${p.folded?'folded':''} ${p.status==='winner'?'winner':''}">
                        <div class="seat-name">${isDealer?'👑 ':''}${p.nickname}${isSelf?' (我)':''}</div>
                        <div class="seat-chips">💰 ${p.chips}</div>
                        ${cardHTML}${statusHTML}${handHTML}
                    </div>`;
            } else {
                seatEl.innerHTML = '';
            }
        }

        this.updateControls();
        this.updateTurnIndicator();

        if (gs.phase === 'showdown' && gs.result) {
            setTimeout(() => this.showResult(), 300);
        }
    }

    updateControls() {
        if (!this.gameState) return;
        const gs = this.gameState;
        const myIdx = gs.players.findIndex(p => p.username === this.currentUser.username);
        const me = gs.players[myIdx];
        const isMyTurn = myIdx === gs.currentTurnIndex && gs.phase === 'playing';

        const btnNext = document.getElementById('btn-next-round');
        const btnCheck = document.getElementById('btn-check');
        const btnCall = document.getElementById('btn-call');
        const btnRaise = document.getElementById('btn-raise');
        const btnFold = document.getElementById('btn-fold');

        if (gs.phase === 'showdown') {
            btnNext.style.display = this.isHost ? 'inline-block' : 'none';
            btnCheck.disabled = true; btnCall.disabled = true; btnRaise.disabled = true; btnFold.disabled = true;
        } else if (gs.phase === 'playing') {
            btnNext.style.display = 'none';
            const callAmt = gs.currentBet - me.roundBet;
            btnCheck.disabled = !isMyTurn || callAmt > 0;
            btnCall.disabled = !isMyTurn || callAmt <= 0 || me.chips < callAmt;
            btnRaise.disabled = !isMyTurn || me.chips < callAmt + 20;
            btnFold.disabled = !isMyTurn;
        }
    }

    updateTurnIndicator() {
        const el = document.getElementById('turn-indicator');
        if (!this.gameState) { el.textContent = '...'; return; }
        const gs = this.gameState;

        if (gs.phase === 'showdown') {
            el.textContent = this.isHost ? '比牌结束 · 点击"下一局"' : '比牌结束 · 等待房主...';
            el.style.borderColor = 'rgba(40,167,69,0.5)';
        } else if (gs.phase === 'playing') {
            const myIdx = gs.players.findIndex(p => p.username === this.currentUser.username);
            if (gs.currentTurnIndex === myIdx) {
                el.textContent = `🔔 轮到你了！ (第${gs.roundNum}/3轮)`;
                el.style.borderColor = 'rgba(255,215,0,0.6)';
            } else {
                const cp = gs.players[gs.currentTurnIndex];
                el.textContent = `等待 ${cp?cp.nickname:'...'} (第${gs.roundNum}/3轮)`;
                el.style.borderColor = 'rgba(255,255,255,0.1)';
            }
        }
    }

    openRaiseModal() {
        if (!this.gameState) return;
        const myIdx = this.gameState.players.findIndex(p => p.username === this.currentUser.username);
        if (this.gameState.currentTurnIndex !== myIdx) return;
        const me = this.gameState.players[myIdx];
        document.getElementById('call-amount-display').textContent = this.gameState.currentBet - me.roundBet;
        this.selectedRaiseAmount = 20;
        document.querySelectorAll('.raise-option-btn').forEach(b => b.classList.remove('selected'));
        document.querySelector('.raise-option-btn[data-amount="20"]').classList.add('selected');
        this.updateRaiseModal();
        document.getElementById('raise-modal').classList.add('active');
    }

    updateRaiseModal() {
        const myIdx = this.gameState.players.findIndex(p => p.username === this.currentUser.username);
        document.getElementById('total-raise-amount').textContent = (this.gameState.currentBet - this.gameState.players[myIdx].roundBet) + this.selectedRaiseAmount;
        document.getElementById('custom-raise').value = this.selectedRaiseAmount;
    }

    closeRaiseModal() { document.getElementById('raise-modal').classList.remove('active'); }

    showResult() {
        const gs = this.gameState;
        if (!gs || !gs.result) return;
        const overlay = document.getElementById('result-overlay');
        if (overlay.style.display === 'flex') return;

        const r = gs.result;
        const isWinner = r.winners.includes(this.currentUser.username);
        const winners = gs.players.filter(p => r.winners.includes(p.username));
        const title = document.getElementById('result-title');
        const detail = document.getElementById('result-detail');

        if (isWinner) {
            title.textContent = '🏆 你赢了！';
            detail.textContent = winners.length > 1
                ? `与 ${winners.map(w=>w.nickname).join('、')} 平分底池，赢得 ${r.winAmount} 筹码`
                : `赢得 ${r.pot} 筹码`;
        } else {
            title.textContent = '本局结束';
            detail.textContent = winners.map(w => `${w.nickname}(${w.handType||'—'})`).join('、') + ` 赢得 ${r.pot} 筹码`;
        }
        overlay.style.display = 'flex';
    }

    addGameLog(text) {
        const log = document.getElementById('game-log');
        if (!log) return;
        const t = new Date().toLocaleTimeString('zh-CN', { hour:'2-digit', minute:'2-digit', second:'2-digit' });
        log.innerHTML += `<div class="log-entry"><span class="log-time">${t}</span>${text}</div>`;
        log.scrollTop = log.scrollHeight;
    }
}

document.addEventListener('DOMContentLoaded', () => { new MultiplayerGame(); });
