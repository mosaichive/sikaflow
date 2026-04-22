-- Remove the duplicate trigger that causes double stock deduction
DROP TRIGGER IF EXISTS on_sale_item_inserted ON public.sale_items;