// Full-stage spinner shown while a structure is being parsed/rendered.
import { useApp } from '../hooks/useStores';

export function Loading() {
  const loading = useApp((s) => s.loading);
  if (!loading) return null;
  return (
    <div className="loading">
      <div className="spinner" />
    </div>
  );
}
