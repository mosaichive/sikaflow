import { useCallback, useEffect, useMemo, useState } from 'react';
import { AppLayout } from '@/components/AppLayout';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { EmptyState } from '@/components/EmptyState';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/context/AuthContext';
import { useBusiness } from '@/context/BusinessContext';
import { supabase } from '@/integrations/supabase/client';
import {
  DEFAULT_SUPPORT_SETTINGS,
  formatSupportPhone,
  getWhatsappHref,
  normalizeSupportSettings,
  type SupportSettings,
} from '@/lib/support';
import { ExternalLink, LifeBuoy, Mail, MapPin, MessageCircle, Phone, Send } from 'lucide-react';

export default function SupportPage() {
  const { user, displayName, profilePhone } = useAuth();
  const { business } = useBusiness();
  const { toast } = useToast();
  const [settings, setSettings] = useState<SupportSettings>(DEFAULT_SUPPORT_SETTINGS);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [form, setForm] = useState({
    name: '',
    contact: '',
    subject: '',
    message: '',
  });

  const loadSettings = useCallback(async () => {
    const { data } = await supabase
      .from('platform_support_settings' as any)
      .select('*')
      .eq('singleton_key', 'default')
      .maybeSingle();

    setSettings(data ? normalizeSupportSettings(data) : DEFAULT_SUPPORT_SETTINGS);
    setLoading(false);
  }, []);

  useEffect(() => {
    void loadSettings();
  }, [loadSettings]);

  useEffect(() => {
    const channel = supabase
      .channel('support-page')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'platform_support_settings' }, () => { void loadSettings(); })
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [loadSettings]);

  useEffect(() => {
    setForm((current) => ({
      ...current,
      name: current.name || displayName || business?.name || '',
      contact: current.contact || profilePhone || user?.email || '',
    }));
  }, [business?.name, displayName, profilePhone, user?.email]);

  const visibleContacts = useMemo(() => {
    const whatsappHref = getWhatsappHref(settings);
    return [
      settings.show_email && settings.support_email
        ? {
            key: 'email',
            label: 'Support Email',
            value: settings.support_email,
            href: `mailto:${settings.support_email}`,
            icon: Mail,
          }
        : null,
      settings.show_phone && settings.phone_number
        ? {
            key: 'phone',
            label: 'Phone',
            value: formatSupportPhone(settings.phone_number),
            href: `tel:${settings.phone_number}`,
            icon: Phone,
          }
        : null,
      settings.show_whatsapp && whatsappHref
        ? {
            key: 'whatsapp',
            label: 'WhatsApp',
            value: formatSupportPhone(settings.whatsapp_number) || 'Chat on WhatsApp',
            href: whatsappHref,
            icon: MessageCircle,
          }
        : null,
      settings.show_office_address && settings.office_address
        ? {
            key: 'office',
            label: 'Office',
            value: settings.office_address,
            href: '',
            icon: MapPin,
          }
        : null,
    ].filter(Boolean) as Array<{
      key: string;
      label: string;
      value: string;
      href: string;
      icon: typeof Mail;
    }>;
  }, [settings]);

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!user?.id) return;

    if (!form.name.trim()) {
      toast({ title: 'Name required', variant: 'destructive' });
      return;
    }
    if (!form.contact.trim()) {
      toast({ title: 'Contact required', description: 'Add your email or phone number.', variant: 'destructive' });
      return;
    }
    if (!form.subject.trim()) {
      toast({ title: 'Subject required', variant: 'destructive' });
      return;
    }
    if (!form.message.trim()) {
      toast({ title: 'Message required', variant: 'destructive' });
      return;
    }

    setSubmitting(true);
    const { error } = await supabase.from('support_messages' as any).insert({
      user_id: user.id,
      business_id: business?.id ?? null,
      sender_name: form.name.trim(),
      sender_contact: form.contact.trim(),
      subject: form.subject.trim(),
      message: form.message.trim(),
    });
    setSubmitting(false);

    if (error) {
      toast({ title: 'Could not send message', description: error.message, variant: 'destructive' });
      return;
    }

    toast({ title: 'Message sent', description: 'Support has received your message.' });
    setForm((current) => ({
      ...current,
      subject: '',
      message: '',
    }));
  };

  return (
    <AppLayout title="Support">
      <div className="space-y-6 animate-fade-in">
        <section className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-[0.22em] text-primary">Support</p>
            <h2 className="mt-1 text-2xl font-bold tracking-tight">Need help with your SikaFlow workspace?</h2>
            <p className="mt-2 max-w-2xl text-sm text-muted-foreground">
              Reach support directly using the contact details below or send a message from inside the app.
            </p>
          </div>
        </section>

        <div className="grid gap-5 xl:grid-cols-[0.92fr_1.08fr]">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <LifeBuoy className="h-4 w-4 text-primary" />
                Contact Support
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {loading ? (
                <p className="text-sm text-muted-foreground">Loading support details...</p>
              ) : visibleContacts.length > 0 ? (
                visibleContacts.map((item) => (
                  <div key={item.key} className="rounded-xl border border-border bg-muted/20 p-4">
                    <div className="flex items-start gap-3">
                      <span className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
                        <item.icon className="h-4 w-4" />
                      </span>
                      <div className="min-w-0 flex-1">
                        <p className="text-xs font-semibold uppercase tracking-[0.16em] text-muted-foreground">{item.label}</p>
                        <p className="mt-1 text-sm font-medium leading-6">{item.value}</p>
                      </div>
                      {item.href ? (
                        <Button asChild variant="ghost" size="icon" className="h-8 w-8 shrink-0">
                          <a href={item.href} target={item.key === 'office' ? undefined : '_blank'} rel="noreferrer">
                            <ExternalLink className="h-3.5 w-3.5" />
                          </a>
                        </Button>
                      ) : null}
                    </div>
                  </div>
                ))
              ) : (
                <EmptyState
                  icon={<LifeBuoy className="h-7 w-7 text-muted-foreground" />}
                  title="Support details coming soon"
                  description="The support team has not published contact details yet, but you can still send a message below."
                />
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <Send className="h-4 w-4 text-primary" />
                Send a Message
              </CardTitle>
            </CardHeader>
            <CardContent>
              <form onSubmit={handleSubmit} className="space-y-4">
                <div className="grid gap-4 sm:grid-cols-2">
                  <div>
                    <Label htmlFor="support-name">Name</Label>
                    <Input
                      id="support-name"
                      maxLength={120}
                      value={form.name}
                      onChange={(event) => setForm((current) => ({ ...current, name: event.target.value }))}
                    />
                  </div>
                  <div>
                    <Label htmlFor="support-contact">Email or phone</Label>
                    <Input
                      id="support-contact"
                      maxLength={160}
                      value={form.contact}
                      onChange={(event) => setForm((current) => ({ ...current, contact: event.target.value }))}
                    />
                  </div>
                </div>

                <div>
                  <Label htmlFor="support-subject">Subject</Label>
                  <Input
                    id="support-subject"
                    maxLength={140}
                    placeholder="How can we help?"
                    value={form.subject}
                    onChange={(event) => setForm((current) => ({ ...current, subject: event.target.value }))}
                  />
                </div>

                <div>
                  <Label htmlFor="support-message">Message</Label>
                  <Textarea
                    id="support-message"
                    rows={7}
                    maxLength={2000}
                    placeholder="Share the issue, steps you took, and what you expected to happen."
                    value={form.message}
                    onChange={(event) => setForm((current) => ({ ...current, message: event.target.value }))}
                  />
                  <p className="mt-1 text-[11px] text-muted-foreground">{form.message.length}/2000</p>
                </div>

                <Button type="submit" disabled={submitting}>
                  <Send className="mr-1.5 h-4 w-4" />
                  {submitting ? 'Sending...' : 'Send Message'}
                </Button>
              </form>
            </CardContent>
          </Card>
        </div>
      </div>
    </AppLayout>
  );
}
