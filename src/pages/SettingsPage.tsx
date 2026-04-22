import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { AppLayout } from '@/components/AppLayout';
import { useAuth } from '@/context/AuthContext';
import { useBusiness } from '@/context/BusinessContext';
import { useTheme } from '@/hooks/useTheme';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { AlertDialog, AlertDialogContent, AlertDialogHeader, AlertDialogTitle, AlertDialogDescription, AlertDialogFooter, AlertDialogCancel } from '@/components/ui/alert-dialog';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Plus, Pencil, Trash2, Landmark, RotateCcw, AlertTriangle, Shield, Users, Key, Camera, X } from 'lucide-react';
import { ImageCropper } from '@/components/ImageCropper';
import { useToast } from '@/hooks/use-toast';

interface BankAccount {
  id: string; bank_name: string; account_name: string; account_number: string;
  branch: string; mobile_money_name: string; mobile_money_number: string;
  account_type: string; note: string;
}

interface ManagedUser {
  user_id: string;
  display_name: string;
  phone: string | null;
  role: string;
}

interface AuditEntry {
  id: string;
  action: string;
  details: string | null;
  performed_by_name: string | null;
  created_at: string;
}

const emptyBank = { bank_name: '', account_name: '', account_number: '', branch: '', mobile_money_name: '', mobile_money_number: '', account_type: 'bank', note: '' };

const PASSWORD_RULES = {
  minLength: 8,
  hasUpper: /[A-Z]/,
  hasLower: /[a-z]/,
  hasNumber: /[0-9]/,
};

function validatePassword(pw: string) {
  const errors: string[] = [];
  if (pw.length < PASSWORD_RULES.minLength) errors.push('At least 8 characters');
  if (!PASSWORD_RULES.hasUpper.test(pw)) errors.push('At least one uppercase letter');
  if (!PASSWORD_RULES.hasLower.test(pw)) errors.push('At least one lowercase letter');
  if (!PASSWORD_RULES.hasNumber.test(pw)) errors.push('At least one number');
  return errors;
}

const roleBadgeVariant = (role: string) => {
  if (role === 'admin') return 'destructive';
  if (role === 'manager') return 'default';
  return 'secondary';
};

export default function SettingsPage() {
  const { user, role, displayName, avatarUrl, profileTitle, profilePhone, profileBio, isAdmin, refreshProfile } = useAuth();
  const { business, businessId } = useBusiness();
  const { isDark, toggle } = useTheme();
  const { toast } = useToast();
  const navigate = useNavigate();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const businessName = business?.name || 'Your Business';
  const resetConfirmText = useMemo(() => `RESET ${businessName.toUpperCase()}`, [businessName]);

  // Profile state
  const [profileForm, setProfileForm] = useState({
    display_name: '', title: '', phone: '', bio: '',
  });
  const [profileSaving, setProfileSaving] = useState(false);
  const [avatarPreview, setAvatarPreview] = useState<string | null>(null);
  const [avatarFile, setAvatarFile] = useState<File | null>(null);
  const [avatarUploading, setAvatarUploading] = useState(false);
  const [cropperOpen, setCropperOpen] = useState(false);
  const [cropperSrc, setCropperSrc] = useState<string>('');
  const [newPassword, setNewPassword] = useState('');
  const [passwordSaving, setPasswordSaving] = useState(false);

  // Bank state
  const [banks, setBanks] = useState<BankAccount[]>([]);
  const [bankForm, setBankForm] = useState(emptyBank);
  const [editBankId, setEditBankId] = useState<string | null>(null);
  const [bankOpen, setBankOpen] = useState(false);

  // Reset state
  const [resetOpen, setResetOpen] = useState(false);
  const [resetConfirmOpen, setResetConfirmOpen] = useState(false);
  const [resetInput, setResetInput] = useState('');
  const [resetting, setResetting] = useState(false);

  // User management state
  const [users, setUsers] = useState<ManagedUser[]>([]);
  const [userOpen, setUserOpen] = useState(false);
  const [userForm, setUserForm] = useState({ full_name: '', email: '', phone: '', role: 'staff' as string, password: '', mode: 'password' as 'password' | 'email' });
  const [userSaving, setUserSaving] = useState(false);
  const [removeUserId, setRemoveUserId] = useState<string | null>(null);
  const [removingUser, setRemovingUser] = useState(false);

  // Audit log state
  const [auditLogs, setAuditLogs] = useState<AuditEntry[]>([]);

  useEffect(() => {
    setProfileForm({
      display_name: displayName || '',
      title: profileTitle || '',
      phone: profilePhone || '',
      bio: profileBio || '',
    });
  }, [displayName, profileTitle, profilePhone, profileBio]);

  useEffect(() => {
    fetchBanks();
    if (isAdmin && businessId) {
      fetchUsers();
      fetchAuditLogs();
    }
    const ch = supabase.channel('settings-page')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'bank_accounts' }, fetchBanks)
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [isAdmin, businessId]);

  const fetchBanks = async () => {
    const { data } = await supabase.from('bank_accounts').select('*').order('created_at', { ascending: false });
    setBanks((data || []) as any);
  };

  const fetchUsers = async () => {
    if (!businessId) return;
    // Scope to current business only
    const { data: profiles } = await supabase
      .from('profiles')
      .select('user_id, display_name, phone')
      .eq('business_id', businessId);
    const { data: roles } = await supabase
      .from('user_roles')
      .select('user_id, role')
      .eq('business_id', businessId);
    if (!profiles) return;
    const roleMap: Record<string, string> = {};
    (roles || []).forEach((r: any) => { roleMap[r.user_id] = r.role; });
    setUsers(profiles.map((p: any) => ({
      user_id: p.user_id,
      display_name: p.display_name || 'Unknown',
      phone: p.phone,
      role: roleMap[p.user_id] || 'none',
    })));
  };

  const fetchAuditLogs = async () => {
    const { data } = await supabase.from('audit_log').select('*').order('created_at', { ascending: false }).limit(50);
    setAuditLogs((data || []) as AuditEntry[]);
  };

  const logAudit = async (action: string, details?: string) => {
    if (!user) return;
    await supabase.from('audit_log').insert({
      action,
      details: details || null,
      performed_by: user.id,
      performed_by_name: displayName || user.email || '',
      business_id: businessId,
    } as any);
  };

  // ---- Profile Management ----
  const handleSaveProfile = async () => {
    if (!user) return;
    setProfileSaving(true);
    const { error } = await supabase.from('profiles').update({
      display_name: profileForm.display_name,
      title: profileForm.title,
      phone: profileForm.phone,
      bio: profileForm.bio,
    } as any).eq('user_id', user.id);
    if (error) {
      toast({ title: 'Error saving profile', description: error.message, variant: 'destructive' });
    } else {
      toast({ title: 'Profile updated successfully' });
      await logAudit('profile_updated', `Updated profile: ${profileForm.display_name}`);
      await refreshProfile();
    }
    setProfileSaving(false);
  };

  const handleAvatarSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const validTypes = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp'];
    if (!validTypes.includes(file.type)) {
      toast({ title: 'Invalid file type', description: 'Only JPG, PNG, and WEBP allowed.', variant: 'destructive' });
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      toast({ title: 'File too large', description: 'Max 5MB.', variant: 'destructive' });
      return;
    }
    setCropperSrc(URL.createObjectURL(file));
    setCropperOpen(true);
    // Reset file input so same file can be re-selected
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const handleCropComplete = useCallback(async (croppedBlob: Blob) => {
    setCropperOpen(false);
    const file = new File([croppedBlob], 'avatar.jpg', { type: 'image/jpeg' });
    setAvatarFile(file);
    setAvatarPreview(URL.createObjectURL(croppedBlob));
  }, []);

  const handleAvatarUpload = async () => {
    if (!avatarFile || !user) return;
    setAvatarUploading(true);
    const ext = avatarFile.name.split('.').pop();
    const path = `avatars/${user.id}.${ext}`;
    const { error: upErr } = await supabase.storage.from('product-images').upload(path, avatarFile, { upsert: true });
    if (upErr) {
      toast({ title: 'Upload failed', description: upErr.message, variant: 'destructive' });
      setAvatarUploading(false);
      return;
    }
    const { data: urlData } = supabase.storage.from('product-images').getPublicUrl(path);
    const avatarUrlNew = urlData.publicUrl + '?t=' + Date.now();
    await supabase.from('profiles').update({ avatar_url: avatarUrlNew }).eq('user_id', user.id);
    toast({ title: 'Profile photo updated' });
    setAvatarFile(null); setAvatarPreview(null);
    await refreshProfile();
    setAvatarUploading(false);
  };

  const handleRemoveAvatar = async () => {
    if (!user) return;
    await supabase.from('profiles').update({ avatar_url: '' }).eq('user_id', user.id);
    toast({ title: 'Profile photo removed' });
    await refreshProfile();
  };

  const handleChangePassword = async () => {
    const pwErrors = validatePassword(newPassword);
    if (pwErrors.length > 0) {
      toast({ title: 'Password too weak', description: pwErrors.join(', '), variant: 'destructive' });
      return;
    }

    setPasswordSaving(true);
    const { error } = await supabase.auth.updateUser({ password: newPassword });
    setPasswordSaving(false);

    if (error) {
      toast({ title: 'Password update failed', description: error.message, variant: 'destructive' });
      return;
    }

    setNewPassword('');
    toast({ title: 'Password updated' });
  };

  // ---- User Management (per-business, server-enforced) ----
  const handleAddUser = async () => {
    if (!userForm.full_name || !userForm.email) {
      toast({ title: 'Full name and email are required', variant: 'destructive' });
      return;
    }
    if (userForm.mode === 'password') {
      const pwErrors = validatePassword(userForm.password);
      if (!userForm.password) {
        toast({ title: 'Password is required', variant: 'destructive' });
        return;
      }
      if (pwErrors.length > 0) {
        toast({ title: 'Password too weak', description: pwErrors.join(', '), variant: 'destructive' });
        return;
      }
    }

    setUserSaving(true);
    const { data, error } = await supabase.functions.invoke('manage-business-user', {
      body: {
        action: 'invite',
        mode: userForm.mode,
        full_name: userForm.full_name,
        email: userForm.email,
        phone: userForm.phone || undefined,
        role: userForm.role,
        password: userForm.mode === 'password' ? userForm.password : undefined,
      },
    });

    if (error || (data && (data as any).error)) {
      const msg = (data as any)?.error || error?.message || 'Failed to invite user';
      toast({ title: 'Could not invite user', description: msg, variant: 'destructive' });
      setUserSaving(false);
      return;
    }

    toast({
      title: userForm.mode === 'password' ? 'User created' : 'Invitation sent',
      description: userForm.mode === 'password'
        ? 'They can sign in immediately with the password you set.'
        : `An invitation email was sent to ${userForm.email}.`,
    });
    setUserForm({ full_name: '', email: '', phone: '', role: 'staff', password: '', mode: 'password' });
    setUserOpen(false);
    fetchUsers();
    setUserSaving(false);
  };

  const handleChangeRole = async (userId: string, newRole: string) => {
    if (userId === user?.id) {
      toast({ title: 'Cannot change your own role', variant: 'destructive' });
      return;
    }
    if (!businessId) return;
    const { data: existing } = await supabase
      .from('user_roles')
      .select('id')
      .eq('user_id', userId)
      .eq('business_id', businessId)
      .maybeSingle();
    if (existing) {
      await supabase.from('user_roles').update({ role: newRole as any }).eq('id', existing.id);
    } else {
      await supabase.from('user_roles').insert({ user_id: userId, role: newRole as any, business_id: businessId });
    }
    await logAudit('role_changed', `Changed role for user ${userId} to ${newRole}`);
    toast({ title: 'Role updated' });
    fetchUsers();
  };

  const handleRemoveUser = async () => {
    if (!removeUserId) return;
    setRemovingUser(true);
    const { data, error } = await supabase.functions.invoke('manage-business-user', {
      body: { action: 'remove', user_id: removeUserId },
    });
    if (error || (data && (data as any).error)) {
      const msg = (data as any)?.error || error?.message || 'Failed to remove user';
      toast({ title: 'Could not remove user', description: msg, variant: 'destructive' });
    } else {
      toast({ title: 'User removed', description: 'They no longer have access to this workspace.' });
      fetchUsers();
    }
    setRemoveUserId(null);
    setRemovingUser(false);
  };

  // ---- Bank CRUD ----
  const handleBankSave = async () => {
    if (!bankForm.bank_name || !businessId) return;
    const { error } = editBankId
      ? await supabase.from('bank_accounts').update(bankForm).eq('id', editBankId)
      : await supabase.from('bank_accounts').insert({ ...bankForm, business_id: businessId });
    if (error) { toast({ title: 'Error', description: error.message, variant: 'destructive' }); return; }
    toast({ title: editBankId ? 'Bank updated' : 'Bank added' });
    setBankForm(emptyBank); setEditBankId(null); setBankOpen(false); fetchBanks();
  };

  const handleBankEdit = (b: BankAccount) => {
    setBankForm({ bank_name: b.bank_name, account_name: b.account_name, account_number: b.account_number, branch: b.branch, mobile_money_name: b.mobile_money_name, mobile_money_number: b.mobile_money_number, account_type: b.account_type, note: b.note });
    setEditBankId(b.id); setBankOpen(true);
  };

  const handleBankDelete = async (id: string) => {
    await supabase.from('bank_accounts').delete().eq('id', id);
    toast({ title: 'Bank deleted' }); fetchBanks();
  };

  // ---- System Reset (scoped to current business) ----
  const handleExportBackup = async () => {
    if (!businessId) return;
    try {
      const tables = ['sales', 'sale_items', 'products', 'customers', 'expenses', 'savings', 'investments', 'investor_funding', 'restocks', 'bank_accounts'] as const;
      const backup: Record<string, any[]> = {};
      for (const table of tables) {
        const { data } = await supabase.from(table).select('*').eq('business_id', businessId);
        backup[table] = data || [];
      }
      const slug = (businessName || 'business').toLowerCase().replace(/[^a-z0-9]+/g, '-');
      const blob = new Blob([JSON.stringify(backup, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url; a.download = `${slug}-backup-${new Date().toISOString().slice(0, 10)}.json`; a.click();
      URL.revokeObjectURL(url);
      toast({ title: 'Backup downloaded' });
    } catch {
      toast({ title: 'Backup failed', variant: 'destructive' });
    }
  };

  const handleSystemReset = async () => {
    if (resetInput !== resetConfirmText) return;
    if (!businessId) return;
    setResetting(true);
    try {
      // Delete sale_items first (FK to sales). All scoped to current business only.
      await supabase.from('sale_items').delete().eq('business_id', businessId);
      await supabase.from('sales').delete().eq('business_id', businessId);
      await supabase.from('restocks').delete().eq('business_id', businessId);
      await supabase.from('expenses').delete().eq('business_id', businessId);
      await supabase.from('savings').delete().eq('business_id', businessId);
      await supabase.from('investments').delete().eq('business_id', businessId);
      await supabase.from('investor_funding').delete().eq('business_id', businessId);
      await supabase.from('products').delete().eq('business_id', businessId);
      await supabase.from('customers').delete().eq('business_id', businessId);
      await logAudit('system_reset', `Full reset for ${businessName}`);
      setResetConfirmOpen(false); setResetOpen(false); setResetInput('');
      toast({ title: 'System reset complete', description: `${businessName} is starting fresh.` });
      navigate('/dashboard');
    } catch (err: any) {
      toast({ title: 'Reset failed', description: err?.message || 'Something went wrong', variant: 'destructive' });
    } finally {
      setResetting(false);
    }
  };

  return (
    <AppLayout title="Settings">
      <div className="space-y-6 animate-fade-in max-w-3xl">

        {/* Profile Settings */}
        <Card>
          <CardHeader><CardTitle className="text-base flex items-center gap-2"><Camera className="h-4 w-4" />Profile Settings</CardTitle></CardHeader>
          <CardContent className="space-y-5">
            {/* Avatar */}
            <div className="flex items-center gap-4">
              <div className="relative">
                <Avatar className="h-16 w-16">
                  {(avatarPreview || avatarUrl) && <AvatarImage src={avatarPreview || avatarUrl} alt={displayName} />}
                  <AvatarFallback className="bg-primary/20 text-primary text-lg font-bold">
                    {displayName?.charAt(0)?.toUpperCase() || 'U'}
                  </AvatarFallback>
                </Avatar>
                {avatarUrl && !avatarPreview && (
                  <button onClick={handleRemoveAvatar} className="absolute -top-1 -right-1 bg-destructive text-destructive-foreground rounded-full p-0.5" title="Remove photo">
                    <X className="h-3 w-3" />
                  </button>
                )}
              </div>
              <div className="space-y-1.5">
                <input ref={fileInputRef} type="file" accept="image/jpeg,image/jpg,image/png,image/webp" onChange={handleAvatarSelect} className="hidden" />
                <div className="flex gap-2">
                  <Button size="sm" variant="outline" onClick={() => fileInputRef.current?.click()}>
                    <Camera className="h-3.5 w-3.5 mr-1" />{avatarUrl ? 'Change Photo' : 'Upload Photo'}
                  </Button>
                  {avatarPreview && (
                    <Button size="sm" onClick={handleAvatarUpload} disabled={avatarUploading}>
                      {avatarUploading ? 'Uploading...' : 'Save Photo'}
                    </Button>
                  )}
                </div>
                <p className="text-[10px] text-muted-foreground">JPG, PNG, or WEBP. Max 5MB.</p>
              </div>
            </div>

            {/* Profile Fields */}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Display Name</Label>
                <Input value={profileForm.display_name} onChange={e => setProfileForm(p => ({ ...p, display_name: e.target.value }))} placeholder="Your name" />
              </div>
              <div>
                <Label>Title / Role Title</Label>
                <Input value={profileForm.title} onChange={e => setProfileForm(p => ({ ...p, title: e.target.value }))} placeholder="e.g. Store Owner, Manager" />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Email</Label>
                <Input value={user?.email || ''} disabled className="bg-muted" />
                <p className="text-[10px] text-muted-foreground mt-0.5">Change email in Account Settings below</p>
              </div>
              <div>
                <Label>Phone</Label>
                <Input value={profileForm.phone} onChange={e => setProfileForm(p => ({ ...p, phone: e.target.value }))} placeholder="0241234567" />
              </div>
            </div>
            <div>
              <Label>Bio / Note (optional)</Label>
              <Textarea value={profileForm.bio} onChange={e => setProfileForm(p => ({ ...p, bio: e.target.value }))} rows={2} placeholder="Short bio or note about yourself" />
            </div>
            <Button size="sm" onClick={handleSaveProfile} disabled={profileSaving}>
              {profileSaving ? 'Saving...' : 'Save Profile'}
            </Button>
          </CardContent>
        </Card>

        {/* Account Info */}
        <Card>
          <CardHeader><CardTitle className="text-base">Account</CardTitle></CardHeader>
          <CardContent className="space-y-3 text-sm">
            <div className="flex justify-between"><span className="text-muted-foreground">Name</span><span className="font-medium">{displayName}</span></div>
            <div className="flex justify-between"><span className="text-muted-foreground">Email</span><span className="font-medium">{user?.email}</span></div>
            <div className="flex justify-between"><span className="text-muted-foreground">Role</span><Badge variant={roleBadgeVariant(role || '')} className="capitalize">{role || 'No role'}</Badge></div>
          </CardContent>
        </Card>

        {/* Account Settings */}
        <Card>
          <CardHeader><CardTitle className="text-base flex items-center gap-2"><Key className="h-4 w-4" />Account Settings</CardTitle></CardHeader>
          <CardContent className="space-y-3">
            <div className="rounded-lg border border-border bg-secondary/30 p-4">
              <div className="flex flex-col gap-3">
                <div>
                  <p className="text-sm font-medium">Password</p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    Update the password for the signed-in account.
                  </p>
                </div>
                <div className="flex flex-col gap-2 sm:flex-row">
                  <Input
                    type="password"
                    value={newPassword}
                    onChange={(event) => setNewPassword(event.target.value)}
                    placeholder="New password"
                    autoComplete="new-password"
                  />
                  <Button size="sm" onClick={handleChangePassword} disabled={passwordSaving || !newPassword}>
                    <Shield className="mr-2 h-4 w-4" />{passwordSaving ? 'Updating...' : 'Update Password'}
                  </Button>
                </div>
                {newPassword && validatePassword(newPassword).length > 0 && (
                  <p className="text-[10px] text-muted-foreground">
                    Needs {validatePassword(newPassword).join(', ').toLowerCase()}.
                  </p>
                )}
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Appearance */}
        <Card>
          <CardHeader><CardTitle className="text-base">Appearance</CardTitle></CardHeader>
          <CardContent>
            <div className="flex items-center justify-between">
              <Label>Dark Mode</Label>
              <Switch checked={isDark} onCheckedChange={toggle} />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle className="text-base">Store</CardTitle></CardHeader>
          <CardContent className="space-y-3 text-sm">
            <div className="flex justify-between"><span className="text-muted-foreground">Store Name</span><span className="font-medium">{businessName}</span></div>
            <div className="flex justify-between"><span className="text-muted-foreground">Currency</span><span className="font-medium">GH₵ (Ghana Cedi)</span></div>
          </CardContent>
        </Card>

        {/* User Management */}
        {isAdmin && (
          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle className="text-base flex items-center gap-2"><Users className="h-4 w-4" />User Management</CardTitle>
              <Dialog open={userOpen} onOpenChange={(o) => { setUserOpen(o); if (!o) setUserForm({ full_name: '', email: '', phone: '', role: 'staff', password: '', mode: 'password' }); }}>
                <DialogTrigger asChild><Button size="sm"><Plus className="h-4 w-4 mr-1" />Add User</Button></DialogTrigger>
                <DialogContent className="max-w-md">
                  <DialogHeader><DialogTitle>Invite a Team Member</DialogTitle></DialogHeader>
                  <div className="grid gap-3">
                    {/* Mode toggle */}
                    <div className="grid grid-cols-2 gap-2 p-1 rounded-lg bg-muted">
                      <button
                        type="button"
                        onClick={() => setUserForm(p => ({ ...p, mode: 'password' }))}
                        className={`px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${userForm.mode === 'password' ? 'bg-background shadow-sm text-foreground' : 'text-muted-foreground'}`}
                      >Set password now</button>
                      <button
                        type="button"
                        onClick={() => setUserForm(p => ({ ...p, mode: 'email' }))}
                        className={`px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${userForm.mode === 'email' ? 'bg-background shadow-sm text-foreground' : 'text-muted-foreground'}`}
                      >Email an invite</button>
                    </div>
                    <p className="text-xs text-muted-foreground -mt-1">
                      {userForm.mode === 'password'
                        ? 'Create the account with a password. They can sign in immediately.'
                        : 'Send an invitation email — the invitee sets their own password.'}
                    </p>

                    <div><Label>Full Name *</Label><Input value={userForm.full_name} onChange={e => setUserForm(p => ({ ...p, full_name: e.target.value }))} placeholder="e.g. Jane Mensah" /></div>
                    <div><Label>Email *</Label><Input type="email" value={userForm.email} onChange={e => setUserForm(p => ({ ...p, email: e.target.value }))} placeholder="user@email.com" /></div>
                    <div><Label>Phone</Label><Input value={userForm.phone} onChange={e => setUserForm(p => ({ ...p, phone: e.target.value }))} placeholder="0241234567" /></div>
                    <div><Label>Role *</Label>
                      <Select value={userForm.role} onValueChange={v => setUserForm(p => ({ ...p, role: v }))}>
                        <SelectTrigger><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="admin">Admin</SelectItem>
                          <SelectItem value="manager">Manager</SelectItem>
                          <SelectItem value="staff">Staff</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    {userForm.mode === 'password' && (
                      <div>
                        <Label>Temporary Password *</Label>
                        <Input type="password" value={userForm.password} onChange={e => setUserForm(p => ({ ...p, password: e.target.value }))} placeholder="Min 8 chars, upper+lower+number" />
                        {userForm.password && validatePassword(userForm.password).length > 0 && (
                          <ul className="text-xs text-destructive mt-1 space-y-0.5 pl-3">
                            {validatePassword(userForm.password).map((e, i) => <li key={i}>• {e}</li>)}
                          </ul>
                        )}
                      </div>
                    )}
                    <Button onClick={handleAddUser} disabled={userSaving} className="w-full">
                      {userSaving
                        ? (userForm.mode === 'password' ? 'Creating...' : 'Sending invite...')
                        : (userForm.mode === 'password' ? 'Create User' : 'Send Invitation')}
                    </Button>
                  </div>
                </DialogContent>
              </Dialog>
            </CardHeader>
            <CardContent>
              {users.length > 0 ? (
                <Table>
                  <TableHeader><TableRow>
                    <TableHead>Name</TableHead><TableHead>Role</TableHead><TableHead className="text-right">Actions</TableHead>
                  </TableRow></TableHeader>
                  <TableBody>
                    {users.map(u => (
                      <TableRow key={u.user_id}>
                        <TableCell>
                          <div>
                            <p className="font-medium">{u.display_name}</p>
                            {u.phone && <p className="text-xs text-muted-foreground">{u.phone}</p>}
                          </div>
                        </TableCell>
                        <TableCell><Badge variant={roleBadgeVariant(u.role)} className="capitalize">{u.role}</Badge></TableCell>
                        <TableCell className="text-right">
                          {u.user_id !== user?.id ? (
                            <div className="flex items-center justify-end gap-1">
                              <Select value={u.role} onValueChange={v => handleChangeRole(u.user_id, v)}>
                                <SelectTrigger className="w-28 h-8 text-xs"><SelectValue /></SelectTrigger>
                                <SelectContent>
                                  <SelectItem value="admin">Admin</SelectItem>
                                  <SelectItem value="manager">Manager</SelectItem>
                                  <SelectItem value="staff">Staff</SelectItem>
                                </SelectContent>
                              </Select>
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-8 w-8"
                                onClick={() => setRemoveUserId(u.user_id)}
                                title="Remove from business"
                              >
                                <Trash2 className="h-4 w-4 text-destructive" />
                              </Button>
                            </div>
                          ) : (
                            <span className="text-xs text-muted-foreground">You</span>
                          )}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              ) : (
                <p className="text-sm text-muted-foreground text-center py-6">No users found.</p>
              )}
            </CardContent>
          </Card>
        )}

        {/* Banks */}
        {isAdmin && (
          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle className="text-base flex items-center gap-2"><Landmark className="h-4 w-4" />Banks & Account Details</CardTitle>
              <Dialog open={bankOpen} onOpenChange={(o) => { setBankOpen(o); if (!o) { setBankForm(emptyBank); setEditBankId(null); } }}>
                <DialogTrigger asChild><Button size="sm"><Plus className="h-4 w-4 mr-1" />Add Bank</Button></DialogTrigger>
                <DialogContent className="max-w-lg">
                  <DialogHeader><DialogTitle>{editBankId ? 'Edit' : 'Add'} Bank / Account</DialogTitle></DialogHeader>
                  <div className="grid gap-3">
                    <div className="grid grid-cols-2 gap-3">
                      <div><Label>Bank Name</Label><Input value={bankForm.bank_name} onChange={e => setBankForm(p => ({ ...p, bank_name: e.target.value }))} placeholder="e.g. Ecobank" /></div>
                      <div><Label>Account Type</Label>
                        <Select value={bankForm.account_type} onValueChange={v => setBankForm(p => ({ ...p, account_type: v }))}>
                          <SelectTrigger><SelectValue /></SelectTrigger>
                          <SelectContent>
                            <SelectItem value="bank">Bank Account</SelectItem>
                            <SelectItem value="mobile_money">Mobile Money</SelectItem>
                            <SelectItem value="other">Other</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                      <div><Label>Account Name</Label><Input value={bankForm.account_name} onChange={e => setBankForm(p => ({ ...p, account_name: e.target.value }))} /></div>
                      <div><Label>Account Number</Label><Input value={bankForm.account_number} onChange={e => setBankForm(p => ({ ...p, account_number: e.target.value }))} /></div>
                    </div>
                    <div><Label>Branch</Label><Input value={bankForm.branch} onChange={e => setBankForm(p => ({ ...p, branch: e.target.value }))} /></div>
                    <div className="grid grid-cols-2 gap-3">
                      <div><Label>Mobile Money Name</Label><Input value={bankForm.mobile_money_name} onChange={e => setBankForm(p => ({ ...p, mobile_money_name: e.target.value }))} /></div>
                      <div><Label>Mobile Money Number</Label><Input value={bankForm.mobile_money_number} onChange={e => setBankForm(p => ({ ...p, mobile_money_number: e.target.value }))} /></div>
                    </div>
                    <div><Label>Note</Label><Textarea value={bankForm.note} onChange={e => setBankForm(p => ({ ...p, note: e.target.value }))} rows={2} /></div>
                    <Button onClick={handleBankSave} className="w-full">{editBankId ? 'Update' : 'Save'} Bank</Button>
                  </div>
                </DialogContent>
              </Dialog>
            </CardHeader>
            <CardContent>
              {banks.length > 0 ? (
                <Table>
                  <TableHeader><TableRow>
                    <TableHead>Bank</TableHead><TableHead>Account Name</TableHead><TableHead>Account #</TableHead>
                    <TableHead>Type</TableHead><TableHead className="text-right">Actions</TableHead>
                  </TableRow></TableHeader>
                  <TableBody>
                    {banks.map(b => (
                      <TableRow key={b.id}>
                        <TableCell className="font-medium">{b.bank_name}</TableCell>
                        <TableCell>{b.account_name || '—'}</TableCell>
                        <TableCell>{b.account_number || '—'}</TableCell>
                        <TableCell className="capitalize">{b.account_type.replace('_', ' ')}</TableCell>
                        <TableCell className="text-right space-x-1">
                          <Button variant="ghost" size="icon" onClick={() => handleBankEdit(b)}><Pencil className="h-4 w-4" /></Button>
                          <Button variant="ghost" size="icon" onClick={() => handleBankDelete(b.id)}><Trash2 className="h-4 w-4 text-destructive" /></Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              ) : (
                <p className="text-sm text-muted-foreground text-center py-6">No banks added yet.</p>
              )}
            </CardContent>
          </Card>
        )}

        {/* Audit Log */}
        {isAdmin && (
          <Card>
            <CardHeader><CardTitle className="text-base flex items-center gap-2"><Shield className="h-4 w-4" />Audit Log</CardTitle></CardHeader>
            <CardContent>
              {auditLogs.length > 0 ? (
                <div className="max-h-64 overflow-y-auto">
                  <Table>
                    <TableHeader><TableRow>
                      <TableHead>Action</TableHead><TableHead>Details</TableHead><TableHead>By</TableHead><TableHead>Date</TableHead>
                    </TableRow></TableHeader>
                    <TableBody>
                      {auditLogs.map(log => (
                        <TableRow key={log.id}>
                          <TableCell className="font-medium capitalize">{log.action.replace(/_/g, ' ')}</TableCell>
                          <TableCell className="text-xs text-muted-foreground max-w-[200px] truncate">{log.details || '—'}</TableCell>
                          <TableCell className="text-xs">{log.performed_by_name || '—'}</TableCell>
                          <TableCell className="text-xs text-muted-foreground">{new Date(log.created_at).toLocaleString()}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              ) : (
                <p className="text-sm text-muted-foreground text-center py-6">No audit records yet.</p>
              )}
            </CardContent>
          </Card>
        )}

        {/* System Control */}
        {isAdmin && (
          <Card className="border-destructive/30">
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2 text-destructive">
                <AlertTriangle className="h-4 w-4" />System Control
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <p className="text-sm text-muted-foreground">
                Reset all transactional data for <span className="font-semibold text-foreground">{businessName}</span> — sales, products, customers, expenses, savings, investments, and restocks. Users, roles, banks, and your business profile are kept.
              </p>
              <div className="flex gap-2">
                <Button variant="outline" size="sm" onClick={handleExportBackup}>Download Backup</Button>
                <Button variant="destructive" size="sm" onClick={() => setResetOpen(true)}>
                  <RotateCcw className="h-4 w-4 mr-1" />Reset System
                </Button>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Reset Dialogs */}
        <AlertDialog open={resetOpen} onOpenChange={(o) => { setResetOpen(o); if (!o) setResetInput(''); }}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle className="flex items-center gap-2 text-destructive"><AlertTriangle className="h-5 w-5" />System Reset Warning</AlertDialogTitle>
              <AlertDialogDescription className="space-y-3">
                <span className="block font-semibold text-foreground">This will permanently delete all transactional data for {businessName}. This action cannot be undone.</span>
                <span className="block text-sm">Type <span className="font-mono font-bold text-destructive">{resetConfirmText}</span> to confirm:</span>
              </AlertDialogDescription>
            </AlertDialogHeader>
            <Input value={resetInput} onChange={e => setResetInput(e.target.value)} placeholder={`Type ${resetConfirmText}`} className="font-mono" />
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <Button variant="destructive" disabled={resetInput !== resetConfirmText} onClick={() => { setResetOpen(false); setResetConfirmOpen(true); }}>Continue</Button>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>

        <AlertDialog open={resetConfirmOpen} onOpenChange={(o) => { if (!resetting) setResetConfirmOpen(o); }}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle className="flex items-center gap-2 text-destructive"><AlertTriangle className="h-5 w-5" />Final Confirmation</AlertDialogTitle>
              <AlertDialogDescription>
                Are you absolutely sure? All transactional data for <span className="font-semibold text-foreground">{businessName}</span> will be erased immediately.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel disabled={resetting}>Go back</AlertDialogCancel>
              <Button variant="destructive" disabled={resetting} onClick={handleSystemReset}>
                {resetting ? 'Resetting...' : 'Yes, reset everything'}
              </Button>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>

        {/* Remove user confirmation */}
        <AlertDialog open={!!removeUserId} onOpenChange={(o) => { if (!o && !removingUser) setRemoveUserId(null); }}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Remove user from {businessName}?</AlertDialogTitle>
              <AlertDialogDescription>
                They will immediately lose access to this workspace. Their historical sales and activity stay intact. Their account is not deleted — they can be re-invited later.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel disabled={removingUser}>Cancel</AlertDialogCancel>
              <Button variant="destructive" disabled={removingUser} onClick={handleRemoveUser}>
                {removingUser ? 'Removing...' : 'Remove user'}
              </Button>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>


        <ImageCropper
          open={cropperOpen}
          onClose={() => setCropperOpen(false)}
          imageSrc={cropperSrc}
          onCropComplete={handleCropComplete}
        />
      </div>
    </AppLayout>
  );
}
