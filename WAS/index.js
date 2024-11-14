require('dotenv').config();
const express = require('express');
const mysql = require('mysql2/promise');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { v4: uuidv4 } = require('uuid');
const cors = require('cors');

const app = express();
app.use(express.json());

// CORS 설정 추가
app.use(cors({
  origin: 'http://localhost:3000', // 허용할 도메인
  methods: 'GET,HEAD,PUT,PATCH,POST,DELETE',
  credentials: true,
}));

// MySQL 연결 설정
const db = mysql.createPool({
  host: process.env.DB_HOST,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
});

// 회원가입 라우트
app.post('/register', async (req, res) => {
  const { username, password } = req.body;
  
  if (!username || !password) {
    return res.status(400).json({ message: 'Username and password are required.' });
  }

  const hashedPassword = await bcrypt.hash(password, 10);
  console.log(`Registering user: ${username}`);

  try {
    const [result] = await db.query('INSERT INTO users (username, password) VALUES (?, ?)', [
      username,
      hashedPassword,
    ]);
    res.status(201).json({ message: 'User registered successfully.' });
  } catch (error) {
    console.error('Database error on registration:', error);
    if (error.code === 'ER_DUP_ENTRY') {
      res.status(400).json({ message: 'Username already exists.' });
    } else {
      res.status(500).json({ message: 'Database error', error });
    }
  }
});

// 로그인 라우트
app.post('/login', async (req, res) => {
  const { username, password } = req.body;
  
  if (!username || !password) {
    return res.status(400).json({ message: 'Username and password are required.' });
  }

  try {
    console.log(`User login attempt: ${username}`);
    const [rows] = await db.query('SELECT * FROM users WHERE username = ?', [username]);
    const user = rows[0];

    if (!user) {
      console.log(`Login failed for user: ${username} (user not found)`);
      return res.status(400).json({ message: 'Invalid username or password.' });
    }

    const isPasswordValid = await bcrypt.compare(password, user.password);
    if (!isPasswordValid) {
      console.log(`Login failed for user: ${username} (invalid password)`);
      return res.status(400).json({ message: 'Invalid username or password.' });
    }

    const token = jwt.sign({ userId: user.id }, process.env.JWT_SECRET, { expiresIn: '1h' });
    console.log(`User ${username} logged in successfully`);
    res.json({ message: 'Login successful', token });
  } catch (error) {
    console.error('Database error on login:', error);
    res.status(500).json({ message: 'Database error', error });
  }
});

// 인증 미들웨어
const authenticate = (req, res, next) => {
  const token = req.headers.authorization?.split(" ")[1];
  if (!token) {
    console.log('Authentication failed: No token provided');
    return res.status(401).json({ message: "Authentication required" });
  }

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    req.userId = decoded.userId;
    next();
  } catch (error) {
    console.log('Authentication failed: Invalid token');
    res.status(403).json({ message: "Invalid token" });
  }
};

// 계좌 생성 라우트
app.post('/account', authenticate, async (req, res) => {
  const { userId } = req;
  const accountNumber = uuidv4().split('-')[0];
  console.log(`Creating account for user ${userId} with account number ${accountNumber}`);

  try {
    const [result] = await db.query('INSERT INTO accounts (user_id, account_number, balance) VALUES (?, ?, 0)', [
      userId, accountNumber,
    ]);
    res.status(201).json({ message: 'Account created successfully', accountNumber });
  } catch (error) {
    console.error('Database error on account creation:', error);
    res.status(500).json({ message: 'Database error', error });
  }
});

// 계좌 목록 조회 라우트
app.get('/accounts', authenticate, async (req, res) => {
  const { userId } = req;
  console.log(`Fetching accounts for user ${userId}`);

  try {
    const [accounts] = await db.query('SELECT * FROM accounts WHERE user_id = ?', [userId]);
    res.status(200).json({ accounts });
  } catch (error) {
    console.error('Database error on fetching accounts:', error);
    res.status(500).json({ message: 'Database error', error });
  }
});

// 입금 라우트
app.post('/account/deposit', authenticate, async (req, res) => {
  const { userId } = req;
  const { accountNumber, amount } = req.body;

  if (amount <= 0) {
    console.log(`Deposit failed: Invalid amount ${amount}`);
    return res.status(400).json({ message: 'Amount must be greater than zero.' });
  }

  try {
    console.log(`Depositing ${amount} to account ${accountNumber} for user ${userId}`);
    await db.query('START TRANSACTION');
    await db.query('UPDATE accounts SET balance = balance + ? WHERE account_number = ? AND user_id = ?', [amount, accountNumber, userId]);
    await db.query('INSERT INTO transactions (account_number, type, amount) VALUES (?, "deposit", ?)', [accountNumber, amount]);
    await db.query('COMMIT');

    const [account] = await db.query('SELECT * FROM accounts WHERE account_number = ?', [accountNumber]);
    res.status(200).json({ message: 'Deposit successful', balance: account[0].balance });
  } catch (error) {
    await db.query('ROLLBACK');
    console.error('Database error on deposit:', error);
    res.status(500).json({ message: 'Database error', error });
  }
});

// 출금 라우트
app.post('/account/withdraw', authenticate, async (req, res) => {
  const { userId } = req;
  const { accountNumber, amount } = req.body;

  if (amount <= 0) {
    console.log(`Withdrawal failed: Invalid amount ${amount}`);
    return res.status(400).json({ message: 'Amount must be greater than zero.' });
  }

  try {
    const [accounts] = await db.query('SELECT balance FROM accounts WHERE account_number = ? AND user_id = ?', [accountNumber, userId]);
    if (!accounts.length || accounts[0].balance < amount) {
      console.log(`Insufficient funds or unauthorized access for account ${accountNumber}`);
      return res.status(400).json({ message: 'Insufficient funds or unauthorized access.' });
    }

    await db.query('START TRANSACTION');
    await db.query('UPDATE accounts SET balance = balance - ? WHERE account_number = ? AND user_id = ?', [amount, accountNumber, userId]);
    await db.query('INSERT INTO transactions (account_number, type, amount) VALUES (?, "withdrawal", ?)', [accountNumber, amount]);
    await db.query('COMMIT');

    const [updatedAccount] = await db.query('SELECT balance FROM accounts WHERE account_number = ?', [accountNumber]);
    res.status(200).json({ message: 'Withdrawal successful', balance: updatedAccount[0].balance });
  } catch (error) {
    await db.query('ROLLBACK');
    console.error('Database error on withdrawal:', error);
    res.status(500).json({ message: 'Database error', error });
  }
});

// 이체 라우트
app.post('/account/transfer', authenticate, async (req, res) => {
  const { userId } = req;
  const { accountNumber, targetAccountNumber, amount } = req.body;

  if (amount <= 0) {
    console.log(`Transfer failed: Invalid amount ${amount}`);
    return res.status(400).json({ message: 'Amount must be greater than zero.' });
  }

  try {
    const [sourceAccount] = await db.query('SELECT balance FROM accounts WHERE account_number = ? AND user_id = ?', [accountNumber, userId]);
    if (!sourceAccount.length || sourceAccount[0].balance < amount) {
      console.log(`Transfer failed: Insufficient funds or unauthorized access to account ${accountNumber}`);
      return res.status(400).json({ message: 'Insufficient funds or unauthorized access.' });
    }

    const [destinationAccount] = await db.query('SELECT * FROM accounts WHERE account_number = ?', [targetAccountNumber]);
    if (!destinationAccount.length) {
      console.log(`Transfer failed: Target account ${targetAccountNumber} not found`);
      return res.status(400).json({ message: 'Target account not found.' });
    }

    await db.query('START TRANSACTION');

    // Update sender's account balance
    await db.query('UPDATE accounts SET balance = balance - ? WHERE account_number = ? AND user_id = ?', [amount, accountNumber, userId]);

    // Update receiver's account balance
    await db.query('UPDATE accounts SET balance = balance + ? WHERE account_number = ?', [amount, targetAccountNumber]);

    // Log transaction for the sender
    await db.query('INSERT INTO transactions (account_number, type, amount, target_account_number) VALUES (?, "transfer_out", ?, ?)', [accountNumber, amount, targetAccountNumber]);

    // Log transaction for the receiver
    await db.query('INSERT INTO transactions (account_number, type, amount, source_account_number) VALUES (?, "transfer_in", ?, ?)', [targetAccountNumber, amount, accountNumber]);

    await db.query('COMMIT');

    const [updatedAccount] = await db.query('SELECT balance FROM accounts WHERE account_number = ?', [accountNumber]);
    res.status(200).json({ message: 'Transfer successful', balance: updatedAccount[0].balance });
  } catch (error) {
    await db.query('ROLLBACK');
    console.error('Database error on transfer:', error);
    res.status(500).json({ message: 'Database error', error });
  }
});

// 트랜잭션 조회 라우트
app.get('/account/:accountNumber/transactions', authenticate, async (req, res) => {
  const { userId } = req;
  const { accountNumber } = req.params;

  console.log(`Fetching transactions for account ${accountNumber} of user ${userId}`);

  try {
    const [account] = await db.query('SELECT * FROM accounts WHERE account_number = ? AND user_id = ?', [accountNumber, userId]);
    if (!account.length) {
      console.log(`Access denied for transactions of account ${accountNumber} (user ${userId} does not own this account)`);
      return res.status(403).json({ message: 'Access denied.' });
    }

    const [transactions] = await db.query('SELECT * FROM transactions WHERE account_number = ?', [accountNumber]);
    res.status(200).json({ transactions });
  } catch (error) {
    console.error('Database error on fetching transactions:', error);
    res.status(500).json({ message: 'Database error', error });
  }
});

// 서버 시작
const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});
