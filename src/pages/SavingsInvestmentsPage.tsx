import { useState, useEffect, useMemo } from 'react';
import { AppLayout } from '@/components/AppLayout';
import { EmptyState } from '@/components/EmptyState';
import { formatCurrency } from '@/lib/constants';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/context/AuthContext';
import { useBusiness } from '@/context/BusinessContext';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { StatusBadge } from '@/components/StatusBadge';
import { Plus, Pencil, Trash2, PiggyBank, TrendingUp, Wallet, HandCoins, Banknote, X } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';

interface BankAccount {
  id: string; bank_name: string; account_name: string; account_number: string;
  branch: string; mobile_money_name: string; mobile_money_number: string;
  account_type: string; note: string;
}
interface Saving {
  id: string; amount: number; savings_date: string; source: string;
  note: string; bank_account_id: string | null; reference: string;
  recorded_by: string; created_at: string;
}
interface Investment {
  id: string; investment_name: string; amount: number; investment_date: string;
  expected_return: number; duration: string; status: string; note: string;
  bank_account_id: string | null; reference: string; recorded_by: string; created_at: string;
}
interface InvestorFunding {
  id: string; investor_name: string; amount: number; date_received: string;
  payment_method: string; bank_account_id: string | null; reference: string;
  phone: string; email: string; investment_type: string; repayment_terms: string;
  expected_return: number; note: string; status: string; recorded_by: string; created_at: string;
}

const emptySaving = { amount: 0, savings_date: new Date().toISOString().slice(0, 10), source: '', note: '', bank_account_id: '', reference: '' };
const emptyInvestment = { investment_name: '', amount: 0, investment_date: new Date().toISOString().slice(0, 10), expected_return: 0, duration: '', status: 'active', note: '', bank_account_id: '', reference: '' };
const emptyFunding = {
  investor_name: '', amount: 0, date_received: new Date().toISOString().slice(0, 10),
  payment_method: 'cash', bank_account_id: '', reference: '', phone: '', email: '',
  investment_type: '', repayment_terms: '', expected_return: 0, note: '', status: 'active',
};

function matchesDateRange(dateValue: string, from: string, to: string) {
  const time = new Date(dateValue).getTime();
  if (from && time < new Date(`${from}T00:00:00`).getTime()) return false;
  if (to && time > new Date(`${to}T23:59:59`).getTime()) return false;
  return true;
}

export default function SavingsInvestmentsPage() {
  const { user } = useAuth();
  const { businessId } = useBusiness();
  const { toast } = useToast();
  const [banks, setBanks] = useState<BankAccount[]>([]);
  const [savings, setSavings] = useState<Saving[]>([]);
  const [investments, setInvestments] = useState<Investment[]>([]);
  const [fundings, setFundings] = useState<InvestorFunding[]>([]);
  const [availableCash, setAvailableCash] = useState(0);

  const [savingForm, setSavingForm] = useState(emptySaving);
  const [editSavingId, setEditSavingId] = useState<string | null>(null);
  const [savingOpen, setSavingOpen] = useState(false);

  const [investForm, setInvestForm] = useState(emptyInvestment);
  const [editInvestId, setEditInvestId] = useState<string | null>(null);
  const [investOpen, setInvestOpen] = useState(false);

  const [fundingForm, setFundingForm] = useState(emptyFunding);
  const [editFundingId, setEditFundingId] = useState<string | null>(null);
  const [fundingOpen, setFundingOpen] = useState(false);
  const [savingsDateFrom, setSavingsDateFrom] = useState('');
  const [savingsDateTo, setSavingsDateTo] = useState('');
  const [investmentDateFrom, setInvestmentDateFrom] = useState('');
  const [investmentDateTo, setInvestmentDateTo] = useState('');
  const [fundingDateFrom, setFundingDateFrom] = useState('');
  const [fundingDateTo, setFundingDateTo] = useState('');

  useEffect(() => {
    fetchAll();
    const ch = supabase.channel('savings-investments')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'savings' }, fetchAll)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'investments' }, fetchAll)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'bank_accounts' }, fetchAll)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'investor_funding' }, fetchAll)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'sales' }, fetchAll)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'expenses' }, fetchAll)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'restocks' }, fetchAll)
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, []);

  const fetchAll = async () => {
    const [b, s, i, f, salesRes, expRes, restockRes] = await Promise.all([
      supabase.from('bank_accounts').select('*').order('created_at', { ascending: false }),
      supabase.from('savings').select('*').order('savings_date', { ascending: false }),
      supabase.from('investments').select('*').order('investment_date', { ascending: false }),
      supabase.from('investor_funding').select('*').order('date_received', { ascending: false }),
      supabase.from('sales').select('total'),
      supabase.from('expenses').select('amount'),
      supabase.from('restocks').select('total_cost'),
    ]);
    const banksData = (b.data || []) as any;
    const savingsData = (s.data || []) as any;
    const investData = (i.data || []) as any;
    const fundingData = (f.data || []) as any;
    const salesData = salesRes.data || [];
    const expData = expRes.data || [];

    setBanks(banksData);
    setSavings(savingsData);
    setInvestments(investData);
    setFundings(fundingData);

    const totalRevenue = salesData.reduce((sum: number, r: any) => sum + Number(r.total), 0);
    const totalExpenses = expData.reduce((sum: number, r: any) => sum + Number(r.amount), 0);
    const totalSav = savingsData.reduce((sum: number, r: any) => sum + Number(r.amount), 0);
    const totalInv = investData.reduce((sum: number, r: any) => sum + Number(r.amount), 0);
    const totalFund = fundingData.reduce((sum: number, r: any) => sum + Number(r.amount), 0);
    const totalRestock = (restockRes.data || []).reduce((sum: number, r: any) => sum + Number(r.total_cost), 0);
    setAvailableCash(totalRevenue + totalFund - totalExpenses - totalSav - totalInv - totalRestock);
  };

  const totalSavings = savings.reduce((s, r) => s + Number(r.amount), 0);
  const totalInvestments = investments.reduce((s, r) => s + Number(r.amount), 0);
  const activeInvestments = investments.filter(i => i.status === 'active');
  const totalFunding = fundings.reduce((s, r) => s + Number(r.amount), 0);
  const filteredSavings = useMemo(
    () => savings.filter((row) => matchesDateRange(row.savings_date, savingsDateFrom, savingsDateTo)),
    [savings, savingsDateFrom, savingsDateTo],
  );
  const filteredInvestments = useMemo(
    () => investments.filter((row) => matchesDateRange(row.investment_date, investmentDateFrom, investmentDateTo)),
    [investments, investmentDateFrom, investmentDateTo],
  );
  const filteredFundings = useMemo(
    () => fundings.filter((row) => matchesDateRange(row.date_received, fundingDateFrom, fundingDateTo)),
    [fundings, fundingDateFrom, fundingDateTo],
  );

  const getBankName = (id: string | null) => banks.find(b => b.id === id)?.bank_name || '—';

  // Savings CRUD
  const handleSavingSave = async () => {
    if (!savingForm.amount || !user) return;
    const editingCurrent = editSavingId ? savings.find(s => s.id === editSavingId) : null;
    const netNew = savingForm.amount - (editingCurrent ? Number(editingCurrent.amount) : 0);
    if (netNew > availableCash) {
      toast({ title: 'Insufficient available funds', description: `You only have ${formatCurrency(availableCash)} available. Cannot set aside ${formatCurrency(savingForm.amount)}.`, variant: 'destructive' });
      return;
    }
    if (!businessId) return;
    const payload = {
      business_id: businessId,
      amount: savingForm.amount, savings_date: new Date(savingForm.savings_date).toISOString(),
      source: savingForm.source, note: savingForm.note,
      bank_account_id: savingForm.bank_account_id || null, reference: savingForm.reference, recorded_by: user.id,
    };
    const { error } = editSavingId
      ? await supabase.from('savings').update(payload).eq('id', editSavingId)
      : await supabase.from('savings').insert(payload);
    if (error) { toast({ title: 'Error', description: error.message, variant: 'destructive' }); return; }
    toast({ title: editSavingId ? 'Savings updated' : 'Money moved to savings' });
    setSavingForm(emptySaving); setEditSavingId(null); setSavingOpen(false); fetchAll();
  };
  const handleSavingEdit = (s: Saving) => {
    setSavingForm({ amount: s.amount, savings_date: s.savings_date.slice(0, 10), source: s.source, note: s.note, bank_account_id: s.bank_account_id || '', reference: s.reference });
    setEditSavingId(s.id); setSavingOpen(true);
  };
  const handleSavingDelete = async (id: string) => {
    await supabase.from('savings').delete().eq('id', id);
    toast({ title: 'Savings deleted — funds returned to available cash' }); fetchAll();
  };

  // Investment CRUD
  const handleInvestSave = async () => {
    if (!investForm.investment_name || !investForm.amount || !user) return;
    const editingCurrent = editInvestId ? investments.find(i => i.id === editInvestId) : null;
    const netNew = investForm.amount - (editingCurrent ? Number(editingCurrent.amount) : 0);
    if (netNew > availableCash) {
      toast({ title: 'Insufficient available funds', description: `You only have ${formatCurrency(availableCash)} available. Cannot invest ${formatCurrency(investForm.amount)}.`, variant: 'destructive' });
      return;
    }
    if (!businessId) return;
    const payload = {
      business_id: businessId,
      investment_name: investForm.investment_name, amount: investForm.amount,
      investment_date: new Date(investForm.investment_date).toISOString(),
      expected_return: investForm.expected_return, duration: investForm.duration,
      status: investForm.status, note: investForm.note,
      bank_account_id: investForm.bank_account_id || null, reference: investForm.reference, recorded_by: user.id,
    };
    const { error } = editInvestId
      ? await supabase.from('investments').update(payload).eq('id', editInvestId)
      : await supabase.from('investments').insert(payload);
    if (error) { toast({ title: 'Error', description: error.message, variant: 'destructive' }); return; }
    toast({ title: editInvestId ? 'Investment updated' : 'Money invested from business funds' });
    setInvestForm(emptyInvestment); setEditInvestId(null); setInvestOpen(false); fetchAll();
  };
  const handleInvestEdit = (inv: Investment) => {
    setInvestForm({
      investment_name: inv.investment_name, amount: inv.amount,
      investment_date: inv.investment_date.slice(0, 10), expected_return: inv.expected_return,
      duration: inv.duration, status: inv.status, note: inv.note,
      bank_account_id: inv.bank_account_id || '', reference: inv.reference,
    });
    setEditInvestId(inv.id); setInvestOpen(true);
  };
  const handleInvestDelete = async (id: string) => {
    await supabase.from('investments').delete().eq('id', id);
    toast({ title: 'Investment deleted — funds returned to available cash' }); fetchAll();
  };

  // Investor Funding CRUD
  const handleFundingSave = async () => {
    if (!fundingForm.investor_name || !fundingForm.amount || !user) return;
    if (!businessId) return;
    const payload = {
      business_id: businessId,
      investor_name: fundingForm.investor_name, amount: fundingForm.amount,
      date_received: new Date(fundingForm.date_received).toISOString(),
      payment_method: fundingForm.payment_method,
      bank_account_id: fundingForm.bank_account_id || null,
      reference: fundingForm.reference, phone: fundingForm.phone, email: fundingForm.email,
      investment_type: fundingForm.investment_type, repayment_terms: fundingForm.repayment_terms,
      expected_return: fundingForm.expected_return, note: fundingForm.note,
      status: fundingForm.status, recorded_by: user.id,
    };
    const { error } = editFundingId
      ? await supabase.from('investor_funding').update(payload).eq('id', editFundingId)
      : await supabase.from('investor_funding').insert(payload);
    if (error) { toast({ title: 'Error', description: error.message, variant: 'destructive' }); return; }
    toast({ title: editFundingId ? 'Investor funding updated' : 'External funding added to business' });
    setFundingForm(emptyFunding); setEditFundingId(null); setFundingOpen(false); fetchAll();
  };
  const handleFundingEdit = (f: InvestorFunding) => {
    setFundingForm({
      investor_name: f.investor_name, amount: f.amount, date_received: f.date_received.slice(0, 10),
      payment_method: f.payment_method, bank_account_id: f.bank_account_id || '',
      reference: f.reference, phone: f.phone, email: f.email,
      investment_type: f.investment_type, repayment_terms: f.repayment_terms,
      expected_return: f.expected_return, note: f.note, status: f.status,
    });
    setEditFundingId(f.id); setFundingOpen(true);
  };
  const handleFundingDelete = async (id: string) => {
    await supabase.from('investor_funding').delete().eq('id', id);
    toast({ title: 'Investor funding deleted' }); fetchAll();
  };

  return (
    <AppLayout title="Savings & Investments">
      <div className="space-y-6 animate-fade-in">
        {/* Available Cash Banner */}
        <Card className="border-primary/30 bg-primary/5">
          <CardContent className="p-5 flex items-center justify-between">
            <div>
              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Available Business Money</p>
              <p className={`text-2xl font-bold mt-1 ${availableCash < 0 ? 'text-destructive' : 'text-primary'}`}>{formatCurrency(availableCash)}</p>
              <p className="text-[10px] text-muted-foreground mt-0.5">Savings &amp; investments are deducted from this balance</p>
            </div>
            <div className="w-12 h-12 rounded-xl bg-primary/10 flex items-center justify-center"><Banknote className="h-6 w-6 text-primary" /></div>
          </CardContent>
        </Card>

        {/* Summary Cards */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <Card>
            <CardContent className="p-5 flex items-start justify-between">
              <div><p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Money Set Aside</p>
                <p className="text-2xl font-bold mt-1">{formatCurrency(totalSavings)}</p>
                <p className="text-[10px] text-muted-foreground">Reduces available cash</p></div>
              <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center"><PiggyBank className="h-5 w-5 text-primary" /></div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-5 flex items-start justify-between">
              <div><p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Money Invested</p>
                <p className="text-2xl font-bold mt-1">{formatCurrency(totalInvestments)}</p>
                <p className="text-[10px] text-muted-foreground">Reduces available cash</p></div>
              <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center"><TrendingUp className="h-5 w-5 text-primary" /></div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-5 flex items-start justify-between">
              <div><p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Active Investments</p>
                <p className="text-2xl font-bold mt-1">{activeInvestments.length}</p></div>
              <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center"><Wallet className="h-5 w-5 text-primary" /></div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-5 flex items-start justify-between">
              <div><p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">External Funding Added</p>
                <p className="text-2xl font-bold mt-1">{formatCurrency(totalFunding)}</p>
                <p className="text-[10px] text-muted-foreground">Increases available cash</p></div>
              <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center"><HandCoins className="h-5 w-5 text-primary" /></div>
            </CardContent>
          </Card>
        </div>

        <Tabs defaultValue="savings">
          <TabsList>
            <TabsTrigger value="savings">Savings</TabsTrigger>
            <TabsTrigger value="investments">Investments</TabsTrigger>
            <TabsTrigger value="funding">Investor Funding</TabsTrigger>
          </TabsList>

          {/* SAVINGS TAB */}
          <TabsContent value="savings" className="space-y-4">
            <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
              <DateRangeFilter
                from={savingsDateFrom}
                to={savingsDateTo}
                onFromChange={setSavingsDateFrom}
                onToChange={setSavingsDateTo}
                onClear={() => { setSavingsDateFrom(''); setSavingsDateTo(''); }}
                resultCount={filteredSavings.length}
                totalCount={savings.length}
              />
              <Dialog open={savingOpen} onOpenChange={(o) => { setSavingOpen(o); if (!o) { setSavingForm(emptySaving); setEditSavingId(null); } }}>
                <DialogTrigger asChild><Button><Plus className="h-4 w-4 mr-2" />Add Savings</Button></DialogTrigger>
                <DialogContent className="max-w-lg">
                  <DialogHeader><DialogTitle>{editSavingId ? 'Edit' : 'Add'} Savings</DialogTitle></DialogHeader>
                  <p className="text-xs text-muted-foreground -mt-2">This will move money from available business cash into savings.</p>
                  <div className="grid gap-3">
                    <div className="grid grid-cols-2 gap-3">
                      <div><Label>Amount (GH₵)</Label><Input type="number" value={savingForm.amount || ''} onChange={e => setSavingForm(p => ({ ...p, amount: Number(e.target.value) }))} /></div>
                      <div><Label>Date</Label><Input type="date" value={savingForm.savings_date} onChange={e => setSavingForm(p => ({ ...p, savings_date: e.target.value }))} /></div>
                    </div>
                    <div><Label>Source</Label><Input value={savingForm.source} onChange={e => setSavingForm(p => ({ ...p, source: e.target.value }))} placeholder="e.g. Daily Sales" /></div>
                    <div><Label>Bank / Account</Label>
                      <Select value={savingForm.bank_account_id} onValueChange={v => setSavingForm(p => ({ ...p, bank_account_id: v }))}>
                        <SelectTrigger><SelectValue placeholder="Select bank/account" /></SelectTrigger>
                        <SelectContent>{banks.map(b => <SelectItem key={b.id} value={b.id}>{b.bank_name} — {b.account_name}</SelectItem>)}</SelectContent>
                      </Select>
                    </div>
                    <div><Label>Reference</Label><Input value={savingForm.reference} onChange={e => setSavingForm(p => ({ ...p, reference: e.target.value }))} placeholder="Transaction ref" /></div>
                    <div><Label>Note</Label><Textarea value={savingForm.note} onChange={e => setSavingForm(p => ({ ...p, note: e.target.value }))} rows={2} /></div>
                    <p className="text-xs text-muted-foreground">Available: <span className="font-semibold">{formatCurrency(availableCash + (editSavingId ? Number(savings.find(s => s.id === editSavingId)?.amount || 0) : 0))}</span></p>
                    <Button onClick={handleSavingSave} className="w-full">{editSavingId ? 'Update' : 'Save'} Savings</Button>
                  </div>
                </DialogContent>
              </Dialog>
            </div>
            {filteredSavings.length > 0 ? (
              <Card><CardContent className="p-0">
                <Table>
                  <TableHeader><TableRow>
                    <TableHead>Date</TableHead><TableHead>Amount</TableHead><TableHead>Source</TableHead>
                    <TableHead>Bank</TableHead><TableHead>Reference</TableHead><TableHead className="text-right">Actions</TableHead>
                  </TableRow></TableHeader>
                  <TableBody>
                    {filteredSavings.map(s => (
                      <TableRow key={s.id}>
                        <TableCell>{new Date(s.savings_date).toLocaleDateString()}</TableCell>
                        <TableCell className="font-semibold">{formatCurrency(Number(s.amount))}</TableCell>
                        <TableCell>{s.source || '—'}</TableCell>
                        <TableCell>{getBankName(s.bank_account_id)}</TableCell>
                        <TableCell>{s.reference || '—'}</TableCell>
                        <TableCell className="text-right space-x-1">
                          <Button variant="ghost" size="icon" onClick={() => handleSavingEdit(s)}><Pencil className="h-4 w-4" /></Button>
                          <Button variant="ghost" size="icon" onClick={() => handleSavingDelete(s.id)}><Trash2 className="h-4 w-4 text-destructive" /></Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent></Card>
            ) : (
              <EmptyState icon={<PiggyBank className="h-7 w-7 text-muted-foreground" />} title={savings.length > 0 ? 'No savings in this date range' : 'No savings records'} description={savings.length > 0 ? 'Clear or adjust the date filter to find older savings records.' : 'Add your first savings entry to set money aside.'} />
            )}
          </TabsContent>

          {/* INVESTMENTS TAB */}
          <TabsContent value="investments" className="space-y-4">
            <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
              <DateRangeFilter
                from={investmentDateFrom}
                to={investmentDateTo}
                onFromChange={setInvestmentDateFrom}
                onToChange={setInvestmentDateTo}
                onClear={() => { setInvestmentDateFrom(''); setInvestmentDateTo(''); }}
                resultCount={filteredInvestments.length}
                totalCount={investments.length}
              />
              <Dialog open={investOpen} onOpenChange={(o) => { setInvestOpen(o); if (!o) { setInvestForm(emptyInvestment); setEditInvestId(null); } }}>
                <DialogTrigger asChild><Button><Plus className="h-4 w-4 mr-2" />Add Investment</Button></DialogTrigger>
                <DialogContent className="max-w-lg">
                  <DialogHeader><DialogTitle>{editInvestId ? 'Edit' : 'Add'} Investment</DialogTitle></DialogHeader>
                  <p className="text-xs text-muted-foreground -mt-2">This will allocate money from available business cash into an investment.</p>
                  <div className="grid gap-3">
                    <div><Label>Investment Name</Label><Input value={investForm.investment_name} onChange={e => setInvestForm(p => ({ ...p, investment_name: e.target.value }))} placeholder="e.g. Treasury Bill" /></div>
                    <div className="grid grid-cols-2 gap-3">
                      <div><Label>Amount (GH₵)</Label><Input type="number" value={investForm.amount || ''} onChange={e => setInvestForm(p => ({ ...p, amount: Number(e.target.value) }))} /></div>
                      <div><Label>Date</Label><Input type="date" value={investForm.investment_date} onChange={e => setInvestForm(p => ({ ...p, investment_date: e.target.value }))} /></div>
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                      <div><Label>Expected Return (GH₵)</Label><Input type="number" value={investForm.expected_return || ''} onChange={e => setInvestForm(p => ({ ...p, expected_return: Number(e.target.value) }))} /></div>
                      <div><Label>Duration</Label><Input value={investForm.duration} onChange={e => setInvestForm(p => ({ ...p, duration: e.target.value }))} placeholder="e.g. 6 months" /></div>
                    </div>
                    <div><Label>Status</Label>
                      <Select value={investForm.status} onValueChange={v => setInvestForm(p => ({ ...p, status: v }))}>
                        <SelectTrigger><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="active">Active</SelectItem>
                          <SelectItem value="matured">Matured</SelectItem>
                          <SelectItem value="withdrawn">Withdrawn</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div><Label>Bank / Account</Label>
                      <Select value={investForm.bank_account_id} onValueChange={v => setInvestForm(p => ({ ...p, bank_account_id: v }))}>
                        <SelectTrigger><SelectValue placeholder="Select bank/account" /></SelectTrigger>
                        <SelectContent>{banks.map(b => <SelectItem key={b.id} value={b.id}>{b.bank_name} — {b.account_name}</SelectItem>)}</SelectContent>
                      </Select>
                    </div>
                    <div><Label>Reference</Label><Input value={investForm.reference} onChange={e => setInvestForm(p => ({ ...p, reference: e.target.value }))} /></div>
                    <div><Label>Note</Label><Textarea value={investForm.note} onChange={e => setInvestForm(p => ({ ...p, note: e.target.value }))} rows={2} /></div>
                    <p className="text-xs text-muted-foreground">Available: <span className="font-semibold">{formatCurrency(availableCash + (editInvestId ? Number(investments.find(i => i.id === editInvestId)?.amount || 0) : 0))}</span></p>
                    <Button onClick={handleInvestSave} className="w-full">{editInvestId ? 'Update' : 'Save'} Investment</Button>
                  </div>
                </DialogContent>
              </Dialog>
            </div>
            {filteredInvestments.length > 0 ? (
              <Card><CardContent className="p-0">
                <Table>
                  <TableHeader><TableRow>
                    <TableHead>Name</TableHead><TableHead>Amount</TableHead><TableHead>Date</TableHead>
                    <TableHead>Expected Return</TableHead><TableHead>Duration</TableHead><TableHead>Status</TableHead>
                    <TableHead>Bank</TableHead><TableHead className="text-right">Actions</TableHead>
                  </TableRow></TableHeader>
                  <TableBody>
                    {filteredInvestments.map(inv => (
                      <TableRow key={inv.id}>
                        <TableCell className="font-medium">{inv.investment_name}</TableCell>
                        <TableCell className="font-semibold">{formatCurrency(Number(inv.amount))}</TableCell>
                        <TableCell>{new Date(inv.investment_date).toLocaleDateString()}</TableCell>
                        <TableCell>{formatCurrency(Number(inv.expected_return))}</TableCell>
                        <TableCell>{inv.duration || '—'}</TableCell>
                        <TableCell><StatusBadge status={inv.status} /></TableCell>
                        <TableCell>{getBankName(inv.bank_account_id)}</TableCell>
                        <TableCell className="text-right space-x-1">
                          <Button variant="ghost" size="icon" onClick={() => handleInvestEdit(inv)}><Pencil className="h-4 w-4" /></Button>
                          <Button variant="ghost" size="icon" onClick={() => handleInvestDelete(inv.id)}><Trash2 className="h-4 w-4 text-destructive" /></Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent></Card>
            ) : (
              <EmptyState icon={<TrendingUp className="h-7 w-7 text-muted-foreground" />} title={investments.length > 0 ? 'No investments in this date range' : 'No investments yet'} description={investments.length > 0 ? 'Clear or adjust the date filter to find older investments.' : 'Record your first investment to allocate business funds.'} />
            )}
          </TabsContent>

          {/* INVESTOR FUNDING TAB */}
          <TabsContent value="funding" className="space-y-4">
            <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
              <DateRangeFilter
                from={fundingDateFrom}
                to={fundingDateTo}
                onFromChange={setFundingDateFrom}
                onToChange={setFundingDateTo}
                onClear={() => { setFundingDateFrom(''); setFundingDateTo(''); }}
                resultCount={filteredFundings.length}
                totalCount={fundings.length}
              />
              <Dialog open={fundingOpen} onOpenChange={(o) => { setFundingOpen(o); if (!o) { setFundingForm(emptyFunding); setEditFundingId(null); } }}>
                <DialogTrigger asChild><Button><Plus className="h-4 w-4 mr-2" />Add Investor Funding</Button></DialogTrigger>
                <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
                  <DialogHeader><DialogTitle>{editFundingId ? 'Edit' : 'Add'} Investor Funding</DialogTitle></DialogHeader>
                  <p className="text-xs text-muted-foreground -mt-2">External money coming into the business — increases available cash.</p>
                  <div className="grid gap-3">
                    <div><Label>Investor Name</Label><Input value={fundingForm.investor_name} onChange={e => setFundingForm(p => ({ ...p, investor_name: e.target.value }))} placeholder="Full name of investor" /></div>
                    <div className="grid grid-cols-2 gap-3">
                      <div><Label>Amount (GH₵)</Label><Input type="number" value={fundingForm.amount || ''} onChange={e => setFundingForm(p => ({ ...p, amount: Number(e.target.value) }))} /></div>
                      <div><Label>Date Received</Label><Input type="date" value={fundingForm.date_received} onChange={e => setFundingForm(p => ({ ...p, date_received: e.target.value }))} /></div>
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                      <div><Label>Phone</Label><Input value={fundingForm.phone} onChange={e => setFundingForm(p => ({ ...p, phone: e.target.value }))} placeholder="Investor phone" /></div>
                      <div><Label>Email</Label><Input type="email" value={fundingForm.email} onChange={e => setFundingForm(p => ({ ...p, email: e.target.value }))} placeholder="Investor email" /></div>
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                      <div><Label>Payment Method</Label>
                        <Select value={fundingForm.payment_method} onValueChange={v => setFundingForm(p => ({ ...p, payment_method: v }))}>
                          <SelectTrigger><SelectValue /></SelectTrigger>
                          <SelectContent>
                            <SelectItem value="cash">Cash</SelectItem>
                            <SelectItem value="bank_transfer">Bank Transfer</SelectItem>
                            <SelectItem value="mobile_money">Mobile Money</SelectItem>
                            <SelectItem value="cheque">Cheque</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                      <div><Label>Investment Type</Label><Input value={fundingForm.investment_type} onChange={e => setFundingForm(p => ({ ...p, investment_type: e.target.value }))} placeholder="e.g. Equity, Loan" /></div>
                    </div>
                    <div><Label>Bank / Account Received Into</Label>
                      <Select value={fundingForm.bank_account_id} onValueChange={v => setFundingForm(p => ({ ...p, bank_account_id: v }))}>
                        <SelectTrigger><SelectValue placeholder="Select bank/account" /></SelectTrigger>
                        <SelectContent>{banks.map(b => <SelectItem key={b.id} value={b.id}>{b.bank_name} — {b.account_name}</SelectItem>)}</SelectContent>
                      </Select>
                      {banks.length === 0 && <p className="text-xs text-muted-foreground mt-1">No bank accounts yet. Add one in Settings first.</p>}
                    </div>
                    <div><Label>Reference Number</Label><Input value={fundingForm.reference} onChange={e => setFundingForm(p => ({ ...p, reference: e.target.value }))} placeholder="Transaction reference" /></div>
                    <div className="grid grid-cols-2 gap-3">
                      <div><Label>Expected Return / Profit Share (GH₵)</Label><Input type="number" value={fundingForm.expected_return || ''} onChange={e => setFundingForm(p => ({ ...p, expected_return: Number(e.target.value) }))} /></div>
                      <div><Label>Status</Label>
                        <Select value={fundingForm.status} onValueChange={v => setFundingForm(p => ({ ...p, status: v }))}>
                          <SelectTrigger><SelectValue /></SelectTrigger>
                          <SelectContent>
                            <SelectItem value="active">Active</SelectItem>
                            <SelectItem value="repaid">Repaid</SelectItem>
                            <SelectItem value="partial">Partial</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                    </div>
                    <div><Label>Repayment Terms</Label><Input value={fundingForm.repayment_terms} onChange={e => setFundingForm(p => ({ ...p, repayment_terms: e.target.value }))} placeholder="e.g. 20% profit share monthly" /></div>
                    <div><Label>Note</Label><Textarea value={fundingForm.note} onChange={e => setFundingForm(p => ({ ...p, note: e.target.value }))} rows={2} /></div>
                    <Button onClick={handleFundingSave} className="w-full">{editFundingId ? 'Update' : 'Save'} Investor Funding</Button>
                  </div>
                </DialogContent>
              </Dialog>
            </div>
            {filteredFundings.length > 0 ? (
              <Card><CardContent className="p-0">
                <Table>
                  <TableHeader><TableRow>
                    <TableHead>Investor</TableHead><TableHead>Amount</TableHead><TableHead>Date</TableHead>
                    <TableHead>Method</TableHead><TableHead>Type</TableHead><TableHead>Status</TableHead>
                    <TableHead>Bank</TableHead><TableHead>Contact</TableHead><TableHead className="text-right">Actions</TableHead>
                  </TableRow></TableHeader>
                  <TableBody>
                    {filteredFundings.map(f => (
                      <TableRow key={f.id}>
                        <TableCell className="font-medium">{f.investor_name}</TableCell>
                        <TableCell className="font-semibold">{formatCurrency(Number(f.amount))}</TableCell>
                        <TableCell>{new Date(f.date_received).toLocaleDateString()}</TableCell>
                        <TableCell className="capitalize">{f.payment_method.replace('_', ' ')}</TableCell>
                        <TableCell>{f.investment_type || '—'}</TableCell>
                        <TableCell><StatusBadge status={f.status} /></TableCell>
                        <TableCell>{getBankName(f.bank_account_id)}</TableCell>
                        <TableCell className="text-xs">{f.phone || f.email || '—'}</TableCell>
                        <TableCell className="text-right space-x-1">
                          <Button variant="ghost" size="icon" onClick={() => handleFundingEdit(f)}><Pencil className="h-4 w-4" /></Button>
                          <Button variant="ghost" size="icon" onClick={() => handleFundingDelete(f.id)}><Trash2 className="h-4 w-4 text-destructive" /></Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent></Card>
            ) : (
              <EmptyState icon={<HandCoins className="h-7 w-7 text-muted-foreground" />} title={fundings.length > 0 ? 'No investor funding in this date range' : 'No investor funding yet'} description={fundings.length > 0 ? 'Clear or adjust the date filter to find older funding records.' : 'Record external funding to increase business capital.'} />
            )}
          </TabsContent>
        </Tabs>
      </div>
    </AppLayout>
  );
}

function DateRangeFilter({
  from,
  to,
  onFromChange,
  onToChange,
  onClear,
  resultCount,
  totalCount,
}: {
  from: string;
  to: string;
  onFromChange: (value: string) => void;
  onToChange: (value: string) => void;
  onClear: () => void;
  resultCount: number;
  totalCount: number;
}) {
  const active = !!from || !!to;

  return (
    <div className="flex flex-wrap items-end gap-2">
      <div className="grid gap-1">
        <Label className="text-[10px] uppercase tracking-wider text-muted-foreground">From</Label>
        <Input type="date" value={from} onChange={(event) => onFromChange(event.target.value)} className="w-40" />
      </div>
      <div className="grid gap-1">
        <Label className="text-[10px] uppercase tracking-wider text-muted-foreground">To</Label>
        <Input type="date" value={to} onChange={(event) => onToChange(event.target.value)} className="w-40" />
      </div>
      {active && (
        <Button type="button" variant="ghost" size="sm" onClick={onClear}>
          <X className="mr-1 h-4 w-4" /> Clear
        </Button>
      )}
      <p className="pb-2 text-xs text-muted-foreground">
        Showing {resultCount} of {totalCount}
      </p>
    </div>
  );
}
