import { Download, Printer, User2 } from 'lucide-react';
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
  const primaryAmountLabel =
    document.kind === 'receipt'
      ? 'Amount Paid'
      : document.payment_status === 'paid'
        ? 'Amount Paid'
        : 'Balance Due';
  const primaryAmountValue =
    document.kind === 'receipt'
      ? formatCurrency(document.snapshot.sale.amount_paid_ghs)
      : document.payment_status === 'paid'
        ? formatCurrency(document.snapshot.sale.amount_paid_ghs)
        : formatCurrency(document.snapshot.sale.balance_ghs);

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
            <div className="mx-auto max-w-3xl overflow-hidden rounded-[24px] border border-slate-200 bg-white shadow-sm">
              <div className="px-6 py-7 sm:px-10">
                <div className="flex flex-col gap-6 sm:flex-row sm:items-start sm:justify-between">
                  <div className="flex gap-4">
                    <div className="flex h-20 w-20 shrink-0 items-center justify-center overflow-hidden rounded-xl border border-slate-200 bg-white">
                      {document.snapshot.business.logo_url ? (
                        <img
                          src={document.snapshot.business.logo_url}
                          alt={`${document.snapshot.business.name} logo`}
                          className="h-full w-full object-contain"
                        />
                      ) : (
                        <div className="px-2 text-center text-[11px] text-slate-400">Add logo in profile</div>
                      )}
                    </div>
                    <div>
                      <p className="text-xl font-extrabold text-slate-900">{document.snapshot.business.name}</p>
                      <div className="mt-3 space-y-1.5 text-[15px] leading-6 text-slate-800">
                        {document.snapshot.business.location ? <p>{document.snapshot.business.location}</p> : null}
                        {document.snapshot.business.phone ? <p>{document.snapshot.business.phone}</p> : null}
                        {document.snapshot.business.email ? <p>{document.snapshot.business.email}</p> : null}
                      </div>
                    </div>
                  </div>

                  <div className="sm:text-right">
                    <div className="text-4xl font-black uppercase tracking-tight text-slate-950">{title}</div>
                    <p className="mt-3 break-all text-sm text-slate-600">{document.document_number}</p>
                  </div>
                </div>

                <div className="mt-8">
                  <p className="text-lg text-slate-500">To:</p>
                  <div className="mt-2 space-y-1 text-lg font-bold uppercase leading-7 text-slate-950">
                    <p>{document.snapshot.customer.name}</p>
                    {document.snapshot.customer.phone ? <p>{document.snapshot.customer.phone}</p> : null}
                  </div>
                  <div className="mt-2 flex items-center gap-2 text-sm font-medium text-slate-600">
                    <User2 className="h-4 w-4" /> {document.snapshot.seller.name}
                  </div>
                </div>

                <div className="mt-8 border-t-2 border-slate-900 pt-5">
                  <div className="grid gap-4 sm:grid-cols-2">
                    <div>
                      <p className="text-sm text-slate-500">Payment Method</p>
                      <p className="mt-1 text-xl font-bold text-slate-950">{document.snapshot.sale.payment_method ? document.snapshot.sale.payment_method.replaceAll('_', ' ').replace(/\b\w/g, (char) => char.toUpperCase()) : 'Not specified'}</p>
                    </div>
                    <div className="sm:text-right">
                      <p className="text-sm text-slate-500">Date • Time</p>
                      <p className="mt-1 text-xl font-bold text-slate-950">{issuedAt}</p>
                    </div>
                  </div>
                </div>
              </div>

              <div className="bg-slate-300 px-6 py-4 text-sm font-semibold text-white sm:px-10">
                <div className="grid grid-cols-[1fr_auto] gap-4">
                  <span>Description</span>
                  <span className="text-right">Amount</span>
                </div>
              </div>

              <div className="px-6 py-2 sm:px-10">
                {document.snapshot.items.map((item, index) => (
                  <div key={`${item.product_name}-${index}`} className="grid grid-cols-[1fr_auto] gap-4 border-b border-slate-200 py-5">
                    <div>
                      <p className="text-lg font-bold text-slate-950">{item.product_name}</p>
                      <p className="mt-1 text-sm leading-6 text-slate-500">
                        Qty {item.quantity} x {formatCurrency(item.unit_price)}
                        {[item.sku, item.size, item.color].filter(Boolean).length ? ` • ${[item.sku, item.size, item.color].filter(Boolean).join(' • ')}` : ''}
                      </p>
                    </div>
                    <div className="text-right text-lg font-bold text-slate-950">{formatCurrency(item.line_total)}</div>
                  </div>
                ))}

                <div className="py-5">
                  <div className="flex items-center justify-between border-b border-slate-900 py-4 text-base text-slate-900">
                    <span>Subtotal</span>
                    <span className="font-bold">{formatCurrency(document.snapshot.sale.amount_ghs)}</span>
                  </div>
                  {document.kind === 'invoice' ? (
                    <div className="flex items-center justify-between pt-4 text-sm text-slate-600">
                      <span>Amount Paid</span>
                      <span className="font-semibold">{formatCurrency(document.snapshot.sale.amount_paid_ghs)}</span>
                    </div>
                  ) : null}
                  <div className="flex items-center justify-between pt-4 text-[32px] font-black tracking-tight text-slate-950">
                    <span>{primaryAmountLabel}</span>
                    <span>{primaryAmountValue}</span>
                  </div>
                  <div className="mt-3">
                    <Badge variant="outline" className={badgeClass(document.payment_status)}>
                      {salePaymentLabel(document.payment_status)}
                    </Badge>
                  </div>
                </div>

                {document.snapshot.sale.notes ? (
                  <div className="border-t border-slate-200 py-5">
                    <p className="text-sm font-semibold uppercase tracking-[0.18em] text-slate-500">Notes</p>
                    <p className="mt-2 text-sm leading-7 text-slate-700">{document.snapshot.sale.notes}</p>
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
