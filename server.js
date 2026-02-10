
const express = require('express');
const cors = require('cors');
const { createClient } = require('@supabase/supabase-js');

const app = express();
app.use(cors());
app.use(express.json());

// ✅ Supabase credentials
const SUPABASE_URL = 'https://rhigklbvrqsngzcbdlkm.supabase.co';
const SERVICE_ROLE_KEY = 'YOUR_SERVICE_ROLE_KEY_HERE';

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
      if (error.code === '23505') {
        return res.status(400).json({ error: 'Phone number already exists' });
      }
      return res.status(400).json({ error: error.message });
    }

    res.json({ success: true });
  } catch {
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

    if (error || !data) {
      return res.status(401).json({ error: 'Invalid phone or password' });
    }

    res.json({ success: true, user: data });
  } catch {
    res.status(500).json({ error: 'Server error' });
  }
});

/* =========================
   3. RESET PIN
========================= */
app.post('/api/reset-pin', async (req, res) => {
  try {
    const { phone, newPassword } = req.body;

    const { data, error } = await supabase
      .from('profiles')
      .update({ password: newPassword })
      .eq('phone', phone)
      .select();

    if (error || !data.length) {
      return res.status(404).json({ error: 'User not found' });
    }

    res.json({ success: true });
  } catch {
    res.status(500).json({ error: 'Server error' });
  }
});

/* =========================
   4. FUND / WITHDRAW (ONE LOGIC)
========================= */
app.post('/api/fund', async (req, res) => {
  try {
    const { phone, amount } = req.body;
    const amt = Number(amount);

    if (!amt || amt === 0) {
      return res.status(400).json({ error: 'Invalid amount' });
    }

    const { data: user, error } = await supabase
      .from('profiles')
      .select('balance')
      .eq('phone', phone)
      .single();

    if (error || !user) {
      return res.status(404).json({ error: 'User not found' });
    }

    const currentBalance = Number(user.balance);
    const newBalance = currentBalance + amt;

    // ❌ Prevent overdraft
    if (newBalance < 0) {
      return res.status(400).json({ error: 'Insufficient funds' });
    }

    await supabase
      .from('profiles')
      .update({ balance: newBalance })
      .eq('phone', phone);

    // ✅ FRONTEND GETS ONLY BALANCE
    res.json({ balance: newBalance });

  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

/* =========================
   5. SEND MONEY
========================= */
app.post('/api/send', async (req, res) => {
  try {
    const { fromPhone, toPhone, amount } = req.body;
    const sendAmt = Number(amount);

    if (!sendAmt || sendAmt <= 0) {
      return res.status(400).json({ error: 'Invalid amount' });
    }

    if (fromPhone === toPhone) {
      return res.status(400).json({ error: 'Cannot send to yourself' });
    }

    const { data: sender } = await supabase
      .from('profiles')
      .select('balance')
      .eq('phone', fromPhone)
      .single();

    if (!sender || sender.balance < sendAmt) {
      return res.status(400).json({ error: 'Insufficient funds' });
    }

    const newSenderBalance = sender.balance - sendAmt;

    await supabase
      .from('profiles')
      .update({ balance: newSenderBalance })
      .eq('phone', fromPhone);

    const { data: recipient } = await supabase
      .from('profiles')
      .select('balance')
      .eq('phone', toPhone)
      .single();

    if (recipient) {
      await supabase
        .from('profiles')
        .update({ balance: recipient.balance + sendAmt })
        .eq('phone', toPhone);
    }

    res.json({
      success: true,
      balance: newSenderBalance
    });

  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Transaction failed' });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`✅ Backend running on port ${PORT}`);
});
