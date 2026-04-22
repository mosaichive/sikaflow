
-- Function to restore stock when sale items are deleted
CREATE OR REPLACE FUNCTION public.restore_stock_on_sale_item_delete()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF OLD.product_id IS NOT NULL THEN
    UPDATE public.products
    SET quantity = quantity + OLD.quantity
    WHERE id = OLD.product_id;
  END IF;
  RETURN OLD;
END;
$$;

-- Trigger to restore stock before sale_items are deleted
CREATE TRIGGER on_sale_item_delete
BEFORE DELETE ON public.sale_items
FOR EACH ROW
EXECUTE FUNCTION public.restore_stock_on_sale_item_delete();

-- Allow admins to delete sale_items
CREATE POLICY "Admins can delete sale_items"
ON public.sale_items
FOR DELETE
TO authenticated
USING (has_role(auth.uid(), 'admin'::app_role));
