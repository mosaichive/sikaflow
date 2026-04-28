import { useCallback, useEffect, useState } from 'react';
import { AppLayout } from '@/components/AppLayout';
import { EmptyState } from '@/components/EmptyState';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/context/AuthContext';
import { useBusiness } from '@/context/BusinessContext';
import { supabase } from '@/integrations/supabase/client';
import { Shield, Trash2, UserPlus, Users } from 'lucide-react';

type ManagedUser = {
  user_id: string;
  display_name: string;
  phone: string | null;
  role: string;
};

const TEAM_ROLES = [
  { value: 'admin', label: 'Admin' },
  { value: 'salesperson', label: 'Salesperson' },
  { value: 'distributor', label: 'Distributor' },
];

export default function StaffUsersPage() {
  const { user, isAdmin, displayName } = useAuth();
  const { businessId } = useBusiness();
  const { toast } = useToast();
  const [rows, setRows] = useState<ManagedUser[]>([]);
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [removingUserId, setRemovingUserId] = useState<string | null>(null);
  const [form, setForm] = useState({
    full_name: '',
    email: '',
    phone: '',
    role: 'salesperson',
    password: '',
  });

  const load = useCallback(async () => {
    if (!businessId) return;
    const { data: profiles } = await supabase
      .from('profiles')
      .select('user_id,display_name,phone')
      .eq('business_id', businessId);
    const { data: roles } = await supabase
      .from('user_roles')
      .select('user_id,role')
      .eq('business_id', businessId);

    const roleMap = new Map<string, string>();
    (roles || []).forEach((row: any) => roleMap.set(row.user_id, row.role));

    setRows(
      ((profiles || []) as any[]).map((profile) => ({
        user_id: profile.user_id,
        display_name: profile.display_name || 'Unknown',
        phone: profile.phone,
        role: roleMap.get(profile.user_id) || 'staff',
      })),
    );
  }, [businessId]);

  useEffect(() => {
    void load();
  }, [load]);

  const inviteUser = async (event: React.FormEvent) => {
    event.preventDefault();
    setSaving(true);

    try {
      const { data, error } = await supabase.functions.invoke('manage-business-user', {
        body: {
          action: 'invite',
          mode: 'password',
          email: form.email.trim(),
          full_name: form.full_name.trim(),
          phone: form.phone.trim() || undefined,
          role: form.role,
          password: form.password,
        },
      });
      if (error) throw error;
      if ((data as any)?.error) throw new Error((data as any).error);

      toast({ title: 'Team member added', description: `${form.full_name} can now sign in.` });
      setForm({ full_name: '', email: '', phone: '', role: 'salesperson', password: '' });
      setOpen(false);
      void load();
    } catch (error) {
      toast({
        title: 'Could not add team member',
        description: error instanceof Error ? error.message : 'Please try again.',
        variant: 'destructive',
      });
    } finally {
      setSaving(false);
    }
  };

  const removeUser = async (userId: string) => {
    setRemovingUserId(userId);
    try {
      const { data, error } = await supabase.functions.invoke('manage-business-user', {
        body: {
          action: 'remove',
          user_id: userId,
        },
      });
      if (error) throw error;
      if ((data as any)?.error) throw new Error((data as any).error);
      toast({ title: 'Team member removed' });
      void load();
    } catch (error) {
      toast({
        title: 'Could not remove team member',
        description: error instanceof Error ? error.message : 'Please try again.',
        variant: 'destructive',
      });
    } finally {
      setRemovingUserId(null);
    }
  };

  return (
    <AppLayout title="Staff / Users">
      <div className="space-y-6">
        <section className="flex flex-col gap-4 rounded-3xl border border-border/70 bg-card/75 p-5 lg:flex-row lg:items-end lg:justify-between">
          <div className="space-y-2">
            <h1 className="text-2xl font-semibold tracking-tight">Staff / Users</h1>
            <p className="text-sm text-muted-foreground">
              Manage your sales team, assign roles, and control who can sell, manage inventory, or handle distribution.
            </p>
          </div>
          {isAdmin ? (
            <Dialog open={open} onOpenChange={setOpen}>
              <DialogTrigger asChild>
                <Button><UserPlus className="mr-2 h-4 w-4" /> Add Team Member</Button>
              </DialogTrigger>
              <DialogContent className="max-w-lg">
                <DialogHeader>
                  <DialogTitle>Add Team Member</DialogTitle>
                </DialogHeader>
                <form className="space-y-4" onSubmit={inviteUser}>
                  <div className="space-y-2">
                    <Label>Full Name</Label>
                    <Input value={form.full_name} onChange={(event) => setForm((current) => ({ ...current, full_name: event.target.value }))} required />
                  </div>
                  <div className="space-y-2">
                    <Label>Email</Label>
                    <Input type="email" value={form.email} onChange={(event) => setForm((current) => ({ ...current, email: event.target.value }))} required />
                  </div>
                  <div className="grid gap-4 sm:grid-cols-2">
                    <div className="space-y-2">
                      <Label>Phone</Label>
                      <Input value={form.phone} onChange={(event) => setForm((current) => ({ ...current, phone: event.target.value }))} />
                    </div>
                    <div className="space-y-2">
                      <Label>Role</Label>
                      <Select value={form.role} onValueChange={(value) => setForm((current) => ({ ...current, role: value }))}>
                        <SelectTrigger><SelectValue /></SelectTrigger>
                        <SelectContent>
                          {TEAM_ROLES.map((roleOption) => (
                            <SelectItem key={roleOption.value} value={roleOption.value}>{roleOption.label}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                  <div className="space-y-2">
                    <Label>Temporary Password</Label>
                    <Input type="password" minLength={8} value={form.password} onChange={(event) => setForm((current) => ({ ...current, password: event.target.value }))} required />
                  </div>
                  <Button type="submit" className="w-full" disabled={saving}>
                    {saving ? 'Saving...' : 'Create Team User'}
                  </Button>
                </form>
              </DialogContent>
            </Dialog>
          ) : null}
        </section>

        <Card className="border-border/70">
          <CardContent className="p-0">
            {rows.length > 0 ? (
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Name</TableHead>
                      <TableHead>Phone</TableHead>
                      <TableHead>Role</TableHead>
                      {isAdmin ? <TableHead className="text-right">Actions</TableHead> : null}
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {rows.map((row) => (
                      <TableRow key={row.user_id}>
                        <TableCell>
                          <div className="flex items-center gap-2">
                            <Shield className="h-4 w-4 text-primary" />
                            <span className="font-medium">{row.display_name}</span>
                            {row.user_id === user?.id ? <Badge variant="secondary">You</Badge> : null}
                          </div>
                        </TableCell>
                        <TableCell>{row.phone || '—'}</TableCell>
                        <TableCell>
                          <Badge variant={row.role === 'admin' ? 'destructive' : 'secondary'}>{row.role}</Badge>
                        </TableCell>
                        {isAdmin ? (
                          <TableCell className="text-right">
                            {row.user_id !== user?.id ? (
                              <Button variant="ghost" size="icon" className="text-destructive" disabled={removingUserId === row.user_id} onClick={() => void removeUser(row.user_id)}>
                                <Trash2 className="h-4 w-4" />
                              </Button>
                            ) : null}
                          </TableCell>
                        ) : null}
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            ) : (
              <EmptyState
                icon={<Users className="h-7 w-7 text-muted-foreground" />}
                title="No team members yet"
                description="Add admins, salespeople, and distributors as your business grows."
                action={isAdmin ? <Button onClick={() => setOpen(true)}><UserPlus className="mr-2 h-4 w-4" /> Add Team Member</Button> : undefined}
              />
            )}
          </CardContent>
        </Card>
      </div>
    </AppLayout>
  );
}
