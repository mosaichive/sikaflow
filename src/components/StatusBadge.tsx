import { Badge } from '@/components/ui/badge';

export function StatusBadge({ status }: { status: string }) {
  const config: Record<string, string> = {
    paid: 'bg-success/10 text-success border-success/20',
    partial: 'bg-warning/10 text-warning border-warning/20',
    unpaid: 'bg-destructive/10 text-destructive border-destructive/20',
  };

  return (
    <Badge variant="outline" className={`text-xs font-medium ${config[status] || ''}`}>
      {status.charAt(0).toUpperCase() + status.slice(1)}
    </Badge>
  );
}
