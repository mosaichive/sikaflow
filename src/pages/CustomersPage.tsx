import { useState, useEffect } from 'react';
import { AppLayout } from '@/components/AppLayout';
import { EmptyState } from '@/components/EmptyState';
import { formatCurrency } from '@/lib/constants';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent } from '@/components/ui/card';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { useToast } from '@/hooks/use-toast';
import { useBusiness } from '@/context/BusinessContext';
import { Plus, Users, Search } from 'lucide-react';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';

export default function CustomersPage() {
  const { toast } = useToast();
  const { businessId } = useBusiness();
  const [customers, setCustomers] = useState<any[]>([]);
  const [search, setSearch] = useState('');
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [form, setForm] = useState({ name: '', phone: '', email: '', location: '', notes: '' });

  useEffect(() => {
    fetchCustomers();
    const ch = supabase.channel('customers-page')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'customers' }, fetchCustomers)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'sales' }, fetchCustomers)
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, []);

  const fetchCustomers = async () => {
    const [custRes, salesRes] = await Promise.all([
      supabase.from('customers').select('*').order('name'),
      supabase.from('sales').select('customer_name, total, balance'),
    ]);

    const sales = salesRes.data || [];
    const custs = (custRes.data || []).map(c => {
      const custSales = sales.filter(s => s.customer_name === c.name);
      return {
        ...c,
        total_spent: custSales.reduce((sum, s) => sum + Number(s.total), 0),
        outstanding: custSales.reduce((sum, s) => sum + Number(s.balance), 0),
      };
    });
    setCustomers(custs);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      if (!businessId) throw new Error('No business selected');
      const { error } = await supabase.from('customers').insert({ ...form, business_id: businessId });
      if (error) throw error;
      toast({ title: 'Customer added!' });
      setForm({ name: '', phone: '', email: '', location: '', notes: '' });
      setOpen(false);
    } catch (err: any) {
      toast({ title: 'Error', description: err.message, variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  };

  const filtered = customers.filter(c =>
    c.name.toLowerCase().includes(search.toLowerCase()) || (c.phone || '').includes(search)
  );

  return (
    <AppLayout title="Customers">
      <div className="space-y-6 animate-fade-in">
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
          <div className="relative w-full sm:w-72">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input placeholder="Search customers..." value={search} onChange={e => setSearch(e.target.value)} className="pl-9" />
          </div>
          <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
              <Button><Plus className="h-4 w-4 mr-2" /> Add Customer</Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader><DialogTitle>Add Customer</DialogTitle></DialogHeader>
              <form onSubmit={handleSubmit} className="space-y-3">
                <div><Label>Name</Label><Input required value={form.name} onChange={e => setForm({...form, name: e.target.value})} /></div>
                <div className="grid grid-cols-2 gap-3">
                  <div><Label>Phone</Label><Input value={form.phone} onChange={e => setForm({...form, phone: e.target.value})} /></div>
                  <div><Label>Email</Label><Input type="email" value={form.email} onChange={e => setForm({...form, email: e.target.value})} /></div>
                </div>
                <div><Label>Location</Label><Input value={form.location} onChange={e => setForm({...form, location: e.target.value})} /></div>
                <div><Label>Notes</Label><Textarea value={form.notes} onChange={e => setForm({...form, notes: e.target.value})} /></div>
                <Button type="submit" className="w-full" disabled={loading}>{loading ? 'Saving...' : 'Add Customer'}</Button>
              </form>
            </DialogContent>
          </Dialog>
        </div>

        <Card>
          <CardContent className="p-0">
            {filtered.length > 0 ? (
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Name</TableHead>
                      <TableHead>Phone</TableHead>
                      <TableHead>Email</TableHead>
                      <TableHead>Location</TableHead>
                      <TableHead>Total Spent</TableHead>
                      <TableHead>Outstanding</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filtered.map(c => (
                      <TableRow key={c.id}>
                        <TableCell className="font-medium">{c.name}</TableCell>
                        <TableCell className="text-sm">{c.phone || '—'}</TableCell>
                        <TableCell className="text-sm">{c.email || '—'}</TableCell>
                        <TableCell className="text-sm">{c.location || '—'}</TableCell>
                        <TableCell className="font-semibold">{formatCurrency(c.total_spent)}</TableCell>
                        <TableCell className={c.outstanding > 0 ? 'text-destructive font-semibold' : ''}>
                          {formatCurrency(c.outstanding)}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            ) : (
              <EmptyState icon={<Users className="h-7 w-7 text-muted-foreground" />} title="No customers yet" description="Add customers to track their purchases and balances." />
            )}
          </CardContent>
        </Card>
      </div>
    </AppLayout>
  );
}
