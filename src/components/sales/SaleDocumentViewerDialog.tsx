import { Download, FileText, Mail, MapPin, Phone, Printer, ReceiptText, User2 } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { formatCurrency } from '@/lib/constants';
import {
  downloadSaleDocument,
  printSaleDocument,
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
  const issuedAt = new Date(document.issued_at).toLocaleString('en-GH', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
  const saleDate = new Date(document.snapshot.sale.sale_date).toLocaleDateString('en-GH', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });

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

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl overflow-hidden p-0">
        <DialogHeader className="border-b border-border px-6 py-4">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <DialogTitle className="text-xl">{title} Preview</DialogTitle>
              <p className="mt-1 text-sm text-muted-foreground">{document.document_number}</p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant="outline" className={badgeClass(document.payment_status)}>
                {salePaymentLabel(document.payment_status)}
              </Badge>
              <Button type="button" variant="outline" size="sm" onClick={() => downloadSaleDocument(document)}>
                <Download className="mr-1.5 h-3.5 w-3.5" /> Download
              </Button>
              <Button type="button" size="sm" onClick={handlePrint}>
                <Printer className="mr-1.5 h-3.5 w-3.5" /> Print / Save PDF
              </Button>
            </div>
          </div>
        </DialogHeader>

        <ScrollArea className="max-h-[80vh]">
          <div className="bg-muted/20 px-4 py-5 sm:px-6">
            <div className="mx-auto max-w-3xl rounded-2xl border border-border bg-background shadow-sm">
              <div className="border-b border-border px-6 py-6">
                <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-primary">{title}</p>
                <div className="mt-4 flex flex-col gap-6 sm:flex-row sm:items-start sm:justify-between">
                  <div>
                    <h2 className="text-3xl font-bold tracking-tight">{document.snapshot.business.name}</h2>
                    <div className="mt-3 space-y-1 text-sm text-muted-foreground">
                      {document.snapshot.business.email ? (
                        <p className="flex items-center gap-2"><Mail className="h-3.5 w-3.5" /> {document.snapshot.business.email}</p>
                      ) : null}
                      {document.snapshot.business.phone ? (
                        <p className="flex items-center gap-2"><Phone className="h-3.5 w-3.5" /> {document.snapshot.business.phone}</p>
                      ) : null}
                      {document.snapshot.business.location ? (
                        <p className="flex items-center gap-2"><MapPin className="h-3.5 w-3.5" /> {document.snapshot.business.location}</p>
                      ) : null}
                    </div>
                  </div>
                  <div className="sm:text-right">
                    <div className="flex items-center gap-2 sm:justify-end">
                      {document.kind === 'invoice' ? <FileText className="h-4 w-4 text-primary" /> : <ReceiptText className="h-4 w-4 text-primary" />}
                      <span className="text-sm font-semibold">{document.document_number}</span>
                    </div>
                    <p className="mt-2 text-sm text-muted-foreground">Sale date: {saleDate}</p>
                    <p className="text-sm text-muted-foreground">Issued: {issuedAt}</p>
                  </div>
                </div>
              </div>

              <div className="grid gap-4 border-b border-border px-6 py-5 sm:grid-cols-2">
                <div className="rounded-xl border border-border bg-muted/20 p-4">
                  <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">Customer</p>
                  <p className="mt-3 text-base font-semibold">{document.snapshot.customer.name}</p>
                  {document.snapshot.customer.phone ? <p className="mt-1 text-sm text-muted-foreground">{document.snapshot.customer.phone}</p> : null}
                </div>
                <div className="rounded-xl border border-border bg-muted/20 p-4">
                  <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">Seller</p>
                  <p className="mt-3 flex items-center gap-2 text-base font-semibold"><User2 className="h-4 w-4 text-primary" /> {document.snapshot.seller.name}</p>
                  {document.snapshot.seller.email ? <p className="mt-1 text-sm text-muted-foreground">{document.snapshot.seller.email}</p> : null}
                </div>
              </div>

              <div className="grid gap-3 border-b border-border px-6 py-5 sm:grid-cols-4">
                <Metric label="Total" value={formatCurrency(document.snapshot.sale.amount_ghs)} />
                <Metric label="Amount paid" value={formatCurrency(document.snapshot.sale.amount_paid_ghs)} />
                <Metric label="Balance" value={formatCurrency(document.snapshot.sale.balance_ghs)} />
                <Metric label="Payment" value={salePaymentLabel(document.payment_status)} tone={document.payment_status} />
              </div>

              <div className="px-6 py-5">
                <div className="overflow-hidden rounded-xl border border-border">
                  <table className="w-full text-sm">
                    <thead className="bg-muted/30 text-left text-[11px] uppercase tracking-[0.16em] text-muted-foreground">
                      <tr>
                        <th className="px-4 py-3 font-medium">Product / Service</th>
                        <th className="px-4 py-3 text-center font-medium">Qty</th>
                        <th className="px-4 py-3 text-right font-medium">Unit price</th>
                        <th className="px-4 py-3 text-right font-medium">Line total</th>
                      </tr>
                    </thead>
                    <tbody>
                      {document.snapshot.items.map((item, index) => (
                        <tr key={`${item.product_name}-${index}`} className="border-t border-border">
                          <td className="px-4 py-3">
                            <p className="font-medium">{item.product_name}</p>
                            <p className="mt-1 text-xs text-muted-foreground">
                              {[item.sku, item.size, item.color].filter(Boolean).join(' • ') || 'Standard item'}
                            </p>
                          </td>
                          <td className="px-4 py-3 text-center">{item.quantity}</td>
                          <td className="px-4 py-3 text-right">{formatCurrency(item.unit_price)}</td>
                          <td className="px-4 py-3 text-right font-semibold">{formatCurrency(item.line_total)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                {document.snapshot.sale.notes ? (
                  <div className="mt-4 rounded-xl border border-border bg-muted/20 p-4">
                    <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">Notes</p>
                    <p className="mt-2 text-sm leading-6 text-foreground">{document.snapshot.sale.notes}</p>
                  </div>
                ) : null}
              </div>
            </div>
          </div>
        </ScrollArea>
      </DialogContent>
    </Dialog>
  );
}

function Metric({ label, value, tone }: { label: string; value: string; tone?: string }) {
  return (
    <div className="rounded-xl border border-border bg-muted/20 p-4">
      <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">{label}</p>
      <p className={`mt-2 text-lg font-bold ${tone === 'paid' ? 'text-emerald-600 dark:text-emerald-400' : tone === 'partial' ? 'text-amber-600 dark:text-amber-400' : tone === 'unpaid' ? 'text-destructive' : ''}`}>
        {value}
      </p>
    </div>
  );
}
