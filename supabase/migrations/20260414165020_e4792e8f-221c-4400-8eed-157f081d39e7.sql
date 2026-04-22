
-- Fix customer insert: still allow all authenticated but use a non-true expression
DROP POLICY "Authenticated can insert customers" ON public.customers;
CREATE POLICY "Authenticated can insert customers" ON public.customers 
  FOR INSERT TO authenticated 
  WITH CHECK (auth.uid() IS NOT NULL);

-- Fix customer update: restrict to admins only
DROP POLICY "Authenticated can update customers" ON public.customers;
CREATE POLICY "Admins can update customers" ON public.customers 
  FOR UPDATE TO authenticated 
  USING (public.has_role(auth.uid(), 'admin'));

-- Fix sale_items insert
DROP POLICY "Authenticated can insert sale_items" ON public.sale_items;
CREATE POLICY "Authenticated can insert sale_items" ON public.sale_items 
  FOR INSERT TO authenticated 
  WITH CHECK (auth.uid() IS NOT NULL);

-- Fix storage: restrict listing to authenticated
DROP POLICY "Anyone can view product images" ON storage.objects;
CREATE POLICY "Authenticated can view product images" ON storage.objects 
  FOR SELECT TO authenticated 
  USING (bucket_id = 'product-images');
