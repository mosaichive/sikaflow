import { useCallback, useEffect, useMemo, useState } from 'react';
import { AppLayout } from '@/components/AppLayout';
import { EmptyState } from '@/components/EmptyState';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { formatCurrency } from '@/lib/constants';
import { AVAILABLE_BUSINESS_MONEY_FORMULA } from '@/lib/business-money';
import { useBusiness } from '@/context/BusinessContext';
import { useBusinessFinancials } from '@/context/BusinessFinancialsContext';
import { useAuth } from '@/context/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { Banknote, Landmark, PiggyBank, Plus, Pencil, Smartphone, Trash2, WalletCards } from 'lucide-react';
import { logSupabaseError } from '@/lib/workspace';

type DestinationType = 'bank' | 'mobile_money' | 'susu';

type SavingsDestination = {
  id: string;
  bank_name: string;
  account_name: string;
  account_number: string;
  branch: string | null;
  mobile_money_name: string | null;
  mobile_money_number: string | null;
  account_type: string;
  note: string | null;
};

type SavingsRecord = {
  id: string;
  amount: number;
  savings_date: string;
  source: string | null;
  note: string | null;
  bank_account_id: string | null;
  reference: string | null;
  recorded_by: string;
  created_at: string;
};

const emptySavingForm = {
  savings_date: new Date().toISOString().slice(0, 10),
  amount: 0,
  savings_type: 'bank' as DestinationType,
  bank_account_id: '',
  reference: '',
  note: '',
};

const emptyDestinationForm = {
  account_type: 'bank' as DestinationType,
  bank_name: '',
  account_name: '',
  account_number: '',
  branch: '',
  mobile_money_name: '',
  mobile_money_number: '',
  note: '',
};

function normalizeDestinationType(value: string | null | undefined): DestinationType {
  if (value === 'mobile_money') return 'mobile_money';
  if (value === 'susu') return 'susu';
  return 'bank';
}

function getDestinationTypeLabel(value: string | null | undefined) {
  const type = normalizeDestinationType(value);
  if (type === 'mobile_money') return 'MoMo';
  if (type === 'susu') return 'Susu';
  return 'Bank';
}

function formatDestinationTitle(destination: SavingsDestination) {
  const type = normalizeDestinationType(destination.account_type);

  if (type === 'mobile_money') {
    const network = destination.mobile_money_name || destination.bank_name || 'MoMo';
    const number = destination.mobile_money_number || destination.account_number || '';
    return [network, number].filter(Boolean).join(' • ');
  }

  if (type === 'susu') {
    return [destination.bank_name || 'Susu Savings', destination.account_name].filter(Boolean).join(' • ');
  }

  return [destination.bank_name || 'Bank Savings', destination.account_name].filter(Boolean).join(' • ');
}

function formatDestinationDetails(destination: SavingsDestination) {
  const type = normalizeDestinationType(destination.account_type);

  if (type === 'mobile_money') {
    return [destination.account_name, destination.mobile_money_number].filter(Boolean).join(' • ') || '—';
  }

  if (type === 'susu') {
    return [destination.mobile_money_number, destination.note].filter(Boolean).join(' • ') || '—';
  }

  return [destination.account_number, destination.branch].filter(Boolean).join(' • ') || '—';
}

function getDestinationTypeIcon(type: string | null | undefined) {
  const normalized = normalizeDestinationType(type);
  if (normalized === 'mobile_money') return Smartphone;
  if (normalized === 'susu') return WalletCards;
  return Landmark;
}

export default function SavingsPage() {
  const { user, isAdmin, isManager, displayName } = useAuth();
  const { businessId } = useBusiness();
  const { financials, loading: financialsLoading } = useBusinessFinancials();
  const { toast } = useToast();

  const [destinations, setDestinations] = useState<SavingsDestination[]>([]);
  const [savings, setSavings] = useState<SavingsRecord[]>([]);
  const [loading, setLoading] = useState(true);

  const [savingOpen, setSavingOpen] = useState(false);
  const [savingForm, setSavingForm] = useState(emptySavingForm);
  const [editSavingId, setEditSavingId] = useState<string | null>(null);

  const [destinationOpen, setDestinationOpen] = useState(false);
  const [destinationForm, setDestinationForm] = useState(emptyDestinationForm);
  const [editDestinationId, setEditDestinationId] = useState<string | null>(null);

  const fetchAll = useCallback(async () => {
    setLoading(true);

    const [destinationsRes, savingsRes] = await Promise.allSettled([
      supabase.from('bank_accounts').select('*').eq('business_id', businessId).order('created_at', { ascending: false }),
      supabase.from('savings').select('*').eq('business_id', businessId).order('savings_date', { ascending: false }),
    ]);

    if (destinationsRes.status === 'fulfilled') {
      if (destinationsRes.value.error) logSupabaseError('savings.load.destinations', destinationsRes.value.error, { businessId });
      setDestinations((destinationsRes.value.data || []) as SavingsDestination[]);
    } else {
      logSupabaseError('savings.load.destinations', destinationsRes.reason, { businessId });
      setDestinations([]);
    }

    if (savingsRes.status === 'fulfilled') {
      if (savingsRes.value.error) logSupabaseError('savings.load.records', savingsRes.value.error, { businessId });
      setSavings((savingsRes.value.data || []) as SavingsRecord[]);
    } else {
      logSupabaseError('savings.load.records', savingsRes.reason, { businessId });
      setSavings([]);
    }

    setLoading(false);
  }, [businessId]);

  useEffect(() => {
    void fetchAll();
    if (!businessId) return;

    const channel = supabase
      .channel('savings-page')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'bank_accounts', filter: `business_id=eq.${businessId}` }, () => { void fetchAll(); })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'savings', filter: `business_id=eq.${businessId}` }, () => { void fetchAll(); })
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [businessId, fetchAll]);

  const availableBusinessMoney = financials.availableBusinessMoney;

  const totalSavings = savings.reduce((sum, row) => sum + Number(row.amount || 0), 0);
  const filteredDestinations = useMemo(
    () => destinations.filter((destination) => normalizeDestinationType(destination.account_type) === savingForm.savings_type),
    [destinations, savingForm.savings_type],
  );
  const canManageSavings = isAdmin || isManager;

  function resetSavingDialog() {
    setSavingForm(emptySavingForm);
    setEditSavingId(null);
  }

  function resetDestinationDialog() {
    setDestinationForm(emptyDestinationForm);
    setEditDestinationId(null);
  }

  function openEditSaving(record: SavingsRecord) {
    const linkedDestination = destinations.find((destination) => destination.id === record.bank_account_id);
    setSavingForm({
      savings_date: record.savings_date.slice(0, 10),
      amount: Number(record.amount || 0),
      savings_type: normalizeDestinationType(record.source || linkedDestination?.account_type),
      bank_account_id: record.bank_account_id || '',
      reference: record.reference || '',
      note: record.note || '',
    });
    setEditSavingId(record.id);
    setSavingOpen(true);
  }

  function openEditDestination(destination: SavingsDestination) {
    setDestinationForm({
      account_type: normalizeDestinationType(destination.account_type),
      bank_name: destination.bank_name || '',
      account_name: destination.account_name || '',
      account_number: destination.account_number || '',
      branch: destination.branch || '',
      mobile_money_name: destination.mobile_money_name || '',
      mobile_money_number: destination.mobile_money_number || '',
      note: destination.note || '',
    });
    setEditDestinationId(destination.id);
    setDestinationOpen(true);
  }

  async function handleSaveSaving() {
    if (!user || !businessId) return;
    if (financialsLoading) {
      toast({ title: 'Financials still loading', description: 'Please wait a moment and try again.' });
      return;
    }
    if (!savingForm.amount || savingForm.amount <= 0) {
      toast({ title: 'Amount required', description: 'Enter a valid savings amount.', variant: 'destructive' });
      return;
    }
    if (!savingForm.bank_account_id) {
      toast({ title: 'Destination required', description: 'Select where you want to move this money.', variant: 'destructive' });
      return;
    }

    const currentRow = editSavingId ? savings.find((row) => row.id === editSavingId) : null;
    const netAmount = savingForm.amount - Number(currentRow?.amount || 0);

    if (netAmount > availableBusinessMoney) {
      toast({
        title: 'Insufficient available business money',
        description: 'Insufficient available business money.',
        variant: 'destructive',
      });
      return;
    }

    const payload = {
      business_id: businessId,
      amount: savingForm.amount,
      savings_date: new Date(savingForm.savings_date).toISOString(),
      source: savingForm.savings_type,
      bank_account_id: savingForm.bank_account_id,
      reference: savingForm.reference || null,
      note: savingForm.note || null,
      recorded_by: user.id,
    };

    const { error } = editSavingId
      ? await supabase.from('savings').update(payload).eq('id', editSavingId)
      : await supabase.from('savings').insert(payload);

    if (error) {
      logSupabaseError('savings.save', error, { businessId, editSavingId });
      toast({ title: 'Could not save savings', description: error.message, variant: 'destructive' });
      return;
    }

    toast({ title: editSavingId ? 'Savings updated' : 'Savings recorded' });
    resetSavingDialog();
    setSavingOpen(false);
    await fetchAll();
  }

  async function handleDeleteSaving(id: string) {
    const { error } = await supabase.from('savings').delete().eq('id', id);
    if (error) {
      logSupabaseError('savings.delete', error, { businessId, id });
      toast({ title: 'Could not delete savings', description: error.message, variant: 'destructive' });
      return;
    }
    toast({ title: 'Savings deleted' });
    await fetchAll();
  }

  async function handleSaveDestination() {
    if (!businessId) return;

    const type = destinationForm.account_type;
    const isBank = type === 'bank';
    const isMoMo = type === 'mobile_money';

    const primaryName = destinationForm.bank_name.trim();
    const accountName = destinationForm.account_name.trim();

    if (isBank && (!primaryName || !accountName || !destinationForm.account_number.trim())) {
      toast({ title: 'Missing destination details', description: 'Fill in the bank details before saving.', variant: 'destructive' });
      return;
    }

    if (isMoMo && (!destinationForm.mobile_money_name.trim() || !accountName || !destinationForm.mobile_money_number.trim())) {
      toast({ title: 'Missing destination details', description: 'Fill in the MoMo details before saving.', variant: 'destructive' });
      return;
    }

    if (type === 'susu' && (!primaryName || !accountName || !destinationForm.mobile_money_number.trim())) {
      toast({ title: 'Missing destination details', description: 'Fill in the Susu details before saving.', variant: 'destructive' });
      return;
    }

    const payload = {
      business_id: businessId,
      account_type: type,
      bank_name: destinationForm.bank_name.trim(),
      account_name: accountName,
      account_number: isBank ? destinationForm.account_number.trim() : '',
      branch: isBank ? destinationForm.branch.trim() : '',
      mobile_money_name: isMoMo ? destinationForm.mobile_money_name.trim() : '',
      mobile_money_number: isMoMo || type === 'susu' ? destinationForm.mobile_money_number.trim() : '',
      note: destinationForm.note.trim() || null,
    };

    const { error } = editDestinationId
      ? await supabase.from('bank_accounts').update(payload).eq('id', editDestinationId)
      : await supabase.from('bank_accounts').insert(payload);

    if (error) {
      logSupabaseError('savings.destination.save', error, { businessId, editDestinationId });
      toast({ title: 'Could not save destination', description: error.message, variant: 'destructive' });
      return;
    }

    toast({ title: editDestinationId ? 'Destination updated' : 'Destination added' });
    resetDestinationDialog();
    setDestinationOpen(false);
    await fetchAll();
  }

  async function handleDeleteDestination(id: string) {
    const { error } = await supabase.from('bank_accounts').delete().eq('id', id);
    if (error) {
      logSupabaseError('savings.destination.delete', error, { businessId, id });
      toast({ title: 'Could not delete destination', description: error.message, variant: 'destructive' });
      return;
    }
    toast({ title: 'Destination deleted' });
    await fetchAll();
  }

  return (
    <AppLayout title="Savings">
      <div className="space-y-6 animate-fade-in">
        <Card className="border-primary/30 bg-primary/5">
          <CardContent className="flex items-center justify-between gap-4 p-5">
            <div>
              <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">Available Business Money</p>
              <p className="mt-1 text-2xl font-bold text-primary">{financialsLoading ? 'Loading…' : formatCurrency(availableBusinessMoney)}</p>
              <p className="mt-1 text-xs text-muted-foreground">
                {AVAILABLE_BUSINESS_MONEY_FORMULA}
              </p>
            </div>
            <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-primary/10 text-primary">
              <Banknote className="h-6 w-6" />
            </div>
          </CardContent>
        </Card>

        <div className="grid gap-4 md:grid-cols-3">
          <Card>
            <CardContent className="p-5">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">Total Savings</p>
                  <p className="mt-1 text-2xl font-bold">{formatCurrency(totalSavings)}</p>
                  <p className="text-xs text-muted-foreground">Money already moved out of available business cash.</p>
                </div>
                <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10 text-primary">
                  <PiggyBank className="h-5 w-5" />
                </span>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-5">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">Saved Destinations</p>
                  <p className="mt-1 text-2xl font-bold">{destinations.length}</p>
                  <p className="text-xs text-muted-foreground">Bank, MoMo, and Susu destinations linked to this business.</p>
                </div>
                <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10 text-primary">
                  <Landmark className="h-5 w-5" />
                </span>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-5">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">Latest Movement</p>
                  <p className="mt-1 text-lg font-semibold">
                    {savings[0] ? formatCurrency(Number(savings[0].amount || 0)) : formatCurrency(0)}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {savings[0] ? new Date(savings[0].savings_date).toLocaleDateString('en-GH') : 'No savings recorded yet'}
                  </p>
                </div>
                <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10 text-primary">
                  <WalletCards className="h-5 w-5" />
                </span>
              </div>
            </CardContent>
          </Card>
        </div>

        <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <div>
            <h2 className="text-xl font-semibold text-foreground">Savings Activity</h2>
            <p className="text-sm text-muted-foreground">
              Move money from Available Business Money into a saved Bank, MoMo, or Susu destination.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Dialog
              open={destinationOpen}
              onOpenChange={(open) => {
                setDestinationOpen(open);
                if (!open) resetDestinationDialog();
              }}
            >
              <DialogTrigger asChild>
                <Button variant="outline" disabled={!canManageSavings}>
                  <Plus className="mr-2 h-4 w-4" />
                  Add Destination
                </Button>
              </DialogTrigger>
              <DialogContent className="max-w-xl">
                <DialogHeader>
                  <DialogTitle>{editDestinationId ? 'Edit' : 'Add'} Savings Destination</DialogTitle>
                </DialogHeader>
                <div className="grid gap-4">
                  <div>
                    <Label>Savings Type</Label>
                    <Select
                      value={destinationForm.account_type}
                      onValueChange={(value: DestinationType) =>
                        setDestinationForm((current) => ({
                          ...current,
                          account_type: value,
                          bank_name: '',
                          account_name: '',
                          account_number: '',
                          branch: '',
                          mobile_money_name: '',
                          mobile_money_number: '',
                          note: '',
                        }))
                      }
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="bank">Bank</SelectItem>
                        <SelectItem value="mobile_money">MoMo</SelectItem>
                        <SelectItem value="susu">Susu</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  {destinationForm.account_type === 'bank' ? (
                    <>
                      <div className="grid gap-3 md:grid-cols-2">
                        <div>
                          <Label>Bank Name</Label>
                          <Input
                            value={destinationForm.bank_name}
                            onChange={(event) => setDestinationForm((current) => ({ ...current, bank_name: event.target.value }))}
                            placeholder="e.g. Ecobank"
                          />
                        </div>
                        <div>
                          <Label>Account Name</Label>
                          <Input
                            value={destinationForm.account_name}
                            onChange={(event) => setDestinationForm((current) => ({ ...current, account_name: event.target.value }))}
                            placeholder="Account holder name"
                          />
                        </div>
                      </div>
                      <div className="grid gap-3 md:grid-cols-2">
                        <div>
                          <Label>Account Number</Label>
                          <Input
                            value={destinationForm.account_number}
                            onChange={(event) => setDestinationForm((current) => ({ ...current, account_number: event.target.value }))}
                            placeholder="Bank account number"
                          />
                        </div>
                        <div>
                          <Label>Branch</Label>
                          <Input
                            value={destinationForm.branch}
                            onChange={(event) => setDestinationForm((current) => ({ ...current, branch: event.target.value }))}
                            placeholder="Branch"
                          />
                        </div>
                      </div>
                    </>
                  ) : null}

                  {destinationForm.account_type === 'mobile_money' ? (
                    <>
                      <div className="grid gap-3 md:grid-cols-2">
                        <div>
                          <Label>Network</Label>
                          <Input
                            value={destinationForm.mobile_money_name}
                            onChange={(event) => setDestinationForm((current) => ({ ...current, mobile_money_name: event.target.value }))}
                            placeholder="MTN, Telecel, AirtelTigo"
                          />
                        </div>
                        <div>
                          <Label>Account Name</Label>
                          <Input
                            value={destinationForm.account_name}
                            onChange={(event) => setDestinationForm((current) => ({ ...current, account_name: event.target.value }))}
                            placeholder="Registered account name"
                          />
                        </div>
                      </div>
                      <div>
                        <Label>MoMo Number</Label>
                        <Input
                          value={destinationForm.mobile_money_number}
                          onChange={(event) => setDestinationForm((current) => ({ ...current, mobile_money_number: event.target.value }))}
                          placeholder="e.g. 024 000 0000"
                        />
                      </div>
                    </>
                  ) : null}

                  {destinationForm.account_type === 'susu' ? (
                    <>
                      <div className="grid gap-3 md:grid-cols-2">
                        <div>
                          <Label>Susu Name</Label>
                          <Input
                            value={destinationForm.bank_name}
                            onChange={(event) => setDestinationForm((current) => ({ ...current, bank_name: event.target.value }))}
                            placeholder="Susu group or collector name"
                          />
                        </div>
                        <div>
                          <Label>Collector Name</Label>
                          <Input
                            value={destinationForm.account_name}
                            onChange={(event) => setDestinationForm((current) => ({ ...current, account_name: event.target.value }))}
                            placeholder="Collector's full name"
                          />
                        </div>
                      </div>
                      <div className="grid gap-3 md:grid-cols-2">
                        <div>
                          <Label>Phone Number</Label>
                          <Input
                            value={destinationForm.mobile_money_number}
                            onChange={(event) => setDestinationForm((current) => ({ ...current, mobile_money_number: event.target.value }))}
                            placeholder="Collector phone number"
                          />
                        </div>
                        <div>
                          <Label>Location / Note</Label>
                          <Input
                            value={destinationForm.note}
                            onChange={(event) => setDestinationForm((current) => ({ ...current, note: event.target.value }))}
                            placeholder="Location or quick note"
                          />
                        </div>
                      </div>
                    </>
                  ) : null}

                  <Button onClick={handleSaveDestination} className="w-full">
                    {editDestinationId ? 'Update' : 'Save'} Destination
                  </Button>
                </div>
              </DialogContent>
            </Dialog>

            <Dialog
              open={savingOpen}
              onOpenChange={(open) => {
                setSavingOpen(open);
                if (!open) resetSavingDialog();
              }}
            >
              <DialogTrigger asChild>
                <Button disabled={!canManageSavings}>
                  <Plus className="mr-2 h-4 w-4" />
                  Add Savings
                </Button>
              </DialogTrigger>
              <DialogContent className="max-w-xl">
                <DialogHeader>
                  <DialogTitle>{editSavingId ? 'Edit' : 'Add'} Savings</DialogTitle>
                </DialogHeader>
                <div className="grid gap-4">
                  <div className="grid gap-3 md:grid-cols-2">
                    <div>
                      <Label>Date</Label>
                      <Input
                        type="date"
                        value={savingForm.savings_date}
                        onChange={(event) => setSavingForm((current) => ({ ...current, savings_date: event.target.value }))}
                      />
                    </div>
                    <div>
                      <Label>Amount</Label>
                      <Input
                        type="number"
                        min="0"
                        step="0.01"
                        value={savingForm.amount || ''}
                        onChange={(event) => setSavingForm((current) => ({ ...current, amount: Number(event.target.value) }))}
                        placeholder="0.00"
                      />
                    </div>
                  </div>

                  <div className="grid gap-3 md:grid-cols-2">
                    <div>
                      <Label>Savings Type</Label>
                      <Select
                        value={savingForm.savings_type}
                        onValueChange={(value: DestinationType) =>
                          setSavingForm((current) => ({
                            ...current,
                            savings_type: value,
                            bank_account_id: '',
                          }))
                        }
                      >
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="bank">Bank</SelectItem>
                          <SelectItem value="mobile_money">MoMo</SelectItem>
                          <SelectItem value="susu">Susu</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div>
                      <Label>Savings Destination</Label>
                      <Select
                        value={savingForm.bank_account_id}
                        onValueChange={(value) => setSavingForm((current) => ({ ...current, bank_account_id: value }))}
                      >
                        <SelectTrigger>
                          <SelectValue placeholder="Select saved destination" />
                        </SelectTrigger>
                        <SelectContent>
                          {filteredDestinations.map((destination) => (
                            <SelectItem key={destination.id} value={destination.id}>
                              {formatDestinationTitle(destination)}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      {filteredDestinations.length === 0 ? (
                        <p className="mt-1 text-xs text-muted-foreground">Add a {getDestinationTypeLabel(savingForm.savings_type).toLowerCase()} destination first.</p>
                      ) : null}
                    </div>
                  </div>

                  <div className="grid gap-3 md:grid-cols-2">
                    <div>
                      <Label>Reference</Label>
                      <Input
                        value={savingForm.reference}
                        onChange={(event) => setSavingForm((current) => ({ ...current, reference: event.target.value }))}
                        placeholder="Transfer or deposit reference"
                      />
                    </div>
                    <div>
                      <Label>Note</Label>
                      <Input
                        value={savingForm.note}
                        onChange={(event) => setSavingForm((current) => ({ ...current, note: event.target.value }))}
                        placeholder="Optional note"
                      />
                    </div>
                  </div>

                  <div className="rounded-xl border border-border/70 bg-secondary/20 p-4">
                    <p className="text-xs uppercase tracking-wider text-muted-foreground">Available Business Money</p>
                    <p className="mt-1 text-xl font-semibold text-foreground">
                      {financialsLoading
                        ? 'Loading…'
                        : formatCurrency(availableBusinessMoney + Number(savings.find((row) => row.id === editSavingId)?.amount || 0))}
                    </p>
                  </div>

                  <Button onClick={handleSaveSaving} className="w-full" disabled={financialsLoading}>
                    {editSavingId ? 'Update' : 'Save'} Savings
                  </Button>
                </div>
              </DialogContent>
            </Dialog>
          </div>
        </div>

        <div className="grid gap-6 xl:grid-cols-[1.6fr_1fr]">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Savings History</CardTitle>
            </CardHeader>
            <CardContent>
              {loading ? (
                <div className="space-y-3">
                  <div className="h-12 rounded-xl bg-secondary/30" />
                  <div className="h-12 rounded-xl bg-secondary/30" />
                  <div className="h-12 rounded-xl bg-secondary/30" />
                </div>
              ) : savings.length > 0 ? (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Date</TableHead>
                      <TableHead>Type</TableHead>
                      <TableHead>Destination</TableHead>
                      <TableHead>Reference</TableHead>
                      <TableHead>Note</TableHead>
                      <TableHead>Amount</TableHead>
                      <TableHead className="text-right">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {savings.map((row) => {
                      const destination = destinations.find((item) => item.id === row.bank_account_id);
                      return (
                        <TableRow key={row.id}>
                          <TableCell>{new Date(row.savings_date).toLocaleDateString('en-GH')}</TableCell>
                          <TableCell>
                            <Badge variant="secondary">{getDestinationTypeLabel(row.source)}</Badge>
                          </TableCell>
                          <TableCell>{destination ? formatDestinationTitle(destination) : '—'}</TableCell>
                          <TableCell>{row.reference || '—'}</TableCell>
                          <TableCell>{row.note || '—'}</TableCell>
                          <TableCell className="font-semibold">{formatCurrency(Number(row.amount || 0))}</TableCell>
                          <TableCell className="text-right">
                            <div className="flex justify-end gap-1">
                              <Button variant="ghost" size="icon" onClick={() => openEditSaving(row)} disabled={!canManageSavings}>
                                <Pencil className="h-4 w-4" />
                              </Button>
                              <Button variant="ghost" size="icon" onClick={() => void handleDeleteSaving(row.id)} disabled={!canManageSavings}>
                                <Trash2 className="h-4 w-4 text-destructive" />
                              </Button>
                            </div>
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              ) : (
                <EmptyState
                  icon={<PiggyBank className="h-7 w-7 text-muted-foreground" />}
                  title="No savings recorded yet"
                  description="Move money into a savings destination and it will appear here instantly."
                />
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Savings Destinations</CardTitle>
            </CardHeader>
            <CardContent>
              {loading ? (
                <div className="space-y-3">
                  <div className="h-20 rounded-xl bg-secondary/30" />
                  <div className="h-20 rounded-xl bg-secondary/30" />
                </div>
              ) : destinations.length > 0 ? (
                <div className="space-y-3">
                  {destinations.map((destination) => {
                    const Icon = getDestinationTypeIcon(destination.account_type);
                    return (
                      <div key={destination.id} className="rounded-2xl border border-border/70 bg-card/70 p-4">
                        <div className="flex items-start justify-between gap-3">
                          <div className="flex items-start gap-3">
                            <span className="mt-0.5 flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10 text-primary">
                              <Icon className="h-5 w-5" />
                            </span>
                            <div className="space-y-1">
                              <div className="flex items-center gap-2">
                                <p className="font-medium text-foreground">{formatDestinationTitle(destination)}</p>
                                <Badge variant="outline">{getDestinationTypeLabel(destination.account_type)}</Badge>
                              </div>
                              <p className="text-sm text-muted-foreground">{formatDestinationDetails(destination)}</p>
                              {destination.note ? <p className="text-xs text-muted-foreground">{destination.note}</p> : null}
                            </div>
                          </div>
                          <div className="flex gap-1">
                            <Button variant="ghost" size="icon" onClick={() => openEditDestination(destination)} disabled={!canManageSavings}>
                              <Pencil className="h-4 w-4" />
                            </Button>
                            <Button variant="ghost" size="icon" onClick={() => void handleDeleteDestination(destination.id)} disabled={!canManageSavings}>
                              <Trash2 className="h-4 w-4 text-destructive" />
                            </Button>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <EmptyState
                  icon={<Landmark className="h-7 w-7 text-muted-foreground" />}
                  title="No savings destinations yet"
                  description="Add a Bank, MoMo, or Susu destination before recording savings."
                />
              )}
            </CardContent>
          </Card>
        </div>

        {!canManageSavings ? (
          <Card className="border-border/70 bg-secondary/20">
            <CardContent className="p-4 text-sm text-muted-foreground">
              Savings management is available to Admin and Manager roles only. Signed in as {displayName || 'your account'}.
            </CardContent>
          </Card>
        ) : null}
      </div>
    </AppLayout>
  );
}
