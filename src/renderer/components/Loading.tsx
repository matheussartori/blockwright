// Full-stage spinner shown while the active tab's structure is being parsed/rendered.
import { useActiveDoc } from '../hooks/useStores';

export function Loading() {
  const loading = useActiveDoc()?.loading ?? false;
  if (!loading) return null;
  return (
    <div className="loading">
      <div className="spinner" />
    </div>
  );
}
