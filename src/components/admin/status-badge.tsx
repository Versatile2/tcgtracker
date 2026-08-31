import { Badge } from '@/components/ui/badge';

const VARIANT = {
  draft: 'outline',
  published: 'default',
  hidden: 'secondary',
} as const;

export function StatusBadge({ status }: { status: 'draft' | 'published' | 'hidden' }) {
  return <Badge variant={VARIANT[status]}>{status}</Badge>;
}
