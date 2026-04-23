import { useCallback, useEffect, useMemo, useState } from 'react';
import { ArrowDown, ArrowUp, ExternalLink, ImagePlus, Pencil, Plus, Trash2 } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/context/AuthContext';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { useToast } from '@/hooks/use-toast';

type AdRow = {
  id: string;
  title: string;
  description: string;
  image_url: string;
  cta_text?: string | null;
  cta_url?: string | null;
  active: boolean;
  sort_order: number;
  created_at: string;
  updated_at?: string;
};

type AdDraft = {
  id?: string;
  title: string;
  description: string;
  image_url: string;
  cta_text: string;
  cta_url: string;
  active: boolean;
  sort_order: number;
};

const VALID_IMAGE_TYPES = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp'];
const MAX_IMAGE_SIZE = 4 * 1024 * 1024;

function emptyDraft(sortOrder: number): AdDraft {
  return {
    title: '',
    description: '',
    image_url: '',
    cta_text: '',
    cta_url: '',
    active: true,
    sort_order: sortOrder,
  };
}

function slugify(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'ad';
}

function isValidCtaUrl(value: string) {
  if (!value.trim()) return true;
  if (value.startsWith('/')) return true;
  try {
    const next = new URL(value);
    return next.protocol === 'http:' || next.protocol === 'https:';
  } catch {
    return false;
  }
}

function extractStoragePath(url: string) {
  try {
    const parsed = new URL(url);
    const marker = '/storage/v1/object/public/platform-ads/';
    const index = parsed.pathname.indexOf(marker);
    if (index === -1) return null;
    return decodeURIComponent(parsed.pathname.slice(index + marker.length));
  } catch {
    return null;
  }
}

export default function AdsPage() {
  const { user } = useAuth();
  const { toast } = useToast();
  const [rows, setRows] = useState<AdRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState<AdDraft | null>(null);
  const [busy, setBusy] = useState(false);
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState<string>('');

  const ordered = useMemo(
    () => [...rows].sort((left, right) => left.sort_order - right.sort_order || new Date(left.created_at).getTime() - new Date(right.created_at).getTime()),
    [rows],
  );

  const load = useCallback(async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from('platform_ads' as any)
      .select('*')
      .order('sort_order')
      .order('created_at');
    if (error) {
      toast({ title: 'Failed to load ads', description: error.message, variant: 'destructive' });
    } else {
      setRows((data as AdRow[]) ?? []);
    }
    setLoading(false);
  }, [toast]);

  useEffect(() => { void load(); }, [load]);

  useEffect(() => {
    const channel = supabase.channel('platform-ads-admin')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'platform_ads' }, () => { void load(); })
      .subscribe();
    return () => { void supabase.removeChannel(channel); };
  }, [load]);

  const resetDialog = () => {
    setDraft(null);
    setImageFile(null);
    setImagePreview('');
    setOpen(false);
  };

  const openCreate = () => {
    setDraft(emptyDraft(rows.length));
    setImageFile(null);
    setImagePreview('');
    setOpen(true);
  };

  const openEdit = (row: AdRow) => {
    setDraft({
      id: row.id,
      title: row.title,
      description: row.description,
      image_url: row.image_url,
      cta_text: row.cta_text ?? '',
      cta_url: row.cta_url ?? '',
      active: row.active,
      sort_order: row.sort_order,
    });
    setImageFile(null);
    setImagePreview(row.image_url);
    setOpen(true);
  };

  const handleImageSelect = (file?: File | null) => {
    if (!file) return;
    if (!VALID_IMAGE_TYPES.includes(file.type)) {
      toast({ title: 'Invalid image type', description: 'Use JPG, PNG, or WEBP images only.', variant: 'destructive' });
      return;
    }
    if (file.size > MAX_IMAGE_SIZE) {
      toast({ title: 'Image too large', description: 'Keep ad images under 4MB.', variant: 'destructive' });
      return;
    }
    setImageFile(file);
    setImagePreview(URL.createObjectURL(file));
  };

  const uploadImage = async (file: File, title: string) => {
    const ext = file.name.split('.').pop()?.toLowerCase() || 'jpg';
    const path = `ads/${Date.now()}-${slugify(title)}.${ext}`;
    const { error } = await supabase.storage.from('platform-ads').upload(path, file, { upsert: true });
    if (error) throw error;
    const { data } = supabase.storage.from('platform-ads').getPublicUrl(path);
    return data.publicUrl;
  };

  const save = async () => {
    if (!draft) return;
    if (!draft.title.trim()) {
      toast({ title: 'Title required', variant: 'destructive' });
      return;
    }
    if (draft.title.trim().length > 80) {
      toast({ title: 'Title too long', description: 'Keep ad titles under 80 characters.', variant: 'destructive' });
      return;
    }
    if (draft.description.trim().length > 180) {
      toast({ title: 'Description too long', description: 'Keep descriptions under 180 characters.', variant: 'destructive' });
      return;
    }
    if (draft.cta_text.trim().length > 24) {
      toast({ title: 'CTA too long', description: 'Keep button text under 24 characters.', variant: 'destructive' });
      return;
    }
    if (!isValidCtaUrl(draft.cta_url)) {
      toast({ title: 'Invalid CTA link', description: 'Use an https:// link or an in-app path like /billing.', variant: 'destructive' });
      return;
    }
    if (!draft.id && !imageFile) {
      toast({ title: 'Ad image required', description: 'Upload an image before publishing the ad.', variant: 'destructive' });
      return;
    }

    setBusy(true);
    try {
      let imageUrl = draft.image_url;
      if (imageFile) {
        imageUrl = await uploadImage(imageFile, draft.title);
      }

      const basePayload = {
        title: draft.title.trim(),
        description: draft.description.trim(),
        image_url: imageUrl,
        cta_text: draft.cta_text.trim() || null,
        cta_url: draft.cta_url.trim() || null,
        active: draft.active,
        sort_order: Number(draft.sort_order ?? 0),
      };

      const { error } = draft.id
        ? await supabase.from('platform_ads' as any).update(basePayload).eq('id', draft.id)
        : await supabase.from('platform_ads' as any).insert({
            ...basePayload,
            created_by: user?.id,
          });

      if (error) throw error;

      toast({ title: draft.id ? 'Ad updated' : 'Ad published' });
      resetDialog();
      await load();
    } catch (error) {
      toast({
        title: 'Could not save ad',
        description: error instanceof Error ? error.message : 'Please try again.',
        variant: 'destructive',
      });
    } finally {
      setBusy(false);
    }
  };

  const toggleActive = async (row: AdRow, next: boolean) => {
    const { error } = await supabase.from('platform_ads' as any).update({ active: next }).eq('id', row.id);
    if (error) {
      toast({ title: 'Update failed', description: error.message, variant: 'destructive' });
      return;
    }
    await load();
  };

  const move = async (index: number, direction: -1 | 1) => {
    const target = index + direction;
    if (target < 0 || target >= ordered.length) return;

    const nextOrder = [...ordered];
    const [moved] = nextOrder.splice(index, 1);
    nextOrder.splice(target, 0, moved);

    const updates = await Promise.all(
      nextOrder.map((row, nextIndex) =>
        supabase
          .from('platform_ads' as any)
          .update({ sort_order: nextIndex })
          .eq('id', row.id),
      ),
    );

    const failed = updates.find((result) => result.error);
    if (failed?.error) {
      toast({
        title: 'Could not reorder ads',
        description: failed.error.message || 'Please try again.',
        variant: 'destructive',
      });
      return;
    }
    await load();
  };

  const remove = async (row: AdRow) => {
    if (!confirm(`Delete "${row.title}"?`)) return;

    const imagePath = extractStoragePath(row.image_url);
    const { error } = await supabase.from('platform_ads' as any).delete().eq('id', row.id);
    if (error) {
      toast({ title: 'Delete failed', description: error.message, variant: 'destructive' });
      return;
    }
    if (imagePath) {
      await supabase.storage.from('platform-ads').remove([imagePath]);
    }
    toast({ title: 'Ad deleted' });
    await load();
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Ads</h1>
          <p className="text-sm text-muted-foreground">Manage the dashboard banner ads shown to tenant users across SikaFlow.</p>
        </div>
        <Button onClick={openCreate}>
          <Plus className="mr-1.5 h-4 w-4" /> New Ad
        </Button>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Published Ads</CardTitle>
          <p className="text-xs text-muted-foreground">Only active ads appear on the tenant dashboard ticker. Reorder to control the sequence.</p>
        </CardHeader>
        <CardContent className="space-y-3">
          {loading ? (
            <p className="text-sm text-muted-foreground">Loading ads...</p>
          ) : ordered.length === 0 ? (
            <p className="text-sm text-muted-foreground">No ads yet. Create the first banner to populate tenant dashboards.</p>
          ) : (
            ordered.map((row, index) => (
              <div key={row.id} className="flex flex-col gap-3 rounded-lg border border-border p-3 md:flex-row md:items-center">
                <img src={row.image_url} alt={row.title} className="h-24 w-full rounded-lg object-cover md:h-20 md:w-28" />
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="truncate text-sm font-semibold">{row.title}</p>
                    <Badge variant={row.active ? 'default' : 'secondary'}>{row.active ? 'Active' : 'Hidden'}</Badge>
                    {row.cta_text ? <Badge variant="outline">{row.cta_text}</Badge> : null}
                  </div>
                  <p className="mt-1 text-sm text-muted-foreground line-clamp-2">{row.description}</p>
                  {row.cta_url ? (
                    <a
                      href={row.cta_url}
                      target={/^https?:\/\//i.test(row.cta_url) ? '_blank' : undefined}
                      rel={/^https?:\/\//i.test(row.cta_url) ? 'noreferrer' : undefined}
                      className="mt-2 inline-flex items-center gap-1 text-xs font-medium text-primary"
                    >
                      {row.cta_url} <ExternalLink className="h-3 w-3" />
                    </a>
                  ) : null}
                </div>
                <div className="flex flex-wrap items-center gap-2 md:justify-end">
                  <Button type="button" size="icon" variant="outline" onClick={() => move(index, -1)} disabled={index === 0}>
                    <ArrowUp className="h-4 w-4" />
                  </Button>
                  <Button type="button" size="icon" variant="outline" onClick={() => move(index, 1)} disabled={index === ordered.length - 1}>
                    <ArrowDown className="h-4 w-4" />
                  </Button>
                  <div className="flex items-center gap-2 rounded-lg border border-border px-3 py-2">
                    <Switch checked={row.active} onCheckedChange={(next) => void toggleActive(row, next)} />
                    <span className="text-xs text-muted-foreground">Live</span>
                  </div>
                  <Button type="button" size="icon" variant="outline" onClick={() => openEdit(row)}>
                    <Pencil className="h-4 w-4" />
                  </Button>
                  <Button type="button" size="icon" variant="outline" onClick={() => void remove(row)}>
                    <Trash2 className="h-4 w-4 text-destructive" />
                  </Button>
                </div>
              </div>
            ))
          )}
        </CardContent>
      </Card>

      <Dialog open={open} onOpenChange={(next) => { if (!next) resetDialog(); else setOpen(true); }}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>{draft?.id ? 'Edit ad' : 'Create ad'}</DialogTitle>
          </DialogHeader>

          {draft ? (
            <div className="grid gap-5 md:grid-cols-[1.2fr_0.8fr]">
              <div className="space-y-4">
                <div>
                  <Label htmlFor="ad-title">Title</Label>
                  <Input id="ad-title" value={draft.title} maxLength={80} onChange={(event) => setDraft((current) => current ? { ...current, title: event.target.value } : current)} placeholder="Sell faster with supplier-ready inventory" />
                  <p className="mt-1 text-[11px] text-muted-foreground">{draft.title.length}/80</p>
                </div>

                <div>
                  <Label htmlFor="ad-description">Short description</Label>
                  <Textarea id="ad-description" rows={4} maxLength={180} value={draft.description} onChange={(event) => setDraft((current) => current ? { ...current, description: event.target.value } : current)} placeholder="Keep this brief and useful so it reads cleanly inside the dashboard banner." />
                  <p className="mt-1 text-[11px] text-muted-foreground">{draft.description.length}/180</p>
                </div>

                <div className="grid gap-4 sm:grid-cols-2">
                  <div>
                    <Label htmlFor="ad-cta-text">CTA button text</Label>
                    <Input id="ad-cta-text" value={draft.cta_text} maxLength={24} onChange={(event) => setDraft((current) => current ? { ...current, cta_text: event.target.value } : current)} placeholder="Learn more" />
                    <p className="mt-1 text-[11px] text-muted-foreground">{draft.cta_text.length}/24</p>
                  </div>
                  <div>
                    <Label htmlFor="ad-sort-order">Order</Label>
                    <Input id="ad-sort-order" type="number" min={0} value={draft.sort_order} onChange={(event) => setDraft((current) => current ? { ...current, sort_order: Number(event.target.value) || 0 } : current)} />
                  </div>
                </div>

                <div>
                  <Label htmlFor="ad-cta-url">CTA link</Label>
                  <Input id="ad-cta-url" value={draft.cta_url} onChange={(event) => setDraft((current) => current ? { ...current, cta_url: event.target.value } : current)} placeholder="https://example.com or /billing" />
                </div>

                <div className="flex items-center gap-3 rounded-lg border border-border px-4 py-3">
                  <Switch checked={draft.active} onCheckedChange={(next) => setDraft((current) => current ? { ...current, active: next } : current)} />
                  <div>
                    <p className="text-sm font-medium">Active on dashboards</p>
                    <p className="text-xs text-muted-foreground">Inactive ads stay saved but remain hidden from users.</p>
                  </div>
                </div>
              </div>

              <div className="space-y-3">
                <Label htmlFor="ad-image">Ad image</Label>
                <label htmlFor="ad-image" className="flex cursor-pointer flex-col items-center justify-center gap-3 rounded-xl border border-dashed border-border bg-muted/20 px-4 py-5 text-center">
                  {imagePreview ? (
                    <img src={imagePreview} alt="Ad preview" className="h-36 w-full rounded-lg object-cover" />
                  ) : (
                    <div className="flex h-36 w-full items-center justify-center rounded-lg bg-background text-muted-foreground">
                      <ImagePlus className="h-8 w-8" />
                    </div>
                  )}
                  <div>
                    <p className="text-sm font-medium">Upload banner image</p>
                    <p className="text-xs text-muted-foreground">JPG, PNG, or WEBP up to 4MB.</p>
                  </div>
                </label>
                <Input id="ad-image" type="file" accept="image/png,image/jpeg,image/webp" className="hidden" onChange={(event) => handleImageSelect(event.target.files?.[0])} />
              </div>
            </div>
          ) : null}

          <DialogFooter>
            <Button variant="ghost" onClick={resetDialog} disabled={busy}>Cancel</Button>
            <Button onClick={() => void save()} disabled={busy}>{busy ? 'Saving...' : draft?.id ? 'Save changes' : 'Publish ad'}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
