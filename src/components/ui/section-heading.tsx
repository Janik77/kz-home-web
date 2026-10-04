import type { ReactNode } from 'react';

export function SectionHeading({ id, title, description, action }: { id: string; title: string; description?: string; action?: ReactNode }) {
  return <div className="section-heading"><div><h2 id={id}>{title}</h2>{description && <p>{description}</p>}</div>{action}</div>;
}
