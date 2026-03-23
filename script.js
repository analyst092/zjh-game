// 扑克牌游戏 - 炸金花（多轮下注模式）

// 扑克牌类
class Card {
    constructor(suit, value) {
        this.suit = suit;
        this.value = value;
        this.suitSymbol = this.getSuitSymbol();
        this.suitColor = this.getSuitColor();
        this.displayValue = this.getDisplayValue();
    }

    getSuitSymbol() {
        const suits = {
            'hearts': '♥',
            'diamonds': '♦',
            'clubs': '♣',
            'spades': '♠'
        };
        return suits[this.suit];
    }

    getSuitColor() {
        return (this.suit === 'hearts' || this.suit === 'diamonds') ? 'red' : 'black';
    }

    getDisplayValue() {
        const values = {
            1: 'A',
            2: '2',
            3: '3',
            4: '4',
            5: '5',
            6: '6',
            7: '7',
            8: '8',
            9: '9',
            10: '10',
            11: 'J',
            12: 'Q',
            13: 'K'
        };
        return values[this.value];
    }
}

// 游戏类
class ZhaJinHuaGame {
    constructor() {
        this.deck = [];
        this.playerCards = [];
        this.dealerCards = [];
        
        // 游戏状态
        this.gameStarted = false;
        this.compared = false;
        this.playerFolded = false;
        this.dealerFolded = false;
        
        // 筹码系统
        this.playerChips = 1000;
        this.dealerChips = 1000;
        this.pot = 0;
        this.baseBet = 10; // 底注
        
        // 当前轮次下注
        this.playerRoundBet = 0;
        this.dealerRoundBet = 0;
        
        // 轮次控制
        this.currentTurn = 'player'; // 'player' 或 'dealer'
        this.bettingRound = 0; // 下注轮次
        this.maxRounds = 5; // 最大下注轮次
        
        // 加注弹窗状态
        this.selectedRaiseAmount = 20;
        
        this.initDeck();
        this.setupEventListeners();
        this.updateDisplay();
    }

    initDeck() {
        const suits = ['hearts', 'diamonds', 'clubs', 'spades'];
        const values = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13];

        this.deck = [];
        for (let suit of suits) {
            for (let value of values) {
                this.deck.push(new Card(suit, value));
            }
        }
    }

    shuffleDeck() {
        for (let i = this.deck.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [this.deck[i], this.deck[j]] = [this.deck[j], this.deck[i]];
        }
    }

    // 开始游戏
    startGame() {
        // 检查筹码是否足够
        if (this.playerChips < this.baseBet || this.dealerChips < this.baseBet) {
            alert('筹码不足，无法开始游戏！');
            return;
        }
        
        // 扣除底注
        this.playerChips -= this.baseBet;
        this.dealerChips -= this.baseBet;
        this.pot = this.baseBet * 2;
        
        // 重置游戏状态
        this.playerRoundBet = this.baseBet;
        this.dealerRoundBet = this.baseBet;
        this.playerFolded = false;
        this.dealerFolded = false;
        this.compared = false;
        this.bettingRound = 0;
        this.currentTurn = 'player';
        
        // 发牌
        this.initDeck();
        this.shuffleDeck();
        this.playerCards = this.deck.splice(0, 3);
        this.dealerCards = this.deck.splice(0, 3);
        
        this.gameStarted = true;
        
        this.renderCards();
        this.updateDisplay();
        this.updateTurnIndicator('轮到你下注');
    }

    // 玩家跟注
    playerCall() {
        if (!this.canPlayerAct()) return;
        
        const callAmount = this.dealerRoundBet - this.playerRoundBet;
        const actualCall = Math.min(callAmount, this.playerChips);
        
        this.playerChips -= actualCall;
        this.pot += actualCall;
        this.playerRoundBet += actualCall;
        
        this.endPlayerTurn();
    }

    // 玩家加注 - 打开弹窗
    playerRaise() {
        if (!this.canPlayerAct()) return;
        
        const callAmount = this.dealerRoundBet - this.playerRoundBet;
        
        // 更新弹窗信息
        document.getElementById('call-amount-display').textContent = callAmount;
        this.selectedRaiseAmount = 20;
        this.updateRaiseModal();
        
        // 显示弹窗
        document.getElementById('raise-modal').classList.add('active');
        
        // 重置选中状态
        document.querySelectorAll('.raise-option-btn').forEach(btn => {
            btn.classList.remove('selected');
        });
        document.querySelector('.raise-option-btn[data-amount="20"]').classList.add('selected');
    }
    
    // 更新加注弹窗显示
    updateRaiseModal() {
        const callAmount = this.dealerRoundBet - this.playerRoundBet;
        const totalAmount = callAmount + this.selectedRaiseAmount;
        document.getElementById('total-raise-amount').textContent = totalAmount;
        document.getElementById('custom-raise').value = this.selectedRaiseAmount;
    }
    
    // 关闭加注弹窗
    closeRaiseModal() {
        document.getElementById('raise-modal').classList.remove('active');
    }
    
    // 确认加注
    confirmRaise() {
        const callAmount = this.dealerRoundBet - this.playerRoundBet;
        const totalNeeded = callAmount + this.selectedRaiseAmount;
        const actualAmount = Math.min(totalNeeded, this.playerChips);
        
        this.playerChips -= actualAmount;
        this.pot += actualAmount;
        this.playerRoundBet += actualAmount;
        
        this.closeRaiseModal();
        this.endPlayerTurn();
    }

    // 玩家看牌
    playerCheck() {
        if (!this.canPlayerAct()) return;
        
        // 看牌：不再下注，但如果对方已下注更多，需要跟注
        const callAmount = this.dealerRoundBet - this.playerRoundBet;
        if (callAmount > 0) {
            // 需要先跟注才能看牌
            const actualCall = Math.min(callAmount, this.playerChips);
            this.playerChips -= actualCall;
            this.pot += actualCall;
            this.playerRoundBet += actualCall;
        }
        
        this.endPlayerTurn();
    }

    // 玩家弃牌
    playerFold() {
        if (!this.canPlayerAct()) return;
        
        this.playerFolded = true;
        this.endRound();
    }

    // 结束玩家回合
    endPlayerTurn() {
        this.currentTurn = 'dealer';
        this.updateDisplay();
        
        // 庄家自动行动
        setTimeout(() => {
            this.dealerAction();
        }, 1000);
    }

    // 庄家AI行动（支持欺骗行为）
    dealerAction() {
        if (!this.gameStarted || this.compared || this.playerFolded) return;
        
        const dealerHand = this.getHandType(this.dealerCards);
        const handStrength = dealerHand.rank;
        
        // 计算需要跟注的金额
        const callAmount = this.playerRoundBet - this.dealerRoundBet;
        const canCall = this.dealerChips >= callAmount;
        const canRaise = this.dealerChips >= callAmount + 20;
        
        // 欺骗概率配置
        const bluffChance = 0.25; // 25%概率诈唬（弱牌强打）
        const slowPlayChance = 0.2; // 20%概率慢打（强牌示弱）
        const randomFactor = Math.random();
        
        let action = '';
        
        // 庄家AI策略（含欺骗行为）
        if (handStrength >= 5) { // 豹子或同花顺 - 超强牌
            if (randomFactor < slowPlayChance) {
                // 慢打：示弱，只看牌或跟注
                if (callAmount === 0) {
                    action = 'check';
                } else if (canCall) {
                    action = 'call';
                } else {
                    action = 'allin';
                }
            } else {
                // 正常激进打法
                if (canRaise) {
                    action = 'raise';
                } else if (canCall) {
                    action = 'call';
                } else {
                    action = 'allin';
                }
            }
        } else if (handStrength >= 3) { // 同花或顺子 - 强牌
            if (randomFactor < slowPlayChance) {
                // 慢打
                if (callAmount === 0) {
                    action = 'check';
                } else {
                    action = 'call';
                }
            } else if (canRaise && randomFactor > 0.4) {
                action = 'raise';
            } else if (canCall) {
                action = 'call';
            } else {
                action = 'allin';
            }
        } else if (handStrength === 2) { // 对子 - 中等牌
            if (randomFactor < bluffChance && canRaise) {
                // 诈唬：加注
                action = 'raise';
            } else if (canCall && randomFactor > 0.3) {
                action = 'call';
            } else if (callAmount === 0) {
                action = 'check';
            } else {
                action = 'fold';
            }
        } else { // 单张 - 弱牌
            if (randomFactor < bluffChance && canRaise) {
                // 诈唬：弱牌加注
                action = 'raise';
            } else if (callAmount === 0) {
                action = 'check';
            } else if (randomFactor < 0.4 && canCall) {
                // 有时跟注观察
                action = 'call';
            } else {
                action = 'fold';
            }
        }
        
        // 执行庄家行动
        switch (action) {
            case 'raise':
                const raiseAmount = Math.min(callAmount + 20, this.dealerChips);
                this.dealerChips -= raiseAmount;
                this.pot += raiseAmount;
                this.dealerRoundBet += raiseAmount;
                this.updateTurnIndicator('庄家加注了！');
                break;
                
            case 'call':
                const callAmt = Math.min(callAmount, this.dealerChips);
                this.dealerChips -= callAmt;
                this.pot += callAmt;
                this.dealerRoundBet += callAmt;
                this.updateTurnIndicator('庄家跟注了');
                break;
                
            case 'check':
                this.updateTurnIndicator('庄家看牌了');
                break;
                
            case 'allin':
                this.dealerChips = 0;
                this.pot += this.dealerChips;
                this.dealerRoundBet += this.dealerChips;
                this.updateTurnIndicator('庄家全押了！');
                break;
                
            case 'fold':
                this.dealerFolded = true;
                this.updateTurnIndicator('庄家弃牌了');
                this.endRound();
                return;
        }
        
        this.endDealerTurn();
    }

    // 结束庄家回合
    endDealerTurn() {
        // 检查是否应该结束下注轮次
        if (this.shouldEndBettingRound()) {
            this.endRound();
        } else {
            this.bettingRound++;
            this.currentTurn = 'player';
            this.updateDisplay();
            
            if (this.bettingRound >= this.maxRounds) {
                this.updateTurnIndicator('下注轮次结束，点击"看牌"比牌');
            } else {
                this.updateTurnIndicator('轮到你下注');
            }
        }
    }

    // 检查是否应该结束下注轮次
    shouldEndBettingRound() {
        // 如果达到最大轮次
        if (this.bettingRound >= this.maxRounds) {
            return true;
        }
        
        // 如果双方都看牌（没有额外下注）
        if (this.playerRoundBet === this.dealerRoundBet && 
            this.bettingRound > 0) {
            return true;
        }
        
        return false;
    }

    // 检查玩家是否可以行动
    canPlayerAct() {
        return this.gameStarted && 
               !this.compared && 
               !this.playerFolded && 
               !this.dealerFolded &&
               this.currentTurn === 'player';
    }

    // 结束回合，进行比牌
    endRound() {
        this.compared = true;
        
        // 显示庄家手牌
        this.renderCards();
        
        let resultText = '';
        let resultClass = '';
        
        if (this.playerFolded) {
            resultText = '你弃牌了，庄家赢得底池！';
            resultClass = 'fold-lose';
            this.dealerChips += this.pot;
        } else if (this.dealerFolded) {
            resultText = '庄家弃牌，你赢得底池！';
            resultClass = 'fold-win';
            this.playerChips += this.pot;
        } else {
            // 比牌
            const playerHand = this.getHandType(this.playerCards);
            const dealerHand = this.getHandType(this.dealerCards);
            
            document.getElementById('player-hand-type').textContent = playerHand.type;
            document.getElementById('dealer-hand-type').textContent = dealerHand.type;
            
            const result = this.compareHands(playerHand, dealerHand);
            
            if (result > 0) {
                resultText = `你赢了！赢得 ${this.pot} 筹码`;
                resultClass = 'win';
                this.playerChips += this.pot;
            } else if (result < 0) {
                resultText = `庄家赢了！你失去 ${this.pot} 筹码`;
                resultClass = 'lose';
                this.dealerChips += this.pot;
            } else {
                resultText = '平局！筹码返还';
                resultClass = 'tie';
                this.playerChips += Math.floor(this.pot / 2);
                this.dealerChips += Math.floor(this.pot / 2);
            }
        }
        
        this.pot = 0;
        
        const resultDiv = document.getElementById('result');
        resultDiv.textContent = resultText;
        resultDiv.className = 'result ' + resultClass;
        
        this.updateDisplay();
        this.checkGameOver();
    }

    // 判断牌型
    getHandType(cards) {
        const sortedCards = [...cards].sort((a, b) => a.value - b.value);
        const values = sortedCards.map(card => card.value);
        const suits = sortedCards.map(card => card.suit);

        // 检查是否是豹子
        if (values[0] === values[1] && values[1] === values[2]) {
            return { type: '豹子', rank: 6, highCard: values[0] };
        }

        // 检查是否同花
        const isFlush = suits[0] === suits[1] && suits[1] === suits[2];

        // 检查是否顺子
        let isStraight = false;
        let straightHigh = 0;

        // 常规顺子
        if (values[2] - values[0] === 2 && 
            values[1] - values[0] === 1 && 
            values[2] - values[1] === 1) {
            isStraight = true;
            straightHigh = values[2];
        }

        // A-2-3 顺子
        if (values[0] === 1 && values[1] === 2 && values[2] === 3) {
            isStraight = true;
            straightHigh = 3;
        }

        // Q-K-A 顺子
        if (values[0] === 1 && values[1] === 12 && values[2] === 13) {
            isStraight = true;
            straightHigh = 14;
        }

        // 同花顺
        if (isFlush && isStraight) {
            return { type: '同花顺', rank: 5, highCard: straightHigh };
        }

        // 同花
        if (isFlush) {
            const highCard = Math.max(...values.map(v => v === 1 ? 14 : v));
            return { type: '同花', rank: 4, highCard: highCard };
        }

        // 顺子
        if (isStraight) {
            return { type: '顺子', rank: 3, highCard: straightHigh };
        }

        // 检查对子
        if (values[0] === values[1] || values[1] === values[2]) {
            let pairValue, singleValue;
            if (values[0] === values[1]) {
                pairValue = values[0];
                singleValue = values[2];
            } else {
                pairValue = values[1];
                singleValue = values[0];
            }
            if (singleValue === 1) singleValue = 14;
            return { 
                type: '对子', 
                rank: 2, 
                pairValue: pairValue, 
                singleValue: singleValue 
            };
        }

        // 单张
        const sortedValues = values.map(v => v === 1 ? 14 : v).sort((a, b) => b - a);
        return { 
            type: '单张', 
            rank: 1, 
            values: sortedValues 
        };
    }

    // 比较两手牌
    compareHands(playerHand, dealerHand) {
        if (playerHand.rank !== dealerHand.rank) {
            return playerHand.rank - dealerHand.rank;
        }

        switch (playerHand.type) {
            case '豹子':
            case '同花顺':
            case '同花':
            case '顺子':
                return playerHand.highCard - dealerHand.highCard;

            case '对子':
                if (playerHand.pairValue !== dealerHand.pairValue) {
                    return playerHand.pairValue - dealerHand.pairValue;
                }
                return playerHand.singleValue - dealerHand.singleValue;

            case '单张':
                for (let i = 0; i < 3; i++) {
                    if (playerHand.values[i] !== dealerHand.values[i]) {
                        return playerHand.values[i] - dealerHand.values[i];
                    }
                }
                return 0;
        }
    }

    // 检查游戏是否结束
    checkGameOver() {
        const resultDiv = document.getElementById('result');
        const nextBtn = document.getElementById('next-btn');
        const startBtn = document.getElementById('start-btn');
        
        if (this.playerChips <= 0) {
            resultDiv.textContent = '游戏结束！你输光了所有筹码！';
            resultDiv.className = 'result lose';
            this.disableAllControls();
            startBtn.style.display = 'inline-block';
            startBtn.textContent = '重新开始';
            startBtn.disabled = false;
            nextBtn.style.display = 'none';
        } else if (this.dealerChips <= 0) {
            resultDiv.textContent = '游戏结束！你赢光了庄家所有筹码！';
            resultDiv.className = 'result win';
            this.disableAllControls();
            startBtn.style.display = 'inline-block';
            startBtn.textContent = '重新开始';
            startBtn.disabled = false;
            nextBtn.style.display = 'none';
        } else {
            // 游戏未结束，显示下一局按钮
            startBtn.style.display = 'none';
            nextBtn.style.display = 'inline-block';
        }
    }

    disableAllControls() {
        document.getElementById('start-btn').disabled = true;
        document.getElementById('call-btn').disabled = true;
        document.getElementById('raise-btn').disabled = true;
        document.getElementById('check-btn').disabled = true;
        document.getElementById('fold-btn').disabled = true;
    }

    // 下一局
    nextRound() {
        // 重置轮次状态
        this.playerCards = [];
        this.dealerCards = [];
        this.pot = 0;
        this.playerRoundBet = 0;
        this.dealerRoundBet = 0;
        this.gameStarted = false;
        this.compared = false;
        this.playerFolded = false;
        this.dealerFolded = false;
        this.bettingRound = 0;
        this.currentTurn = 'player';
        
        // 清空显示
        document.getElementById('player-cards').innerHTML = '';
        document.getElementById('dealer-cards').innerHTML = '';
        document.getElementById('player-hand-type').textContent = '';
        document.getElementById('dealer-hand-type').textContent = '';
        document.getElementById('result').textContent = '';
        document.getElementById('result').className = 'result';
        
        // 切换按钮显示
        document.getElementById('next-btn').style.display = 'none';
        const startBtn = document.getElementById('start-btn');
        startBtn.style.display = 'inline-block';
        startBtn.textContent = '开始游戏';
        startBtn.disabled = false;
        
        this.updateDisplay();
        this.updateTurnIndicator('点击"开始游戏"开始新的一局');
    }

    // 重新开始
    resetGame() {
        this.playerChips = 1000;
        this.dealerChips = 1000;
        
        // 重置所有状态
        this.playerCards = [];
        this.dealerCards = [];
        this.pot = 0;
        this.playerRoundBet = 0;
        this.dealerRoundBet = 0;
        this.gameStarted = false;
        this.compared = false;
        this.playerFolded = false;
        this.dealerFolded = false;
        this.bettingRound = 0;
        this.currentTurn = 'player';
        
        // 清空显示
        document.getElementById('player-cards').innerHTML = '';
        document.getElementById('dealer-cards').innerHTML = '';
        document.getElementById('player-hand-type').textContent = '';
        document.getElementById('dealer-hand-type').textContent = '';
        document.getElementById('result').textContent = '';
        document.getElementById('result').className = 'result';
        
        // 重置按钮
        document.getElementById('next-btn').style.display = 'none';
        const startBtn = document.getElementById('start-btn');
        startBtn.style.display = 'inline-block';
        startBtn.textContent = '开始游戏';
        startBtn.disabled = false;
        
        this.updateDisplay();
        this.updateTurnIndicator('点击"开始游戏"开始新的一局');
    }

    // 重置当前轮次
    resetRound() {
        this.playerCards = [];
        this.dealerCards = [];
        this.pot = 0;
        this.playerRoundBet = 0;
        this.dealerRoundBet = 0;
        this.gameStarted = false;
        this.compared = false;
        this.playerFolded = false;
        this.dealerFolded = false;
        this.bettingRound = 0;
        this.currentTurn = 'player';
        
        document.getElementById('player-cards').innerHTML = '';
        document.getElementById('dealer-cards').innerHTML = '';
        document.getElementById('player-hand-type').textContent = '';
        document.getElementById('dealer-hand-type').textContent = '';
        
        this.updateDisplay();
        this.updateTurnIndicator('点击"开始游戏"开始新的一局');
    }

    // 渲染卡牌
    renderCards() {
        const playerCardsDiv = document.getElementById('player-cards');
        const dealerCardsDiv = document.getElementById('dealer-cards');

        playerCardsDiv.innerHTML = '';
        dealerCardsDiv.innerHTML = '';

        // 显示玩家手牌
        this.playerCards.forEach(card => {
            playerCardsDiv.appendChild(this.createCardElement(card));
        });

        // 显示庄家手牌
        if (!this.compared && !this.dealerFolded) {
            for (let i = 0; i < 3; i++) {
                const cardBack = document.createElement('div');
                cardBack.className = 'card card-back';
                cardBack.innerHTML = '<div class="suit">🂠</div>';
                dealerCardsDiv.appendChild(cardBack);
            }
        } else {
            this.dealerCards.forEach(card => {
                dealerCardsDiv.appendChild(this.createCardElement(card));
            });
        }
    }

    createCardElement(card) {
        const cardDiv = document.createElement('div');
        cardDiv.className = 'card';

        cardDiv.innerHTML = `
            <div class="value">${card.displayValue}</div>
            <div class="suit ${card.suitColor}">${card.suitSymbol}</div>
            <div class="value-bottom">${card.displayValue}</div>
        `;

        return cardDiv;
    }

    // 更新显示
    updateDisplay() {
        document.getElementById('player-chips').textContent = this.playerChips;
        document.getElementById('dealer-chips').textContent = this.dealerChips;
        document.getElementById('pot-amount').textContent = this.pot;
        document.getElementById('player-round-bet').textContent = this.playerRoundBet;
        document.getElementById('dealer-round-bet').textContent = this.dealerRoundBet;
        
        this.updateActionButtons();
    }

    // 更新操作按钮状态
    updateActionButtons() {
        const startBtn = document.getElementById('start-btn');
        const callBtn = document.getElementById('call-btn');
        const raiseBtn = document.getElementById('raise-btn');
        const checkBtn = document.getElementById('check-btn');
        const foldBtn = document.getElementById('fold-btn');
        
        const canAct = this.canPlayerAct();
        const callAmount = this.dealerRoundBet - this.playerRoundBet;
        
        startBtn.disabled = this.gameStarted;
        callBtn.disabled = !canAct || callAmount <= 0 || this.playerChips < callAmount;
        raiseBtn.disabled = !canAct || this.playerChips < callAmount + 20;
        checkBtn.disabled = !canAct;
        foldBtn.disabled = !canAct;
    }

    // 更新轮次指示器
    updateTurnIndicator(message) {
        const roundInfo = this.gameStarted ? ` (第${this.bettingRound + 1}/${this.maxRounds}轮)` : '';
        document.getElementById('turn-indicator').textContent = message + roundInfo;
    }

    // 设置事件监听器
    setupEventListeners() {
        document.getElementById('start-btn').addEventListener('click', () => {
            if (this.playerChips <= 0 || this.dealerChips <= 0) {
                this.resetGame();
            } else {
                this.startGame();
            }
        });

        document.getElementById('next-btn').addEventListener('click', () => {
            this.nextRound();
        });

        document.getElementById('call-btn').addEventListener('click', () => {
            this.playerCall();
        });

        document.getElementById('raise-btn').addEventListener('click', () => {
            this.playerRaise();
        });

        document.getElementById('check-btn').addEventListener('click', () => {
            this.playerCheck();
        });

        document.getElementById('fold-btn').addEventListener('click', () => {
            this.playerFold();
        });
        
        // 加注弹窗事件
        document.querySelectorAll('.raise-option-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                document.querySelectorAll('.raise-option-btn').forEach(b => b.classList.remove('selected'));
                btn.classList.add('selected');
                this.selectedRaiseAmount = parseInt(btn.dataset.amount);
                this.updateRaiseModal();
            });
        });
        
        document.getElementById('custom-raise').addEventListener('input', (e) => {
            const value = parseInt(e.target.value) || 20;
            this.selectedRaiseAmount = Math.max(20, value);
            document.querySelectorAll('.raise-option-btn').forEach(b => b.classList.remove('selected'));
            this.updateRaiseModal();
        });
        
        document.getElementById('confirm-raise-btn').addEventListener('click', () => {
            this.confirmRaise();
        });
        
        document.getElementById('cancel-raise-btn').addEventListener('click', () => {
            this.closeRaiseModal();
        });
        
        // 点击弹窗外部关闭
        document.getElementById('raise-modal').addEventListener('click', (e) => {
            if (e.target.id === 'raise-modal') {
                this.closeRaiseModal();
            }
        });
    }
}

// 初始化游戏
document.addEventListener('DOMContentLoaded', () => {
    new ZhaJinHuaGame();
});