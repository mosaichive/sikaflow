import { formatCurrency } from '@/lib/constants';
import { Card, CardContent } from '@/components/ui/card';
import { LucideIcon } from 'lucide-react';
import { AnimatedNumber } from '@/components/AnimatedNumber';
import { motion } from 'framer-motion';

interface MetricCardProps {
  title: string;
  value: number;
  icon: LucideIcon;
  trend?: string;
  isCurrency?: boolean;
  index?: number;
}

export function MetricCard({ title, value, icon: Icon, trend, isCurrency = true, index = 0 }: MetricCardProps) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3, delay: index * 0.06, ease: [0.25, 0.46, 0.45, 0.94] }}
    >
      <Card className="hover:shadow-md transition-all duration-200 hover:-translate-y-0.5">
        <CardContent className="p-5">
          <div className="flex items-start justify-between">
            <div className="space-y-1">
              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">{title}</p>
              <p className="text-2xl font-bold text-foreground">
                {isCurrency
                  ? <AnimatedNumber value={value} formatter={(n) => formatCurrency(n)} />
                  : <AnimatedNumber value={value} />
                }
              </p>
              {trend && <p className="text-xs text-muted-foreground">{trend}</p>}
            </div>
            <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center shrink-0">
              <Icon className="h-5 w-5 text-primary" />
            </div>
          </div>
        </CardContent>
      </Card>
    </motion.div>
  );
}
