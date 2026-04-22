CREATE TRIGGER on_sale_item_insert
AFTER INSERT ON public.sale_items
FOR EACH ROW
EXECUTE FUNCTION public.reduce_stock_on_sale();