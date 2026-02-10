
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

    if (error) return res.status(400).json({ error: error.message });
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
   3. RESET / CHANGE PIN (NEW)
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
      return res.status(404).json({ error: 'User not found or update failed' });
    }

    res.json({ success: true, message: 'PIN updated successfully!' });
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});

/* =========================
   4. FUND ACCOUNT (Updated)
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

    const { error } = await supabase
      .from('profiles')
      .update({ balance: newBalance })
      .eq('phone', phone);

    if (error) throw error;

    // Return newBalance so the frontend updates immediately
    res.json({ message: `Funded!`, newBalance: newBalance });
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});

/* =========================
   5. SEND MONEY
========================= */
app.post('/api/send', async (req, res) => {
  try {
    const { fromPhone, toPhone, amount } = req.body;
    if (!amount || amount <= 0) return res.status(400).json({ error: 'Invalid amount' });

    const { data: sender } = await supabase
      .from('profiles')
      .select('balance')
      .eq('phone', fromPhone)
      .single();

    if (!sender) return res.status(404).json({ error: 'Sender not found' });
    if (sender.balance < amount) return res.status(400).json({ error: 'No funds. Fund account.' });

    const newBalance = sender.balance - amount;

    await supabase
      .from('profiles')
      .update({ balance: newBalance })
      .eq('phone', fromPhone);

    res.json({
      success: true,
      message: `Ksh ${amount} sent to ${toPhone}`,
      balance: newBalance
    });
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`✅ Backend running on port ${PORT}`);
});
