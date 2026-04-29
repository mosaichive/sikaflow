import { supabase } from '@/integrations/supabase/client';

type SupabaseErrorLike = {
  message?: string;
  details?: string;
  code?: string;
  hint?: string;
};

type EnsureWorkspaceInput = {
  existingBusinessId?: string | null;
  user: {
    id: string;
    email?: string | null;
  };
  displayName?: string;
  businessName?: string;
  phone?: string;
  location?: string;
  allowCreate?: boolean;
};

type CachedProductRow = {
  id: string;
  name: string;
  sku?: string;
  category?: string;
  quantity?: number;
  cost_price?: number | string;
  selling_price?: number | string;
  reorder_level?: number | null;
  low_stock_threshold?: number | null;
  image_url?: string | null;
  is_archived?: boolean | null;
};

function getProductCacheKey(businessId: string) {
  return `sikaflow_products_${businessId}`;
}

function readCachedProducts(businessId?: string | null): CachedProductRow[] {
  if (!businessId || typeof window === 'undefined') return [];
  try {
    const raw = window.localStorage.getItem(getProductCacheKey(businessId));
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as CachedProductRow[]) : [];
  } catch {
    return [];
  }
}

function writeCachedProducts(businessId: string, rows: CachedProductRow[]) {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(getProductCacheKey(businessId), JSON.stringify(rows));
  } catch {
    // Ignore storage write errors. Cache is only a UX fallback.
  }
}

export function rememberCachedProduct(businessId: string, row: CachedProductRow) {
  const existing = readCachedProducts(businessId).filter((item) => item.id !== row.id);
  existing.push(row);
  existing.sort((left, right) => (left.name || '').localeCompare(right.name || ''));
  writeCachedProducts(businessId, existing);
}

export function removeCachedProduct(businessId: string, productId: string) {
  const nextRows = readCachedProducts(businessId).filter((item) => item.id !== productId);
  writeCachedProducts(businessId, nextRows);
}

async function ensureBusinessRoleMembership({
  businessId,
  userId,
}: {
  businessId: string;
  userId: string;
}) {
  const { data, error } = await supabase
    .from('user_roles')
    .select('role, business_id')
    .eq('user_id', userId);

  if (error) throw error;

  const roles = (data || []) as Array<{ role: string; business_id: string | null }>;
  if (roles.some((row) => row.business_id === businessId && (row.role === 'admin' || row.role === 'manager'))) {
    return;
  }
  if (roles.some((row) => row.role === 'super_admin')) {
    return;
  }

  const { error: insertError } = await supabase
    .from('user_roles')
    .insert({
      user_id: userId,
      role: 'admin' as any,
      business_id: businessId,
    } as never);

  if (insertError && insertError.code !== '23505') {
    throw insertError;
  }
}

function isMissingFunctionError(error: unknown) {
  const normalized = (error ?? {}) as SupabaseErrorLike;
  const message = normalized.message?.toLowerCase() ?? '';
  const details = normalized.details?.toLowerCase() ?? '';
  const code = normalized.code?.toUpperCase() ?? '';

  return (
    code === 'PGRST202'
    || message.includes('could not find the function')
    || details.includes('could not find the function')
    || message.includes('schema cache')
  );
}

function isMissingColumnError(error: unknown, columnName?: string, tableName?: string) {
  const normalized = (error ?? {}) as SupabaseErrorLike;
  const message = normalized.message?.toLowerCase() ?? '';
  const details = normalized.details?.toLowerCase() ?? '';
  const code = normalized.code?.toUpperCase() ?? '';
  const targetColumn = columnName?.toLowerCase();
  const targetTable = tableName?.toLowerCase();

  const mentionsColumn =
    !targetColumn
    || message.includes(targetColumn)
    || message.includes(`'${targetColumn}'`)
    || message.includes(`column "${targetColumn}"`)
    || details.includes(targetColumn)
    || details.includes(`'${targetColumn}'`)
    || details.includes(`column "${targetColumn}"`);

  const mentionsTable =
    !targetTable
    || message.includes(`'${targetTable}'`)
    || message.includes(`relation "${targetTable}"`)
    || details.includes(`'${targetTable}'`)
    || details.includes(`relation "${targetTable}"`);

  return (
    mentionsColumn
    && mentionsTable
    && (
      code === 'PGRST204'
      || code === '42703'
      || message.includes('schema cache')
      || message.includes('column')
      || details.includes('schema cache')
      || details.includes('column')
    )
  );
}

function isMissingTableError(error: unknown, tableName?: string) {
  const normalized = (error ?? {}) as SupabaseErrorLike;
  const message = normalized.message?.toLowerCase() ?? '';
  const details = normalized.details?.toLowerCase() ?? '';
  const code = normalized.code?.toUpperCase() ?? '';
  const targetTable = tableName?.toLowerCase();

  const mentionsTable =
    !targetTable
    || message.includes(targetTable)
    || message.includes(`'${targetTable}'`)
    || message.includes(`relation "${targetTable}"`)
    || message.includes(`table ${targetTable}`)
    || details.includes(targetTable)
    || details.includes(`'${targetTable}'`)
    || details.includes(`relation "${targetTable}"`)
    || details.includes(`table ${targetTable}`);

  return (
    mentionsTable
    && (
      code === 'PGRST205'
      || code === '42P01'
      || message.includes('could not find the table')
      || details.includes('could not find the table')
      || message.includes('schema cache')
      || details.includes('schema cache')
      || message.includes('relation')
      || details.includes('relation')
    )
  );
}

async function updateWithOptionalColumnFallback<T extends Record<string, unknown>>({
  table,
  matchColumn,
  matchValue,
  payload,
  optionalColumns,
  context,
}: {
  table: string;
  matchColumn: string;
  matchValue: string;
  payload: T;
  optionalColumns: string[];
  context: string;
}) {
  const nextPayload: Record<string, unknown> = { ...payload };
  const remainingColumns = [...optionalColumns];

  while (true) {
    const { error } = await supabase
      .from(table as any)
      .update(nextPayload as never)
      .eq(matchColumn, matchValue);

    if (!error) return;

    const missingColumn = remainingColumns.find((column) => isMissingColumnError(error, column, table));
    if (!missingColumn) throw error;

    logSupabaseError(context, error, { table, missingColumn, fallbackMode: 'updateWithoutOptionalColumn' });
    remainingColumns.splice(remainingColumns.indexOf(missingColumn), 1);
    delete nextPayload[missingColumn];
  }
}

export async function updateBusinessWorkspaceRecord(
  businessId: string,
  payload: Record<string, unknown>,
) {
  return updateWithOptionalColumnFallback({
    table: 'businesses',
    matchColumn: 'id',
    matchValue: businessId,
    payload,
    optionalColumns: ['business_type'],
    context: 'workspace.updateBusiness',
  });
}

export async function updateProfileRecord(
  userId: string,
  payload: Record<string, unknown>,
) {
  return updateWithOptionalColumnFallback({
    table: 'profiles',
    matchColumn: 'user_id',
    matchValue: userId,
    payload,
    optionalColumns: ['onboarding_completed'],
    context: 'workspace.updateProfile',
  });
}

export async function createProductRecord(
  payload: Record<string, unknown>,
) {
  const businessId = typeof payload.business_id === 'string' ? payload.business_id : null;
  const userId = typeof payload.user_id === 'string' ? payload.user_id : null;

  if (businessId && userId) {
    try {
      await ensureBusinessRoleMembership({ businessId, userId });
    } catch (roleError) {
      logSupabaseError('workspace.createProduct.ensureRoleMembership', roleError, {
        businessId,
        userId,
      });
    }
  }

  const nextPayload: Record<string, unknown> = { ...payload };
  const remainingColumns = ['user_id', 'low_stock_threshold', 'is_archived'];

  while (true) {
    const { data, error } = await supabase
      .from('products')
      .insert(nextPayload as never)
      .select('id')
      .single();

    if (!error) return data as { id: string };

    const missingColumn = remainingColumns.find((column) => isMissingColumnError(error, column, 'products'));
    if (!missingColumn) throw error;

    logSupabaseError('workspace.createProduct', error, {
      table: 'products',
      missingColumn,
      fallbackMode: 'insertWithoutOptionalColumn',
    });
    remainingColumns.splice(remainingColumns.indexOf(missingColumn), 1);
    delete nextPayload[missingColumn];
  }
}

export async function updateProductRecord(
  productId: string,
  payload: Record<string, unknown>,
) {
  return updateWithOptionalColumnFallback({
    table: 'products',
    matchColumn: 'id',
    matchValue: productId,
    payload,
    optionalColumns: ['user_id', 'low_stock_threshold', 'is_archived'],
    context: 'workspace.updateProduct',
  });
}

export async function loadProductsCompat(showArchived: boolean, businessId?: string | null) {
  const baseQuery = () => supabase.from('products').select('*').order('name');
  const filterCachedRows = (rows: CachedProductRow[]) =>
    showArchived ? rows : rows.filter((row) => row.is_archived !== true);
  const getCachedRowsFallback = () => filterCachedRows(readCachedProducts(businessId));

  if (showArchived) {
    const { data, error } = await baseQuery();
    if (error) throw error;
    if (businessId && data) writeCachedProducts(businessId, data as CachedProductRow[]);
    return data ?? [];
  }

  const { data, error } = await baseQuery().eq('is_archived', false);
  if (!error) {
    const rows = (data ?? []) as Array<{ is_archived?: boolean | null }>;
    if (rows.length > 0) {
      if (businessId) writeCachedProducts(businessId, rows as CachedProductRow[]);
      return rows;
    }

    const { data: fallbackData, error: fallbackError } = await baseQuery();
    if (fallbackError) throw fallbackError;
    const filteredRows = ((fallbackData ?? []) as Array<{ is_archived?: boolean | null }>).filter((row) => row.is_archived !== true);
    if (filteredRows.length > 0) {
      if (businessId) writeCachedProducts(businessId, filteredRows as CachedProductRow[]);
      return filteredRows;
    }
    return getCachedRowsFallback();
  }
  if (!isMissingColumnError(error, 'is_archived', 'products')) throw error;

  logSupabaseError('workspace.loadProductsCompat', error, {
    table: 'products',
    missingColumn: 'is_archived',
    fallbackMode: 'loadWithoutArchiveColumn',
  });
  const { data: fallbackData, error: fallbackError } = await baseQuery();
  if (fallbackError) throw fallbackError;
  const rows = (fallbackData ?? []) as CachedProductRow[];
  if (rows.length > 0 && businessId) writeCachedProducts(businessId, rows);
  return rows.length > 0 ? rows : getCachedRowsFallback();
}

export async function loadStockMovementsCompat(limit = 100) {
  const { data, error } = await supabase
    .from('stock_movements' as any)
    .select('*')
    .order('movement_date', { ascending: false })
    .limit(limit);

  if (!error) return (data ?? []) as any[];
  if (!isMissingTableError(error, 'stock_movements')) throw error;

  logSupabaseError('workspace.loadStockMovementsCompat', error, {
    table: 'stock_movements',
    fallbackMode: 'loadWithoutStockMovementsTable',
  });
  return [];
}

export async function insertStockMovementCompat(
  payload: Record<string, unknown>,
) {
  const businessId = typeof payload.business_id === 'string' ? payload.business_id : null;
  const userId =
    typeof payload.created_by === 'string'
      ? payload.created_by
      : typeof payload.user_id === 'string'
        ? payload.user_id
        : null;

  if (businessId && userId) {
    try {
      await ensureBusinessRoleMembership({ businessId, userId });
    } catch (roleError) {
      logSupabaseError('workspace.insertStockMovementCompat.ensureRoleMembership', roleError, {
        businessId,
        userId,
      });
    }
  }

  const { error } = await supabase.from('stock_movements' as any).insert(payload);

  if (!error) {
    return { inserted: true, skipped: false } as const;
  }

  if (!isMissingTableError(error, 'stock_movements')) throw error;

  logSupabaseError('workspace.insertStockMovementCompat', error, {
    table: 'stock_movements',
    fallbackMode: 'skipMissingStockMovementsTable',
    payload,
  });
  return { inserted: false, skipped: true } as const;
}

export async function deleteStockMovementsBySourceCompat(sourceIds: string[]) {
  if (sourceIds.length === 0) return { deleted: false, skipped: false } as const;

  const { error } = await supabase
    .from('stock_movements' as any)
    .delete()
    .in('source_id', sourceIds)
    .eq('source_table', 'sale_items');

  if (!error) {
    return { deleted: true, skipped: false } as const;
  }

  if (!isMissingTableError(error, 'stock_movements')) throw error;

  logSupabaseError('workspace.deleteStockMovementsBySourceCompat', error, {
    table: 'stock_movements',
    fallbackMode: 'skipMissingStockMovementsTable',
    sourceIds,
  });
  return { deleted: false, skipped: true } as const;
}

export function getErrorMessage(error: unknown, fallback = 'Please try again.') {
  if (error instanceof Error && error.message) return error.message;
  if (typeof error === 'object' && error !== null && 'message' in error && typeof (error as any).message === 'string') {
    return (error as any).message as string;
  }
  return fallback;
}

export function logSupabaseError(context: string, error: unknown, extra?: Record<string, unknown>) {
  const normalized = (error ?? {}) as SupabaseErrorLike;
  console.error(`[SikaFlow:${context}]`, {
    message: normalized.message ?? (error instanceof Error ? error.message : 'Unknown error'),
    details: normalized.details ?? null,
    code: normalized.code ?? null,
    hint: normalized.hint ?? null,
    ...extra,
    rawError: error,
  });
}

export async function resolveCurrentBusinessId(userId: string) {
  const { data, error } = await supabase
    .from('profiles')
    .select('business_id')
    .eq('user_id', userId)
    .maybeSingle();

  if (error) throw error;
  return ((data as any)?.business_id as string | null) ?? null;
}

async function fallbackProfileMembership({
  businessId,
  userId,
  displayName,
  email,
  phone,
}: {
  businessId: string;
  userId: string;
  displayName?: string;
  email?: string | null;
  phone?: string;
}) {
  const profilePayload = {
    user_id: userId,
    business_id: businessId,
    display_name: displayName?.trim() || email?.split('@')[0]?.trim() || 'User',
    phone: phone?.trim() || null,
  };

  const { error } = await supabase
    .from('profiles')
    .upsert(profilePayload as never, { onConflict: 'user_id' });

  if (error) throw error;
  await ensureBusinessRoleMembership({ businessId, userId });
  return businessId;
}

export async function ensureUserBusinessWorkspace({
  existingBusinessId,
  user,
  displayName,
  businessName,
  phone,
  location,
  allowCreate = true,
}: EnsureWorkspaceInput) {
  const ensureMembership = async (businessId: string) => {
    const { data, error } = await supabase.rpc('ensure_business_workspace_membership', {
      _business_id: businessId,
      _display_name: displayName?.trim() || user.email?.split('@')[0]?.trim() || 'User',
      _phone: phone?.trim() || '',
    });

    if (error) {
      if (isMissingFunctionError(error)) {
        logSupabaseError('workspace.ensureMembershipFallback', error, {
          businessId,
          userId: user.id,
        });
        return fallbackProfileMembership({
          businessId,
          userId: user.id,
          displayName,
          email: user.email,
          phone,
        });
      }
      throw error;
    }
    await ensureBusinessRoleMembership({ businessId, userId: user.id });
    return (data as string | null) || businessId;
  };

  if (existingBusinessId) {
    return ensureMembership(existingBusinessId);
  }

  const profileBusinessId = await resolveCurrentBusinessId(user.id);
  if (profileBusinessId) {
    return ensureMembership(profileBusinessId);
  }

  if (!allowCreate) {
    return null;
  }

  const fallbackBusinessName =
    businessName?.trim() ||
    displayName?.trim() ||
    user.email?.split('@')[0]?.trim() ||
    'My Business';

  const { data, error } = await supabase.rpc('create_business_for_owner', {
    _name: fallbackBusinessName,
    _email: user.email?.trim() || '',
    _phone: phone?.trim() || '',
    _location: location?.trim() || '',
    _employees: 1,
    _logo_light_url: '',
    _logo_dark_url: '',
  });

  if (error) throw error;
  if (!data) throw new Error('Business setup did not return a workspace id.');
  return ensureMembership(data as string);
}
