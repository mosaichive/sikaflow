import { useCallback, useEffect, useMemo, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/context/AuthContext';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';
import { useToast } from '@/hooks/use-toast';
import {
  DEFAULT_SUPPORT_SETTINGS,
  isValidHttpUrl,
  isValidSupportEmail,
  normalizeSupportSettings,
  type SupportSettings,
} from '@/lib/support';
import { Badge } from '@/components/ui/badge';
import { Mail, MessageSquareMore, Phone, Trash2 } from 'lucide-react';

type SupportMessageRow = {
  id: string;
  sender_name: string;
  sender_contact: string;
  subject: string;
  message: string;
  is_read: boolean;
  created_at: string;
};

export default function PlatformSupportPage() {
  const { user } = useAuth();
  const { toast } = useToast();
  const [settings, setSettings] = useState<SupportSettings>(DEFAULT_SUPPORT_SETTINGS);
  const [messages, setMessages] = useState<SupportMessageRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [filter, setFilter] = useState<'all' | 'unread'>('all');

  const load = useCallback(async () => {
    setLoading(true);
    const [settingsRes, messagesRes] = await Promise.all([
      supabase.from('platform_support_settings' as any).select('*').eq('singleton_key', 'default').maybeSingle(),
      supabase.from('support_messages' as any).select('*').order('is_read').order('created_at', { ascending: false }),
    ]);

    setSettings(settingsRes.data ? normalizeSupportSettings(settingsRes.data) : DEFAULT_SUPPORT_SETTINGS);
    setMessages((messagesRes.data as SupportMessageRow[]) ?? []);
    setLoading(false);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    const channel = supabase
      .channel('platform-support')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'platform_support_settings' }, () => { void load(); })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'support_messages' }, () => { void load(); })
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [load]);

  const visibleMessages = useMemo(
    () => (filter === 'unread' ? messages.filter((message) => !message.is_read) : messages),
    [filter, messages],
  );

  const handleSave = async () => {
    if (!isValidSupportEmail(settings.support_email)) {
      toast({ title: 'Invalid support email', variant: 'destructive' });
      return;
    }
    if (!isValidHttpUrl(settings.whatsapp_link)) {
      toast({ title: 'Invalid WhatsApp link', description: 'Use a full https:// link for WhatsApp.', variant: 'destructive' });
      return;
    }

    setSaving(true);
    const payload = {
      singleton_key: 'default',
      support_email: settings.support_email.trim(),
      phone_number: settings.phone_number.trim(),
      whatsapp_number: settings.whatsapp_number.trim(),
      whatsapp_link: settings.whatsapp_link.trim(),
      office_address: settings.office_address.trim(),
      show_email: settings.show_email,
      show_phone: settings.show_phone,
      show_whatsapp: settings.show_whatsapp,
      show_office_address: settings.show_office_address,
      updated_by: user?.id,
    };

    const { error } = await supabase
      .from('platform_support_settings' as any)
      .upsert(payload, { onConflict: 'singleton_key' });

    setSaving(false);

    if (error) {
      toast({ title: 'Could not save support settings', description: error.message, variant: 'destructive' });
      return;
    }

    toast({ title: 'Support settings updated' });
    await load();
  };

  const markRead = async (message: SupportMessageRow, next: boolean) => {
    const { error } = await supabase
      .from('support_messages' as any)
      .update({ is_read: next, read_at: next ? new Date().toISOString() : null })
      .eq('id', message.id);

    if (error) {
      toast({ title: 'Could not update message', description: error.message, variant: 'destructive' });
      return;
    }
    await load();
  };

  const removeMessage = async (messageId: string) => {
    if (!confirm('Delete this support message?')) return;
    const { error } = await supabase.from('support_messages' as any).delete().eq('id', messageId);
    if (error) {
      toast({ title: 'Could not delete message', description: error.message, variant: 'destructive' });
      return;
    }
    toast({ title: 'Message deleted' });
    await load();
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Support</h1>
        <p className="text-sm text-muted-foreground">Manage the contact details users see and review incoming support requests.</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Support Settings</CardTitle>
          <p className="text-xs text-muted-foreground">These details appear on the tenant Support page and update live.</p>
        </CardHeader>
        <CardContent className="grid gap-5 lg:grid-cols-[1fr_0.7fr]">
          <div className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <Label htmlFor="support-email">Support email</Label>
                <Input
                  id="support-email"
                  maxLength={160}
                  value={settings.support_email}
                  onChange={(event) => setSettings((current) => ({ ...current, support_email: event.target.value }))}
                  placeholder="support@sikaflow.com"
                />
              </div>
              <div>
                <Label htmlFor="support-phone">Phone number</Label>
                <Input
                  id="support-phone"
                  maxLength={32}
                  value={settings.phone_number}
                  onChange={(event) => setSettings((current) => ({ ...current, phone_number: event.target.value }))}
                  placeholder="+233 24 123 4567"
                />
              </div>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <Label htmlFor="support-whatsapp-number">WhatsApp number</Label>
                <Input
                  id="support-whatsapp-number"
                  maxLength={32}
                  value={settings.whatsapp_number}
                  onChange={(event) => setSettings((current) => ({ ...current, whatsapp_number: event.target.value }))}
                  placeholder="+233 24 123 4567"
                />
              </div>
              <div>
                <Label htmlFor="support-whatsapp-link">WhatsApp link override</Label>
                <Input
                  id="support-whatsapp-link"
                  maxLength={255}
                  value={settings.whatsapp_link}
                  onChange={(event) => setSettings((current) => ({ ...current, whatsapp_link: event.target.value }))}
                  placeholder="https://wa.me/233241234567"
                />
              </div>
            </div>

            <div>
              <Label htmlFor="support-office">Office address</Label>
              <Textarea
                id="support-office"
                rows={4}
                maxLength={240}
                value={settings.office_address}
                onChange={(event) => setSettings((current) => ({ ...current, office_address: event.target.value }))}
                placeholder="Osu, Accra, Ghana"
              />
            </div>

            <Button onClick={handleSave} disabled={saving}>
              {saving ? 'Saving...' : 'Save Support Settings'}
            </Button>
          </div>

          <div className="space-y-3 rounded-xl border border-border bg-muted/15 p-4">
            <p className="text-sm font-semibold">Visibility</p>
            <VisibilityToggle
              label="Show support email"
              checked={settings.show_email}
              onCheckedChange={(checked) => setSettings((current) => ({ ...current, show_email: checked }))}
            />
            <VisibilityToggle
              label="Show phone number"
              checked={settings.show_phone}
              onCheckedChange={(checked) => setSettings((current) => ({ ...current, show_phone: checked }))}
            />
            <VisibilityToggle
              label="Show WhatsApp"
              checked={settings.show_whatsapp}
              onCheckedChange={(checked) => setSettings((current) => ({ ...current, show_whatsapp: checked }))}
            />
            <VisibilityToggle
              label="Show office address"
              checked={settings.show_office_address}
              onCheckedChange={(checked) => setSettings((current) => ({ ...current, show_office_address: checked }))}
            />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <CardTitle className="text-base">Support Messages</CardTitle>
            <p className="text-xs text-muted-foreground">Messages submitted from the in-app Support page.</p>
          </div>
          <div className="flex items-center gap-2">
            <Button type="button" variant={filter === 'all' ? 'secondary' : 'outline'} size="sm" onClick={() => setFilter('all')}>
              All
            </Button>
            <Button type="button" variant={filter === 'unread' ? 'secondary' : 'outline'} size="sm" onClick={() => setFilter('unread')}>
              Unread
            </Button>
          </div>
        </CardHeader>
        <CardContent className="space-y-3">
          {loading ? (
            <p className="text-sm text-muted-foreground">Loading support inbox...</p>
          ) : visibleMessages.length === 0 ? (
            <p className="text-sm text-muted-foreground">No support messages yet.</p>
          ) : (
            visibleMessages.map((message) => (
              <div key={message.id} className="rounded-xl border border-border p-4">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="text-sm font-semibold">{message.subject}</p>
                      <Badge variant={message.is_read ? 'secondary' : 'default'}>
                        {message.is_read ? 'Read' : 'Unread'}
                      </Badge>
                    </div>
                    <div className="mt-2 flex flex-wrap gap-3 text-xs text-muted-foreground">
                      <span className="inline-flex items-center gap-1"><Mail className="h-3.5 w-3.5" /> {message.sender_name}</span>
                      <span className="inline-flex items-center gap-1"><Phone className="h-3.5 w-3.5" /> {message.sender_contact}</span>
                      <span className="inline-flex items-center gap-1"><MessageSquareMore className="h-3.5 w-3.5" /> {new Date(message.created_at).toLocaleString('en-GH')}</span>
                    </div>
                    <p className="mt-3 whitespace-pre-wrap text-sm leading-6 text-muted-foreground">{message.message}</p>
                  </div>
                  <div className="flex shrink-0 items-center gap-2">
                    <Button variant="outline" size="sm" onClick={() => void markRead(message, !message.is_read)}>
                      {message.is_read ? 'Mark unread' : 'Mark read'}
                    </Button>
                    <Button variant="ghost" size="icon" onClick={() => void removeMessage(message.id)}>
                      <Trash2 className="h-4 w-4 text-destructive" />
                    </Button>
                  </div>
                </div>
              </div>
            ))
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function VisibilityToggle({
  label,
  checked,
  onCheckedChange,
}: {
  label: string;
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
}) {
  return (
    <label className="flex items-center justify-between gap-3 rounded-lg border border-border bg-background/70 px-3 py-2.5">
      <span className="text-sm text-foreground">{label}</span>
      <Switch checked={checked} onCheckedChange={onCheckedChange} />
    </label>
  );
}
