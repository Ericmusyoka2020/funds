
const express = require('express');
const cors = require('cors');
const { createClient } = require('@supabase/supabase-js');

const app = express();
app.use(cors());
app.use(express.json());

// Supabase credentials
const SUPABASE_URL = 'https://rhigklbvrqsngzcbdlkm.supabase.co';
const SERVICE_ROLE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InJoaWdrbGJ2cnFzbmd6Y2JkbGttIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3MDYzMjA0MSwiZXhwIjoyMDg2MjA4MDQxfQ.9SCc26l_5GWUwAP83AFBl7aPzMcKugpYKoK-IucXE6A';

const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
  auth: { persistSession: false }
});

/* =========================
   1. REGISTER
========================= */
app.post('/api/register', async (req, res) => {
  try {
    const { phone, password, name } = req.body;
    const { error } = await supabase
      .from('profiles')
      .insert([{ phone, password, full_name: name, balance: 0 }]);

    if (error) {
      if (error.code === '23505' || error.message.includes('unique constraint')) {
        return res.status(400).json({ error: 'Phone number already exists. Please login.' });
      }
      return res.status(400).json({ error: error.message });
    }

    res.json({ message: 'Account created successfully!' });
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});

/* =========================
   2. LOGIN
========================= */
app.post('/api/login', async (req, res) => {
  try {
    const { phone, password } = req.body;
    const { data, error } = await supabase
      .from('profiles')
      .select('*')
      .eq('phone', phone)
      .eq('password', password)
      .single();

    if (error || !data) return res.status(401).json({ error: 'Invalid phone or password' });

    res.json({ success: true, user: data });
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});

/* =========================
   3. RESET / CHANGE PIN
========================= */
app.post('/api/reset-pin', async (req, res) => {
  try {
    const { phone, newPassword } = req.body;
    const { data, error } = await supabase
      .from('profiles')
      .update({ password: newPassword })
      .eq('phone', phone)
      .select();

    if (error || !data || data.length === 0) {
      return res.status(404).json({ error: 'User not found or update failed' });
    }

    res.json({ success: true, message: 'PIN updated successfully!' });
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});

/* =========================
   4. FUND or WITHDRAW (Admin/External)
   - Positive amount → Deposit / Fund
   - Negative amount → Withdraw
   - Always fetches balance after update to confirm
========================= */
app.post('/api/fund', async (req, res) => {
  try {
    const { phone, amount } = req.body;

    // Validate input
    const transactionAmount = Number(amount);
    if (isNaN(transactionAmount) || transactionAmount === 0) {
      return res.status(400).json({ 
        error: 'Amount must be a non-zero number' 
      });
    }

    // 1. Get current user info
    const { data: user, error: fetchError } = await supabase
      .from('profiles')
      .select('id, balance, full_name')
      .eq('phone', phone)
      .single();

    if (fetchError || !user) {
      return res.status(404).json({ 
        error: 'User not found' 
      });
    }

    const currentBalance = Number(user.balance);
    const newCalculatedBalance = currentBalance + transactionAmount;

    // 2. Prevent going negative on withdrawal
    if (transactionAmount < 0 && Math.abs(transactionAmount) > currentBalance) {
      return res.status(400).json({ 
        error: 'Insufficient balance for withdrawal',
        requested: Math.abs(transactionAmount),
        available: currentBalance,
        phone
      });
    }

    // 3. Update balance
    const { error: updateError } = await supabase
      .from('profiles')
      .update({ balance: newCalculatedBalance })
      .eq('phone', phone);

    if (updateError) {
      console.error('Balance update failed:', updateError);
      throw updateError;
    }

    // 4. Fetch the updated balance to confirm the real value
    const { data: updatedUser, error: refetchError } = await supabase
      .from('profiles')
      .select('balance')
      .eq('phone', phone)
      .single();

    if (refetchError || !updatedUser) {
      console.error('Failed to verify balance after update:', refetchError);
      // Fallback to calculated value but warn
      return res.status(200).json({
        success: true,
        warning: 'Balance updated but could not verify latest database value',
        type: transactionAmount > 0 ? 'deposit' : 'withdrawal',
        amount: Math.abs(transactionAmount),
        previousBalance: currentBalance,
        newBalance: newCalculatedBalance,
        phone,
        userName: user.full_name || null,
        timestamp: new Date().toISOString()
      });
    }

    const confirmedNewBalance = Number(updatedUser.balance);

    // 5. Success response
    const isDeposit = transactionAmount > 0;

    res.json({
      success: true,
      message: isDeposit 
        ? `Account funded successfully` 
        : `Withdrawal processed successfully`,
      type: isDeposit ? 'deposit' : 'withdrawal',
      amount: Math.abs(transactionAmount),
      previousBalance: currentBalance,
      newBalance: confirmedNewBalance,
      phone,
      userName: user.full_name || null,
      timestamp: new Date().toISOString()
    });

  } catch (err) {
    console.error('Fund/withdraw error:', err);
    res.status(500).json({ 
      error: 'Server error while processing transaction' 
    });
  }
});

/* =========================
   5. SEND MONEY (Universal Send)
========================= */
app.post('/api/send', async (req, res) => {
  try {
    const { fromPhone, toPhone, amount } = req.body;
    const sendAmt = Number(amount);

    if (!sendAmt || sendAmt <= 0) return res.status(400).json({ error: 'Invalid amount' });
    if (fromPhone === toPhone) return res.status(400).json({ error: 'Cannot send to yourself' });

    // 1. Check sender balance
    const { data: sender, error: senderErr } = await supabase
      .from('profiles')
      .select('balance')
      .eq('phone', fromPhone)
      .single();

    if (senderErr || !sender) return res.status(404).json({ error: 'Sender not found' });

    if (Number(sender.balance) < sendAmt) {
      return res.status(400).json({ 
        error: 'Insufficient funds',
        balance: Number(sender.balance)
      });
    }

    // 2. Deduct from sender
    const newSenderBalance = Number(sender.balance) - sendAmt;
    const { error: deductErr } = await supabase
      .from('profiles')
      .update({ balance: newSenderBalance })
      .eq('phone', fromPhone);

    if (deductErr) throw deductErr;

    // 3. Credit recipient if registered
    const { data: recipient } = await supabase
      .from('profiles')
      .select('balance')
      .eq('phone', toPhone)
      .single();

    if (recipient) {
      const newRecipientBalance = Number(recipient.balance) + sendAmt;
      await supabase
        .from('profiles')
        .update({ balance: newRecipientBalance })
        .eq('phone', toPhone);
    }

    // 4. Success response
    res.json({
      success: true,
      message: `Ksh ${sendAmt} sent successfully to ${toPhone}`,
      balance: newSenderBalance
    });

  } catch (err) {
    console.error("Send money error:", err);
    res.status(500).json({ error: 'Transaction failed' });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`✅ Backend running on port ${PORT}`);
});
