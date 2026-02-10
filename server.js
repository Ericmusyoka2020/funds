const express = require('express');
const cors = require('cors');
const { createClient } = require('@supabase/supabase-js');

const app = express();
app.use(cors());
app.use(express.json());

// ✅ Supabase credentials
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
   4. FUND ACCOUNT
========================= */
app.post('/api/fund', async (req, res) => {
  try {
    const { phone, amount } = req.body;
    const { data: user } = await supabase
      .from('profiles')
      .select('balance')
      .eq('phone', phone)
      .single();

    if (!user) return res.status(404).json({ error: 'User not found' });

    const newBalance = Number(user.balance) + Number(amount);
    const { error } = await supabase.from('profiles').update({ balance: newBalance }).eq('phone', phone);

    if (error) throw error;
    res.json({ message: `Funded!`, newBalance: newBalance });
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});

/* =========================
   5. SEND MONEY (Flexible Logic)
========================= */
app.post('/api/send', async (req, res) => {
  try {
    const { fromPhone, toPhone, amount } = req.body;
    const sendAmt = Number(amount);

    if (!sendAmt || sendAmt <= 0) return res.status(400).json({ error: 'Invalid amount' });
    if (fromPhone === toPhone) return res.status(400).json({ error: 'Cannot send money to yourself' });

    // 1. Get Sender Details
    const { data: sender, error: senderFetchError } = await supabase
      .from('profiles')
      .select('balance')
      .eq('phone', fromPhone)
      .single();

    if (senderFetchError || !sender) return res.status(404).json({ error: 'Sender not found' });
    
    // 2. Check if sender has enough balance
    if (Number(sender.balance) < sendAmt) {
      return res.status(400).json({ error: 'Insufficient funds. Please fund your account.' });
    }

    // 3. Deduct from Sender (This happens regardless of whether recipient exists)
    const newSenderBalance = Number(sender.balance) - sendAmt;
    const { error: updateSenderError } = await supabase
      .from('profiles')
      .update({ balance: newSenderBalance })
      .eq('phone', fromPhone);

    if (updateSenderError) throw updateSenderError;

    // 4. Try to find the recipient to update their balance
    const { data: recipient } = await supabase
      .from('profiles')
      .select('balance')
      .eq('phone', toPhone)
      .single();

    if (recipient) {
      // Recipient exists, add the money to their account
      const newRecipientBalance = Number(recipient.balance) + sendAmt;
      await supabase
        .from('profiles')
        .update({ balance: newRecipientBalance })
        .eq('phone', toPhone);
    } 
    // If recipient doesn't exist, we don't throw an error. 
    // The money has been successfully deducted from sender.

    res.json({
      success: true,
      message: `Ksh ${sendAmt} sent to ${toPhone}`,
      balance: newSenderBalance
    });

  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Transaction failed on server' });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`✅ Backend running on port ${PORT}`);
});
