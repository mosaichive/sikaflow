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
  business_id?: string;
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

const STABLE_PRODUCT_SELECT =
  'id,name,sku,category,quantity,cost_price,selling_price,reorder_level,image_url,business_id,created_at,updated_at';

function getProductCacheKey(businessId: string) {
  return `sikaflow_products_${businessId}`;
}

async function resolveActiveBusinessIdFromSession() {
  const { data } = await supabase.auth.getUser();
  const userId = data.user?.id;
  if (!userId) return null;
  try {
    return await resolveCurrentBusinessId(userId);
  } catch (error) {
    logSupabaseError('workspace.resolveActiveBusinessIdFromSession', error, {
      userId,
    });
    return null;
  }
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

function readAllCachedProducts(): CachedProductRow[] {
  if (typeof window === 'undefined') return [];
  try {
    const rowsById = new Map<string, CachedProductRow>();
    for (let index = 0; index < window.localStorage.length; index += 1) {
      const key = window.localStorage.key(index);
      if (!key || !key.startsWith('sikaflow_products_')) continue;
      const raw = window.localStorage.getItem(key);
      if (!raw) continue;
      const parsed = JSON.parse(raw);
      if (!Array.isArray(parsed)) continue;
      for (const row of parsed as CachedProductRow[]) {
        if (!row?.id) continue;
        rowsById.set(row.id, row);
      }
    }
    return Array.from(rowsById.values());
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

function normalizeProductRow(row: Record<string, unknown>): CachedProductRow {
  return {
    id: String(row.id ?? ''),
    business_id: typeof row.business_id === 'string' ? row.business_id : undefined,
    name: String(row.name ?? ''),
    sku: typeof row.sku === 'string' ? row.sku : '',
    category: typeof row.category === 'string' ? row.category : '',
    quantity: typeof row.quantity === 'number' ? row.quantity : Number(row.quantity ?? 0),
    cost_price: typeof row.cost_price === 'number' || typeof row.cost_price === 'string' ? row.cost_price : 0,
    selling_price: typeof row.selling_price === 'number' || typeof row.selling_price === 'string' ? row.selling_price : 0,
    reorder_level:
      typeof row.reorder_level === 'number' || typeof row.reorder_level === 'string'
        ? Number(row.reorder_level ?? 0)
        : 0,
    low_stock_threshold:
      typeof row.low_stock_threshold === 'number' || typeof row.low_stock_threshold === 'string'
        ? Number(row.low_stock_threshold ?? 0)
        : typeof row.reorder_level === 'number' || typeof row.reorder_level === 'string'
          ? Number(row.reorder_level ?? 0)
          : 0,
    image_url: typeof row.image_url === 'string' ? row.image_url : null,
    is_archived: typeof row.is_archived === 'boolean' ? row.is_archived : false,
  };
}

export function rememberCachedProduct(businessId: string, row: CachedProductRow) {
  const existing = readCachedProducts(businessId).filter((item) => item.id !== row.id);
  existing.push({
    ...row,
    business_id: row.business_id ?? businessId,
  });
  existing.sort((left, right) => (left.name || '').localeCompare(right.name || ''));
  writeCachedProducts(businessId, existing);
}

export function removeCachedProduct(businessId: string, productId: string) {
  const nextRows = readCachedProducts(businessId).filter((item) => item.id !== productId);
  writeCachedProducts(businessId, nextRows);
}

function mergeProductRows(
  liveRows: CachedProductRow[],
  cachedRows: CachedProductRow[],
  showArchived: boolean,
) {
  const merged = new Map<string, CachedProductRow>();

  for (const row of cachedRows) {
    merged.set(row.id, row);
  }

  for (const row of liveRows) {
    merged.set(row.id, {
      ...merged.get(row.id),
      ...row,
    });
  }

  return Array.from(merged.values())
    .filter((row) => (showArchived ? true : row.is_archived !== true))
    .sort((left, right) => (left.name || '').localeCompare(right.name || ''));
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
    || message.includes(targetTable)
    || message.includes(`public.${targetTable}`)
    || (targetColumn ? message.includes(`${targetTable}.${targetColumn}`) : false)
    || (targetColumn ? message.includes(`public.${targetTable}.${targetColumn}`) : false)
    || message.includes(`'${targetTable}'`)
    || message.includes(`relation "${targetTable}"`)
    || details.includes(targetTable)
    || details.includes(`public.${targetTable}`)
    || (targetColumn ? details.includes(`${targetTable}.${targetColumn}`) : false)
    || (targetColumn ? details.includes(`public.${targetTable}.${targetColumn}`) : false)
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

async function insertWithOptionalColumnFallback<T extends Record<string, unknown>>({
  table,
  payload,
  optionalColumns,
  context,
}: {
  table: string;
  payload: T;
  optionalColumns: string[];
  context: string;
}) {
  const nextPayload: Record<string, unknown> = { ...payload };
  const remainingColumns = [...optionalColumns];

  while (true) {
    const { data, error } = await supabase
      .from(table as any)
      .insert(nextPayload as never)
      .select()
      .single();

    if (!error) return data;

    const missingColumn = remainingColumns.find((column) => isMissingColumnError(error, column, table));
    if (!missingColumn) throw error;

    logSupabaseError(context, error, { table, missingColumn, fallbackMode: 'insertWithoutOptionalColumn' });
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

export async function insertSaleRecord(
  payload: Record<string, unknown>,
) {
  return insertWithOptionalColumnFallback({
    table: 'sales',
    payload,
    optionalColumns: ['due_date', 'status', 'sale_channel', 'stock_status', 'stock_shortfall'],
    context: 'workspace.insertSale',
  });
}

export async function updateSaleRecord(
  saleId: string,
  payload: Record<string, unknown>,
) {
  return updateWithOptionalColumnFallback({
    table: 'sales',
    matchColumn: 'id',
    matchValue: saleId,
    payload,
    optionalColumns: ['due_date', 'status', 'sale_channel', 'stock_status', 'stock_shortfall'],
    context: 'workspace.updateSale',
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

export async function insertRestockRecord(
  payload: Record<string, unknown>,
) {
  return insertWithOptionalColumnFallback({
    table: 'restocks',
    payload,
    optionalColumns: ['status', 'business_id'],
    context: 'workspace.insertRestock',
  });
}

export async function updateRestockRecord(
  restockId: string,
  payload: Record<string, unknown>,
) {
  return updateWithOptionalColumnFallback({
    table: 'restocks',
    matchColumn: 'id',
    matchValue: restockId,
    payload,
    optionalColumns: ['status', 'business_id'],
    context: 'workspace.updateRestock',
  });
}

export async function insertExpenseRecord(
  payload: Record<string, unknown>,
) {
  return insertWithOptionalColumnFallback({
    table: 'expenses',
    payload,
    optionalColumns: ['business_id', 'payment_method', 'attachment_path', 'attachment_name'],
    context: 'workspace.insertExpense',
  });
}

export async function updateExpenseRecord(
  expenseId: string,
  payload: Record<string, unknown>,
) {
  return updateWithOptionalColumnFallback({
    table: 'expenses',
    matchColumn: 'id',
    matchValue: expenseId,
    payload,
    optionalColumns: ['business_id', 'payment_method', 'attachment_path', 'attachment_name'],
    context: 'workspace.updateExpense',
  });
}

export async function loadProductsCompat(showArchived: boolean, businessId?: string | null) {
  const effectiveBusinessId = businessId ?? await resolveActiveBusinessIdFromSession();
  const allCachedRows = readAllCachedProducts();
  const scopedBaseQuery = () => {
    let query = supabase.from('products').select('*').order('name');
    if (effectiveBusinessId) {
      query = query.eq('business_id', effectiveBusinessId);
    }
    return query;
  };
  const visibleBaseQuery = () => supabase.from('products').select('*').order('name');
  const stableBaseQuery = () => {
    let query = supabase.from('products').select(STABLE_PRODUCT_SELECT).order('name');
    if (effectiveBusinessId) {
      query = query.eq('business_id', effectiveBusinessId);
    }
    return query;
  };
  const filterVisibleRows = (rows: CachedProductRow[]) =>
    effectiveBusinessId
      ? rows.filter((row) => row.business_id === effectiveBusinessId)
      : rows;
  const filterCachedRows = (rows: CachedProductRow[]) =>
    showArchived ? rows : rows.filter((row) => row.is_archived !== true);
  const getCachedRowsFallback = () => {
    const businessScopedRows = filterCachedRows(readCachedProducts(effectiveBusinessId));
    if (businessScopedRows.length > 0) return businessScopedRows;
    return filterCachedRows(filterVisibleRows(allCachedRows));
  };
  const loadStableRows = async () => {
    const { data: stableData, error: stableError } = await stableBaseQuery();
    if (stableError) throw stableError;
    return ((stableData ?? []) as Array<Record<string, unknown>>).map(normalizeProductRow);
  };

  if (showArchived) {
    try {
      const { data, error } = await scopedBaseQuery();
      if (error) throw error;
      let liveRows = (data ?? []) as CachedProductRow[];
      if (liveRows.length === 0 && effectiveBusinessId) {
        const stableRows = await loadStableRows();
        liveRows = stableRows;
      }
      const mergedRows = mergeProductRows(liveRows, filterVisibleRows(allCachedRows), true);
      if (effectiveBusinessId && mergedRows.length > 0) writeCachedProducts(effectiveBusinessId, mergedRows);
      return mergedRows;
    } catch (error) {
      logSupabaseError('workspace.loadProductsCompat.showArchived', error, {
        businessId: effectiveBusinessId,
      });
      try {
        const stableRows = await loadStableRows();
        const mergedRows = mergeProductRows(stableRows, filterVisibleRows(allCachedRows), true);
        if (effectiveBusinessId && mergedRows.length > 0) writeCachedProducts(effectiveBusinessId, mergedRows);
        return mergedRows;
      } catch (stableError) {
        logSupabaseError('workspace.loadProductsCompat.showArchived.fallback', stableError, {
          businessId: effectiveBusinessId,
        });
        return getCachedRowsFallback();
      }
    }
  }

  const { data, error } = await scopedBaseQuery().eq('is_archived', false);
  if (!error) {
    const rows = (data ?? []) as Array<{ is_archived?: boolean | null }>;
    if (rows.length > 0) {
      const mergedRows = mergeProductRows(
        rows as CachedProductRow[],
        filterVisibleRows(allCachedRows),
        false,
      );
      if (effectiveBusinessId && mergedRows.length > 0) writeCachedProducts(effectiveBusinessId, mergedRows);
      return mergedRows;
    }

    const { data: fallbackData, error: fallbackError } = await scopedBaseQuery();
    if (fallbackError) throw fallbackError;
    const filteredRows = ((fallbackData ?? []) as Array<{ is_archived?: boolean | null }>).filter((row) => row.is_archived !== true) as CachedProductRow[];
    const mergedRows = mergeProductRows(filteredRows, filterVisibleRows(allCachedRows), false);
    if (mergedRows.length > 0) {
      if (businessId) writeCachedProducts(businessId, mergedRows);
      return mergedRows;
    }

    if (effectiveBusinessId) {
      try {
        const stableRows = await loadStableRows();
        const mergedStableRows = mergeProductRows(stableRows, filterVisibleRows(allCachedRows), false);
        if (mergedStableRows.length > 0) {
          writeCachedProducts(effectiveBusinessId, mergedStableRows);
          return mergedStableRows;
        }
      } catch (stableError) {
        logSupabaseError('workspace.loadProductsCompat.stableAfterEmpty', stableError, {
          businessId: effectiveBusinessId,
        });
      }
    }

    if (effectiveBusinessId) {
      const { data: visibleRows, error: visibleError } = await visibleBaseQuery();
      if (!visibleError) {
        const mergedVisibleRows = mergeProductRows(
          filterVisibleRows((visibleRows ?? []) as CachedProductRow[]).filter((row) => row.is_archived !== true),
          filterVisibleRows(allCachedRows),
          false,
        );
        if (mergedVisibleRows.length > 0) {
          writeCachedProducts(effectiveBusinessId, mergedVisibleRows);
          return mergedVisibleRows;
        }
      }
    }

    return getCachedRowsFallback();
  }
  if (!isMissingColumnError(error, 'is_archived', 'products')) {
    logSupabaseError('workspace.loadProductsCompat', error, {
      table: 'products',
      fallbackMode: 'loadFromCacheAfterReadFailure',
      businessId: effectiveBusinessId,
      showArchived,
    });
    return getCachedRowsFallback();
  }

  logSupabaseError('workspace.loadProductsCompat', error, {
    table: 'products',
    missingColumn: 'is_archived',
    fallbackMode: 'loadWithoutArchiveColumn',
  });
  try {
    const stableRows = await loadStableRows();
    const mergedRows = mergeProductRows(stableRows, filterVisibleRows(allCachedRows), false);
    if (mergedRows.length > 0 && effectiveBusinessId) writeCachedProducts(effectiveBusinessId, mergedRows);
    return mergedRows.length > 0 ? mergedRows : getCachedRowsFallback();
  } catch (stableError) {
    logSupabaseError('workspace.loadProductsCompat.fallback', stableError, {
      table: 'products',
      fallbackMode: 'loadFromCacheAfterStableFallbackFailure',
      businessId: effectiveBusinessId,
      showArchived,
    });
    return getCachedRowsFallback();
  }
}

export async function loadStockMovementsCompat(limit = 100, businessId?: string | null) {
  const effectiveBusinessId = businessId ?? await resolveActiveBusinessIdFromSession();
  let query = supabase
    .from('stock_movements' as any)
    .select('*')
    .order('movement_date', { ascending: false })
    .limit(limit);

  if (effectiveBusinessId) {
    query = query.eq('business_id', effectiveBusinessId);
  }

  const { data, error } = await query;

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
