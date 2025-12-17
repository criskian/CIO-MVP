import { ReactNode } from 'react';
import { FileQuestion } from 'lucide-react';

interface EmptyStateProps {
  icon?: ReactNode;
  title: string;
  description?: string;
  action?: ReactNode;
}

export default function EmptyState({
  icon,
  title,
  description,
  action,
}: EmptyStateProps) {
  return (
    <div className="text-center py-12">
      <div className="flex justify-center mb-4">
        {icon || <FileQuestion size={48} className="text-gray-400" />}
      </div>
      <h3 className="text-lg font-semibold text-admin-text-primary mb-2">
        {title}
      </h3>
      {description && (
        <p className="text-admin-text-secondary mb-6 max-w-md mx-auto">
          {description}
        </p>
      )}
      {action && <div className="flex justify-center">{action}</div>}
    </div>
  );
}

