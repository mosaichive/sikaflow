import { Download, Printer } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  downloadSaleDocument,
  printSaleDocument,
  renderSaleDocumentHtml,
  saleDocumentLabel,
  salePaymentLabel,
  type SaleDocumentRecord,
} from '@/lib/sale-documents';
import { useToast } from '@/hooks/use-toast';

function badgeClass(status: string) {
  if (status === 'paid') return 'border-emerald-500/30 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400';
  if (status === 'partial') return 'border-amber-500/30 bg-amber-500/10 text-amber-600 dark:text-amber-400';
  return 'border-destructive/30 bg-destructive/10 text-destructive';
}

export function SaleDocumentViewerDialog({
  open,
  onOpenChange,
  document,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  document: SaleDocumentRecord | null;
}) {
  const { toast } = useToast();

  if (!document) return null;

  const title = saleDocumentLabel(document.kind);
  const saleDate = new Date(document.snapshot.sale.sale_date).toLocaleDateString('en-GH', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
  const previewHtml = renderSaleDocumentHtml(document);

  const handlePrint = () => {
    const opened = printSaleDocument(document);
    if (!opened) {
      toast({
        title: 'Could not open print window',
        description: 'Allow pop-ups for SikaFlow to print or save this document as PDF.',
        variant: 'destructive',
      });
    }
  };

  const handleDownload = async () => {
    try {
      await downloadSaleDocument(document);
    } catch (error: any) {
      toast({
        title: 'Could not generate PDF',
        description: error?.message || 'Please try again in a moment.',
        variant: 'destructive',
      });
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl overflow-hidden p-0">
        <DialogHeader className="border-b border-border px-6 py-4">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <DialogTitle className="text-xl">{title} Preview</DialogTitle>
              <p className="mt-1 text-sm text-muted-foreground">
                {document.document_number} • Sale date {saleDate}
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant="outline" className={badgeClass(document.payment_status)}>
                {salePaymentLabel(document.payment_status)}
              </Badge>
              <Button type="button" variant="outline" size="sm" onClick={() => void handleDownload()}>
                <Download className="mr-1.5 h-3.5 w-3.5" /> Download PDF
              </Button>
              <Button type="button" size="sm" onClick={handlePrint}>
                <Printer className="mr-1.5 h-3.5 w-3.5" /> Print / Save PDF
              </Button>
            </div>
          </div>
        </DialogHeader>

        <div className="bg-muted/25 p-4 sm:p-5">
          <div className="rounded-2xl border border-border/60 bg-background shadow-sm">
            <iframe
              title={`${title} preview ${document.document_number}`}
              srcDoc={previewHtml}
              className="h-[66vh] min-h-[420px] w-full rounded-2xl border-0 bg-white"
            />
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
