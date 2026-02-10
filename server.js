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
   4. FUND ACCOUNT (Updated)
========================= */
app.post('/api/fund', async (req, res) => {
  try {
    const { phone, amount } = req.body;
    
    // 1. Fetch current user balance
    const { data: user, error: fetchError } = await supabase
      .from('profiles')
      .select('balance')
      .eq('phone', phone)
      .single();

    if (fetchError || !user) return res.status(404).json({ error: 'User not found' });

    // 2. Calculate New Balance (Supports negative amounts for withdrawals)
    const newBalance = Number(user.balance) + Number(amount);

    // 3. Update the database
    const { error: updateError } = await supabase
      .from('profiles')
      .update({ balance: newBalance })
      .eq('phone', phone);

    if (updateError) throw updateError;

    // 4. Send specific response: "Funded!" and the New Balance
    res.json({ 
      message: 'Funded!', 
      balance: newBalance 
    });

  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

/* ... Rest of your existing endpoints (Register, Login, Send) stay the same ... */

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`✅ Backend running on port ${PORT}`);
});
