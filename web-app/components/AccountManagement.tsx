// components/AccountManagement.tsx
"use client";

import { useState, useEffect } from 'react';
import { api } from '@/lib/api';
import { useAuthStore } from '@/stores/authStore';

export default function AccountManagement() {
  const { userId } = useAuthStore();
  const [accounts, setAccounts] = useState<{ account_number: string; balance: number }[]>([]);
  const [selectedAccount, setSelectedAccount] = useState<string>('');
  const [amount, setAmount] = useState<number>(0);
  const [targetAccount, setTargetAccount] = useState<string>('');
  const [transactions, setTransactions] = useState<{ transaction_id: string; type: string; amount: number; target_account_number?: string }[]>([]);
  const [showDeposit, setShowDeposit] = useState(false);
  const [showWithdraw, setShowWithdraw] = useState(false);
  const [showTransfer, setShowTransfer] = useState(false);

  useEffect(() => {
    fetchAccounts();
  }, []);

  useEffect(() => {
    if (selectedAccount) {
      fetchTransactions(selectedAccount);
    }
  }, [selectedAccount]);

  const fetchAccounts = async () => {
    const response = await api.get('/api/accounts');
    setAccounts(response.data.accounts);
    if (response.data.accounts.length > 0) {
      setSelectedAccount(response.data.accounts[0].account_number);
      fetchTransactions(response.data.accounts[0].account_number);
    }
  };

  const fetchTransactions = async (accountNumber: string) => {
    const response = await api.get(`/api/account/${accountNumber}/transactions`);
    setTransactions(response.data.transactions);
  };

  const createAccount = async () => {
    await api.post('/api/account', { userId });
    fetchAccounts();
  };

  const handleDeposit = async () => {
    await api.post('/api/account/deposit', { accountNumber: selectedAccount, amount });
    fetchAccounts();
    fetchTransactions(selectedAccount);
    setShowDeposit(false);
  };

  const handleWithdraw = async () => {
    await api.post('/api/account/withdraw', { accountNumber: selectedAccount, amount });
    fetchAccounts();
    fetchTransactions(selectedAccount);
    setShowWithdraw(false);
  };

  const handleTransfer = async () => {
    await api.post('/api/account/transfer', { accountNumber: selectedAccount, targetAccountNumber: targetAccount, amount });
    fetchAccounts();
    fetchTransactions(selectedAccount);
    setShowTransfer(false);
  };

  return (
    <div className="p-6 min-h-screen  flex justify-center items-center">
      <div className="max-w-lg w-full bg-gray-900 shadow-md rounded-lg p-6 text-white">
        <h1 className="text-2xl font-semibold text-center mb-6 text-gray-100">Account Management</h1>

        <div className="flex justify-between items-center mb-6">
          <button
            onClick={createAccount}
            className="bg-gray-800 hover:bg-gray-700 text-white font-medium py-2 px-4 rounded transition"
          >
            + Create Account
          </button>

          <div className="flex items-center">
            <label className="mr-3 font-medium text-gray-300">Account:</label>
            <select
              value={selectedAccount}
              onChange={(e) => setSelectedAccount(e.target.value)}
              className="bg-gray-800 text-white border border-gray-600 rounded p-2 focus:outline-none"
            >
              {accounts.map((account) => (
                <option key={account.account_number} value={account.account_number}>
                  {account.account_number} - ${Number(account.balance).toFixed(2)}
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* Deposit Section */}
        <div className="mb-4">
          <button
            onClick={() => setShowDeposit((prev) => !prev)}
            className="bg-gray-700 hover:bg-gray-600 text-white font-medium py-2 px-4 rounded w-full transition"
          >
            Deposit
          </button>
          {showDeposit && (
            <div className="mt-4">
              <input
                type="number"
                placeholder="Amount"
                value={amount}
                onChange={(e) => setAmount(Number(e.target.value))}
                className="w-full bg-gray-800 text-white p-2 border border-gray-700 rounded mt-2 focus:outline-none"
              />
              <button
                onClick={handleDeposit}
                className="bg-gray-400 hover:bg-gray-600 text-white font-medium py-2 mt-2 rounded w-full transition"
              >
                Confirm Deposit
              </button>
            </div>
          )}
        </div>

        {/* Withdraw Section */}
        <div className="mb-4">
          <button
            onClick={() => setShowWithdraw((prev) => !prev)}
            className="bg-gray-700 hover:bg-gray-600 text-white font-medium py-2 px-4 rounded w-full transition"
          >
            Withdraw
          </button>
          {showWithdraw && (
            <div className="mt-4">
              <input
                type="number"
                placeholder="Amount"
                value={amount}
                onChange={(e) => setAmount(Number(e.target.value))}
                className="w-full bg-gray-800 text-white p-2 border border-gray-700 rounded mt-2 focus:outline-none"
              />
              <button
                onClick={handleWithdraw}
                className="bg-gray-400 hover:bg-gray-600 text-white font-medium py-2 mt-2 rounded w-full transition"
              >
                Confirm Withdraw
              </button>
            </div>
          )}
        </div>

        {/* Transfer Section */}
        <div className="mb-4">
          <button
            onClick={() => setShowTransfer((prev) => !prev)}
            className="bg-gray-700 hover:bg-gray-600 text-white font-medium py-2 px-4 rounded w-full transition"
          >
            Transfer
          </button>
          {showTransfer && (
            <div className="mt-4">
              <input
                type="text"
                placeholder="Target Account"
                value={targetAccount}
                onChange={(e) => setTargetAccount(e.target.value)}
                className="w-full bg-gray-800 text-white p-2 border border-gray-700 rounded mt-2 focus:outline-none"
              />
              <input
                type="number"
                placeholder="Amount"
                value={amount}
                onChange={(e) => setAmount(Number(e.target.value))}
                className="w-full bg-gray-800 text-white p-2 border border-gray-700 rounded mt-2 focus:outline-none"
              />
              <button
                onClick={handleTransfer}
                className="bg-gray-400 hover:bg-gray-600 text-white font-medium py-2 mt-2 rounded w-full transition"
              >
                Confirm Transfer
              </button>
            </div>
          )}
        </div>

        <h2 className="text-xl font-semibold text-gray-200 mt-8 mb-4">Transaction History</h2>
        <div className="bg-gray-800 rounded-lg p-4 max-h-60 overflow-y-auto shadow-inner">
          <ul>
            {transactions.map((transaction) => (
              <li
                key={transaction.transaction_id}
                className="flex justify-between items-center p-3 bg-gray-700 rounded mb-3 border border-gray-600 hover:bg-gray-600 transition"
              >
                <div>
                  <span className="block text-lg font-medium text-gray-200">{transaction.type}</span>
                  <span className="text-sm text-gray-400">
                    Target Account: {transaction.target_account_number || 'N/A'}
                  </span>
                </div>
                <span className="text-lg font-bold text-gray-100">
                  ${Number(transaction.amount).toFixed(2)}
                </span>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  );
}
