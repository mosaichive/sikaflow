export type SupportSettings = {
  id?: string;
  singleton_key?: string;
  support_email: string;
  phone_number: string;
  whatsapp_number: string;
  whatsapp_link: string;
  office_address: string;
  show_email: boolean;
  show_phone: boolean;
  show_whatsapp: boolean;
  show_office_address: boolean;
  updated_at?: string;
};

export const DEFAULT_SUPPORT_SETTINGS: SupportSettings = {
  support_email: '',
  phone_number: '',
  whatsapp_number: '',
  whatsapp_link: '',
  office_address: '',
  show_email: true,
  show_phone: true,
  show_whatsapp: true,
  show_office_address: false,
};

export function normalizeSupportSettings(row: any): SupportSettings {
  return {
    id: row?.id,
    singleton_key: row?.singleton_key ?? 'default',
    support_email: row?.support_email ?? '',
    phone_number: row?.phone_number ?? '',
    whatsapp_number: row?.whatsapp_number ?? '',
    whatsapp_link: row?.whatsapp_link ?? '',
    office_address: row?.office_address ?? '',
    show_email: row?.show_email ?? true,
    show_phone: row?.show_phone ?? true,
    show_whatsapp: row?.show_whatsapp ?? true,
    show_office_address: row?.show_office_address ?? false,
    updated_at: row?.updated_at,
  };
}

export function normalizeGhanaPhone(value: string) {
  const digits = value.replace(/\D/g, '');
  if (!digits) return '';
  if (digits.startsWith('233')) return `+${digits}`;
  if (digits.startsWith('0')) return `+233${digits.slice(1)}`;
  return digits.startsWith('+') ? digits : `+${digits}`;
}

export function formatSupportPhone(value: string) {
  const normalized = normalizeGhanaPhone(value);
  if (!normalized) return '';
  if (!normalized.startsWith('+233') || normalized.length < 13) return normalized;
  return `${normalized.slice(0, 4)} ${normalized.slice(4, 6)} ${normalized.slice(6, 9)} ${normalized.slice(9)}`;
}

export function getWhatsappHref(settings: SupportSettings) {
  if (settings.whatsapp_link.trim()) return settings.whatsapp_link.trim();
  const normalized = normalizeGhanaPhone(settings.whatsapp_number);
  if (!normalized) return '';
  return `https://wa.me/${normalized.replace(/\D/g, '')}`;
}

export function isValidSupportEmail(value: string) {
  if (!value.trim()) return true;
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim());
}

export function isValidHttpUrl(value: string) {
  if (!value.trim()) return true;
  try {
    const url = new URL(value.trim());
    return url.protocol === 'https:' || url.protocol === 'http:';
  } catch {
    return false;
  }
}
